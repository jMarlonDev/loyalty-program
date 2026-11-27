import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../application/errors.js';
import type { CardView, CustomerPrincipal } from '../application/next.js';
import { maskPhone, normalizePhone } from '../application/next.js';
import { createTokenCodec } from './token-codec.js';
import { idempotent, withTransaction } from './transactions.js';

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 400;
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
  private readonly now: () => Date;
  private readonly origin: string;
  constructor(
    private readonly pool: Pool,
    options: {
      tokenEncryptionKey: string;
      now?: () => Date;
      publicOrigin?: string;
    },
  ) {
    this.codec = createTokenCodec(options.tokenEncryptionKey);
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
        p.text_color,p.card_message,p.restaurant_id,
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
    let number = (current?.number ?? 0) + 1;
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
      customer_id: string;
      phone: string;
      expires_at: Date;
    }>(
      `SELECT s.id AS session_id,s.customer_id,s.expires_at,u.phone
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
        const membershipId = randomUUID();
        const cardToken = this.codec.generate();
        await client.query(
          `INSERT INTO memberships(id,user_id,program_id,status,joined_at)
           VALUES($1,$2,$3,'active',$4)`,
          [membershipId, principal.user_id, program.id, this.now()],
        );
        await client.query(
          `INSERT INTO loyalty_cards(id,membership_id,qr_token_hash,qr_token_encrypted,status,created_at,version)
           VALUES($1,$2,$3,$4,'active',$5,0)`,
          [
            randomUUID(),
            membershipId,
            this.codec.hash(cardToken),
            this.codec.encrypt(cardToken),
            this.now(),
          ],
        );
        await client.query(
          'UPDATE loyalty_programs SET terms_locked=true,updated_at=$2 WHERE id=$1',
          [program.id, this.now()],
        );
        await client.query(
          `INSERT INTO loyalty_cycles(id,membership_id,number,state,stamps,target,opened_at)
           VALUES($1,$2,1,'collecting',0,$3,$4)`,
          [randomUUID(), membershipId, program.stamps_required, this.now()],
        );
        membership = { id: membershipId };
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

  async listCards(principal: CustomerPrincipal): Promise<CardView[]> {
    return withTransaction(this.pool, async (client) => {
      const cards = (
        await client.query<{ id: string }>(
          `SELECT c.id FROM loyalty_cards c JOIN memberships m ON m.id=c.membership_id
           WHERE m.user_id=$1 ORDER BY c.created_at DESC`,
          [principal.user_id],
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
      if (card.customer_id !== principal.user_id) throw notFound();
      return this.view(client, card);
    });
  }

  async getCardQr(
    principal: CustomerPrincipal,
    cardId: string,
  ): Promise<{ card_id: string; restaurant_id: string; token: string }> {
    return withTransaction(this.pool, async (client) => {
      const card = await this.card(client, cardId);
      if (card.customer_id !== principal.user_id) throw notFound();
      await this.activeCard(card);
      if (!card.qr_token_encrypted) throw conflict('El QR no está disponible.');
      return {
        card_id: card.id,
        restaurant_id: card.restaurant_id,
        token: this.codec.decrypt(card.qr_token_encrypted),
      };
    });
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
           WHERE r.id=$1 AND m.user_id=$2`,
          [rewardId, principal.user_id],
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
           WHERE r.id=$1 AND m.user_id=$2`,
          [rewardId, principal.user_id],
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
  }> {
    return withTransaction(this.pool, async (client) => {
      await this.staff(client, userId, restaurantId);
      let cardId: string;
      let rewardId: string | null = null;
      if (purpose === 'card') {
        const row = (
          await client.query<{ card_id: string }>(
            `SELECT c.id AS card_id FROM loyalty_cards c
             JOIN memberships m ON m.id=c.membership_id JOIN loyalty_programs p ON p.id=m.program_id
             WHERE c.qr_token_hash=$1 AND p.restaurant_id=$2 AND c.status='active'`,
            [this.codec.hash(token), restaurantId],
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
    saleReference: string;
    key: string;
    requestId: string;
  }): Promise<{ card: CardView; event_id: string }> {
    return withTransaction(this.pool, async (client) => {
      const staff = await this.staff(client, input.userId, input.restaurantId);
      const lookup = (
        await client.query<{ card_id: string; customer_id: string }>(
          `SELECT c.id AS card_id,m.user_id AS customer_id FROM loyalty_cards c
           JOIN memberships m ON m.id=c.membership_id JOIN loyalty_programs p ON p.id=m.program_id
           WHERE c.qr_token_hash=$1 AND p.restaurant_id=$2`,
          [this.codec.hash(input.token), input.restaurantId],
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
            token: input.token,
            saleReference: input.saleReference,
          },
        },
        async () => {
          const cycle = await this.cycleForPurchase(client, card);
          let locationId = (
            await client.query<{ id: string }>(
              "SELECT id FROM locations WHERE restaurant_id=$1 AND status='active' ORDER BY created_at,id LIMIT 1",
              [input.restaurantId],
            )
          ).rows[0]?.id;
          if (!locationId) {
            locationId = randomUUID();
            await client.query(
              `INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at)
               VALUES($1,$2,'Principal','Por definir','Por definir','Por definir','active',$3,$3)`,
              [locationId, input.restaurantId, this.now()],
            );
          }
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
    key: string;
    requestId: string;
  }): Promise<{ card: CardView; event_id: string }> {
    return withTransaction(this.pool, async (client) => {
      const staff = await this.staff(client, input.userId, input.restaurantId);
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
            throw conflict(
              'El comprobante ya fue utilizado.',
              'VOUCHER_CONSUMED',
            );
          if (
            lookup.expires_at &&
            lookup.expires_at.getTime() <= this.now().getTime()
          )
            throw conflict(
              'El comprobante ha caducado. Solicita uno nuevo.',
              'VOUCHER_EXPIRED',
            );
          if (lookup.reward_status !== 'available')
            throw conflict('El premio ya fue entregado.', 'REWARD_REDEEMED');
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
            throw conflict(
              'El comprobante ya fue utilizado.',
              'VOUCHER_CONSUMED',
            );
          const delivered = await client.query(
            "UPDATE rewards SET status='redeemed',redeemed_by=$2,redeemed_at=$3 WHERE id=$1 AND status='available'",
            [lookup.reward_id, staff.id, this.now()],
          );
          if (!delivered.rowCount)
            throw conflict('El premio ya fue entregado.', 'REWARD_REDEEMED');
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
          `SELECT e.id,e.user_id,e.status,e.phone,e.joined_at,u.full_name,u.email
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
