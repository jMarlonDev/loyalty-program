import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../application/errors.js';
import type {
  StaffCommand,
  StaffQuery,
  StaffRepository,
  StaffResult,
} from '../application/staff.js';
import { canManageStaff, type StaffRole } from '../domain/staff.js';
import { requireStaff, type StaffAccess } from './staff-access.js';
import { createTokenCodec } from './token-codec.js';
import {
  idempotent,
  lockActor,
  lockRestaurant,
  withTransaction,
} from './transactions.js';

type Row = Record<string, unknown> & { id: string };
interface Invitation extends Row {
  restaurant_id: string;
  email: string;
  role_id: string;
  role: StaffRole;
  invited_by: string;
  status: string;
  expires_at: Date;
  accepted_by: string | null;
}
const forbidden = () =>
  new AppError(403, 'FORBIDDEN', 'Insufficient restaurant permissions');
const notFound = () => new AppError(404, 'NOT_FOUND', 'Resource not found');
const conflict = () =>
  new AppError(409, 'CONFLICT', 'Operation conflicts with current state');
const staffSelection =
  'SELECT e.*,r.rol_type AS role FROM restaurant_employees e JOIN roles r ON r.id=e.role_id';
const invitationSelection =
  'SELECT i.*,r.rol_type AS role FROM invitations i JOIN roles r ON r.id=i.role_id';

function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function publicInvitation(invitation: Row): Row {
  const { token_hash: _hash, ...data } = invitation;
  return data;
}

export class PgStaffRepository implements StaffRepository {
  private readonly now: () => Date;
  private readonly codec: ReturnType<typeof createTokenCodec>;
  constructor(
    private readonly pool: Pool,
    options: { tokenEncryptionKey: string; now?: () => Date },
  ) {
    this.now = options.now ?? (() => new Date());
    this.codec = createTokenCodec(options.tokenEncryptionKey);
  }

  async execute(command: StaffCommand): Promise<StaffResult> {
    const result = await withTransaction(this.pool, async (client) => {
      if (command.action === 'invitation.accept')
        return this.accept(client, command);
      if (command.restaurantId)
        await lockRestaurant(client, command.restaurantId);
      await lockActor(client, command.actor.id);
      let staff: StaffAccess | undefined;
      if (command.action !== 'restaurant.create') {
        staff = await requireStaff(
          client,
          command.actor.id,
          command.restaurantId as string,
          ['owner', 'admin'],
          { allowSuspendedOwner: true },
        );
        await this.authorizeTarget(client, command, staff);
      }
      const result = await idempotent(
        client,
        {
          actorId: command.actor.id,
          key: command.key,
          operation: command.action,
          payload: {
            restaurantId: command.restaurantId,
            targetId: command.targetId,
            input: command.input,
          },
        },
        async () => {
          const data = await this.mutate(client, command, staff);
          const restaurantId = command.restaurantId ?? data.id;
          await this.audit(client, command, restaurantId, data.id);
          return json({ data });
        },
      );
      if (command.action === 'restaurant.create') {
        await requireStaff(
          client,
          command.actor.id,
          result.data.id,
          ['owner'],
          { allowSuspendedOwner: true },
        );
      }
      return result;
    });
    if (command.action === 'invitation.create') {
      const data = result.data as Row & { token_encrypted: string };
      const { token_encrypted, ...publicData } = data;
      return {
        data: { ...publicData, token: this.codec.decrypt(token_encrypted) },
      };
    }
    return result;
  }

