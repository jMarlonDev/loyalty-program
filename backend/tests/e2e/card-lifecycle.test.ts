import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/application/errors.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';
import { type ServerType, serve } from '../helpers/http-server.js';

describe('NEXT-001/003 ciclo completo HTTP + PostgreSQL', () => {
  let database: TestDatabase;
  let server: ServerType;
  let origin: string;
  const people = Object.fromEntries(
    ['owner', 'employee', 'customer', 'stranger'].map((name) => [
      name,
      { id: randomUUID(), email: `${name}@example.test`, emailVerified: true },
    ]),
  );

  beforeAll(async () => {
    database = await createTestDatabase();
    const app = createApp({
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      // D-06: estas pruebas encadenan compras; la espera se prueba en stamps-d06.
      stampCooldownMinutes: 0,
      publicOrigin: 'https://loyalty.test',
      identityProvider: {
        async verifyAccessToken(token) {
          const identity = people[token];
          if (!identity)
            throw new AppError(401, 'UNAUTHENTICATED', 'Invalid token');
          return identity;
        },
      },
    });
    await new Promise<void>((resolve) => {
      server = serve(
        { fetch: app.fetch, port: 0, hostname: '127.0.0.1' },
        ({ port }) => {
          origin = `http://127.0.0.1:${port}`;
          resolve();
        },
      );
    });
  });

  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    await database?.cleanup();
  });

  async function call(
    actor: string | null,
    method: string,
    path: string,
    body?: unknown,
    expected = 200,
    options: { key?: string; customer?: string } = {},
  ) {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: {
        ...(actor ? { Authorization: `Bearer ${actor}` } : {}),
        ...(options.customer ? { 'x-customer-session': options.customer } : {}),
        ...(method !== 'GET' ? { Origin: 'https://loyalty.test' } : {}),
        'Idempotency-Key': options.key ?? randomUUID(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    expect(
      response.status,
      `${method} ${path}: ${JSON.stringify(result)}`,
    ).toBe(expected);
    return { body: result, headers: response.headers };
  }

  it('AC-01/02/05/06/09/11/12 recorre dueño, empleado, cliente, premio y nuevo ciclo', async () => {
    for (const actor of Object.keys(people))
      await call(actor, 'POST', '/profiles', { full_name: actor }, 201);

    const restaurant = (
      await call('owner', 'POST', '/restaurants', { name: 'Restaurante' }, 201)
    ).body.data;
    const base = `/restaurants/${restaurant.id}`;

    await call(
      'employee',
      'POST',
      `${base}/purchases`,
      {
        card_id: randomUUID(),
        location_id: randomUUID(),
        sale_reference: 'before-invitation',
      },
      404,
    );

    const invitation = (
      await call(
        'owner',
        'POST',
        `${base}/invitations`,
        {
          email: people.employee?.email,
          phone: '3001234567',
          country: 'CO',
        },
        201,
      )
    ).body.data;
    await call(
      'stranger',
      'POST',
      '/invitations/accept',
      {
        token: invitation.token,
      },
      403,
    );
    await call('employee', 'POST', '/invitations/accept', {
      token: invitation.token,
    });
    await call('employee', 'POST', '/restaurants', { name: 'Forbidden' }, 403);

    const programInput = {
      name: 'Programa frecuente',
      stamps_required: 2,
      reward_description: 'Premio gratis',
      background_color: '#FFFFFF',
      text_color: '#000000',
    };
    await call('employee', 'POST', `${base}/programs`, programInput, 403);
    const program = (
      await call('owner', 'POST', `${base}/programs`, programInput, 201)
    ).body.data;
    await call('stranger', 'GET', base, undefined, 404);

    const session = await call(
      null,
      'POST',
      '/customer/enrollments',
      {
        phone: '3009876543',
        country: 'CO',
        public_code: program.public_code,
      },
      201,
    );
    const customerToken = session.headers.get('x-customer-token');
    expect(customerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const enrolled = session.body.data;
    const card = enrolled.card;
    expect(card.balance).toBe(0);

    const repeated = await call(
      null,
      'POST',
      '/customer/enrollments',
      { public_code: program.public_code },
      200,
      { customer: customerToken ?? '' },
    );
    expect(repeated.body.data.card.id).toBe(card.id);

    const qr = await call(
      'customer',
      'GET',
      `/customer/cards/${card.id}/qr`,
      undefined,
      200,
      { customer: customerToken ?? '' },
    );
    const cardToken = qr.body.data.token;

    await call(
      'stranger',
      'POST',
      '/operator/scans',
      {
        restaurant_id: restaurant.id,
        purpose: 'card',
        token: cardToken,
      },
      403,
    );

    const scan = await call('employee', 'POST', '/operator/scans', {
      restaurant_id: restaurant.id,
      purpose: 'card',
      token: cardToken,
    });
    expect(scan.body.data.allowed_actions).toEqual(['purchase']);
    expect(scan.body.data.card.balance).toBe(0);
    expect(scan.body.data.phone_masked).not.toContain('3009876543');

    const purchaseKey = randomUUID();
    const purchaseInput = {
      restaurant_id: restaurant.id,
      token: cardToken,
      sale_reference: 'sale-1',
    };
    const first = await call(
      'employee',
      'POST',
      '/operator/purchases',
      purchaseInput,
      201,
      { key: purchaseKey },
    );
    expect(first.body.data.card.balance).toBe(1);
    expect(first.body.data.card.cycle.state).toBe('collecting');

    const replay = await call(
      'employee',
      'POST',
      '/operator/purchases',
      purchaseInput,
      201,
      { key: purchaseKey },
    );
    expect(replay.body.data.id).toBe(first.body.data.id);
    await call(
      'employee',
      'POST',
      '/operator/purchases',
      { ...purchaseInput, sale_reference: 'changed' },
      409,
      { key: purchaseKey },
    );

    const final = await call(
      'employee',
      'POST',
      '/operator/purchases',
      {
        ...purchaseInput,
        sale_reference: 'sale-2',
      },
      201,
    );
    expect(final.body.data.card.balance).toBe(2);
    // D-06: la meta deja el premio pendiente y reabre la tarjeta en 0.
    expect(final.body.data.card.cycle).toMatchObject({
      number: 2,
      state: 'collecting',
      stamps: 0,
    });
    const reward = final.body.data.card.rewards[0];
    expect(reward.status).toBe('available');
    const voucherToken = reward.voucher.token;

    const extra = await call(
      'employee',
      'POST',
      '/operator/purchases',
      {
        ...purchaseInput,
        sale_reference: 'sale-3',
      },
      201,
    );
    expect(extra.body.data.card.cycle).toMatchObject({
      number: 2,
      state: 'collecting',
      stamps: 1,
    });
    expect(extra.body.data.card.rewards[0].status).toBe('available');

    const rewardScan = await call('employee', 'POST', '/operator/scans', {
      restaurant_id: restaurant.id,
      purpose: 'reward',
      token: voucherToken,
    });
    expect(rewardScan.body.data.allowed_actions).toEqual(['redeem']);
    await call(
      'customer',
      'POST',
      '/operator/redemptions',
      {
        restaurant_id: restaurant.id,
        token: voucherToken,
        confirm: true,
      },
      403,
    );

    const redemption = await call(
      'employee',
      'POST',
      '/operator/redemptions',
      {
        restaurant_id: restaurant.id,
        token: voucherToken,
        confirm: true,
      },
      201,
      { key: 'redeem-1' },
    );
    expect(redemption.body.data.card.balance).toBe(1);
    expect(redemption.body.data.card.cycle.state).toBe('collecting');
    expect(redemption.body.data.card.cycle.number).toBe(2);
    expect(redemption.body.data.card.cycle.stamps).toBe(1);

    await call(
      'employee',
      'POST',
      '/operator/redemptions',
      {
        restaurant_id: restaurant.id,
        token: voucherToken,
        confirm: true,
      },
      409,
      { key: 'redeem-2' },
    );
    expect(
      (
        await database.pool.query(
          'SELECT sum(stamp_delta)::int AS balance FROM loyalty_ledger_entries WHERE membership_id=(SELECT membership_id FROM loyalty_cards WHERE id=$1)',
          [card.id],
        )
      ).rows[0].balance,
    ).toBe(1);

    const next = await call(
      'employee',
      'POST',
      '/operator/purchases',
      {
        ...purchaseInput,
        sale_reference: 'sale-4',
      },
      201,
    );
    expect(next.body.data.card.balance).toBe(2);
    expect(next.body.data.card.cycle).toMatchObject({
      number: 3,
      state: 'collecting',
      stamps: 0,
    });
    expect(next.body.data.card.rewards[0].status).toBe('available');
  });
});
