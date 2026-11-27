import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/application/errors.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('NEXT-001/003 HTTP + PostgreSQL end-to-end', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const owner = randomUUID();
  const employee = randomUUID();
  const samePhoneEmployee = randomUUID();
  const invited = randomUUID();
  const stranger = randomUUID();
  const ownerOnly = randomUUID();
  const restaurant = randomUUID();
  const foreignRestaurant = randomUUID();
  const ownerOnlyRestaurant = randomUUID();
  const publicCode = `next-${randomUUID().slice(0, 18)}`;
  const people = new Map<string, string>([
    [owner, 'owner@example.test'],
    [employee, 'employee@example.test'],
    [samePhoneEmployee, 'same@example.test'],
    [invited, 'invited@example.test'],
    [stranger, 'stranger@example.test'],
    [ownerOnly, 'owner-only@example.test'],
  ]);
  let cardId = '';
  let cardToken = '';
  let customerToken = '';
  let rewardId = '';
  let voucherToken = '';
  let invitationToken = '';

  beforeAll(async () => {
    database = await createTestDatabase();
    for (const [id, email] of people)
      await database.pool.query(
        "INSERT INTO users(id,full_name,email,phone,status,created_at,updated_at) VALUES($1,'Person',$2,$3,'active',now(),now())",
        [id, email, id === samePhoneEmployee ? '+573001234567' : null],
      );
    const ownerRole = randomUUID();
    const employeeRole = randomUUID();
    await database.pool.query(
      "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'owner',now()),($2,'employee',now())",
      [ownerRole, employeeRole],
    );
    await database.pool.query(
      "INSERT INTO restaurants(id,name,owner_user_id,status,created_at,updated_at) VALUES($1,'Propio',$2,'active',now(),now())",
      [ownerOnlyRestaurant, ownerOnly],
    );
    for (const id of [restaurant, foreignRestaurant])
      await database.pool.query(
        "INSERT INTO restaurants(id,name,owner_user_id,status,created_at,updated_at) VALUES($1,'Next',$2,'active',now(),now())",
        [id, id === restaurant ? owner : stranger],
      );
    for (const [userId, roleId] of [
      [owner, ownerRole],
      [employee, employeeRole],
      [samePhoneEmployee, employeeRole],
    ])
      await database.pool.query(
        "INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',now(),now(),now())",
        [randomUUID(), userId, restaurant, roleId],
      );
    await database.pool.query(
      `INSERT INTO loyalty_programs(id,restaurant_id,name,public_code,stamps_required,reward_description,status,created_at,updated_at)
       VALUES($1,$2,'Next',$3,3,'Premio', 'active',now(),now())`,
      [randomUUID(), restaurant, publicCode],
    );
    app = createApp({
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      publicOrigin: 'https://loyalty.test',
      identityProvider: {
        async verifyAccessToken(token) {
          const email = people.get(token);
          if (!email) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid');
          return { id: token, email, emailVerified: true };
        },
      },
    });
  });
  afterAll(async () => {
    if (database) await database.cleanup();
  });

  const request = (
    method: string,
    path: string,
    options: {
      actor?: string;
      customer?: string;
      body?: unknown;
      key?: string;
      origin?: string;
    } = {},
  ) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: {
        ...(options.actor ? { Authorization: `Bearer ${options.actor}` } : {}),
        ...(options.customer ? { 'x-customer-session': options.customer } : {}),
        ...(options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
        Origin: options.origin ?? 'https://loyalty.test',
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });

  it('AC-02/05/06/09/11/12 enrols, stamps, rewards and redeems once', async () => {
    const session = await request('POST', '/customer/session', {
      body: {
        phone: '3001234567',
        country: 'CO',
        public_code: publicCode,
      },
    });
    expect(session.status).toBe(201);
    customerToken = session.headers.get('x-customer-token') ?? '';
    expect(customerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const enrolled = (await session.json()).data;
    cardId = enrolled.card.id;
    expect(enrolled.card.balance).toBe(0);

    const repeated = await request('POST', '/customer/enrollments', {
      customer: customerToken,
      body: { public_code: publicCode },
    });
    expect(repeated.status).toBe(201);
    expect((await repeated.json()).data.id).toBe(cardId);

    const qr = await request('GET', `/customer/cards/${cardId}/qr`, {
      customer: customerToken,
    });
    expect(qr.status).toBe(200);
    cardToken = (await qr.json()).data.token;

    const scan = await request('POST', '/operator/scans', {
      actor: employee,
      body: {
        restaurant_id: restaurant,
        purpose: 'card',
        token: cardToken,
      },
    });
    expect(scan.status).toBe(200);
    expect((await scan.json()).data.allowed_actions).toEqual(['purchase']);

    for (let index = 1; index <= 3; index++) {
      const purchase = await request('POST', '/operator/purchases', {
        actor: employee,
        key: `purchase-${index}`,
        body: {
          restaurant_id: restaurant,
          token: cardToken,
          sale_reference: `SALE-${index}`,
        },
      });
      expect(purchase.status).toBe(201);
      const data = (await purchase.json()).data;
      expect(data.card.balance).toBe(index);
      if (index === 3) {
        rewardId = data.card.rewards[0].id;
        voucherToken = data.card.rewards[0].voucher.token;
        expect(data.card.cycle.state).toBe('reward_available');
      }
    }

    const replay = await request('POST', '/operator/purchases', {
      actor: employee,
      key: 'purchase-3',
      body: {
        restaurant_id: restaurant,
        token: cardToken,
        sale_reference: 'SALE-3',
      },
    });
    expect(replay.status).toBe(201);
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int AS total FROM purchases WHERE membership_id=(SELECT membership_id FROM loyalty_cards WHERE id=$1)',
          [cardId],
        )
      ).rows[0].total,
    ).toBe(3);

    const duplicateReference = await request('POST', '/operator/purchases', {
      actor: employee,
      key: 'purchase-duplicate-reference',
      body: {
        restaurant_id: restaurant,
        token: cardToken,
        sale_reference: 'SALE-1',
      },
    });
    expect(duplicateReference.status).toBe(409);
    expect((await duplicateReference.json()).error.code).toBe(
      'SALE_REFERENCE_DUPLICATE',
    );

    const additional = await request('POST', '/operator/purchases', {
      actor: employee,
      key: 'purchase-4',
      body: {
        restaurant_id: restaurant,
        token: cardToken,
        sale_reference: 'SALE-4',
      },
    });
    expect(additional.status).toBe(201);
    const extra = (await additional.json()).data;
    expect(extra.card.cycle).toMatchObject({
      number: 2,
      state: 'collecting',
      stamps: 1,
    });
    expect(extra.card.rewards[0].status).toBe('available');

    const voucher = await request(
      'GET',
      `/customer/rewards/${rewardId}/voucher`,
      { customer: customerToken },
    );
    expect(voucher.status).toBe(200);
    expect((await voucher.json()).data.token).toBe(voucherToken);

    const rewardScan = await request('POST', '/operator/scans', {
      actor: employee,
      body: {
        restaurant_id: restaurant,
        purpose: 'reward',
        token: voucherToken,
      },
    });
    expect(rewardScan.status).toBe(200);
    expect((await rewardScan.json()).data.allowed_actions).toEqual(['redeem']);

    const redemption = await request('POST', '/operator/redemptions', {
      actor: employee,
      key: 'redeem-1',
      body: {
        restaurant_id: restaurant,
        token: voucherToken,
        confirm: true,
      },
    });
    expect(redemption.status).toBe(201);
    const redeemed = (await redemption.json()).data;
    expect(redeemed.card.balance).toBe(1);
    expect(redeemed.card.cycle.state).toBe('collecting');
    expect(redeemed.card.cycle.number).toBe(2);
    expect(redeemed.card.cycle.stamps).toBe(1);
    expect(
      (
        await database.pool.query(
          'SELECT sum(stamp_delta)::int AS balance FROM loyalty_ledger_entries WHERE membership_id=(SELECT membership_id FROM loyalty_cards WHERE id=$1)',
          [cardId],
        )
      ).rows[0].balance,
    ).toBe(1);

    const replayed = await request('POST', '/operator/redemptions', {
      actor: employee,
      key: 'redeem-1',
      body: {
        restaurant_id: restaurant,
        token: voucherToken,
        confirm: true,
      },
    });
    expect(replayed.status).toBe(201);
    expect((await replayed.json()).data.card.cycle.number).toBe(2);

    const second = await request('POST', '/operator/redemptions', {
      actor: employee,
      key: 'redeem-2',
      body: {
        restaurant_id: restaurant,
        token: voucherToken,
        confirm: true,
      },
    });
    expect(second.status).toBe(409);
    expect((await second.json()).error.code).toBe('VOUCHER_CONSUMED');

    const nextPurchase = await request('POST', '/operator/purchases', {
      actor: employee,
      key: 'purchase-next',
      body: {
        restaurant_id: restaurant,
        token: cardToken,
        sale_reference: 'SALE-NEXT',
      },
    });
    expect(nextPurchase.status).toBe(201);
    const afterNext = (await nextPurchase.json()).data;
    expect(afterNext.card.balance).toBe(2);
    expect(afterNext.card.cycle.stamps).toBe(2);
  });

  it('AC-05/06 rejects foreign staff, revoked access, self-purchase and wrong origin', async () => {
    const foreign = await request('POST', '/operator/scans', {
      actor: stranger,
      body: {
        restaurant_id: restaurant,
        purpose: 'card',
        token: cardToken,
      },
    });
    expect(foreign.status).toBe(403);
    const self = await request('POST', '/operator/purchases', {
      actor: samePhoneEmployee,
      key: 'self',
      body: {
        restaurant_id: restaurant,
        token: cardToken,
        sale_reference: 'SELF',
      },
    });
    expect(self.status).toBe(403);
    const origin = await request('POST', '/operator/purchases', {
      actor: employee,
      key: 'csrf',
      origin: 'https://attacker.test',
      body: {
        restaurant_id: restaurant,
        token: cardToken,
        sale_reference: 'CSRF',
      },
    });
    expect(origin.status).toBe(403);
    await database.pool.query(
      "UPDATE restaurant_employees SET status='disabled' WHERE user_id=$1",
      [employee],
    );
    const revoked = await request('POST', '/operator/scans', {
      actor: employee,
      body: {
        restaurant_id: restaurant,
        purpose: 'card',
        token: cardToken,
      },
    });
    expect(revoked.status).toBe(403);
  });

  it('AC-05 owner without operator link cannot operate cash', async () => {
    const scan = await request('POST', '/operator/scans', {
      actor: ownerOnly,
      body: {
        restaurant_id: ownerOnlyRestaurant,
        purpose: 'card',
        token: 'a'.repeat(43),
      },
    });
    expect(scan.status).toBe(403);
    const purchase = await request('POST', '/operator/purchases', {
      actor: ownerOnly,
      key: 'owner-only',
      body: {
        restaurant_id: ownerOnlyRestaurant,
        token: 'a'.repeat(43),
        sale_reference: 'OWNER-ONLY',
      },
    });
    expect(purchase.status).toBe(403);
  });

  it('AC-05 owner invites by email and phone; employee cannot invite or list', async () => {
    const invitation = await request(
      'POST',
      `/restaurants/${restaurant}/invitations`,
      {
        actor: owner,
        body: {
          email: 'invited@example.test',
          phone: '3109876543',
          country: 'CO',
        },
      },
    );
    const invitationBody = await invitation.json();
    expect(invitation.status, JSON.stringify(invitationBody)).toBe(201);
    const created = invitationBody.data;
    invitationToken = created.token;
    expect(created.invitation.phone_masked).toBe('+57 •••• 6543');

    const forbidden = await request(
      'POST',
      `/restaurants/${restaurant}/invitations`,
      {
        actor: employee,
        body: {
          email: 'other@example.test',
          phone: '3109876543',
          country: 'CO',
        },
      },
    );
    expect(forbidden.status).toBe(403);
    expect(
      (
        await request('GET', `/restaurants/${restaurant}/invitations`, {
          actor: employee,
        })
      ).status,
    ).toBe(403);

    const accepted = await request('POST', '/invitations/accept', {
      actor: invited,
      body: { token: invitationToken },
    });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).data.restaurant_id).toBe(restaurant);
    const employeeRow = (
      await database.pool.query(
        'SELECT phone,status FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2',
        [invited, restaurant],
      )
    ).rows[0];
    expect(employeeRow).toMatchObject({
      phone: '+573109876543',
      status: 'active',
    });
    const replay = await request('POST', '/invitations/accept', {
      actor: invited,
      body: { token: invitationToken },
    });
    expect(replay.status).toBe(200);

    await database.pool.query(
      "UPDATE restaurant_employees SET status='disabled' WHERE user_id=$1 AND restaurant_id=$2",
      [invited, restaurant],
    );
    const denied = await request('POST', '/operator/scans', {
      actor: invited,
      body: {
        restaurant_id: restaurant,
        purpose: 'card',
        token: cardToken,
      },
    });
    expect(denied.status).toBe(403);
  });
});
