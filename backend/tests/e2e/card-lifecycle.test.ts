import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/application/errors.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';
import { type ServerType, serve } from '../helpers/http-server.js';

describe('BACKEND-001 ciclo completo HTTP + PostgreSQL', () => {
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
    key = randomUUID(),
  ) {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: {
        ...(actor ? { Authorization: `Bearer ${actor}` } : {}),
        'Idempotency-Key': key,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    expect(
      response.status,
      `${method} ${path}: ${JSON.stringify(result)}`,
    ).toBe(expected);
    return result;
  }
  it('AC-001/006–014 crea negocio, invita personal, acumula, canjea, revierte, cierra y reinscribe conservando historial', async () => {
    for (const actor of Object.keys(people))
      await call(actor, 'POST', '/profiles', { full_name: actor }, 201);
    const restaurant = (
      await call(
        'owner',
        'POST',
        '/restaurants',
        { name: 'Café', slug: 'cafe-e2e' },
        201,
      )
    ).data;
    const base = `/restaurants/${restaurant.id}`;
    const location = (
      await call(
        'owner',
        'POST',
        `${base}/locations`,
        {
          name: 'Centro',
          address: 'Calle 1',
          city: 'Bogotá',
          department: 'Bogotá',
        },
        201,
      )
    ).data;
    const invitation = (
      await call(
        'owner',
        'POST',
        `${base}/invitations`,
        { email: people.employee?.email, role: 'employee' },
        201,
      )
    ).data;
    await call('employee', 'POST', '/invitations/accept', {
      token: invitation.token,
    });
    const programInput = {
      name: 'Café frecuente',
      stamps_required: 2,
      reward_description: 'Café gratis',
      background_color: '#FFFFFF',
      text_color: '#000000',
    };
    await call('employee', 'POST', `${base}/programs`, programInput, 403);
    await call('stranger', 'GET', base, undefined, 404);
    const program = (
      await call('owner', 'POST', `${base}/programs`, programInput, 201)
    ).data;
    const programPage = await call('owner', 'GET', `${base}/programs?limit=1`);
    expect(programPage.data.map((row: { id: string }) => row.id)).toEqual([
      program.id,
    ]);
    expect(programPage.next_cursor).toBeNull();
    expect(
      (await call('owner', 'GET', `${base}/programs/${program.id}`)).data.id,
    ).toBe(program.id);
    const publicProgram = (
      await call(null, 'GET', `/public/programs/${program.public_code}`)
    ).data;
    expect(publicProgram.name).toBe(program.name);
    expect(publicProgram).not.toHaveProperty('employees');
    const enrollment = (
      await call(
        'customer',
        'POST',
        `/public/programs/${program.public_code}/enrollments`,
        {},
        201,
      )
    ).data;
    const card = enrollment.card;
    const member = enrollment.membership;
    await call(
      'customer',
      'POST',
      `/public/programs/${program.public_code}/enrollments`,
      {},
      200,
    );
    await call(
      'owner',
      'PATCH',
      `${base}/programs/${program.id}`,
      { stamps_required: 3 },
      409,
    );
    await call('stranger', 'GET', `/me/cards/${card.id}`, undefined, 404);
    const cardPage = await call('customer', 'GET', '/me/cards?limit=1');
    expect(cardPage.data.map((row: { id: string }) => row.id)).toEqual([
      card.id,
    ]);
    expect(cardPage.next_cursor).toBeNull();
    expect(
      (await call('customer', 'GET', `/me/cards/${card.id}`)).data.id,
    ).toBe(card.id);
    expect((await call('stranger', 'GET', '/me/cards')).data).toEqual([]);
    const originalQr = (
      await call('customer', 'GET', `/me/cards/${card.id}/qr`)
    ).data;
    await call('stranger', 'POST', `/me/cards/${card.id}/qr/rotate`, {}, 404);
    const rotationKey = randomUUID();
    const qr = (
      await call(
        'customer',
        'POST',
        `/me/cards/${card.id}/qr/rotate`,
        {},
        200,
        rotationKey,
      )
    ).data;
    expect(qr.token).not.toBe(originalQr.token);
    expect(
      (
        await call(
          'customer',
          'POST',
          `/me/cards/${card.id}/qr/rotate`,
          {},
          200,
          rotationKey,
        )
      ).data,
    ).toEqual(qr);
    expect(
      (await call('customer', 'GET', `/me/cards/${card.id}/qr`)).data,
    ).toEqual(qr);
    await call(
      'employee',
      'POST',
      `${base}/cards/resolve`,
      { token: originalQr.token },
      404,
    );
    await call('employee', 'POST', `${base}/cards/resolve`, {
      token: qr.token,
    });
    const purchaseInput = {
      card_id: card.id,
      location_id: location.id,
      sale_reference: 'sale-1',
    };
    await call('customer', 'POST', `${base}/purchases`, purchaseInput, 404);
    const purchaseKey = randomUUID();
    const first = (
      await call(
        'employee',
        'POST',
        `${base}/purchases`,
        purchaseInput,
        201,
        purchaseKey,
      )
    ).data;
    const repeat = (
      await call(
        'employee',
        'POST',
        `${base}/purchases`,
        purchaseInput,
        201,
        purchaseKey,
      )
    ).data;
    expect(repeat.purchase_id).toBe(first.purchase_id);
    await call(
      'employee',
      'POST',
      `${base}/purchases`,
      { ...purchaseInput, sale_reference: 'changed' },
      409,
      purchaseKey,
    );
    await call(
      'employee',
      'POST',
      `${base}/purchases`,
      { ...purchaseInput, sale_reference: 'sale-2' },
      201,
    );
    const movements = await call(
      'customer',
      'GET',
      `/me/cards/${card.id}/movements?limit=100`,
    );
    expect(movements.data).toHaveLength(3);
    expect(
      movements.data.reduce(
        (sum: number, row: { stamp_delta: number }) => sum + row.stamp_delta,
        0,
      ),
    ).toBe(0);
    await call(
      'stranger',
      'GET',
      `/me/cards/${card.id}/movements`,
      undefined,
      404,
    );
    const rewards = (
      await call('customer', 'GET', `/me/cards/${card.id}/rewards`)
    ).data;
    expect(rewards).toHaveLength(1);
    await call('employee', 'POST', `${base}/rewards/${rewards[0].id}/redeem`, {
      location_id: location.id,
    });
    await call(
      'owner',
      'POST',
      `${base}/purchases/${first.purchase_id}/reverse`,
      { reason: 'Delivered reward' },
      409,
    );
    const third = (
      await call(
        'employee',
        'POST',
        `${base}/purchases`,
        { ...purchaseInput, sale_reference: 'sale-3' },
        201,
      )
    ).data;
    await call(
      'owner',
      'POST',
      `${base}/purchases/${third.purchase_id}/reverse`,
      { reason: 'Refunded' },
    );
    await call(
      'employee',
      'POST',
      `${base}/purchases`,
      { ...purchaseInput, sale_reference: 'sale-4' },
      201,
    );
    await call(
      'employee',
      'POST',
      `${base}/purchases`,
      { ...purchaseInput, sale_reference: 'sale-5' },
      201,
    );
    const preview = (
      await call('customer', 'GET', `/me/cards/${card.id}/closure-preview`)
    ).data;
    expect(preview.rewards).toHaveLength(1);
    const revoked = (
      await call(
        'customer',
        'POST',
        `/me/cards/${card.id}/closure-consents`,
        {
          benefits_version: preview.benefits_version,
          accepted: true,
        },
        201,
      )
    ).data;
    await call(
      'customer',
      'DELETE',
      `/me/cards/${card.id}/closure-consents/${revoked.id}`,
    );
    await call(
      'employee',
      'POST',
      `${base}/cards/${card.id}/close`,
      { consent_id: revoked.id },
      409,
    );
    expect(
      (await call('customer', 'GET', `/me/cards/${card.id}/closure-preview`))
        .data,
    ).toEqual(preview);
    const consent = (
      await call(
        'customer',
        'POST',
        `/me/cards/${card.id}/closure-consents`,
        { benefits_version: preview.benefits_version, accepted: true },
        201,
      )
    ).data;
    await call('employee', 'POST', `${base}/cards/${card.id}/close`, {
      consent_id: consent.id,
    });
    await call(
      'employee',
      'POST',
      `${base}/cards/resolve`,
      { token: qr.token },
      404,
    );
    const fresh = (
      await call(
        'customer',
        'POST',
        `/public/programs/${program.public_code}/enrollments`,
        {},
        201,
      )
    ).data;
    expect(fresh.card.id).not.toBe(card.id);
    expect(fresh.membership.id).not.toBe(member.id);
    const old = (
      await database.pool.query('SELECT status FROM memberships WHERE id=$1', [
        member.id,
      ])
    ).rows[0];
    expect(old.status).toBe('closed');
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int AS n FROM purchases WHERE membership_id=$1',
          [member.id],
        )
      ).rows[0].n,
    ).toBe(5);
    expect(
      (
        await database.pool.query(
          'SELECT coalesce(sum(stamp_delta),0)::int AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
          [member.id],
        )
      ).rows[0].balance,
    ).toBe(0);
    expect(
      (
        await database.pool.query(
          'SELECT status FROM rewards WHERE membership_id=$1 ORDER BY earned_at,id',
          [member.id],
        )
      ).rows
        .map((row) => row.status)
        .sort(),
    ).toEqual(['cancelled', 'redeemed']);
  });
});