  private async authorizeTarget(
    client: PoolClient,
    command: StaffCommand,
    staff: StaffAccess,
  ) {
    if (
      command.action === 'restaurant.update' &&
      Object.hasOwn(command.input, 'status') &&
      staff.role !== 'owner'
    ) {
      throw forbidden();
    }
    if (command.action === 'employee.update') {
      const result = await client.query<StaffAccess>(
        `${staffSelection} WHERE e.id=$1 AND e.restaurant_id=$2`,
        [command.targetId, command.restaurantId],
      );
      const target = result.rows[0];
      if (!target) throw notFound();
      const nextRole = (command.input.role ?? target.role) as StaffRole;
      if (!canManageStaff(staff.role, target.role, nextRole)) throw forbidden();
    }
    if (command.action === 'location.update') {
      const result = await client.query(
        'SELECT id FROM locations WHERE id=$1 AND restaurant_id=$2',
        [command.targetId, command.restaurantId],
      );
      if (!result.rowCount) throw notFound();
    }
    if (command.action === 'invitation.create') {
      if (
        !canManageStaff(staff.role, 'employee', command.input.role as StaffRole)
      )
        throw forbidden();
    }
    if (command.action === 'invitation.revoke') {
      const result = await client.query<Invitation>(
        `${invitationSelection} WHERE i.id=$1 AND i.restaurant_id=$2`,
        [command.targetId, command.restaurantId],
      );
      const invitation = result.rows[0];
      if (!invitation) throw notFound();
      if (!canManageStaff(staff.role, invitation.role, invitation.role))
        throw forbidden();
      // Repeating a revoked operation is harmless; accepted invitations cannot be revoked.
      if (invitation.status === 'accepted') throw conflict();
    }
  }

  private async roleId(client: PoolClient, role: string): Promise<string> {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM roles WHERE rol_type=$1',
      [role],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const result = await client.query<{ id: string }>(
      `INSERT INTO roles(id,rol_type,created_at) VALUES($1,$2,$3)
      ON CONFLICT(rol_type) DO UPDATE SET rol_type=EXCLUDED.rol_type RETURNING id`,
      [randomUUID(), role, this.now()],
    );
    return (result.rows[0] as { id: string }).id;
  }

  private async update(
    client: PoolClient,
    table: 'restaurants' | 'locations',
    id: string,
    input: Record<string, string | null>,
    permitted: string[],
  ): Promise<Row> {
    const entries = Object.entries(input).filter(([key]) =>
      permitted.includes(key),
    );
    const values: unknown[] = entries.map(([, value]) => value);
    values.push(this.now(), id);
    const assignments = entries.map(([key], index) => `${key}=$${index + 1}`);
    assignments.push(`updated_at=$${values.length - 1}`);
    const result = await client.query<Row>(
      `UPDATE ${table} SET ${assignments.join(',')}
      WHERE id=$${values.length} RETURNING *`,
      values,
    );
    return result.rows[0] as Row;
  }

