import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../application/errors.js';
import type {
  LoyaltyRepository,
  LoyaltyResult,
  PurchaseInput,
} from '../application/loyalty.js';
import { assertNotSelf, rewardBatches } from '../domain/loyalty.js';
import { requireStaff } from './staff-access.js';
import {
  idempotent,
  lockActor,
  lockRestaurant,
  withTransaction,
} from './transactions.js';

interface CardContext {
  card_id: string;
  membership_id: string;
  customer_id: string;
  restaurant_id: string;
  program_id: string;
  card_status: string;
  membership_status: string;
  program_status: string;
  customer_status: string;
  benefits_version: number;
  stamps_required: number;
  reward_description: string;
}
const missing = () => new AppError(404, 'NOT_FOUND', 'No existe el recurso.');
const conflict = (message: string) =>
  new AppError(409, 'LOYALTY_CONFLICT', message);
async function cardContext(
  client: PoolClient,
  cardId: string,
  restaurant?: string,
): Promise<CardContext> {
  const result = await client.query<CardContext>(
    `SELECT c.id AS card_id,c.membership_id,c.status AS card_status,
 m.user_id AS customer_id,m.program_id,m.status AS membership_status,m.benefits_version,
 p.restaurant_id,p.status AS program_status,p.stamps_required,p.reward_description,u.status AS customer_status
 FROM loyalty_cards c JOIN memberships m ON m.id=c.membership_id
 JOIN loyalty_programs p ON p.id=m.program_id JOIN users u ON u.id=m.user_id
 WHERE c.id=$1 FOR UPDATE OF m,c FOR SHARE OF u`,
    [cardId],
  );
  const card = result.rows[0];
  if (!card || (restaurant && card.restaurant_id !== restaurant))
    throw missing();
  return card;
}
function activeCard(card: CardContext) {
  if (card.card_status !== 'active' || card.membership_status !== 'active')
    throw conflict('La tarjeta o membresía no está activa.');
  if (card.customer_status !== 'active')
    throw new AppError(403, 'CUSTOMER_INACTIVE', 'El titular no está activo.');
}
async function activeLocation(
  client: PoolClient,
  id: string,
  restaurant: string,
) {
  const location = (
    await client.query<{ status: string }>(
      'SELECT status FROM locations WHERE id=$1 AND restaurant_id=$2',
      [id, restaurant],
    )
  ).rows[0];
  if (!location) throw missing();
  if (location.status !== 'active')
    throw conflict('La sucursal no está activa.');
}
async function balance(
  client: PoolClient,
  membership: string,
): Promise<number> {
  return (
    (
      await client.query<{ balance: number }>(
        'SELECT COALESCE(sum(stamp_delta),0)::int AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
        [membership],
      )
    ).rows[0]?.balance ?? 0
  );
}
async function bump(client: PoolClient, membership: string) {
  await client.query(
    'UPDATE memberships SET benefits_version=benefits_version+1 WHERE id=$1',
    [membership],
  );
}

