import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/application/errors.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

const HOUR = 3_600_000;

describe('D-06 QR rotativo, espera entre sellos y ciclos con premio pendiente', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let fastApp: ReturnType<typeof createApp>;
  let clock = Date.parse('2026-11-01T12:00:00Z');
  const now = () => new Date(clock);
  const owner = randomUUID();
  const staffA = randomUUID();
  const staffBoth = randomUUID();
  const restaurant = randomUUID();
  const locA = randomUUID();
  const locB = randomUUID();
  const publicCode = `d06-${randomUUID().slice(0, 18)}`;
  const people = new Map<string, string>([
    [owner, 'owner-d06@example.test'],
    [staffA, 'a-d06@example.test'],
    [staffBoth, 'both-d06@example.test'],
  ]);
  let phoneSeq = 3100000000;

  beforeAll(async () => {
    database = await createTestDatabase();
    for (const [id, email] of people)
      await database.pool.query(
        "INSERT INTO users(id,full_name,email,status,created_at,updated_at) VALUES($1,'Person',$2,'active',now(),now())",
        [id, email],
      );
    await database.pool.query(
      "INSERT INTO restaurants(id,name,owner_user_id,status,created_at,updated_at) VALUES($1,'D06',$2,'active',now(),now())",
      [restaurant, owner],
    );
    const ownerRole = randomUUID();
    const employeeRole = randomUUID();
    await database.pool.query(
      "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'owner',now()),($2,'employee',now())",
      [ownerRole, employeeRole],
    );
    for (const [userId, roleId] of [
      [owner, ownerRole],
      [staffA, employeeRole],
      [staffBoth, employeeRole],
    ])
      await database.pool.query(
        "INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',now(),now(),now())",
        [randomUUID(), userId, restaurant, roleId],
      );
    for (const [id, name] of [
      [locA, 'Centro'],
      [locB, 'Norte'],
    ])
      await database.pool.query(
        "INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at) VALUES($1,$2,$3,'Calle 1','','','active',now(),now())",
        [id, restaurant, name],
      );
    for (const [user, loc] of [
      [staffA, locA],
      [staffBoth, locA],
      [staffBoth, locB],
    ])
      await database.pool.query(
        `INSERT INTO employee_locations(employee_id,location_id,created_at)
         SELECT id,$3,now() FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2`,
        [user, restaurant, loc],
      );
    await database.pool.query(
      `INSERT INTO loyalty_programs(id,restaurant_id,name,public_code,stamps_required,reward_description,status,created_at,updated_at)
       VALUES($1,$2,'D06',$3,5,'Postre','active',now(),now())`,
      [randomUUID(), restaurant, publicCode],
    );
    const base = {
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      publicOrigin: 'https://loyalty.test',
      now,
      identityProvider: {
        async verifyAccessToken(token: string) {
          const email = people.get(token);
          if (!email) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid');
          return { id: token, email, emailVerified: true };
        },
      },
    };
    app = createApp(base);
    fastApp = createApp({ ...base, stampCooldownMinutes: 1 });
  });
  afterAll(async () => {
    if (database) await database.cleanup();
  });

  const call = (
    target: ReturnType<typeof createApp>,
    method: string,
    path: string,
    options: {
      actor?: string;
      customer?: string;
      body?: unknown;
      key?: string;
    } = {},
  ) =>
    target.request(`/api/v1${path}`, {
      method,
      headers: {
        ...(options.actor ? { Authorization: `Bearer ${options.actor}` } : {}),
        ...(options.customer ? { 'x-customer-session': options.customer } : {}),
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

  async function newCustomer() {
    const phone = String(phoneSeq++);
    const res = await call(app, 'POST', '/customer/enrollments', {
      body: { phone, country: 'CO', public_code: publicCode },
    });
    expect(res.status).toBe(201);
    const session = res.headers.get('x-customer-token') ?? '';
    const cardId = (await res.json()).data.card.id as string;
    return { session, cardId };
  }
  async function qr(c: { session: string; cardId: string }) {
    const res = await call(app, 'GET', `/customer/cards/${c.cardId}/qr`, {
      customer: c.session,
    });
    expect(res.status).toBe(200);
    return (await res.json()).data as {
      token: string;
      rotates_at: string;
      expires_at: string;
    };
  }
  let keySeq = 0;
  async function buy(
    c: { session: string; cardId: string },
    options: {
      actor?: string;
      location?: string;
      ticket?: string | null;
      key?: string;
      token?: string;
      target?: ReturnType<typeof createApp>;
    } = {},
  ) {
    const token = options.token ?? (await qr(c)).token;
    return call(options.target ?? app, 'POST', '/operator/purchases', {
      actor: options.actor ?? staffA,
      key: options.key ?? `k-${++keySeq}`,
      body: {
        restaurant_id: restaurant,
        token,
        ...(options.ticket === null
          ? {}
          : { sale_reference: options.ticket ?? `T-${randomUUID()}` }),
        ...(options.location ? { location_id: options.location } : {}),
      },
    });
  }
  const purchaseCount = async (cardId: string) =>
    (
      await database.pool.query(
        'SELECT count(*)::int AS n FROM purchases WHERE membership_id=(SELECT membership_id FROM loyalty_cards WHERE id=$1)',
        [cardId],
      )
    ).rows[0].n as number;
  const ledgerCount = async (cardId: string) =>
    (
      await database.pool.query(
        'SELECT count(*)::int AS n FROM loyalty_ledger_entries WHERE membership_id=(SELECT membership_id FROM loyalty_cards WHERE id=$1)',
        [cardId],
      )
    ).rows[0].n as number;

  it('el QR rotativo vigente permite registrar la compra', async () => {
    const c = await newCustomer();
    const data = await qr(c);
    expect(data.token).toMatch(/^c1[A-Za-z0-9_-]{48}$/);
    expect(Date.parse(data.expires_at)).toBeGreaterThan(
      Date.parse(data.rotates_at),
    );
    const res = await buy(c, { token: data.token });
    expect(res.status).toBe(201);
    expect((await res.json()).data.card.balance).toBe(1);
  });

  it('rechaza el mismo QR tras dos ventanas con 409 CARD_QR_EXPIRED y sin compra', async () => {
    const c = await newCustomer();
    const { token } = await qr(c);
    clock += 121_000;
    const res = await buy(c, { token });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CARD_QR_EXPIRED');
    expect(await purchaseCount(c.cardId)).toBe(0);
    expect(await ledgerCount(c.cardId)).toBe(0);
  });

  it('rechaza un QR alterado con 409 y sin compra', async () => {
    const c = await newCustomer();
    const { token } = await qr(c);
    const last = token.endsWith('A') ? 'B' : 'A';
    const res = await buy(c, { token: token.slice(0, -1) + last });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CARD_QR_EXPIRED');
    expect(await purchaseCount(c.cardId)).toBe(0);
  });

  it('rechaza el token estático antiguo de 43 caracteres con 400', async () => {
    const c = await newCustomer();
    const res = await buy(c, { token: 'A'.repeat(43) });
    expect(res.status).toBe(400);
    const scan = await call(app, 'POST', '/operator/scans', {
      actor: staffA,
      body: {
        restaurant_id: restaurant,
        purpose: 'card',
        token: 'A'.repeat(43),
      },
    });
    expect(scan.status).toBe(400);
    expect(await purchaseCount(c.cardId)).toBe(0);
  });

  it('el escaneo de tarjeta con QR rotativo solo lee y no crea sellos', async () => {
    const c = await newCustomer();
    const scan = await call(app, 'POST', '/operator/scans', {
      actor: staffA,
      body: {
        restaurant_id: restaurant,
        purpose: 'card',
        token: (await qr(c)).token,
      },
    });
    expect(scan.status).toBe(200);
    expect(await purchaseCount(c.cardId)).toBe(0);
  });

  it('rechaza un segundo sello antes de 4 h con 429 y tiempo restante, y acepta tras 4 h', async () => {
    const c = await newCustomer();
    expect((await buy(c)).status).toBe(201);
    clock += 1 * HOUR;
    const early = await buy(c);
    expect(early.status).toBe(429);
    const body = await early.json();
    expect(body.error.code).toBe('STAMP_COOLDOWN');
    expect(body.error.message).toMatch(/3 h/);
    expect(await purchaseCount(c.cardId)).toBe(1);
    expect(await ledgerCount(c.cardId)).toBe(1);
    clock += 3 * HOUR;
    const later = await buy(c);
    expect(later.status).toBe(201);
    expect((await later.json()).data.card.balance).toBe(2);
  });

  it('la espera de una sucursal no bloquea al mismo cliente en otra sucursal', async () => {
    const c = await newCustomer();
    expect((await buy(c, { actor: staffBoth, location: locA })).status).toBe(
      201,
    );
    const sameBranch = await buy(c, { actor: staffBoth, location: locA });
    expect(sameBranch.status).toBe(429);
    const otherBranch = await buy(c, { actor: staffBoth, location: locB });
    expect(otherBranch.status).toBe(201);
    expect(await purchaseCount(c.cardId)).toBe(2);
  });

  it('el override stampCooldownMinutes permite sellar a los 61 s y no antes', async () => {
    const c = await newCustomer();
    expect((await buy(c, { target: fastApp })).status).toBe(201);
    clock += 30_000;
    expect((await buy(c, { target: fastApp })).status).toBe(429);
    clock += 31_000;
    expect((await buy(c, { target: fastApp })).status).toBe(201);
    expect(await purchaseCount(c.cardId)).toBe(2);
  });

  it('doble toque con distintas Idempotency-Key deja un solo sello', async () => {
    const c = await newCustomer();
    const token = (await qr(c)).token;
    const [one, two] = await Promise.all([
      buy(c, { token, key: 'tap-1' }),
      buy(c, { token, key: 'tap-2' }),
    ]);
    expect([one.status, two.status].sort()).toEqual([201, 429]);
    expect(await purchaseCount(c.cardId)).toBe(1);
    expect(await ledgerCount(c.cardId)).toBe(1);
  });

  it('la misma Idempotency-Key devuelve el resultado previo sin otro sello', async () => {
    const c = await newCustomer();
    const ticket = `T-${randomUUID()}`;
    const first = await buy(c, { key: 'same-key', ticket });
    expect(first.status).toBe(201);
    const replay = await buy(c, { key: 'same-key', ticket });
    expect(replay.status).toBe(201);
    expect((await replay.json()).data.card.balance).toBe(1);
    expect(await purchaseCount(c.cardId)).toBe(1);
    expect(await ledgerCount(c.cardId)).toBe(1);
  });

  it('acepta omitir el ticket y rechaza un ticket repetido con 409', async () => {
    const c = await newCustomer();
    expect((await buy(c, { ticket: null })).status).toBe(201);
    clock += 5 * HOUR;
    expect((await buy(c, { ticket: 'REPE-1' })).status).toBe(201);
    clock += 5 * HOUR;
    const dup = await buy(c, { ticket: 'REPE-1' });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe('SALE_REFERENCE_DUPLICATE');
    expect(await purchaseCount(c.cardId)).toBe(2);
  });

  it('al completar la meta crea un premio pendiente, reabre en 0 y permite varios premios', async () => {
    const c = await newCustomer();
    let last: { card: any } | undefined;
    for (let i = 1; i <= 5; i++) {
      const res = await buy(c);
      expect(res.status).toBe(201);
      last = (await res.json()).data;
      clock += 5 * HOUR;
    }
    expect(last?.card.cycle.stamps).toBe(0);
    expect(last?.card.cycle.state).toBe('collecting');
    expect(
      last?.card.rewards.filter((r: any) => r.status === 'available'),
    ).toHaveLength(1);
    for (let i = 1; i <= 5; i++) {
      const res = await buy(c);
      expect(res.status).toBe(201);
      last = (await res.json()).data;
      clock += 5 * HOUR;
    }
    expect(last?.card.cycle.stamps).toBe(0);
    expect(
      last?.card.rewards.filter((r: any) => r.status === 'available'),
    ).toHaveLength(2);
  });

  it('canjea un premio una vez y el segundo intento dice que ya fue usado', async () => {
    const c = await newCustomer();
    let rewards: any[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await buy(c);
      expect(res.status).toBe(201);
      rewards = (await res.json()).data.card.rewards;
      clock += 5 * HOUR;
    }
    const voucher = rewards[0].voucher.token as string;
    const redeem = (key: string) =>
      call(app, 'POST', '/operator/redemptions', {
        actor: staffA,
        key,
        body: { restaurant_id: restaurant, token: voucher, confirm: true },
      });
    expect((await redeem('r-1')).status).toBe(201);
    const second = await redeem('r-2');
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.message).toBe('Este premio ya fue usado.');
    expect(
      (
        await database.pool.query(
          "SELECT count(*)::int AS n FROM rewards WHERE membership_id=(SELECT membership_id FROM loyalty_cards WHERE id=$1) AND status='redeemed'",
          [c.cardId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