  private async mutate(
    client: PoolClient,
    command: StaffCommand,
    staff?: StaffAccess,
  ): Promise<Row> {
    const input = command.input;
    const now = this.now();
    const id = randomUUID();
    switch (command.action) {
      case 'restaurant.create': {
        const result = await client.query<Row>(
          `INSERT INTO restaurants(id,name,slug,email,phone,status,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,'active',$6,$6) RETURNING *`,
          [
            id,
            input.name,
            input.slug,
            input.email ?? null,
            input.phone ?? null,
            now,
          ],
        );
        await client.query(
          `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at)
          VALUES($1,$2,$3,$4,'active',$5,$5,$5)`,
          [
            randomUUID(),
            command.actor.id,
            id,
            await this.roleId(client, 'owner'),
            now,
          ],
        );
        return result.rows[0] as Row;
      }
      case 'restaurant.update':
        return this.update(
          client,
          'restaurants',
          command.restaurantId as string,
          input,
          ['name', 'email', 'phone', 'status'],
        );
      case 'location.create': {
        const result = await client.query<Row>(
          `INSERT INTO locations(id,restaurant_id,name,address,city,department,phone,status,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$8) RETURNING *`,
          [
            id,
            command.restaurantId,
            input.name,
            input.address,
            input.city,
            input.department,
            input.phone ?? null,
            now,
          ],
        );
        return result.rows[0] as Row;
      }
      case 'location.update':
        return this.update(
          client,
          'locations',
          command.targetId as string,
          input,
          ['name', 'address', 'city', 'department', 'phone', 'status'],
        );
      case 'employee.update': {
        const role = input.role ? await this.roleId(client, input.role) : null;
        await client.query(
          `UPDATE restaurant_employees SET role_id=COALESCE($1,role_id),status=COALESCE($2,status),
          ended_at=CASE WHEN $2='disabled' THEN $3 WHEN $2='active' THEN NULL ELSE ended_at END,updated_at=$3
          WHERE id=$4 AND restaurant_id=$5`,
          [
            role,
            input.status ?? null,
            now,
            command.targetId,
            command.restaurantId,
          ],
        );
        return (
          await client.query<Row>(`${staffSelection} WHERE e.id=$1`, [
            command.targetId,
          ])
        ).rows[0] as Row;
      }
      case 'invitation.create': {
        const token = this.codec.generate();
        const result = await client.query<Row>(
          `INSERT INTO invitations(id,restaurant_id,email,role_id,token_hash,
          expires_at,status,invited_by,created_at) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8) RETURNING *`,
          [
            id,
            command.restaurantId,
            input.email,
            await this.roleId(client, input.role as string),
            this.codec.hash(token),
            new Date(now.getTime() + 7 * 86400000),
            staff?.id,
            now,
          ],
        );
        return {
          ...publicInvitation(result.rows[0] as Row),
          role: input.role,
          token_encrypted: this.codec.encrypt(token),
        };
      }
      case 'invitation.revoke': {
        const result = await client.query<Row>(
          `UPDATE invitations SET status='revoked' WHERE id=$1 RETURNING *`,
          [command.targetId],
        );
        return publicInvitation(result.rows[0] as Row);
      }
      default:
        throw new Error('Unsupported staff mutation');
    }
  }

  private async accept(
    client: PoolClient,
    command: StaffCommand,
  ): Promise<StaffResult> {
    const tokenHash = this.codec.hash(command.input.token as string);
    const found = await client.query<Invitation>(
      `${invitationSelection} WHERE i.token_hash=$1`,
      [tokenHash],
    );
    const location = found.rows[0];
    if (!location) throw notFound();
    await lockRestaurant(client, location.restaurant_id);
    await lockActor(client, command.actor.id);
    const current = await client.query<Invitation>(
      `${invitationSelection} WHERE i.id=$1 FOR UPDATE OF i`,
      [location.id],
    );
    const invitation = current.rows[0] as Invitation;
    if (
      !command.actor.emailVerified ||
      invitation.email !== command.actor.email.toLowerCase()
    )
      throw forbidden();
    const issuer = (
      await client.query<StaffAccess>(`${staffSelection} WHERE e.id=$1`, [
        invitation.invited_by,
      ])
    ).rows[0];
    if (!issuer) throw forbidden();
    await lockActor(client, issuer.user_id);
    await requireStaff(client, issuer.user_id, invitation.restaurant_id, [
      'owner',
      'admin',
    ]);
    const existing = (
      await client.query<StaffAccess>(
        `${staffSelection} WHERE e.user_id=$1 AND e.restaurant_id=$2`,
        [command.actor.id, invitation.restaurant_id],
      )
    ).rows[0];
    if (
      !canManageStaff(
        issuer.role,
        existing?.role ?? 'employee',
        invitation.role,
      )
    )
      throw forbidden();
    if (invitation.status === 'revoked') throw conflict();
    if (invitation.status === 'accepted') {
      if (
        invitation.accepted_by !== command.actor.id ||
        !existing ||
        existing.status !== 'active'
      )
        throw forbidden();
    } else if (invitation.expires_at.getTime() <= this.now().getTime())
      throw conflict();
    return idempotent(
      client,
      {
        actorId: command.actor.id,
        key: command.key,
        operation: command.action,
        payload: { token_hash: tokenHash },
      },
      async () => {
        if (invitation.status === 'accepted') return json({ data: existing });
        const now = this.now();
        if (existing) {
          await client.query(
            `UPDATE restaurant_employees SET role_id=$1,status='active',ended_at=NULL,updated_at=$2 WHERE id=$3`,
            [invitation.role_id, now, existing.id],
          );
        } else {
          await client.query(
            `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at)
          VALUES($1,$2,$3,$4,'active',$5,$5,$5)`,
            [
              randomUUID(),
              command.actor.id,
              invitation.restaurant_id,
              invitation.role_id,
              now,
            ],
          );
        }
        await client.query(
          `UPDATE invitations SET status='accepted',accepted_by=$1 WHERE id=$2`,
          [command.actor.id, invitation.id],
        );
        const data = (
          await client.query<Row>(
            `${staffSelection} WHERE e.user_id=$1 AND e.restaurant_id=$2`,
            [command.actor.id, invitation.restaurant_id],
          )
        ).rows[0] as Row;
        await this.audit(client, command, invitation.restaurant_id, data.id);
        return json({ data });
      },
    );
  }

