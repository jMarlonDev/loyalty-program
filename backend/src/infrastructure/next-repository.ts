import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../application/errors.js';
import type { CardView, CustomerPrincipal } from '../application/next.js';
import {
  maskPhone,
  maskPhoneGrouped,
  normalizePhone,
} from '../application/next.js';
import { createCardQr } from './card-qr.js';
import { createTokenCodec } from './token-codec.js';
import { idempotent, withTransaction } from './transactions.js';

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 400;
const HOUR = 60 * 60 * 1000;
/** NEXT-006: intentos de inscripción por IP y por dispositivo en una hora. */
export const ENROLL_ATTEMPTS_PER_HOUR = 5;
const TRANSFER_MINUTES = 10;
const notFound = () => new AppError(404, 'NOT_FOUND', 'No existe el recurso.');
const conflict = (message: string, code = 'CONFLICT') =>
  new AppError(409, code, message);
const forbidden = () =>
  new AppError(403, 'FORBIDDEN', 'No tienes acceso a este recurso.');

type CardRow = {
  id: string;
  membership_id: string;
  customer_id: string;
  program_id: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_status: string;
  program_name: string;
  program_status: string;
  program_description: string | null;
  public_code: string;
  stamps_required: number;
  reward_description: string;
  logo_url: string | null;
  background_color: string | null;
  text_color: string | null;
  card_message: string | null;
  stamp_cooldown_minutes: number;
  card_status: string;
  card_version: number;
  membership_status: string;
  customer_phone: string | null;
  customer_name: string | null;
  qr_token_encrypted: string | null;
};
type CycleRow = {
  id: string;
  number: number;
  state: 'collecting' | 'reward_available' | 'redeemed';
  stamps: number;
  target: number;
};
type RewardRow = {
  id: string;
  description: string;
  status: string;
  accounting_mode: string;
  earned_at: Date;
  cycle_id: string | null;
  stamps_spent: number;
};
type VoucherRow = {
  id: string;
  reward_id: string;
  token_encrypted: string;
  status: string;
  expires_at: Date | null;
};
type StaffRow = {
  id: string;
  user_id: string;
  restaurant_id: string;
  phone: string | null;
};

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export class PgNextRepository {
  private readonly codec;
  private readonly cardQr;
  private readonly now: () => Date;
  private readonly origin: string;
  /** D-06: sobrescribe la espera del programa (solo desarrollo, STAMP_COOLDOWN_MINUTES). */
  private readonly cooldownOverride: number | undefined;
  constructor(
    private readonly pool: Pool,
    options: {
      tokenEncryptionKey: string;
      now?: () => Date;
      publicOrigin?: string;
      stampCooldownMinutes?: number | undefined;
    },
  ) {
    this.codec = createTokenCodec(options.tokenEncryptionKey);
    this.cardQr = createCardQr(options.tokenEncryptionKey);
    this.cooldownOverride = options.stampCooldownMinutes;
    this.now = options.now ?? (() => new Date());
    this.origin = options.publicOrigin ?? '';
  }

  private async staff(
    client: PoolClient,
    userId: string,
    restaurantId: string,
  ): Promise<StaffRow> {
    const owner = await client.query<{
      id: string;
      owner_user_id: string | null;
      status: string;
    }>('SELECT id,owner_user_id,status FROM restaurants WHERE id=$1', [
      restaurantId,
    ]);
    const restaurant = owner.rows[0];
    if (!restaurant) throw notFound();
    if (restaurant.status !== 'active')
      throw new AppError(
        403,
        'RESTAURANT_SUSPENDED',
        'El restaurante está suspendido.',
      );
    const employee = await client.query<StaffRow>(
      "SELECT id,user_id,restaurant_id,phone FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2 AND status='active'",
      [userId, restaurantId],
    );
    if (employee.rows[0]) return employee.rows[0];
    throw forbidden();
  }

  private async owner(
    client: PoolClient,
    userId: string,
    restaurantId: string,
  ) {
    const restaurant = (
      await client.query<{
        id: string;
        owner_user_id: string | null;
        status: string;
      }>('SELECT id,owner_user_id,status FROM restaurants WHERE id=$1', [
        restaurantId,
      ])
    ).rows[0];
    if (!restaurant) throw notFound();
    if (restaurant.status !== 'active')
      throw new AppError(
        403,
        'RESTAURANT_SUSPENDED',
        'El restaurante está suspendido.',
      );
    if (restaurant.owner_user_id === userId) return;
    const owner = (
      await client.query(
        `SELECT 1 FROM restaurant_employees e JOIN roles r ON r.id=e.role_id
         WHERE e.user_id=$1 AND e.restaurant_id=$2 AND e.status='active' AND r.rol_type='owner'`,
        [userId, restaurantId],
      )
    ).rowCount;
    if (!owner) throw forbidden();
  }

  private async card(
    client: PoolClient,
    cardId: string,
    restaurantId?: string,
  ): Promise<CardRow> {
    const result = await client.query<CardRow>(
      `SELECT c.id,c.membership_id,m.user_id AS customer_id,m.program_id,
        c.status AS card_status,c.version AS card_version,m.status AS membership_status,
        p.name AS program_name,p.status AS program_status,p.description AS program_description,
        p.public_code,p.stamps_required,p.reward_description,p.logo_url,p.background_color,
        p.text_color,p.card_message,p.stamp_cooldown_minutes,p.restaurant_id,
        r.name AS restaurant_name,r.status AS restaurant_status,
        u.phone AS customer_phone,u.full_name AS customer_name,c.qr_token_encrypted
       FROM loyalty_cards c
       JOIN memberships m ON m.id=c.membership_id
       JOIN loyalty_programs p ON p.id=m.program_id
       JOIN restaurants r ON r.id=p.restaurant_id
       JOIN users u ON u.id=m.user_id
       WHERE c.id=$1${restaurantId ? ' AND p.restaurant_id=$2' : ''}`,
      restaurantId ? [cardId, restaurantId] : [cardId],
    );
    const row = result.rows[0];
    if (!row) throw notFound();
    return row;
  }

  /**
   * BRANCH-001: sucursal donde opera el empleado. Debe pertenecer a ella; si
   * tiene una sola se usa esa, si tiene varias debe elegirla.
   */
  private async staffLocation(
    client: PoolClient,
    staff: StaffRow,
    requested?: string | undefined,
  ): Promise<string> {
    const assigned = (
      await client.query<{ id: string }>(
        `SELECT l.id FROM employee_locations el JOIN locations l ON l.id=el.location_id
         WHERE el.employee_id=$1 AND l.status='active' ORDER BY l.created_at,l.id`,
        [staff.id],
      )
    ).rows.map((row) => row.id);
    if (requested) {
      if (!assigned.includes(requested))
        throw new AppError(
          403,
          'LOCATION_FORBIDDEN',
          'No perteneces a esta sucursal.',
        );
      return requested;
    }
    if (assigned.length === 1) return assigned[0] as string;
    if (assigned.length === 0)
      throw new AppError(
        403,
        'NO_LOCATION',
        'No tienes una sucursal asignada. Pide al administrador que te asigne una.',
      );
    throw new AppError(
      400,
      'LOCATION_REQUIRED',
      'Elige la sucursal en la que estás atendiendo.',
    );
  }

  /** D-06: espera mínima entre sellos para el mismo cliente en la misma sucursal. */
  private async assertCooldown(
    client: PoolClient,
    card: CardRow,
    locationId: string,
  ): Promise<void> {
    const minutes = this.cooldownOverride ?? card.stamp_cooldown_minutes;
    if (!minutes || minutes <= 0) return;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `stamp:${card.customer_id}:${locationId}`,
    ]);
    const last = (
      await client.query<{ created_at: Date | null }>(
        `SELECT max(pu.created_at) AS created_at FROM purchases pu
         JOIN memberships m ON m.id=pu.membership_id
         WHERE m.user_id=$1 AND pu.location_id=$2 AND pu.reversed_at IS NULL`,
        [card.customer_id, locationId],
      )
    ).rows[0]?.created_at;
    if (!last) return;
    const remaining = last.getTime() + minutes * 60_000 - this.now().getTime();
    if (remaining <= 0) return;
    const totalMinutes = Math.ceil(remaining / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const rest = totalMinutes % 60;
    const wait =
      hours > 0
        ? `${hours} h${rest ? ` ${rest} min` : ''}`
        : `${totalMinutes} min`;
    throw new AppError(
      429,
      'STAMP_COOLDOWN',
      `Este cliente ya recibió un sello en esta sucursal. Podrá recibir el siguiente en ${wait}.`,
    );
  }

  private async activeCard(card: CardRow) {
    if (card.restaurant_status !== 'active')
      throw conflict('El restaurante está suspendido.');
    if (card.program_status !== 'active')
      throw conflict('El programa no está activo.');
    if (card.card_status !== 'active' || card.membership_status !== 'active')
      throw conflict('La tarjeta no está activa.');
  }

  private async latestCycle(
    client: PoolClient,
    membershipId: string,
    lock = false,
  ): Promise<CycleRow | null> {
    const current = await client.query<CycleRow>(
      `SELECT id,number,state,stamps,target FROM loyalty_cycles
       WHERE membership_id=$1 ORDER BY number DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [membershipId],
    );
    return current.rows[0] ?? null;
  }

  private async assertNotSelf(
    client: PoolClient,
    staff: StaffRow,
    card: CardRow,
  ): Promise<void> {
    if (!card.customer_phone) return;
    const accountPhone = (
      await client.query<{ phone: string | null }>(
        'SELECT phone FROM users WHERE id=$1',
        [staff.user_id],
      )
    ).rows[0]?.phone;
    const phones = [staff.phone, accountPhone].filter(
      (phone): phone is string => Boolean(phone),
    );
    if (phones.includes(card.customer_phone)) throw forbidden();
  }

  private async cycleForPurchase(
    client: PoolClient,
    card: CardRow,
  ): Promise<CycleRow> {
    const current = await this.latestCycle(client, card.membership_id, true);
    if (current?.state === 'collecting') return current;
    const number = (current?.number ?? 0) + 1;
    let stamps = 0;
    let state: CycleRow['state'] = 'collecting';
    let existingReward: { id: string } | undefined;
    if (!current) {
      existingReward = (
        await client.query<{ id: string }>(
          "SELECT id FROM rewards WHERE membership_id=$1 AND status='available' AND cycle_id IS NULL ORDER BY earned_at,id LIMIT 1",
          [card.membership_id],
        )
      ).rows[0];
      if (existingReward) {
        state = 'reward_available';
        stamps = card.stamps_required;
      } else {
        const balance =
          (
            await client.query<{ balance: number }>(
              'SELECT COALESCE(sum(stamp_delta),0)::int AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
              [card.membership_id],
            )
          ).rows[0]?.balance ?? 0;
        stamps = Math.max(0, Math.min(balance, card.stamps_required - 1));
      }
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO loyalty_cycles(id,membership_id,number,state,stamps,target,opened_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        card.membership_id,
        number,
        state,
        stamps,
        card.stamps_required,
        this.now(),
      ],
    );
    if (existingReward) {
      await client.query(
        'UPDATE rewards SET cycle_id=$1 WHERE id=$2 AND cycle_id IS NULL',
        [id, existingReward.id],
      );
    }
    return {
      id,
      number,
      state,
      stamps,
      target: card.stamps_required,
    };
  }

  private async activeVoucher(
    client: PoolClient,
    rewardId: string,
  ): Promise<VoucherRow | null> {
    return (
      (
        await client.query<VoucherRow>(
          "SELECT id,reward_id,token_encrypted,status,expires_at FROM reward_vouchers WHERE reward_id=$1 AND status='active'",
          [rewardId],
        )
      ).rows[0] ?? null
    );
  }

  private async issueVoucher(
    client: PoolClient,
    rewardId: string,
    version = 1,
  ): Promise<{ token: string; expires_at: Date | null }> {
    const existing = await this.activeVoucher(client, rewardId);
    if (existing) {
      const expires = existing.expires_at;
      if (expires && expires.getTime() <= this.now().getTime()) {
        await client.query(
          "UPDATE reward_vouchers SET status='expired' WHERE id=$1",
          [existing.id],
        );
      } else {
        return {
          token: this.codec.decrypt(existing.token_encrypted),
          expires_at: expires,
        };
      }
    }
    const token = this.codec.generate();
    const expires = new Date(this.now().getTime() + 90 * DAY);
    await client.query(
      `INSERT INTO reward_vouchers(id,reward_id,token_hash,token_encrypted,status,version,expires_at,created_at)
       VALUES($1,$2,$3,$4,'active',$5,$6,$7)`,
      [
        randomUUID(),
        rewardId,
        this.codec.hash(token),
        this.codec.encrypt(token),
        version,
        expires,
        this.now(),
      ],
    );
    return { token, expires_at: expires };
  }

  private async rewardView(
    client: PoolClient,
    reward: RewardRow,
    phone: string | null,
    restaurantId: string,
  ) {
    const voucher =
      reward.status === 'available'
        ? await this.issueVoucher(client, reward.id)
        : null;
    const rewardUrl = voucher
      ? `${this.origin}/reward#${new URLSearchParams({
          token: voucher.token,
          restaurant: restaurantId,
        }).toString()}`
      : null;
    const whatsappUrl =
      voucher && phone
        ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(
            `Tu premio está listo. Muestra este código al personal: ${rewardUrl}`,
          )}`
        : null;
    return {
      id: reward.id,
      description: reward.description,
      status: reward.status,
      accounting_mode: reward.accounting_mode,
      earned_at: reward.earned_at.toISOString(),
      voucher: voucher
        ? {
            token: voucher.token,
            expires_at: voucher.expires_at?.toISOString() ?? null,
          }
        : null,
      whatsapp_url: whatsappUrl,
    };
  }

  private async view(client: PoolClient, card: CardRow): Promise<CardView> {
    const cycle = await this.latestCycle(client, card.membership_id);
    const rewards = (
      await client.query<RewardRow>(
        `SELECT id,description,status,accounting_mode,earned_at,cycle_id,stamps_spent
         FROM rewards WHERE membership_id=$1
         ORDER BY earned_at DESC,id LIMIT 20`,
        [card.membership_id],
      )
    ).rows;
    const balance =
      (
        await client.query<{ balance: number }>(
          'SELECT COALESCE(sum(stamp_delta),0)::int AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
          [card.membership_id],
        )
      ).rows[0]?.balance ?? 0;
    const phone = card.customer_phone;
    const rewardViews = [];
    for (const reward of rewards)
      rewardViews.push(
        await this.rewardView(client, reward, phone, card.restaurant_id),
      );
    return {
      id: card.id,
      membership_id: card.membership_id,
      program_id: card.program_id,
      restaurant_id: card.restaurant_id,
      restaurant_name: card.restaurant_name,
      program_name: card.program_name,
      status: card.card_status,
      version: card.card_version,
      balance,
      target: cycle?.target ?? card.stamps_required,
      cycle: cycle
        ? {
            id: cycle.id,
            number: cycle.number,
            state: cycle.state,
            stamps: cycle.stamps,
            target: cycle.target,
          }
        : null,
      rewards: rewardViews,
      program: {
        name: card.program_name,
        description: card.program_description,
        stamps_required: card.stamps_required,
        reward_description: card.reward_description,
        logo_url: card.logo_url,
        background_color: card.background_color ?? '#22346B',
        text_color: card.text_color ?? '#FFFFFF',
        card_message: card.card_message,
        public_code: card.public_code,
      },
    };
  }

  private async addEvent(
    client: PoolClient,
    card: CardRow,
    type:
      | 'purchase.recorded'
      | 'reward.available'
      | 'reward.redeemed'
      | 'card.changed',
  ): Promise<{ version: number; event_id: string }> {
    const version = await client.query<{ version: number }>(
      'UPDATE loyalty_cards SET version=version+1 WHERE id=$1 RETURNING version',
      [card.id],
    );
    const next = version.rows[0]?.version;
    if (!next) throw notFound();
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO card_events_outbox(id,card_id,version,type,occurred_at,available_at)
       VALUES($1,$2,$3,$4,$5,$5)`,
      [eventId, card.id, next, type, this.now()],
    );
    card.card_version = next;
    return { version: next, event_id: eventId };
  }

  async startSession(input: {
    phone: unknown;
    country: unknown;
  }): Promise<{ token: string; principal: CustomerPrincipal }> {
    const phone = normalizePhone(input.phone, input.country);
    const country = String(input.country).toUpperCase();
    const token = this.codec.generate();
    const now = this.now();
    const expires = new Date(now.getTime() + SESSION_DAYS * DAY);
    return withTransaction(this.pool, async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`customer:${phone}`],
      );
      let customer = (
        await client.query<{ id: string }>(
          'SELECT id FROM customers WHERE phone=$1',
          [phone],
        )
      ).rows[0];
      if (!customer) {
        const id = randomUUID();
        await client.query(
          `INSERT INTO users(id,full_name,phone,status,created_at,updated_at)
           VALUES($1,'Cliente',$2,'active',$3,$3)`,
          [id, phone, now],
        );
        await client.query(
          `INSERT INTO customers(id,phone,country,status,phone_verified_at,created_at,updated_at)
           VALUES($1,$2,$3,'active',$4,$4,$4)`,
          [id, phone, country, now],
        );
        customer = { id };
      }
      const sessionId = randomUUID();
      await client.query(
        `INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at,last_seen_at,created_at)
         VALUES($1,$2,$3,$4,$5,$5)`,
        [sessionId, customer.id, hash(token), expires, now],
      );
      return {
        token,
        principal: {
          session_id: sessionId,
          card_id: null,
          customer_id: customer.id,
          user_id: customer.id,
          phone,
          phone_masked: maskPhone(phone),
          expires_at: expires.toISOString(),
        },
      };
    });
  }

  async sessionActive(sessionId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM customer_sessions
       WHERE id=$1 AND revoked_at IS NULL AND expires_at > $2`,
      [sessionId, this.now()],
    );
    return (rowCount ?? 0) > 0;
  }

  async cardAccessVersion(
    userId: string,
    cardId: string,
  ): Promise<number | null> {
    const { rows } = await this.pool.query<{ version: number }>(
      `SELECT c.version FROM loyalty_cards c
       JOIN memberships m ON m.id=c.membership_id
       WHERE c.id=$1 AND m.user_id=$2 AND m.status='active' AND c.status='active'`,
      [cardId, userId],
    );
    return rows[0]?.version ?? null;
  }

  async authenticate(token: string): Promise<CustomerPrincipal> {
    const result = await this.pool.query<{
      session_id: string;
      card_id: string | null;
      customer_id: string;
      phone: string;
      expires_at: Date;
    }>(
      `SELECT s.id AS session_id,s.card_id,s.customer_id,s.expires_at,u.phone
       FROM customer_sessions s JOIN customers c ON c.id=s.customer_id
       JOIN users u ON u.id=c.id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2
         AND c.status='active' AND u.status='active'`,
      [hash(token), this.now()],
    );
    const row = result.rows[0];
    if (!row)
      throw new AppError(401, 'UNAUTHENTICATED', 'Tu sesión ha caducado.');
    await this.pool.query(
      'UPDATE customer_sessions SET last_seen_at=$2 WHERE id=$1',
      [row.session_id, this.now()],
    );
    return {
      session_id: row.session_id,
      card_id: row.card_id,
      customer_id: row.customer_id,
      user_id: row.customer_id,
      phone: row.phone,
      phone_masked: maskPhone(row.phone),
      expires_at: row.expires_at.toISOString(),
    };
  }

  async endSession(sessionId: string): Promise<void> {
    await this.pool.query(
      'UPDATE customer_sessions SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL',
      [sessionId, this.now()],
    );
  }

  async enroll(principal: CustomerPrincipal, publicCode: string) {
    return withTransaction(this.pool, async (client) => {
      const program = (
        await client.query<{
          id: string;
          restaurant_id: string;
          status: string;
          stamps_required: number;
          reward_description: string;
        }>(
          `SELECT p.id,p.restaurant_id,p.status,p.stamps_required,p.reward_description
           FROM loyalty_programs p JOIN restaurants r ON r.id=p.restaurant_id
           WHERE p.public_code=$1 AND r.status='active'`,
          [publicCode],
        )
      ).rows[0];
      if (!program) throw notFound();
      if (program.status !== 'active')
        throw conflict('El programa no admite nuevas inscripciones.');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`enroll:${principal.user_id}:${program.id}`],
      );
      let membership = (
        await client.query<{ id: string }>(
          "SELECT id FROM memberships WHERE user_id=$1 AND program_id=$2 AND status<>'closed'",
          [principal.user_id, program.id],
        )
      ).rows[0];
      if (!membership) {
        const created = await this.createMembership(
          client,
          principal.user_id,
          program,
          0,
        );
        membership = { id: created.membershipId };
      }
      const card = (
        await client.query<{ id: string }>(
          'SELECT id FROM loyalty_cards WHERE membership_id=$1',
          [membership.id],
        )
      ).rows[0];
      if (!card) throw notFound();
      return this.view(client, await this.card(client, card.id));
    });
  }

  // ---------------------------------------------------------------------------
  // NEXT-006: inscripción por teléfono, tarjeta por dispositivo, cierre y
  // transferencia. El teléfono es la credencial de alta, nunca la de acceso:
  // un número con tarjeta activa se rechaza sin revelar sus datos.
  // ---------------------------------------------------------------------------

  private owns(principal: CustomerPrincipal, card: CardRow): boolean {
    if (card.customer_id !== principal.user_id) return false;
    return principal.card_id === null || principal.card_id === card.id;
  }

  private async audit(
    client: PoolClient | Pool,
    input: {
      actor: string;
      restaurant: string | null;
      action: string;
      resource: string;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
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

  /** Registra el intento y rechaza si la IP o el dispositivo superan el límite horario. */
  async limitEnrollment(keys: {
    ip?: string | undefined;
    device?: string | undefined;
  }): Promise<void> {
    const now = this.now();
    const since = new Date(now.getTime() - HOUR);
    for (const [scope, key] of [
      ['ip', keys.ip],
      ['device', keys.device],
    ] as const) {
      if (!key) continue;
      const keyHash = hash(`${scope}:${key}`);
      await this.pool.query(
        'DELETE FROM enrollment_attempts WHERE scope=$1 AND key_hash=$2 AND created_at<=$3',
        [scope, keyHash, since],
      );
      await this.pool.query(
        'INSERT INTO enrollment_attempts(id,scope,key_hash,created_at) VALUES($1,$2,$3,$4)',
        [randomUUID(), scope, keyHash, now],
      );
      const count =
        (
          await this.pool.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM enrollment_attempts WHERE scope=$1 AND key_hash=$2 AND created_at>$3',
            [scope, keyHash, since],
          )
        ).rows[0]?.n ?? 0;
      if (count > ENROLL_ATTEMPTS_PER_HOUR)
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Demasiados intentos. Vuelve a intentarlo más tarde.',
        );
    }
  }

  private async activeProgram(client: PoolClient, publicCode: string) {
    const program = (
      await client.query<{
        id: string;
        restaurant_id: string;
        status: string;
        stamps_required: number;
      }>(
        `SELECT p.id,p.restaurant_id,p.status,p.stamps_required
         FROM loyalty_programs p JOIN restaurants r ON r.id=p.restaurant_id
         WHERE p.public_code=$1 AND r.status='active'`,
        [publicCode],
      )
    ).rows[0];
    if (!program) throw notFound();
    if (program.status !== 'active')
      throw conflict('El programa no admite nuevas inscripciones.');
    return program;
  }

  private async createMembership(
    client: PoolClient,
    customerId: string,
    program: { id: string; stamps_required: number },
    previousCards: number,
  ): Promise<{ membershipId: string; cardId: string }> {
    const membershipId = randomUUID();
    const cardId = randomUUID();
    const cardToken = this.codec.generate();
    const now = this.now();
    await client.query(
      `INSERT INTO memberships(id,user_id,program_id,status,joined_at,is_reenrollment,previous_cards_count)
       VALUES($1,$2,$3,'active',$4,$5,$6)`,
      [
        membershipId,
        customerId,
        program.id,
        now,
        previousCards > 0,
        previousCards,
      ],
    );
    await client.query(
      `INSERT INTO loyalty_cards(id,membership_id,qr_token_hash,qr_token_encrypted,status,created_at,version)
       VALUES($1,$2,$3,$4,'active',$5,0)`,
      [
        cardId,
        membershipId,
        this.codec.hash(cardToken),
        this.codec.encrypt(cardToken),
        now,
      ],
    );
    await client.query(
      'UPDATE loyalty_programs SET terms_locked=true,updated_at=$2 WHERE id=$1',
      [program.id, now],
    );
    await client.query(
      `INSERT INTO loyalty_cycles(id,membership_id,number,state,stamps,target,opened_at)
       VALUES($1,$2,1,'collecting',0,$3,$4)`,
      [randomUUID(), membershipId, program.stamps_required, now],
    );
    return { membershipId, cardId };
  }

  private async deviceSession(
    client: PoolClient,
    customerId: string,
    cardId: string,
    userAgent?: string | undefined,
  ): Promise<{ token: string; expires_at: string }> {
    const token = this.codec.generate();
    const now = this.now();
    const expires = new Date(now.getTime() + SESSION_DAYS * DAY);
    await client.query(
      `INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at,last_seen_at,created_at,card_id,user_agent)
       VALUES($1,$2,$3,$4,$5,$5,$6,$7)`,
      [
        randomUUID(),
        customerId,
        hash(token),
        expires,
        now,
        cardId,
        userAgent ? userAgent.slice(0, 255) : null,
      ],
    );
    return { token, expires_at: expires.toISOString() };
  }

  /**
   * Alta de un dispositivo sin sesión. Crea la tarjeta y una sesión ligada a
   * ella. Un número con tarjeta activa en el programa se rechaza (409) sin
   * crear sesión ni devolver datos de esa tarjeta.
   */
  async enrollByPhone(input: {
    publicCode: string;
    phone: unknown;
    country: unknown;
    userAgent?: string | undefined;
  }): Promise<{
    token: string;
    expires_at: string;
    reenrollment: boolean;
    card: CardView;
  }> {
    const phone = normalizePhone(input.phone, input.country);
    const country = String(input.country).toUpperCase();
    const outcome = await withTransaction(this.pool, async (client) => {
      const program = await this.activeProgram(client, input.publicCode);
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`customer:${phone}`],
      );
      let customer = (
        await client.query<{ id: string; status: string }>(
          'SELECT id,status FROM customers WHERE phone=$1',
          [phone],
        )
      ).rows[0];
      if (customer && customer.status !== 'active') throw forbidden();
      if (customer) {
        const active = (
          await client.query<{ id: string }>(
            "SELECT id FROM memberships WHERE user_id=$1 AND program_id=$2 AND status<>'closed'",
            [customer.id, program.id],
          )
        ).rows[0];
        if (active) {
          await this.audit(client, {
            actor: customer.id,
            restaurant: program.restaurant_id,
            action: 'ENROLL_REJECTED_ACTIVE',
            resource: active.id,
            details: { program_id: program.id, phone: maskPhone(phone) },
          });
          return { rejected: true as const };
        }
      }
      const now = this.now();
      if (!customer) {
        const id = randomUUID();
        await client.query(
          `INSERT INTO users(id,full_name,phone,status,created_at,updated_at)
           VALUES($1,'Cliente',$2,'active',$3,$3)`,
          [id, phone, now],
        );
        await client.query(
          `INSERT INTO customers(id,phone,country,status,created_at,updated_at)
           VALUES($1,$2,$3,'active',$4,$4)`,
          [id, phone, country, now],
        );
        customer = { id, status: 'active' };
      }
      const previous =
        (
          await client.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND program_id=$2 AND status='closed'",
            [customer.id, program.id],
          )
        ).rows[0]?.n ?? 0;
      const created = await this.createMembership(
        client,
        customer.id,
        program,
        previous,
      );
      const session = await this.deviceSession(
        client,
        customer.id,
        created.cardId,
        input.userAgent,
      );
      await this.audit(client, {
        actor: customer.id,
        restaurant: program.restaurant_id,
        action: previous > 0 ? 'CARD_REENROLLED' : 'CARD_CREATED',
        resource: created.membershipId,
        details: {
          program_id: program.id,
          card_id: created.cardId,
          previous_cards_count: previous,
          phone: maskPhone(phone),
        },
      });
      return {
        rejected: false as const,
        ...session,
        reenrollment: previous > 0,
        card: await this.view(client, await this.card(client, created.cardId)),
      };
    });
    if (outcome.rejected)
      throw new AppError(
        409,
        'CARD_ALREADY_ACTIVE',
        'Este número ya tiene una tarjeta activa.',
      );
    const { rejected: _rejected, ...result } = outcome;
    return result;
  }

  /** Dispositivo con sesión: muestra su tarjeta y nunca crea otra. */
  async deviceCard(
    principal: CustomerPrincipal,
    publicCode: string,
  ): Promise<{ card: CardView; same_program: boolean }> {
    if (principal.card_id === null) {
      // Sesión heredada (NEXT-001): se liga a la tarjeta de este programa.
      const card = await this.enroll(principal, publicCode);
      await this.pool.query(
        'UPDATE customer_sessions SET card_id=$2 WHERE id=$1 AND card_id IS NULL',
        [principal.session_id, card.id],
      );
      return { card, same_program: true };
    }
    const card = await this.getCard(principal, principal.card_id);
    return { card, same_program: card.program.public_code === publicCode };
  }

  /** «Salir del programa»: cierra la tarjeta, pierde sellos/premios y revoca la sesión. */
  async closeCard(
    principal: CustomerPrincipal,
    cardId: string,
  ): Promise<{ stamps_lost: number; rewards_lost: number }> {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        'SELECT id FROM loyalty_cards WHERE id=$1 FOR UPDATE',
        [cardId],
      );
      const card = await this.card(client, cardId);
      if (!this.owns(principal, card)) throw notFound();
      if (card.membership_status === 'closed' || card.card_status === 'closed')
        throw conflict('La tarjeta ya está cerrada.');
      const cycle = await this.latestCycle(client, card.membership_id);
      const stampsLost =
        cycle && cycle.state === 'collecting' ? cycle.stamps : 0;
      const pending = (
        await client.query<{ id: string }>(
          "SELECT id FROM rewards WHERE membership_id=$1 AND status='available'",
          [card.membership_id],
        )
      ).rows.map((row) => row.id);
      const now = this.now();
      await client.query(
        "UPDATE memberships SET status='closed',closed_at=$2,close_reason='customer_exit' WHERE id=$1",
        [card.membership_id, now],
      );
      await client.query(
        "UPDATE loyalty_cards SET status='closed' WHERE id=$1",
        [card.id],
      );
      if (pending.length) {
        await client.query(
          "UPDATE rewards SET status='cancelled' WHERE id = ANY($1::uuid[])",
          [pending],
        );
        await client.query(
          "UPDATE reward_vouchers SET status='revoked' WHERE reward_id = ANY($1::uuid[]) AND status='active'",
          [pending],
        );
      }
      await client.query(
        'UPDATE customer_sessions SET revoked_at=$3 WHERE (card_id=$1 OR id=$2) AND revoked_at IS NULL',
        [card.id, principal.session_id, now],
      );
      await client.query(
        'UPDATE card_transfers SET expires_at=$2 WHERE card_id=$1 AND consumed_at IS NULL AND expires_at>$2',
        [card.id, now],
      );
      await this.addEvent(client, card, 'card.changed');
      await this.audit(client, {
        actor: card.customer_id,
        restaurant: card.restaurant_id,
        action: 'CARD_CLOSED',
        resource: card.membership_id,
        details: {
          card_id: card.id,
          stamps_lost: stampsLost,
          rewards_lost: pending.length,
          reward_ids: pending,
        },
      });
      return { stamps_lost: stampsLost, rewards_lost: pending.length };
    });
  }

  /** Dueño o empleado con permiso explícito de transferencia en ese restaurante. */
  private async transferAgent(
    client: PoolClient,
    userId: string,
    restaurantId: string,
  ): Promise<void> {
    try {
      await this.owner(client, userId, restaurantId);
      return;
    } catch (error) {
      if (!(error instanceof AppError) || error.status !== 403) throw error;
    }
    const allowed = (
      await client.query(
        "SELECT 1 FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2 AND status='active' AND can_transfer_cards",
        [userId, restaurantId],
      )
    ).rowCount;
    if (!allowed) throw forbidden();
  }

  /** Emite un QR de un solo uso (10 min) para mover la tarjeta a otro dispositivo. */
  async createTransfer(
    userId: string,
    restaurantId: string,
    cardId: string,
  ): Promise<{ token: string; url: string; expires_at: string }> {
    return withTransaction(this.pool, async (client) => {
      await this.transferAgent(client, userId, restaurantId);
      const card = await this.card(client, cardId, restaurantId);
      await this.activeCard(card);
      const now = this.now();
      await client.query(
        'UPDATE card_transfers SET expires_at=$2 WHERE card_id=$1 AND consumed_at IS NULL AND expires_at>$2',
        [card.id, now],
      );
      const token = this.codec.generate();
      const expires = new Date(now.getTime() + TRANSFER_MINUTES * 60 * 1000);
      const id = randomUUID();
      await client.query(
        `INSERT INTO card_transfers(id,card_id,token_hash,created_by,expires_at,created_at)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [id, card.id, hash(token), userId, expires, now],
      );
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'CARD_TRANSFER_ISSUED',
        resource: card.membership_id,
        details: { card_id: card.id, transfer_id: id },
      });
      return {
        token,
        url: `${this.origin}/transfer#token=${token}`,
        expires_at: expires.toISOString(),
      };
    });
  }

  /** Consume el QR de transferencia: revoca dispositivos anteriores y abre sesión aquí. */
  async claimTransfer(input: {
    token: string;
    currentSessionId?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<{ token: string; expires_at: string; card: CardView }> {
    return withTransaction(this.pool, async (client) => {
      const transfer = (
        await client.query<{
          id: string;
          card_id: string;
          created_by: string;
          expires_at: Date;
          consumed_at: Date | null;
        }>(
          'SELECT id,card_id,created_by,expires_at,consumed_at FROM card_transfers WHERE token_hash=$1 FOR UPDATE',
          [hash(input.token)],
        )
      ).rows[0];
      const now = this.now();
      if (!transfer || transfer.consumed_at || transfer.expires_at <= now)
        throw new AppError(
          409,
          'TRANSFER_INVALID',
          'El código de transferencia no es válido o venció.',
        );
      const card = await this.card(client, transfer.card_id);
      await this.activeCard(card);
      await client.query(
        'UPDATE card_transfers SET consumed_at=$2 WHERE id=$1',
        [transfer.id, now],
      );
      const revoked = await client.query(
        `UPDATE customer_sessions SET revoked_at=$4
         WHERE revoked_at IS NULL
           AND (card_id=$1 OR (card_id IS NULL AND customer_id=$2) OR id=$3::uuid)`,
        [card.id, card.customer_id, input.currentSessionId ?? null, now],
      );
      const session = await this.deviceSession(
        client,
        card.customer_id,
        card.id,
        input.userAgent,
      );
      await this.audit(client, {
        actor: transfer.created_by,
        restaurant: card.restaurant_id,
        action: 'CARD_TRANSFERRED',
        resource: card.membership_id,
        details: {
          card_id: card.id,
          transfer_id: transfer.id,
          sessions_revoked: revoked.rowCount ?? 0,
        },
      });
      return { ...session, card: await this.view(client, card) };
    });
  }

  /** Lista de tarjetas para el admin (o búsqueda por teléfono para quien transfiere). */
  async listRestaurantCards(
    userId: string,
    restaurantId: string,
    filter: { phone?: unknown; country?: unknown } = {},
  ) {
    return withTransaction(this.pool, async (client) => {
      const phone =
        filter.phone === undefined
          ? null
          : normalizePhone(filter.phone, filter.country);
      if (phone) await this.transferAgent(client, userId, restaurantId);
      else await this.owner(client, userId, restaurantId);
      const rows = (
        await client.query<{
          card_id: string;
          membership_id: string;
          program_name: string;
          status: string;
          joined_at: Date;
          closed_at: Date | null;
          is_reenrollment: boolean;
          previous_cards_count: number;
          phone: string;
          stamps: number | null;
          pending_rewards: number;
        }>(
          `SELECT c.id AS card_id,m.id AS membership_id,p.name AS program_name,
             CASE WHEN m.status='closed' THEN 'closed' ELSE 'active' END AS status,
             m.joined_at,m.closed_at,m.is_reenrollment,m.previous_cards_count,u.phone,
             (SELECT y.stamps FROM loyalty_cycles y WHERE y.membership_id=m.id ORDER BY y.number DESC LIMIT 1) AS stamps,
             (SELECT count(*)::int FROM rewards w WHERE w.membership_id=m.id AND w.status='available') AS pending_rewards
           FROM loyalty_cards c
           JOIN memberships m ON m.id=c.membership_id
           JOIN loyalty_programs p ON p.id=m.program_id
           JOIN users u ON u.id=m.user_id
           WHERE p.restaurant_id=$1 AND ($2::text IS NULL OR u.phone=$2)
           ORDER BY m.joined_at DESC,c.id LIMIT 500`,
          [restaurantId, phone],
        )
      ).rows;
      return rows.map(({ phone: full, ...row }) => ({
        ...row,
        stamps: row.stamps ?? 0,
        joined_at: row.joined_at.toISOString(),
        closed_at: row.closed_at?.toISOString() ?? null,
        phone_masked: maskPhoneGrouped(full),
      }));
    });
  }

  /** Detalle para el admin: teléfono completo, historial y tarjetas anteriores. */
  async getRestaurantCard(
    userId: string,
    restaurantId: string,
    cardId: string,
  ) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const card = await this.card(client, cardId, restaurantId);
      const membership = (
        await client.query<{
          joined_at: Date;
          closed_at: Date | null;
          close_reason: string | null;
          is_reenrollment: boolean;
          previous_cards_count: number;
        }>(
          'SELECT joined_at,closed_at,close_reason,is_reenrollment,previous_cards_count FROM memberships WHERE id=$1',
          [card.membership_id],
        )
      ).rows[0];
      if (!membership) throw notFound();
      const purchases = (
        await client.query<{
          id: string;
          created_at: Date;
          stamps_earned: number;
          sale_reference: string | null;
          location_name: string | null;
          employee_name: string | null;
          reversed_at: Date | null;
        }>(
          `SELECT pu.id,pu.created_at,pu.stamps_earned,pu.sale_reference,pu.reversed_at,
             l.name AS location_name,u.full_name AS employee_name
           FROM purchases pu
           LEFT JOIN locations l ON l.id=pu.location_id
           LEFT JOIN restaurant_employees e ON e.id=pu.employee_id
           LEFT JOIN users u ON u.id=e.user_id
           WHERE pu.membership_id=$1 ORDER BY pu.created_at DESC LIMIT 200`,
          [card.membership_id],
        )
      ).rows;
      const rewards = (
        await client.query<{
          id: string;
          description: string;
          status: string;
          earned_at: Date;
          redeemed_at: Date | null;
        }>(
          'SELECT id,description,status,earned_at,redeemed_at FROM rewards WHERE membership_id=$1 ORDER BY earned_at DESC',
          [card.membership_id],
        )
      ).rows;
      const previous = (
        await client.query<{
          card_id: string;
          joined_at: Date;
          closed_at: Date | null;
          status: string;
        }>(
          `SELECT c.id AS card_id,m.joined_at,m.closed_at,m.status
           FROM memberships m JOIN loyalty_cards c ON c.membership_id=m.id
           WHERE m.user_id=$1 AND m.program_id=$2 AND m.id<>$3
           ORDER BY m.joined_at DESC`,
          [card.customer_id, card.program_id, card.membership_id],
        )
      ).rows;
      const iso = (value: Date | null) => value?.toISOString() ?? null;
      return {
        card_id: card.id,
        program_name: card.program_name,
        status: card.membership_status === 'closed' ? 'closed' : 'active',
        phone: card.customer_phone,
        phone_masked: card.customer_phone
          ? maskPhoneGrouped(card.customer_phone)
          : null,
        joined_at: membership.joined_at.toISOString(),
        closed_at: iso(membership.closed_at),
        close_reason: membership.close_reason,
        is_reenrollment: membership.is_reenrollment,
        previous_cards_count: membership.previous_cards_count,
        purchases: purchases.map((row) => ({
          ...row,
          created_at: row.created_at.toISOString(),
          reversed_at: iso(row.reversed_at),
        })),
        rewards: rewards.map((row) => ({
          ...row,
          earned_at: row.earned_at.toISOString(),
          redeemed_at: iso(row.redeemed_at),
        })),
        previous_cards: previous.map((row) => ({
          card_id: row.card_id,
          status: row.status === 'closed' ? 'closed' : 'active',
          joined_at: row.joined_at.toISOString(),
          closed_at: iso(row.closed_at),
        })),
      };
    });
  }

  /** El dueño concede o retira el permiso de transferir tarjetas a un empleado. */
  async setEmployeeTransferPermission(
    userId: string,
    restaurantId: string,
    employeeId: string,
    allowed: boolean,
  ): Promise<{ id: string; can_transfer_cards: boolean }> {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const updated = await client.query<{ id: string }>(
        'UPDATE restaurant_employees SET can_transfer_cards=$3,updated_at=$4 WHERE id=$1 AND restaurant_id=$2 RETURNING id',
        [employeeId, restaurantId, allowed, this.now()],
      );
      if (!updated.rows[0]) throw notFound();
      await this.audit(client, {
        actor: userId,
        restaurant: restaurantId,
        action: 'EMPLOYEE_TRANSFER_PERMISSION',
        resource: employeeId,
        details: { can_transfer_cards: allowed },
      });
      return { id: employeeId, can_transfer_cards: allowed };
    });
  }

  async listCards(principal: CustomerPrincipal): Promise<CardView[]> {
    return withTransaction(this.pool, async (client) => {
      const cards = (
        await client.query<{ id: string }>(
          `SELECT c.id FROM loyalty_cards c JOIN memberships m ON m.id=c.membership_id
           WHERE m.user_id=$1 AND ($2::uuid IS NULL OR c.id=$2)
           ORDER BY c.created_at DESC`,
          [principal.user_id, principal.card_id],
        )
      ).rows;
      const result: CardView[] = [];
      for (const card of cards)
        result.push(await this.view(client, await this.card(client, card.id)));
      return result;
    });
  }

  async getCard(
    principal: CustomerPrincipal,
    cardId: string,
  ): Promise<CardView> {
    return withTransaction(this.pool, async (client) => {
      const card = await this.card(client, cardId);
      if (!this.owns(principal, card)) throw notFound();
      return this.view(client, card);
    });
  }

  async getCardQr(
    principal: CustomerPrincipal,
    cardId: string,
  ): Promise<{
    card_id: string;
    restaurant_id: string;
    token: string;
    rotates_at: string;
    expires_at: string;
  }> {
    return withTransaction(this.pool, async (client) => {
      const card = await this.card(client, cardId);
      if (!this.owns(principal, card)) throw notFound();
      await this.activeCard(card);
      // D-06: token HMAC rotativo (60 s); el cliente lo vuelve a pedir al rotar.
      return {
        card_id: card.id,
        restaurant_id: card.restaurant_id,
        ...this.cardQr.issue(card.id, this.now()),
      };
    });
  }

  /** D-06: resuelve el QR rotativo; uno vencido o alterado no identifica tarjeta. */
  private cardFromQr(token: string): string {
    const cardId = this.cardQr.verify(token, this.now());
    if (!cardId)
      throw new AppError(
        409,
        'CARD_QR_EXPIRED',
        'Este QR ya venció. Pide al cliente que abra su tarjeta para mostrar el QR actual.',
      );
    return cardId;
  }

  async getRewardVoucher(
    principal: CustomerPrincipal,
    rewardId: string,
  ): Promise<{ token: string; expires_at: string | null }> {
    return withTransaction(this.pool, async (client) => {
      const reward = (
        await client.query<RewardRow & { customer_id: string }>(
          `SELECT r.id,r.description,r.status,r.accounting_mode,r.earned_at,r.cycle_id,r.stamps_spent,m.user_id AS customer_id
           FROM rewards r JOIN memberships m ON m.id=r.membership_id
           WHERE r.id=$1 AND m.user_id=$2
             AND ($3::uuid IS NULL OR m.id=(SELECT membership_id FROM loyalty_cards WHERE id=$3))`,
          [rewardId, principal.user_id, principal.card_id],
        )
      ).rows[0];
      if (!reward) throw notFound();
      if (reward.status !== 'available')
        throw conflict('El premio no está disponible.');
      const voucher = await this.issueVoucher(client, reward.id);
      return {
        token: voucher.token,
        expires_at: voucher.expires_at?.toISOString() ?? null,
      };
    });
  }

  async reissueRewardVoucher(
    principal: CustomerPrincipal,
    rewardId: string,
  ): Promise<{ token: string; expires_at: string | null }> {
    return withTransaction(this.pool, async (client) => {
      const reward = (
        await client.query<{ id: string; status: string }>(
          `SELECT r.id,r.status FROM rewards r JOIN memberships m ON m.id=r.membership_id
           WHERE r.id=$1 AND m.user_id=$2
             AND ($3::uuid IS NULL OR m.id=(SELECT membership_id FROM loyalty_cards WHERE id=$3))`,
          [rewardId, principal.user_id, principal.card_id],
        )
      ).rows[0];
      if (!reward) throw notFound();
      if (reward.status !== 'available')
        throw conflict('El premio no está disponible.');
      await client.query(
        "UPDATE reward_vouchers SET status='revoked' WHERE reward_id=$1 AND status='active'",
        [rewardId],
      );
      const nextVersion =
        (
          await client.query<{ version: number }>(
            'SELECT COALESCE(max(version),0)::int+1 AS version FROM reward_vouchers WHERE reward_id=$1',
            [rewardId],
          )
        ).rows[0]?.version ?? 2;
      const voucher = await this.issueVoucher(client, reward.id, nextVersion);
      return {
        token: voucher.token,
        expires_at: voucher.expires_at?.toISOString() ?? null,
      };
    });
  }

  async resendReward(
    userId: string,
    restaurantId: string,
    rewardId: string,
  ): Promise<{
    token: string;
    expires_at: string | null;
    whatsapp_url: string;
  }> {
    return withTransaction(this.pool, async (client) => {
      await this.staff(client, userId, restaurantId);
      const reward = (
        await client.query<{
          id: string;
          status: string;
          phone: string;
          restaurant_id: string;
        }>(
          `SELECT r.id,r.status,u.phone,p.restaurant_id FROM rewards r
           JOIN memberships m ON m.id=r.membership_id JOIN users u ON u.id=m.user_id
           JOIN loyalty_programs p ON p.id=m.program_id
           WHERE r.id=$1 AND p.restaurant_id=$2`,
          [rewardId, restaurantId],
        )
      ).rows[0];
      if (!reward) throw notFound();
      if (reward.status !== 'available')
        throw conflict('El premio no está disponible.');
      const voucher = await this.issueVoucher(client, reward.id);
      const url = `${this.origin}/reward#${new URLSearchParams({ token: voucher.token, restaurant: restaurantId }).toString()}`;
      return {
        token: voucher.token,
        expires_at: voucher.expires_at?.toISOString() ?? null,
        whatsapp_url: `https://wa.me/${reward.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Tu premio está listo. Muestra este código al personal: ${url}`,
        )}`,
      };
    });
  }

  async scan(
    userId: string,
    restaurantId: string,
    token: string,
    purpose: 'card' | 'reward',
  ): Promise<{
    card: CardView;
    phone_masked: string;
    reward: {
      id: string;
      description: string;
      status: string;
      voucher_token: string | null;
    } | null;
    allowed_actions: Array<'purchase' | 'redeem'>;
    locations: Array<{ id: string; name: string }>;
  }> {
    return withTransaction(this.pool, async (client) => {
      const staff = await this.staff(client, userId, restaurantId);
      // BRANCH-001: sucursales donde este empleado puede sellar o canjear.
      const locations = (
        await client.query<{ id: string; name: string }>(
          `SELECT l.id,l.name FROM employee_locations el JOIN locations l ON l.id=el.location_id
           WHERE el.employee_id=$1 AND l.status='active' ORDER BY l.name,l.id`,
          [staff.id],
        )
      ).rows;
      let cardId: string;
      let rewardId: string | null = null;
      if (purpose === 'card') {
        const row = (
          await client.query<{ card_id: string }>(
            `SELECT c.id AS card_id FROM loyalty_cards c
             JOIN memberships m ON m.id=c.membership_id JOIN loyalty_programs p ON p.id=m.program_id
             WHERE c.id=$1 AND p.restaurant_id=$2 AND c.status='active'`,
            [this.cardFromQr(token), restaurantId],
          )
        ).rows[0];
        if (!row) throw notFound();
        cardId = row.card_id;
      } else {
        const row = (
          await client.query<{ card_id: string; reward_id: string }>(
            `SELECT c.id AS card_id,v.reward_id FROM reward_vouchers v
             JOIN rewards r ON r.id=v.reward_id JOIN memberships m ON m.id=r.membership_id
             JOIN loyalty_programs p ON p.id=m.program_id JOIN loyalty_cards c ON c.membership_id=m.id
             WHERE v.token_hash=$1 AND v.status='active' AND p.restaurant_id=$2`,
            [this.codec.hash(token), restaurantId],
          )
        ).rows[0];
        if (!row) throw notFound();
        cardId = row.card_id;
        rewardId = row.reward_id;
      }
      const card = await this.card(client, cardId, restaurantId);
      const view = await this.view(client, card);
      const available = rewardId
        ? view.rewards.find((reward) => reward.id === rewardId)
        : view.rewards.find((reward) => reward.status === 'available');
      return {
        card: view,
        phone_masked: maskPhone(card.customer_phone ?? ''),
        reward: available
          ? {
              id: available.id,
              description: available.description,
              status: available.status,
              voucher_token: available.voucher?.token ?? null,
            }
          : null,
        locations,
        allowed_actions:
          purpose === 'reward'
            ? ['redeem']
            : available
              ? ['purchase', 'redeem']
              : ['purchase'],
      };
    });
  }

  async purchase(input: {
    userId: string;
    restaurantId: string;
    token: string;
    saleReference: string | null;
    locationId?: string | undefined;
    key: string;
    requestId: string;
  }): Promise<{ card: CardView; event_id: string }> {
    return withTransaction(this.pool, async (client) => {
      const staff = await this.staff(client, input.userId, input.restaurantId);
      const locationId = await this.staffLocation(
        client,
        staff,
        input.locationId,
      );
      const lookup = (
        await client.query<{ card_id: string; customer_id: string }>(
          `SELECT c.id AS card_id,m.user_id AS customer_id FROM loyalty_cards c
           JOIN memberships m ON m.id=c.membership_id JOIN loyalty_programs p ON p.id=m.program_id
           WHERE c.id=$1 AND p.restaurant_id=$2`,
          [this.cardFromQr(input.token), input.restaurantId],
        )
      ).rows[0];
      if (!lookup) throw notFound();
      const card = await this.card(client, lookup.card_id, input.restaurantId);
      await this.activeCard(card);
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`card:${card.id}`],
      );
      await this.assertNotSelf(client, staff, card);
      const result = await idempotent(
        client,
        {
          actorId: input.userId,
          key: input.key,
          operation: 'next.purchase',
          payload: {
            restaurantId: input.restaurantId,
            // El token rota: un reintento con un QR más nuevo es la misma operación.
            cardId: card.id,
            saleReference: input.saleReference,
            locationId,
          },
        },
        async () => {
          await this.assertCooldown(client, card, locationId);
          const cycle = await this.cycleForPurchase(client, card);
          const purchaseId = randomUUID();
          try {
            await client.query(
              `INSERT INTO purchases(id,membership_id,employee_id,location_id,stamps_earned,created_at,sale_reference)
               VALUES($1,$2,$3,$4,1,$5,$6)`,
              [
                purchaseId,
                card.membership_id,
                staff.id,
                locationId,
                this.now(),
                input.saleReference,
              ],
            );
          } catch (error) {
            if ((error as { code?: string }).code === '23505')
              throw conflict(
                'La referencia de venta ya fue registrada.',
                'SALE_REFERENCE_DUPLICATE',
              );
            throw error;
          }
          await client.query(
            `INSERT INTO loyalty_ledger_entries(id,membership_id,purchase_id,stamp_delta,created_at,kind,actor_id,request_id)
             VALUES($1,$2,$3,1,$4,'purchase',$5,$6)`,
            [
              randomUUID(),
              card.membership_id,
              purchaseId,
              this.now(),
              input.userId,
              input.requestId,
            ],
          );
          const stamps = cycle.stamps + 1;
          let type: 'purchase.recorded' | 'reward.available' =
            'purchase.recorded';
          if (stamps >= cycle.target) {
            const rewardId = randomUUID();
            await client.query(
              `UPDATE loyalty_cycles SET state='reward_available',stamps=$2 WHERE id=$1`,
              [cycle.id, cycle.target],
            );
            await client.query(
              `INSERT INTO rewards(id,membership_id,cycle_id,description,stamps_spent,accounting_mode,status,earned_at)
               VALUES($1,$2,$3,$4,$5,'debit_on_redemption','available',$6)`,
              [
                rewardId,
                card.membership_id,
                cycle.id,
                card.reward_description,
                cycle.target,
                this.now(),
              ],
            );
            await this.issueVoucher(client, rewardId);
            // D-03 combinada: la tarjeta vuelve a 0 enseguida; el premio queda pendiente.
            await client.query(
              `INSERT INTO loyalty_cycles(id,membership_id,number,state,stamps,target,opened_at)
               VALUES($1,$2,$3,'collecting',0,$4,$5)`,
              [
                randomUUID(),
                card.membership_id,
                cycle.number + 1,
                card.stamps_required,
                this.now(),
              ],
            );
            type = 'reward.available';
          } else {
            await client.query(
              'UPDATE loyalty_cycles SET stamps=$2 WHERE id=$1',
              [cycle.id, stamps],
            );
          }
          const event = await this.addEvent(client, card, type);
          return {
            card: await this.view(client, card),
            event_id: event.event_id,
          };
        },
      );
      return result;
    });
  }

  async redeem(input: {
    userId: string;
    restaurantId: string;
    token: string;
    locationId?: string | undefined;
    key: string;
    requestId: string;
  }): Promise<{ card: CardView; event_id: string }> {
    return withTransaction(this.pool, async (client) => {
      const staff = await this.staff(client, input.userId, input.restaurantId);
      const locationId = await this.staffLocation(
        client,
        staff,
        input.locationId,
      );
      const lookup = (
        await client.query<{
          voucher_id: string;
          reward_id: string;
          card_id: string;
          membership_id: string;
          cycle_id: string | null;
          stamps_spent: number;
          accounting_mode: string;
          reward_status: string;
          voucher_status: string;
          expires_at: Date | null;
        }>(
          `SELECT v.id AS voucher_id,v.reward_id,v.expires_at,v.status AS voucher_status,
             r.stamps_spent,r.accounting_mode,r.status AS reward_status,c.id AS card_id,r.membership_id,r.cycle_id
           FROM reward_vouchers v JOIN rewards r ON r.id=v.reward_id
           JOIN memberships m ON m.id=r.membership_id JOIN loyalty_programs p ON p.id=m.program_id
           JOIN loyalty_cards c ON c.membership_id=m.id
           WHERE v.token_hash=$1 AND p.restaurant_id=$2
           FOR UPDATE OF v,r,c`,
          [this.codec.hash(input.token), input.restaurantId],
        )
      ).rows[0];
      if (!lookup) throw notFound();
      const card = await this.card(client, lookup.card_id, input.restaurantId);
      await this.activeCard(card);
      await this.assertNotSelf(client, staff, card);
      const result = await idempotent(
        client,
        {
          actorId: input.userId,
          key: input.key,
          operation: 'next.redeem',
          payload: { restaurantId: input.restaurantId, token: input.token },
        },
        async () => {
          if (lookup.voucher_status !== 'active')
            throw conflict('Este premio ya fue usado.', 'VOUCHER_CONSUMED');
          if (
            lookup.expires_at &&
            lookup.expires_at.getTime() <= this.now().getTime()
          )
            throw conflict(
              'El comprobante ha caducado. Solicita uno nuevo.',
              'VOUCHER_EXPIRED',
            );
          if (lookup.reward_status !== 'available')
            throw conflict('Este premio ya fue usado.', 'REWARD_REDEEMED');
          let cycle: CycleRow | null = null;
          if (lookup.cycle_id) {
            cycle =
              (
                await client.query<CycleRow>(
                  `SELECT id,number,state,stamps,target FROM loyalty_cycles
                   WHERE id=$1 AND membership_id=$2 FOR UPDATE`,
                  [lookup.cycle_id, card.membership_id],
                )
              ).rows[0] ?? null;
          } else {
            cycle = await this.latestCycle(client, card.membership_id, true);
            if (cycle) {
              await client.query(
                'UPDATE rewards SET cycle_id=$1 WHERE id=$2 AND cycle_id IS NULL',
                [cycle.id, lookup.reward_id],
              );
            }
          }
          if (!cycle)
            throw conflict(
              'El premio no pertenece a un ciclo disponible.',
              'REWARD_UNAVAILABLE',
            );
          if (cycle.state !== 'reward_available')
            throw conflict(
              'El premio no está disponible.',
              'REWARD_UNAVAILABLE',
            );
          if (lookup.accounting_mode === 'debit_on_redemption') {
            await client.query(
              `INSERT INTO loyalty_ledger_entries(id,membership_id,reward_id,stamp_delta,created_at,kind,actor_id,request_id)
               VALUES($1,$2,$3,$4,$5,'reward_redemption',$6,$7)`,
              [
                randomUUID(),
                card.membership_id,
                lookup.reward_id,
                -lookup.stamps_spent,
                this.now(),
                input.userId,
                input.requestId,
              ],
            );
          }
          const voucher = await client.query(
            "UPDATE reward_vouchers SET status='consumed',consumed_at=$2 WHERE reward_id=$1 AND status='active'",
            [lookup.reward_id, this.now()],
          );
          if (!voucher.rowCount)
            throw conflict('Este premio ya fue usado.', 'VOUCHER_CONSUMED');
          const delivered = await client.query(
            "UPDATE rewards SET status='redeemed',redeemed_by=$2,redeemed_at=$3,redeemed_location_id=$4 WHERE id=$1 AND status='available'",
            [lookup.reward_id, staff.id, this.now(), locationId],
          );
          if (!delivered.rowCount)
            throw conflict('Este premio ya fue usado.', 'REWARD_REDEEMED');
          await client.query(
            "UPDATE loyalty_cycles SET state='redeemed',closed_at=$2 WHERE id=$1",
            [cycle.id, this.now()],
          );
          const later = await client.query(
            'SELECT 1 FROM loyalty_cycles WHERE membership_id=$1 AND number>$2 LIMIT 1',
            [card.membership_id, cycle.number],
          );
          if (!later.rowCount) {
            await client.query(
              `INSERT INTO loyalty_cycles(id,membership_id,number,state,stamps,target,opened_at)
               VALUES($1,$2,$3,'collecting',0,$4,$5)`,
              [
                randomUUID(),
                card.membership_id,
                cycle.number + 1,
                cycle.target,
                this.now(),
              ],
            );
          }
          const event = await this.addEvent(client, card, 'reward.redeemed');
          return {
            card: await this.view(client, card),
            event_id: event.event_id,
          };
        },
      );
      return result;
    });
  }

  async createInvitation(input: {
    userId: string;
    restaurantId: string;
    email: string;
    phone: string;
    country: string;
  }) {
    const phone = normalizePhone(input.phone, input.country);
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, input.userId, input.restaurantId);
      const restaurant = (
        await client.query<{ name: string }>(
          'SELECT name FROM restaurants WHERE id=$1',
          [input.restaurantId],
        )
      ).rows[0];
      if (!restaurant) throw notFound();
      const token = this.codec.generate();
      const invitation = {
        id: randomUUID(),
        restaurant_id: input.restaurantId,
        email: input.email,
        phone,
        status: 'pending',
        expires_at: new Date(this.now().getTime() + 7 * DAY),
        invited_by: input.userId,
        created_at: this.now(),
      };
      await client.query(
        `INSERT INTO operator_invitations(id,restaurant_id,email,phone,token_hash,status,expires_at,invited_by,created_at)
         VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8)`,
        [
          invitation.id,
          invitation.restaurant_id,
          invitation.email,
          invitation.phone,
          this.codec.hash(token),
          invitation.expires_at,
          invitation.invited_by,
          invitation.created_at,
        ],
      );
      const url = `${this.origin}/invite/${token}`;
      return {
        invitation: {
          id: invitation.id,
          restaurant_id: invitation.restaurant_id,
          restaurant_name: restaurant.name,
          email: invitation.email,
          phone_masked: maskPhone(phone),
          status: invitation.status,
          expires_at: invitation.expires_at.toISOString(),
        },
        token,
        url,
        whatsapp_url: `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Te invitaron a operar en ${restaurant.name}. Abre este enlace: ${url}`,
        )}`,
      };
    });
  }

  async listInvitations(userId: string, restaurantId: string) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const rows = (
        await client.query(
          `SELECT id,restaurant_id,email,phone,status,expires_at,accepted_by,created_at,accepted_at,revoked_at
           FROM operator_invitations WHERE restaurant_id=$1 ORDER BY created_at DESC`,
          [restaurantId],
        )
      ).rows;
      return rows.map((row) => ({
        ...row,
        phone_masked: row.phone ? maskPhone(String(row.phone)) : null,
        phone: undefined,
      }));
    });
  }

  async revokeInvitation(
    userId: string,
    restaurantId: string,
    invitationId: string,
  ) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const invitation = (
        await client.query<{
          id: string;
          accepted_by: string | null;
          status: string;
        }>(
          'SELECT id,accepted_by,status FROM operator_invitations WHERE id=$1 AND restaurant_id=$2',
          [invitationId, restaurantId],
        )
      ).rows[0];
      if (!invitation) throw notFound();
      if (invitation.status === 'accepted' || invitation.accepted_by)
        throw conflict(
          'Un operador aceptado se desactiva desde el equipo.',
          'INVITATION_ACCEPTED',
        );
      await client.query(
        "UPDATE operator_invitations SET status='revoked',revoked_at=$2 WHERE id=$1 AND status='pending'",
        [invitationId, this.now()],
      );
      return { id: invitationId, status: 'revoked' };
    });
  }

  async acceptInvitation(userId: string, email: string, token: string) {
    return withTransaction(this.pool, async (client) => {
      const invitation = (
        await client.query<{
          id: string;
          restaurant_id: string;
          email: string;
          phone: string;
          status: string;
          expires_at: Date;
        }>(
          `SELECT id,restaurant_id,email,phone,status,expires_at FROM operator_invitations
           WHERE token_hash=$1 FOR UPDATE`,
          [this.codec.hash(token)],
        )
      ).rows[0];
      if (!invitation) throw notFound();
      if (invitation.status === 'accepted' && invitation.email !== email)
        throw forbidden();
      if (invitation.status === 'revoked')
        throw conflict('La invitación fue revocada.');
      if (
        invitation.status === 'expired' ||
        invitation.expires_at.getTime() <= this.now().getTime()
      ) {
        await client.query(
          "UPDATE operator_invitations SET status='expired' WHERE id=$1",
          [invitation.id],
        );
        throw conflict('La invitación ha caducado.');
      }
      if (invitation.email !== email) throw forbidden();
      const role = (
        await client.query<{ id: string }>(
          "SELECT id FROM roles WHERE rol_type='employee'",
        )
      ).rows[0];
      let roleId = role?.id;
      if (!roleId) {
        roleId = randomUUID();
        await client.query(
          "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'employee',$2)",
          [roleId, this.now()],
        );
      }
      const existing = (
        await client.query<StaffRow>(
          'SELECT id,user_id,restaurant_id FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2',
          [userId, invitation.restaurant_id],
        )
      ).rows[0];
      if (existing) {
        await client.query(
          "UPDATE restaurant_employees SET role_id=$2,phone=$3,status='active',ended_at=NULL,updated_at=$4 WHERE id=$1",
          [existing.id, roleId, invitation.phone, this.now()],
        );
      } else {
        await client.query(
          `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,phone,status,joined_at,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,'active',$6,$6,$6)`,
          [
            randomUUID(),
            userId,
            invitation.restaurant_id,
            roleId,
            invitation.phone,
            this.now(),
          ],
        );
      }
      // BRANCH-001: la invitación heredada por correo da acceso a las sucursales
      // activas del restaurante (si no hay ninguna se crea «Principal»).
      const employeeId = (
        await client.query<{ id: string }>(
          'SELECT id FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2',
          [userId, invitation.restaurant_id],
        )
      ).rows[0]?.id;
      let active = (
        await client.query<{ id: string }>(
          "SELECT id FROM locations WHERE restaurant_id=$1 AND status='active'",
          [invitation.restaurant_id],
        )
      ).rows.map((row) => row.id);
      if (active.length === 0) {
        const locationId = randomUUID();
        await client.query(
          `INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at)
           VALUES($1,$2,'Principal','Por definir','Por definir','Por definir','active',$3,$3)`,
          [locationId, invitation.restaurant_id, this.now()],
        );
        active = [locationId];
      }
      for (const locationId of active)
        await client.query(
          'INSERT INTO employee_locations(employee_id,location_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [employeeId, locationId, this.now()],
        );
      await client.query(
        "UPDATE operator_invitations SET status='accepted',accepted_by=$2,accepted_at=$3 WHERE id=$1",
        [invitation.id, userId, this.now()],
      );
      const restaurant = (
        await client.query<{ name: string }>(
          'SELECT name FROM restaurants WHERE id=$1',
          [invitation.restaurant_id],
        )
      ).rows[0];
      return {
        restaurant_id: invitation.restaurant_id,
        restaurant_name: restaurant?.name ?? '',
        phone_masked: maskPhone(invitation.phone),
      };
    });
  }

  async listEmployees(userId: string, restaurantId: string) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const rows = (
        await client.query(
          `SELECT e.id,e.user_id,e.status,e.phone,e.joined_at,e.can_transfer_cards,u.full_name,u.email
           FROM restaurant_employees e JOIN users u ON u.id=e.user_id
           WHERE e.restaurant_id=$1 ORDER BY e.created_at`,
          [restaurantId],
        )
      ).rows;
      return rows.map((row) => ({
        ...row,
        phone_masked: row.phone ? maskPhone(String(row.phone)) : null,
        phone: undefined,
      }));
    });
  }

  async setEmployeeStatus(
    userId: string,
    restaurantId: string,
    employeeId: string,
    status: 'suspended' | 'disabled',
  ) {
    return withTransaction(this.pool, async (client) => {
      await this.owner(client, userId, restaurantId);
      const target = (
        await client.query<StaffRow & { role: string }>(
          `SELECT e.id,e.user_id,e.restaurant_id,r.rol_type AS role FROM restaurant_employees e
           JOIN roles r ON r.id=e.role_id WHERE e.id=$1 AND e.restaurant_id=$2`,
          [employeeId, restaurantId],
        )
      ).rows[0];
      if (!target) throw notFound();
      if (target.user_id === userId || target.role === 'owner')
        throw forbidden();
      await client.query(
        "UPDATE restaurant_employees SET status=$2,ended_at=CASE WHEN $2='disabled' THEN $3 ELSE ended_at END,updated_at=$3 WHERE id=$1",
        [employeeId, status, this.now()],
      );
      return { id: employeeId, status };
    });
  }
}

export type NextRepository = PgNextRepository;
