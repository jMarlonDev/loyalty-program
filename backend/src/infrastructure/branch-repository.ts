import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../application/errors.js';
import {
  hashPassword,
  normalizeEmail,
  validatePassword,
} from './local-auth.js';
import { withTransaction } from './transactions.js';

/**
 * BRANCH-001 (D-02 revisada): sucursales visibles, empleados ligados a una o
 * varias sucursales, QR de invitación por sucursal con vencimiento, límite de
 * usos y renovación, y alta manual con contraseña temporal.
 */
const HOUR = 60 * 60 * 1000;
const notFound = () => new AppError(404, 'NOT_FOUND', 'No existe el recurso.');
const forbidden = () =>
  new AppError(403, 'FORBIDDEN', 'No tienes permiso para esta operación.');
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function text(value: unknown, field: string, max = 255, optional = false) {
  if (optional && (value === undefined || value === null || value === ''))
    return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(400, 'INVALID_INPUT', `Revisa el campo ${field}.`);
  return value.trim();
}

function uuidList(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 50 ||
    value.some(
      (item) =>
        typeof item !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          item,
        ),
    )
  )
    throw new AppError(400, 'INVALID_INPUT', 'Elige al menos una sucursal.');
  return [...new Set(value as string[])];
}

/** Contraseña temporal legible (12 caracteres, con letras y números). */
export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const bytes = randomBytes(12);
  let result = '';
  for (let i = 0; i < 10; i++)
    result += alphabet[(bytes[i] ?? 0) % alphabet.length];
  result += digits[(bytes[10] ?? 0) % digits.length];
  result += digits[(bytes[11] ?? 0) % digits.length];
  return result;
}

export type InvitationState = 'valid' | 'expired' | 'revoked' | 'exhausted';

export class PgBranchRepository {
  private readonly now: () => Date;
  private readonly origin: string;
  constructor(
    private readonly pool: Pool,
    options: { now?: () => Date; publicOrigin?: string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.origin = options.publicOrigin ?? '';
  }

  private async owner(
    client: PoolClient,
    userId: string,
    restaurantId: string,
  ) {
    const restaurant = (
      await client.query<{ owner_user_id: string | null; status: string }>(
        'SELECT owner_user_id,status FROM restaurants WHERE id=$1',
        [restaurantId],
      )
    ).rows[0];
    if (!restaurant) throw notFound();
    if (restaurant.status !== 'active')
      throw new AppError(
        403,
        'RESTAURANT_SUSPENDED',
        'El restaurante está suspendido.',
      );
    if (restaurant.owner_user_id === userId) return;
    const legacyOwner = (
      await client.query(
        `SELECT 1 FROM restaurant_employees e JOIN roles r ON r.id=e.role_id
         WHERE e.user_id=$1 AND e.restaurant_id=$2 AND e.status='active' AND r.rol_type='owner'`,
        [userId, restaurantId],
      )
    ).rowCount;
    if (!legacyOwner) throw forbidden();
  }

  private async audit(
    client: PoolClient,
    input: {
      actor: string;
      restaurant: string;
      action: string;
      resource: string;
      details: Record<string, unknown>;
    },
  ) {
    await client.query(
      `INSERT INTO audit_events(id,actor_id,restaurant_id,action,resource_id,request_id,details,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        input.actor,
        input.restaurant,
        input.action,
        input.resource,
        randomUUID(),
        JSON.stringify(input.details),
        this.now(),
      ],
    );
  }

  private async location(
    client: PoolClient,
    restaurantId: string,
    locationId: string,
  ) {
    const row = (
      await client.query<{ id: string; name: string; status: string }>(
        'SELECT id,name,status FROM locations WHERE id=$1 AND restaurant_id=$2',
        [locationId, restaurantId],
      )
    ).rows[0];
    if (!row) throw notFound();
    if (row.status !== 'active')
      throw new AppError(409, 'CONFLICT', 'La sucursal no está activa.');
    return row;
  }

  private async employeeRole(client: PoolClient): Promise<string> {
    const existing = (
      await client.query<{ id: string }>(
        "SELECT id FROM roles WHERE rol_type='employee' ORDER BY id LIMIT 1",
      )
    ).rows[0]?.id;
    if (existing) return existing;
    const id = randomUUID();
    await client.query(
      "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'employee',$2)",
      [id, this.now()],
    );
    return id;
  }

  /** Crea o reactiva el vínculo y añade las sucursales indicadas. */
  private async link(
    client: PoolClient,
    userId: string,
    restaurantId: string,
    locationIds: string[],
  ): Promise<string> {
    const now = this.now();
    let employee = (
      await client.query<{ id: string }>(
        'SELECT id FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2',
        [userId, restaurantId],
      )
    ).rows[0];
    if (employee)
      await client.query(
        "UPDATE restaurant_employees SET status='active',ended_at=NULL,updated_at=$2 WHERE id=$1",
        [employee.id, now],
      );
    else {
      employee = { id: randomUUID() };
      await client.query(
        `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at)
         VALUES($1,$2,$3,$4,'active',$5,$5,$5)`,
        [
          employee.id,
          userId,
          restaurantId,
          await this.employeeRole(client),
          now,
        ],
      );
    }
    for (const locationId of locationIds)
      await client.query(
        `INSERT INTO employee_locations(employee_id,location_id,created_at)
         VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
        [employee.id, locationId, now],
      );
    return employee.id;
  }