  private async audit(
    client: PoolClient,
    command: StaffCommand,
    restaurantId: string,
    resourceId: string,
  ) {
    await client.query(
      `INSERT INTO audit_events(id,actor_id,restaurant_id,action,resource_id,request_id,details,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        command.actor.id,
        restaurantId,
        command.action,
        resourceId,
        command.requestId,
        JSON.stringify({
          fields: Object.keys(command.input).filter((name) => name !== 'token'),
        }),
        this.now(),
      ],
    );
  }

  async query(query: StaffQuery): Promise<StaffResult> {
    return withTransaction(this.pool, async (client) => {
      if (query.restaurantId) await lockRestaurant(client, query.restaurantId);
      await lockActor(client, query.actor.id);
      const params = [
        query.restaurantId ?? query.actor.id,
        query.cursor ?? null,
        query.limit + 1,
      ];
      let sql: string;
      if (query.collection === 'restaurants') {
        sql = `SELECT r.*,role.rol_type AS actor_role FROM restaurants r JOIN restaurant_employees e ON e.restaurant_id=r.id
          JOIN roles role ON role.id=e.role_id WHERE e.user_id=$1 AND e.status='active'
          AND (r.status='active' OR role.rol_type='owner') AND ($2::uuid IS NULL OR r.id>$2)
          ORDER BY r.id LIMIT $3`;
      } else {
        const allowed: StaffRole[] = ['restaurant', 'locations'].includes(
          query.collection,
        )
          ? ['owner', 'admin', 'employee']
          : ['owner', 'admin'];
        await requireStaff(
          client,
          query.actor.id,
          query.restaurantId as string,
          allowed,
          { allowSuspendedOwner: true },
        );
        if (query.collection === 'restaurant') {
          return json({
            data: (
              await client.query<Row>('SELECT * FROM restaurants WHERE id=$1', [
                query.restaurantId,
              ])
            ).rows[0],
          });
        }
        sql =
          query.collection === 'locations'
            ? 'SELECT * FROM locations WHERE restaurant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3'
            : query.collection === 'employees'
              ? `SELECT e.*,r.rol_type AS role,u.full_name,u.email FROM restaurant_employees e JOIN roles r ON r.id=e.role_id JOIN users u ON u.id=e.user_id WHERE e.restaurant_id=$1 AND ($2::uuid IS NULL OR e.id>$2) ORDER BY e.id LIMIT $3`
              : `${invitationSelection} WHERE i.restaurant_id=$1 AND ($2::uuid IS NULL OR i.id>$2) ORDER BY i.id LIMIT $3`;
      }
      const rows = (await client.query<Row>(sql, params)).rows;
      const data = rows
        .slice(0, query.limit)
        .map((row) =>
          query.collection === 'invitations' ? publicInvitation(row) : row,
        );
      return json({
        data,
        next_cursor: rows.length > query.limit ? data.at(-1)?.id : null,
      });
    });
  }
}
