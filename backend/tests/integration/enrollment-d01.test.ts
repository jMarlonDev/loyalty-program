import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/application/errors.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('NEXT-006 D-01 inscripción por teléfono, cierre y transferencia', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let skewMs = 0;
  const owner = randomUUID();
  const employee = randomUUID();
  const employeeRow = randomUUID();
  const restaurant = randomUUID();
  const publicCode = `d01-${randomUUID().slice(0, 18)}`;
  const people = new Map<string, string>([
    [owner, 'owner-d01@example.test'],
    [employee, 'employee-d01@example.test'],
  ]);

  beforeAll(async () => {
    database = await createTestDatabase();
    for (const [id, email] of people)
      await database.pool.query(
        "INSERT INTO users(id,full_name,email,status,created_at,updated_at) VALUES($1,'Person',$2,'active',now(),now())",
        [id, email],
      );
    const ownerRole = randomUUID();
    const employeeRole = randomUUID();
    await database.pool.query(
      "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'owner',now()),($2,'employee',now())",
      [ownerRole, employeeRole],
    );
    await database.pool.query(
      "INSERT INTO restaurants(id,name,owner_user_id,status,created_at,updated_at) VALUES($1,'D01',$2,'active',now(),now())",
      [restaurant, owner],
    );
    for (const [id, userId, roleId] of [
      [randomUUID(), owner, ownerRole],
      [employeeRow, employee, employeeRole],
    ])
      await database.pool.query(
        "INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',now(),now(),now())",
        [id, userId, restaurant, roleId],
      );
    // BRANCH-001: el empleado solo opera en las sucursales asignadas.
    await database.pool.query(
      "INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at) VALUES(gen_random_uuid(),$1,'Principal','Calle 1','','','active',now(),now())",
      [restaurant],
    );
    await database.pool.query(
      `INSERT INTO employee_locations(employee_id,location_id,created_at)
       SELECT e.id,l.id,now() FROM restaurant_employees e JOIN locations l ON l.restaurant_id=e.restaurant_id
       WHERE e.restaurant_id=$1 AND e.user_id<>$2`,
      [restaurant, owner],
    );
    await database.pool.query(
      `INSERT INTO loyalty_programs(id,restaurant_id,name,public_code,stamps_required,reward_description,status,created_at,updated_at)
       VALUES($1,$2,'D01',$3,3,'Premio','active',now(),now())`,
      [randomUUID(), restaurant, publicCode],
    );
    app = createApp({
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      // D-06: estas pruebas encadenan compras; la espera se prueba en stamps-d06.
      stampCooldownMinutes: 0,
      publicOrigin: 'https://loyalty.test',
      now: () => new Date(Date.now() + skewMs),
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
      ip?: string;
    } = {},
  ) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: {
        ...(options.actor ? { Authorization: `Bearer ${options.actor}` } : {}),
        ...(options.customer ? { 'x-customer-session': options.customer } : {}),
        ...(options.ip ? { 'x-loyalty-client-address': options.ip } : {}),
        ...(options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
        Origin: 'https://loyalty.test',
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  const enroll = (phone: string, country = 'CO', ip?: string) =>
    request('POST', '/customer/enrollments', {
      body: { public_code: publicCode, phone, country },
      ...(ip ? { ip } : {}),
    });
  const count = async (sql: string, args: unknown[] = []) =>
    (await database.pool.query(sql, args)).rows[0].n as number;
  const auditCount = (action: string) =>
    count('SELECT count(*)::int AS n FROM audit_events WHERE action=$1', [
      action,
    ]);
  const openMemberships = (phone: string) =>
    count(
      "SELECT count(*)::int AS n FROM memberships m JOIN customers c ON c.id=m.user_id WHERE c.phone=$1 AND m.status<>'closed'",
      [phone],
    );

  it('crea una tarjeta con 0 sellos para un número nuevo y audita CARD_CREATED', async () => {
    const response = await enroll('3101000001');
    expect(response.status).toBe(201);
    expect(response.headers.get('x-customer-token')).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    const data = (await response.json()).data;
    expect(data.existing).toBe(false);
    expect(data.reenrollment).toBe(false);
    expect(data.card.balance).toBe(0);
    expect(data.card.cycle.stamps).toBe(0);
    expect(await auditCount('CARD_CREATED')).toBeGreaterThanOrEqual(1);
  });

  it('rechaza el mismo número con tarjeta activa desde otro dispositivo sin revelar datos', async () => {
    const first = await enroll('3101000002');
    expect(first.status).toBe(201);
    const before = await auditCount('ENROLL_REJECTED_ACTIVE');
    const second = await enroll('3101000002');
    expect(second.status).toBe(409);
    expect(second.headers.get('x-customer-token')).toBeNull();
    const text = await second.text();
    const body = JSON.parse(text);
    expect(body.error.code).toBe('CARD_ALREADY_ACTIVE');
    expect(body.error.message).toBe('Este número ya tiene una tarjeta activa.');
    expect(body.data).toBeUndefined();
    expect(text).not.toMatch(/"card"|stamps|balance|3101000002/);
    expect(await auditCount('ENROLL_REJECTED_ACTIVE')).toBe(before + 1);
    expect(await openMemberships('+573101000002')).toBe(1);
  });

  it('devuelve la misma tarjeta al dispositivo con sesión sin crear otra membresía', async () => {
    const first = await enroll('3101000003');
    const token = first.headers.get('x-customer-token') ?? '';
    const cardId = (await first.json()).data.card.id;
    const again = await request('POST', '/customer/enrollments', {
      customer: token,
      body: { public_code: publicCode },
    });
    expect(again.status).toBe(200);
    const data = (await again.json()).data;
    expect(data.existing).toBe(true);
    expect(data.same_program).toBe(true);
    expect(data.card.id).toBe(cardId);
    expect(await openMemberships('+573101000003')).toBe(1);
  });

  it('cierra la tarjeta con sellos y premio pendiente, revoca la sesión y conserva las filas', async () => {
    const first = await enroll('3101000004');
    const token = first.headers.get('x-customer-token') ?? '';
    const cardId = (await first.json()).data.card.id;
    const qr = await request('GET', `/customer/cards/${cardId}/qr`, {
      customer: token,
    });
    const cardToken = (await qr.json()).data.token;
    for (let i = 1; i <= 4; i++) {
      const purchase = await request('POST', '/operator/purchases', {
        actor: employee,
        key: `close-${i}`,
        body: {
          restaurant_id: restaurant,
          token: cardToken,
          sale_reference: `CLOSE-${i}`,
        },
      });
      expect(purchase.status).toBe(201);
    }
    const before = await auditCount('CARD_CLOSED');
    const noConfirm = await request('POST', `/customer/cards/${cardId}/close`, {
      customer: token,
      body: { confirm: false },
    });
    expect(noConfirm.status).toBe(400);

    const closed = await request('POST', `/customer/cards/${cardId}/close`, {
      customer: token,
      body: { confirm: true },
    });
    expect(closed.status).toBe(200);
    expect(closed.headers.get('x-customer-clear')).toBe('1');
    expect((await closed.json()).data).toEqual({
      stamps_lost: 1,
      rewards_lost: 1,
    });
    const rows = await database.pool.query(
      `SELECT m.status AS m,c.status AS c,
        (SELECT array_agg(status) FROM rewards WHERE membership_id=m.id) AS rewards,
        (SELECT count(*)::int FROM purchases WHERE membership_id=m.id) AS purchases
       FROM loyalty_cards c JOIN memberships m ON m.id=c.membership_id WHERE c.id=$1`,
      [cardId],
    );
    expect(rows.rows[0]).toMatchObject({
      m: 'closed',
      c: 'closed',
      rewards: ['cancelled'],
      purchases: 4,
    });
    const afterClose = await request('GET', '/customer/cards', {
      customer: token,
    });
    expect(afterClose.status).toBe(401);
    expect(await auditCount('CARD_CLOSED')).toBe(before + 1);
  });

  it('crea una tarjeta nueva en 0 al reinscribir un número con tarjeta cerrada y el dueño la distingue', async () => {
    const first = await enroll('3101000005');
    const token = first.headers.get('x-customer-token') ?? '';
    const oldCard = (await first.json()).data.card.id;
    expect(
      (
        await request('POST', `/customer/cards/${oldCard}/close`, {
          customer: token,
          body: { confirm: true },
        })
      ).status,
    ).toBe(200);

    const second = await enroll('3101000005');
    expect(second.status).toBe(201);
    const data = (await second.json()).data;
    expect(data.reenrollment).toBe(true);
    expect(data.notice).toBeTruthy();
    expect(data.card.balance).toBe(0);
    expect(data.card.id).not.toBe(oldCard);
    const membership = await database.pool.query(
      'SELECT is_reenrollment,previous_cards_count FROM memberships WHERE id=(SELECT membership_id FROM loyalty_cards WHERE id=$1)',
      [data.card.id],
    );
    expect(membership.rows[0]).toEqual({
      is_reenrollment: true,
      previous_cards_count: 1,
    });

    const list = await request('GET', `/restaurants/${restaurant}/cards`, {
      actor: owner,
    });
    expect(list.status).toBe(200);
    const entry = (await list.json()).data.find(
      (row: { card_id: string }) => row.card_id === data.card.id,
    );
    expect(entry.is_reenrollment).toBe(true);
    expect(entry.phone_masked).toBe('+57 310 *** 0005');

    const detail = await request(
      'GET',
      `/restaurants/${restaurant}/cards/${data.card.id}`,
      { actor: owner },
    );
    const detailData = (await detail.json()).data;
    expect(detailData.phone).toBe('+573101000005');
    expect(detailData.previous_cards).toHaveLength(1);
    expect(detailData.previous_cards[0].card_id).toBe(oldCard);
  });

  it('con dos inscripciones simultáneas del mismo número solo una prospera', async () => {
    const [a, b] = await Promise.all([
      enroll('3101000006'),
      enroll('3101000006'),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await openMemberships('+573101000006')).toBe(1);
  });

  it('trata «300 123 4567» y «+573001234567» como el mismo cliente', async () => {
    const first = await enroll('300 123 4567');
    expect(first.status).toBe(201);
    const second = await enroll('+573001234567');
    expect(second.status).toBe(409);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM customers WHERE phone='+573001234567'",
      ),
    ).toBe(1);
  });

  it('transfiere la tarjeta con un QR de un solo uso, revoca el dispositivo anterior y respeta permisos y vencimiento', async () => {
    const first = await enroll('3101000008');
    const oldToken = first.headers.get('x-customer-token') ?? '';
    const cardId = (await first.json()).data.card.id;
    const qr = await request('GET', `/customer/cards/${cardId}/qr`, {
      customer: oldToken,
    });
    const cardToken = (await qr.json()).data.token;
    const stamp = await request('POST', '/operator/purchases', {
      actor: employee,
      key: 'transfer-1',
      body: {
        restaurant_id: restaurant,
        token: cardToken,
        sale_reference: 'TR-1',
      },
    });
    expect(stamp.status).toBe(201);

    const path = `/restaurants/${restaurant}/cards/${cardId}/transfers`;
    // Empleado sin permiso.
    expect((await request('POST', path, { actor: employee })).status).toBe(403);

    const issued = await request('POST', path, { actor: owner });
    expect(issued.status).toBe(201);
    const transferToken = (await issued.json()).data.token;
    const claimed = await request('POST', '/customer/transfers/claim', {
      body: { token: transferToken },
    });
    expect(claimed.status).toBe(201);
    const newToken = claimed.headers.get('x-customer-token') ?? '';
    expect(newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken).not.toBe(oldToken);
    expect(
      (await request('GET', '/customer/cards', { customer: oldToken })).status,
    ).toBe(401);
    const cards = await request('GET', '/customer/cards', {
      customer: newToken,
    });
    expect(cards.status).toBe(200);
    const mine = (await cards.json()).data[0];
    expect(mine.id).toBe(cardId);
    expect(mine.balance).toBe(1);
    expect(await auditCount('CARD_TRANSFERRED')).toBeGreaterThanOrEqual(1);

    // Segundo uso del mismo código.
    const reused = await request('POST', '/customer/transfers/claim', {
      body: { token: transferToken },
    });
    expect(reused.status).toBe(409);
    expect((await reused.json()).error.code).toBe('TRANSFER_INVALID');

    // Código vencido (>10 min).
    const expiring = await request('POST', path, { actor: owner });
    const expiredToken = (await expiring.json()).data.token;
    skewMs = 11 * 60 * 1000;
    try {
      const late = await request('POST', '/customer/transfers/claim', {
        body: { token: expiredToken },
      });
      expect(late.status).toBe(409);
      expect((await late.json()).error.code).toBe('TRANSFER_INVALID');
    } finally {
      skewMs = 0;
    }

    // Permiso concedido al empleado.
    const grant = await request(
      'PATCH',
      `/restaurants/${restaurant}/employees/${employeeRow}/transfer-permission`,
      { actor: owner, body: { can_transfer_cards: true } },
    );
    expect(grant.status).toBe(200);
    expect((await request('POST', path, { actor: employee })).status).toBe(201);
  });

  it('rechaza el sexto intento de inscripción desde la misma IP en una hora', async () => {
    const ip = '203.0.113.77';
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await enroll(`31020000${10 + i}`, 'CO', ip)).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });
});