  // ---------------------------------------------------------------- sucursales

  async listBranches(userId: string, restaurantId: string) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const rows = (
        await client.query<{
          id: string;
          name: string;
          address: string;
          physical_point: string | null;
          status: string;
          employees: number;
        }>(
          `SELECT l.id,l.name,l.address,l.physical_point,l.status,
             (SELECT count(*)::int FROM employee_locations el
               JOIN restaurant_employees e ON e.id=el.employee_id
               WHERE el.location_id=l.id AND e.status='active') AS employees
           FROM locations l WHERE l.restaurant_id=$1 ORDER BY l.created_at,l.id`,
          [restaurantId],
        )
      ).rows;
      return rows;
    });
  }

  async createBranch(
    userId: string,
    restaurantId: string,
    body: Record<string, unknown>,
  ) {
    const name = text(body.name, 'nombre') as string;
    const address = text(body.address, 'dirección', 500) as string;
    const physicalPoint = text(body.physical_point, 'punto físico', 255, true);
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const id = randomUUID();
      const now = this.now();
      await client.query(
        `INSERT INTO locations(id,restaurant_id,name,address,physical_point,city,department,status,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,'','','active',$6,$6)`,
        [id, restaurantId, name, address, physicalPoint, now],
      );
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'BRANCH_CREATED',
        resource: id,
        details: { name },
      });
      return {
        id,
        name,
        address,
        physical_point: physicalPoint,
        status: 'active',
        employees: 0,
      };
    });
  }

  // ----------------------------------------------------------------- empleados

  async listEmployees(userId: string, restaurantId: string) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const rows = (
        await client.query<{
          id: string;
          user_id: string;
          full_name: string;
          email: string | null;
          status: string;
          must_change_password: boolean;
          can_transfer_cards: boolean;
          locations: Array<{ id: string; name: string }>;
        }>(
          `SELECT e.id,e.user_id,u.full_name,u.email,e.status,u.must_change_password,e.can_transfer_cards,
             COALESCE((SELECT json_agg(json_build_object('id',l.id,'name',l.name) ORDER BY l.name)
               FROM employee_locations el JOIN locations l ON l.id=el.location_id
               WHERE el.employee_id=e.id),'[]'::json) AS locations
           FROM restaurant_employees e JOIN users u ON u.id=e.user_id
           LEFT JOIN restaurants r ON r.id=e.restaurant_id
           WHERE e.restaurant_id=$1 AND e.user_id IS DISTINCT FROM r.owner_user_id
           ORDER BY e.created_at,e.id`,
          [restaurantId],
        )
      ).rows;
      return rows;
    });
  }

  /** Alta manual: devuelve la contraseña temporal UNA sola vez al admin. */
  async createEmployee(
    userId: string,
    restaurantId: string,
    body: Record<string, unknown>,
  ): Promise<{
    employee_id: string;
    email: string;
    temporary_password: string | null;
    existing_account: boolean;
  }> {
    const email = normalizeEmail(body.email);
    const fullName = text(body.full_name, 'nombre') as string;
    const locationIds = uuidList(body.location_ids);
    const provided =
      body.password === undefined ? undefined : validatePassword(body.password);
    const password = provided ?? temporaryPassword();
    const hash = await hashPassword(password);
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      for (const locationId of locationIds)
        await this.location(client, restaurantId, locationId);
      const now = this.now();
      let account = (
        await client.query<{ id: string }>(
          'SELECT id FROM users WHERE lower(email)=$1',
          [email],
        )
      ).rows[0];
      const existing = Boolean(account);
      if (!account) {
        account = { id: randomUUID() };
        await client.query(
          `INSERT INTO users(id,full_name,email,password_hash,must_change_password,status,created_at,updated_at)
           VALUES($1,$2,$3,$4,true,'active',$5,$5)`,
          [account.id, fullName, email, hash, now],
        );
      }
      if (account.id === userId)
        throw new AppError(
          409,
          'CONFLICT',
          'El dueño no puede darse de alta como empleado aquí.',
        );
      const employeeId = await this.link(
        client,
        account.id,
        restaurantId,
        locationIds,
      );
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'EMPLOYEE_CREATED_MANUAL',
        resource: employeeId,
        details: { location_ids: locationIds, existing_account: existing },
      });
      return {
        employee_id: employeeId,
        email,
        // Una cuenta existente conserva su contraseña.
        temporary_password: existing ? null : password,
        existing_account: existing,
      };
    });
  }

  async setEmployeeLocations(
    userId: string,
    restaurantId: string,
    employeeId: string,
    body: Record<string, unknown>,
  ) {
    const locationIds = uuidList(body.location_ids);
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const employee = (
        await client.query<{ id: string }>(
          'SELECT id FROM restaurant_employees WHERE id=$1 AND restaurant_id=$2',
          [employeeId, restaurantId],
        )
      ).rows[0];
      if (!employee) throw notFound();
      for (const locationId of locationIds)
        await this.location(client, restaurantId, locationId);
      await client.query(
        'DELETE FROM employee_locations WHERE employee_id=$1 AND NOT (location_id = ANY($2::uuid[]))',
        [employeeId, locationIds],
      );
      for (const locationId of locationIds)
        await client.query(
          'INSERT INTO employee_locations(employee_id,location_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [employeeId, locationId, this.now()],
        );
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'EMPLOYEE_LOCATIONS_SET',
        resource: employeeId,
        details: { location_ids: locationIds },
      });
      return { employee_id: employeeId, location_ids: locationIds };
    });
  }

  // -------------------------------------------------------------- invitaciones

  private state(row: {
    revoked_at: Date | null;
    expires_at: Date;
    uses: number;
    max_uses: number;
  }): InvitationState {
    if (row.revoked_at) return 'revoked';
    if (row.expires_at.getTime() <= this.now().getTime()) return 'expired';
    if (row.uses >= row.max_uses) return 'exhausted';
    return 'valid';
  }

  private async issue(
    client: PoolClient,
    input: {
      userId: string;
      restaurantId: string;
      locationId: string;
      hours: number;
      maxUses: number;
    },
  ) {
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const now = this.now();
    const expires = new Date(now.getTime() + input.hours * HOUR);
    await client.query(
      `INSERT INTO branch_invitations(id,restaurant_id,location_id,token_hash,expires_at,max_uses,created_by,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        input.restaurantId,
        input.locationId,
        tokenHash(token),
        expires,
        input.maxUses,
        input.userId,
        now,
      ],
    );
    return {
      id,
      token,
      url: `${this.origin}/join-staff#token=${token}`,
      expires_at: expires.toISOString(),
      max_uses: input.maxUses,
      uses: 0,
      state: 'valid' as InvitationState,
    };
  }

  private bounds(body: Record<string, unknown>) {
    const hours = body.expires_in_hours ?? 24;
    const maxUses = body.max_uses ?? 1;
    if (
      typeof hours !== 'number' ||
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 24 * 30
    )
      throw new AppError(
        400,
        'INVALID_INPUT',
        'La vigencia debe estar entre 1 hora y 30 días.',
      );
    if (
      typeof maxUses !== 'number' ||
      !Number.isInteger(maxUses) ||
      maxUses < 1 ||
      maxUses > 50
    )
      throw new AppError(
        400,
        'INVALID_INPUT',
        'El límite de usos debe estar entre 1 y 50.',
      );
    return { hours, maxUses };
  }

  async createInvitation(
    userId: string,
    restaurantId: string,
    locationId: string,
    body: Record<string, unknown>,
  ) {
    const { hours, maxUses } = this.bounds(body);
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const location = await this.location(client, restaurantId, locationId);
      const issued = await this.issue(client, {
        userId,
        restaurantId,
        locationId,
        hours,
        maxUses,
      });
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'BRANCH_INVITATION_ISSUED',
        resource: issued.id,
        details: { location_id: locationId, hours, max_uses: maxUses },
      });
      return {
        ...issued,
        location_id: locationId,
        location_name: location.name,
      };
    });
  }

  async listInvitations(userId: string, restaurantId: string) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const rows = (
        await client.query<{
          id: string;
          location_id: string;
          location_name: string;
          expires_at: Date;
          max_uses: number;
          uses: number;
          revoked_at: Date | null;
          created_at: Date;
        }>(
          `SELECT i.id,i.location_id,l.name AS location_name,i.expires_at,i.max_uses,i.uses,i.revoked_at,i.created_at
           FROM branch_invitations i JOIN locations l ON l.id=i.location_id
           WHERE i.restaurant_id=$1 ORDER BY i.created_at DESC LIMIT 100`,
          [restaurantId],
        )
      ).rows;
      return rows.map((row) => ({
        id: row.id,
        location_id: row.location_id,
        location_name: row.location_name,
        expires_at: row.expires_at.toISOString(),
        max_uses: row.max_uses,
        uses: row.uses,
        created_at: row.created_at.toISOString(),
        state: this.state(row),
      }));
    });
  }

  /** Renovar: revoca la invitación y emite otra con la misma sucursal y límites. */
  async renewInvitation(
    userId: string,
    restaurantId: string,
    invitationId: string,
  ) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const old = (
        await client.query<{
          id: string;
          location_id: string;
          max_uses: number;
          expires_at: Date;
          created_at: Date;
        }>(
          'SELECT id,location_id,max_uses,expires_at,created_at FROM branch_invitations WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',
          [invitationId, restaurantId],
        )
      ).rows[0];
      if (!old) throw notFound();
      const location = await this.location(
        client,
        restaurantId,
        old.location_id,
      );
      const hours = Math.max(
        1,
        Math.round(
          (old.expires_at.getTime() - old.created_at.getTime()) / HOUR,
        ),
      );
      const issued = await this.issue(client, {
        userId,
        restaurantId,
        locationId: old.location_id,
        hours,
        maxUses: old.max_uses,
      });
      await client.query(
        'UPDATE branch_invitations SET revoked_at=COALESCE(revoked_at,$2),replaced_by=$3 WHERE id=$1',
        [old.id, this.now(), issued.id],
      );
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'BRANCH_INVITATION_RENEWED',
        resource: issued.id,
        details: { replaced: old.id, location_id: old.location_id },
      });
      return {
        ...issued,
        location_id: old.location_id,
        location_name: location.name,
      };
    });
  }

  async revokeInvitation(
    userId: string,
    restaurantId: string,
    invitationId: string,
  ) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const updated = await client.query(
        'UPDATE branch_invitations SET revoked_at=COALESCE(revoked_at,$3) WHERE id=$1 AND restaurant_id=$2',
        [invitationId, restaurantId, this.now()],
      );
      if (!updated.rowCount) throw notFound();
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'BRANCH_INVITATION_REVOKED',
        resource: invitationId,
        details: {},
      });
      return { id: invitationId, state: 'revoked' as InvitationState };
    });
  }

  private invitationError(state: InvitationState) {
    if (state === 'expired')
      return new AppError(409, 'INVITATION_EXPIRED', 'Invitación vencida.');
    if (state === 'revoked')
      return new AppError(
        409,
        'INVITATION_REVOKED',
        'Esta invitación fue reemplazada o revocada. Pide una nueva al administrador.',
      );
    return new AppError(
      409,
      'INVITATION_EXHAUSTED',
      'Esta invitación ya alcanzó su límite de usos.',
    );
  }

  /** Vista pública mínima para el formulario de registro. */
  async previewInvitation(token: string) {
    const row = (
      await this.pool.query<{
        restaurant_name: string;
        location_name: string;
        expires_at: Date;
        uses: number;
        max_uses: number;
        revoked_at: Date | null;
      }>(
        `SELECT r.name AS restaurant_name,l.name AS location_name,i.expires_at,i.uses,i.max_uses,i.revoked_at
         FROM branch_invitations i JOIN restaurants r ON r.id=i.restaurant_id
         JOIN locations l ON l.id=i.location_id WHERE i.token_hash=$1`,
        [tokenHash(token)],
      )
    ).rows[0];
    if (!row) throw notFound();
    const state = this.state(row);
    if (state !== 'valid') throw this.invitationError(state);
    return {
      restaurant_name: row.restaurant_name,
      location_name: row.location_name,
      expires_at: row.expires_at.toISOString(),
    };
  }

  /** Cuenta ya autenticada (registro o login) acepta y queda ligada a la sucursal. */
  async acceptInvitation(userId: string, token: string) {
    return withTransaction(this.pool, async (client) => {
      const row = (
        await client.query<{
          id: string;
          restaurant_id: string;
          location_id: string;
          expires_at: Date;
          uses: number;
          max_uses: number;
          revoked_at: Date | null;
        }>(
          'SELECT id,restaurant_id,location_id,expires_at,uses,max_uses,revoked_at FROM branch_invitations WHERE token_hash=$1 FOR UPDATE',
          [tokenHash(token)],
        )
      ).rows[0];
      if (!row) throw notFound();
      const state = this.state(row);
      if (state !== 'valid') throw this.invitationError(state);
      const restaurant = (
        await client.query<{ name: string; owner_user_id: string | null }>(
          'SELECT name,owner_user_id FROM restaurants WHERE id=$1',
          [row.restaurant_id],
        )
      ).rows[0];
      if (!restaurant) throw notFound();
      const location = await this.location(
        client,
        row.restaurant_id,
        row.location_id,
      );
      const already = (
        await client.query(
          `SELECT 1 FROM employee_locations el JOIN restaurant_employees e ON e.id=el.employee_id
           WHERE e.user_id=$1 AND el.location_id=$2 AND e.status='active'`,
          [userId, row.location_id],
        )
      ).rowCount;
      const employeeId = await this.link(client, userId, row.restaurant_id, [
        row.location_id,
      ]);
      // Reabrir el mismo QR con la misma cuenta no consume otro uso.
      if (!already)
        await client.query(
          'UPDATE branch_invitations SET uses=uses+1 WHERE id=$1',
          [row.id],
        );
      await this.audit(client, {
        actor: userId,
        restaurant: row.restaurant_id,
        action: 'BRANCH_INVITATION_ACCEPTED',
        resource: row.id,
        details: { employee_id: employeeId, location_id: row.location_id },
      });
      return {
        restaurant_id: row.restaurant_id,
        restaurant_name: restaurant.name,
        location_id: row.location_id,
        location_name: location.name,
        employee_id: employeeId,
      };
    });
  }
}