export class PgLoyaltyRepository implements LoyaltyRepository {
  private readonly now: () => Date;
  constructor(
    private readonly pool: Pool,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }
  private async audit(
    client: PoolClient,
    actor: string,
    restaurant: string,
    action: string,
    resource: string,
    requestId: string,
  ) {
    await client.query(
      'INSERT INTO audit_events(id,actor_id,restaurant_id,action,resource_id,request_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        randomUUID(),
        actor,
        restaurant,
        action,
        resource,
        requestId,
        JSON.stringify({}),
        this.now(),
      ],
    );
  }
  private async movement(
    client: PoolClient,
    card: CardContext,
    actor: string,
    delta: number,
    kind: string,
    time: Date,
    requestId: string,
    purchase: string | null = null,
    reward: string | null = null,
    reason: string | null = null,
  ) {
    await client.query(
      'INSERT INTO loyalty_ledger_entries(id,membership_id,purchase_id,reward_id,stamp_delta,created_at,kind,actor_id,reason,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        randomUUID(),
        card.membership_id,
        purchase,
        reward,
        delta,
        time,
        kind,
        actor,
        reason,
        requestId,
      ],
    );
  }
  private async grantRewards(
    client: PoolClient,
    card: CardContext,
    actor: string,
    time: Date,
    requestId: string,
  ): Promise<string[]> {
    const available = await client.query<{ id: string }>(
      `SELECT p.id FROM purchases p WHERE p.membership_id=$1 AND p.reversed_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM reward_purchase_allocations a WHERE a.purchase_id=p.id AND a.released_at IS NULL)
   ORDER BY p.created_at,p.id`,
      [card.membership_id],
    );
    const rewards: string[] = [];
    for (const purchases of rewardBatches(
      available.rows.map((row) => row.id),
      card.stamps_required,
    )) {
      const reward = randomUUID();
      await client.query(
        "INSERT INTO rewards(id,membership_id,description,stamps_spent,status,earned_at) VALUES($1,$2,$3,$4,'available',$5)",
        [
          reward,
          card.membership_id,
          card.reward_description,
          card.stamps_required,
          time,
        ],
      );
      for (const purchase of purchases)
        await client.query(
          'INSERT INTO reward_purchase_allocations(id,reward_id,purchase_id,membership_id,created_at) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), reward, purchase, card.membership_id, time],
        );
      await this.movement(
        client,
        card,
        actor,
        -card.stamps_required,
        'reward_consumption',
        time,
        requestId,
        null,
        reward,
      );
      rewards.push(reward);
    }
    return rewards;
  }
  async purchase(
    actor: string,
    restaurant: string,
    input: PurchaseInput,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<LoyaltyResult> {
    return withTransaction(this.pool, async (client) => {
      await lockRestaurant(client, restaurant);
      await lockActor(client, actor);
      const staff = await requireStaff(client, actor, restaurant, [
        'owner',
        'admin',
        'employee',
      ]);
      const card = await cardContext(client, input.card_id, restaurant);
      assertNotSelf(actor, card.customer_id);
      return idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'purchase',
          payload: { restaurant, ...input },
        },
        async () => {
          activeCard(card);
          if (card.program_status !== 'active')
            throw conflict('El programa no permite compras.');
          await activeLocation(client, input.location_id, restaurant);
          const id = randomUUID(),
            time = this.now();
          await client.query(
            'INSERT INTO purchases(id,membership_id,employee_id,location_id,stamps_earned,created_at,sale_reference) VALUES($1,$2,$3,$4,1,$5,$6)',
            [
              id,
              card.membership_id,
              staff.id,
              input.location_id,
              time,
              input.sale_reference,
            ],
          );
          await this.movement(
            client,
            card,
            actor,
            1,
            'purchase',
            time,
            requestId,
            id,
          );
          const rewards = await this.grantRewards(
            client,
            card,
            actor,
            time,
            requestId,
          );
          await bump(client, card.membership_id);
          await this.audit(
            client,
            actor,
            restaurant,
            'purchase_created',
            id,
            requestId,
          );
          return {
            purchase_id: id,
            membership_id: card.membership_id,
            balance: await balance(client, card.membership_id),
            rewards,
          };
        },
      );
    });
  }
  async redeem(
    actor: string,
    restaurant: string,
    rewardId: string,
    location: string,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<LoyaltyResult> {
    return withTransaction(this.pool, async (client) => {
      await lockRestaurant(client, restaurant);
      await lockActor(client, actor);
      const staff = await requireStaff(client, actor, restaurant, [
        'owner',
        'admin',
        'employee',
      ]);
      const reward = (
        await client.query<{
          id: string;
          status: string;
          card_id: string;
          restaurant_id: string;
        }>(
          `SELECT r.id,r.status,c.id AS card_id,p.restaurant_id FROM rewards r JOIN memberships m ON m.id=r.membership_id JOIN loyalty_programs p ON p.id=m.program_id JOIN loyalty_cards c ON c.membership_id=m.id WHERE r.id=$1`,
          [rewardId],
        )
      ).rows[0];
      if (!reward || reward.restaurant_id !== restaurant) throw missing();
      const card = await cardContext(client, reward.card_id, restaurant);
      assertNotSelf(actor, card.customer_id);
      return idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'redeem',
          payload: { restaurant, rewardId, location },
        },
        async () => {
          activeCard(card);
          await activeLocation(client, location, restaurant);
          if (reward.status !== 'available')
            throw conflict('El premio no está disponible.');
          await client.query(
            "UPDATE rewards SET status='redeemed',redeemed_by=$1,redeemed_location_id=$2,redeemed_at=$3 WHERE id=$4",
            [staff.id, location, this.now(), rewardId],
          );
          await bump(client, card.membership_id);
          await this.audit(
            client,
            actor,
            restaurant,
            'reward_redeemed',
            rewardId,
            requestId,
          );
          return { reward_id: rewardId, status: 'redeemed' };
        },
      );
    });
  }
  async reverse(
    actor: string,
    restaurant: string,
    purchaseId: string,
    reason: string,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<LoyaltyResult> {
    return withTransaction(this.pool, async (client) => {
      await lockRestaurant(client, restaurant);
      await lockActor(client, actor);
      await requireStaff(client, actor, restaurant, ['owner', 'admin']);
      const purchase = (
        await client.query<{
          id: string;
          reversed_at: Date | null;
          card_id: string;
          restaurant_id: string;
        }>(
          `SELECT b.id,b.reversed_at,c.id AS card_id,p.restaurant_id FROM purchases b JOIN memberships m ON m.id=b.membership_id JOIN loyalty_programs p ON p.id=m.program_id JOIN loyalty_cards c ON c.membership_id=m.id WHERE b.id=$1`,
          [purchaseId],
        )
      ).rows[0];
      if (!purchase || purchase.restaurant_id !== restaurant) throw missing();
      const card = await cardContext(client, purchase.card_id, restaurant);
      return idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'reverse',
          payload: { restaurant, purchaseId, reason },
        },
        async () => {
          if (card.membership_status === 'closed')
            throw conflict('La membresía está cerrada.');
          if (purchase.reversed_at)
            throw conflict('La compra ya fue revertida.');
          const affected = await client.query<{
            id: string;
            status: string;
            stamps_spent: number;
          }>(
            `SELECT r.id,r.status,r.stamps_spent FROM reward_purchase_allocations a JOIN rewards r ON r.id=a.reward_id WHERE a.purchase_id=$1 AND a.released_at IS NULL`,
            [purchaseId],
          );
          if (affected.rows.some((reward) => reward.status === 'redeemed'))
            throw conflict('La compra financió un premio entregado.');
          const time = this.now();
          for (const reward of affected.rows) {
            if (reward.status !== 'available')
              throw conflict('La asignación de la compra no admite reversión.');
            await client.query(
              "UPDATE rewards SET status='cancelled' WHERE id=$1",
              [reward.id],
            );
            await client.query(
              'UPDATE reward_purchase_allocations SET released_at=$1 WHERE reward_id=$2 AND released_at IS NULL',
              [time, reward.id],
            );
            await this.movement(
              client,
              card,
              actor,
              reward.stamps_spent,
              'reward_refund',
              time,
              requestId,
              null,
              reward.id,
              reason,
            );
          }
          await client.query(
            'UPDATE purchases SET reversed_at=$1,reversal_reason=$2 WHERE id=$3',
            [time, reason, purchaseId],
          );
          await this.movement(
            client,
            card,
            actor,
            -1,
            'purchase_reversal',
            time,
            requestId,
            purchaseId,
            null,
            reason,
          );
          const rewards = await this.grantRewards(
            client,
            card,
            actor,
            time,
            requestId,
          );
          await bump(client, card.membership_id);
          await this.audit(
            client,
            actor,
            restaurant,
            'purchase_reversed',
            purchaseId,
            requestId,
          );
          return {
            purchase_id: purchaseId,
            status: 'reversed',
            balance: await balance(client, card.membership_id),
            rewards,
          };
        },
      );
    });
  }
  private async withOwnCard<T>(
    actor: string,
    cardId: string,
    work: (client: PoolClient, card: CardContext) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const lookup = (
        await client.query<{ restaurant_id: string }>(
          `SELECT p.restaurant_id FROM loyalty_cards c JOIN memberships m ON m.id=c.membership_id JOIN loyalty_programs p ON p.id=m.program_id WHERE c.id=$1 AND m.user_id=$2`,
          [cardId, actor],
        )
      ).rows[0];
      if (!lookup) throw missing();
      const restaurant = await lockRestaurant(client, lookup.restaurant_id);
      await lockActor(client, actor);
      const card = await cardContext(client, cardId);
      if (card.customer_id !== actor) throw missing();
      if (restaurant.status !== 'active')
        throw new AppError(
          403,
          'RESTAURANT_SUSPENDED',
          'El restaurante está suspendido.',
        );
      return work(client, card);
    });
  }
  async preview(actor: string, cardId: string): Promise<LoyaltyResult> {
    return this.withOwnCard(actor, cardId, async (client, card) => {
      activeCard(card);
      const rewards = (
        await client.query(
          'SELECT id,description,stamps_spent FROM rewards WHERE membership_id=$1 AND status=$2 ORDER BY earned_at,id',
          [card.membership_id, 'available'],
        )
      ).rows;
      return {
        card_id: cardId,
        benefits_version: card.benefits_version,
        balance: await balance(client, card.membership_id),
        rewards,
      };
    });
  }
  async consent(
    actor: string,
    cardId: string,
    version: number,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<LoyaltyResult> {
    return this.withOwnCard(actor, cardId, async (client, card) =>
      idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'consent',
          payload: { cardId, version },
        },
        async () => {
          activeCard(card);
          if (card.benefits_version !== version)
            throw conflict(
              'Los beneficios cambiaron; actualice la vista previa.',
            );
          const id = randomUUID(),
            time = this.now(),
            expires = new Date(time.getTime() + 15 * 60 * 1000);
          await client.query(
            'INSERT INTO closure_consents(id,card_id,user_id,benefits_version,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',
            [id, cardId, actor, version, expires, time],
          );
          await this.audit(
            client,
            actor,
            card.restaurant_id,
            'closure_consent_created',
            id,
            requestId,
          );
          return {
            id,
            card_id: cardId,
            benefits_version: version,
            expires_at: expires.toISOString(),
          };
        },
      ),
    );
  }
  async revoke(
    actor: string,
    cardId: string,
    consentId: string,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<LoyaltyResult> {
    return this.withOwnCard(actor, cardId, async (client, card) => {
      const consent = (
        await client.query<{ consumed_at: Date | null }>(
          'SELECT consumed_at FROM closure_consents WHERE id=$1 AND card_id=$2 AND user_id=$3',
          [consentId, cardId, actor],
        )
      ).rows[0];
      if (!consent) throw missing();
      return idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'revoke_consent',
          payload: { cardId, consentId },
        },
        async () => {
          if (consent.consumed_at)
            throw conflict('El consentimiento ya se consumió.');
          await client.query(
            'UPDATE closure_consents SET revoked_at=COALESCE(revoked_at,$1) WHERE id=$2',
            [this.now(), consentId],
          );
          await this.audit(
            client,
            actor,
            card.restaurant_id,
            'closure_consent_revoked',
            consentId,
            requestId,
          );
          return { id: consentId, revoked: true };
        },
      );
    });
  }
  async close(
    actor: string,
    restaurant: string,
    cardId: string,
    consentId: string,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<LoyaltyResult> {
    return withTransaction(this.pool, async (client) => {
      await lockRestaurant(client, restaurant);
      await lockActor(client, actor);
      await requireStaff(client, actor, restaurant, [
        'owner',
        'admin',
        'employee',
      ]);
      const card = await cardContext(client, cardId, restaurant);
      return idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'close',
          payload: { restaurant, cardId, consentId },
        },
        async () => {
          activeCard(card);
          const consent = (
            await client.query<{
              user_id: string;
              benefits_version: number;
              expires_at: Date;
              revoked_at: Date | null;
              consumed_at: Date | null;
            }>(
              'SELECT user_id,benefits_version,expires_at,revoked_at,consumed_at FROM closure_consents WHERE id=$1 AND card_id=$2',
              [consentId, cardId],
            )
          ).rows[0];
          const time = this.now();
          if (
            !consent ||
            consent.user_id !== card.customer_id ||
            consent.benefits_version !== card.benefits_version ||
            consent.expires_at <= time ||
            consent.revoked_at ||
            consent.consumed_at
          )
            throw conflict(
              'El consentimiento no está vigente para los beneficios actuales.',
            );
          await client.query(
            'UPDATE closure_consents SET consumed_at=$1 WHERE id=$2',
            [time, consentId],
          );
          await client.query(
            "UPDATE rewards SET status='cancelled' WHERE membership_id=$1 AND status='available'",
            [card.membership_id],
          );
          await client.query(
            `UPDATE reward_purchase_allocations SET released_at=$1 WHERE membership_id=$2 AND released_at IS NULL AND reward_id IN(SELECT id FROM rewards WHERE membership_id=$2 AND status='cancelled')`,
            [time, card.membership_id],
          );
          const remaining = await balance(client, card.membership_id);
          if (remaining !== 0)
            await this.movement(
              client,
              card,
              actor,
              -remaining,
              'closure',
              time,
              requestId,
              null,
              null,
              'Cierre confirmado por titular',
            );
          await client.query(
            "UPDATE memberships SET status='closed',closed_at=$1,benefits_version=benefits_version+1 WHERE id=$2",
            [time, card.membership_id],
          );
          const invalidated = createHash('sha256')
            .update(randomUUID())
            .digest('hex');
          await client.query(
            "UPDATE loyalty_cards SET status='blocked',qr_token_hash=$1,qr_token_encrypted=NULL WHERE id=$2",
            [invalidated, cardId],
          );
          await this.audit(
            client,
            actor,
            restaurant,
            'card_closed',
            cardId,
            requestId,
          );
          return { card_id: cardId, status: 'closed' };
        },
      );
    });
  }
}
