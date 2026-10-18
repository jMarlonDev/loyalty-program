import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLoyaltyService } from '../../src/application/loyalty.js';
import { PgLoyaltyRepository } from '../../src/infrastructure/loyalty-repository.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('LOYALTY-001: transacciones y concurrencia reales', () => {
  let database: TestDatabase;
  let now = new Date('2026-10-18T12:00:00Z');
  let service: ReturnType<typeof createLoyaltyService>;
  beforeAll(async () => {
    database = await createTestDatabase();
    service = createLoyaltyService(
      new PgLoyaltyRepository(database.pool, { now: () => now }),
    );
  });
  afterAll(async () => {
    await database?.cleanup();
  });
  async function fixture(target = 2) {
    const ids = {
      owner: randomUUID(),
      customer: randomUUID(),
      restaurant: randomUUID(),
      employee: randomUUID(),
      location: randomUUID(),
      program: randomUUID(),
      membership: randomUUID(),
      card: randomUUID(),
    };
    for (const id of [ids.owner, ids.customer])
      await database.pool.query(
        "INSERT INTO users(id,full_name,email,status,created_at,updated_at) VALUES($1,'Fixture',$2,'active',now(),now())",
        [id, `${id}@example.test`],
      );
    await database.pool.query(
      "INSERT INTO restaurants(id,name,slug,status,created_at,updated_at) VALUES($1,'Fixture',$2,'active',now(),now())",
      [ids.restaurant, randomUUID()],
    );
    const role = (
      await database.pool.query<{ id: string }>(
        "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'owner',now()) ON CONFLICT(rol_type) DO UPDATE SET rol_type=excluded.rol_type RETURNING id",
        [randomUUID()],
      )
    ).rows[0];
    await database.pool.query(
      "INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',now(),now(),now())",
      [ids.employee, ids.owner, ids.restaurant, role?.id],
    );
    await database.pool.query(
      "INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at) VALUES($1,$2,'Fixture','Address','City','Region','active',now(),now())",
      [ids.location, ids.restaurant],
    );
    await database.pool.query(
      "INSERT INTO loyalty_programs(id,restaurant_id,name,public_code,stamps_required,reward_description,status,terms_locked,created_at,updated_at) VALUES($1,$2,'Fixture',$3,$4,'Coffee','active',true,now(),now())",
      [ids.program, ids.restaurant, randomUUID(), target],
    );
    await database.pool.query(
      "INSERT INTO memberships(id,user_id,program_id,status,joined_at) VALUES($1,$2,$3,'active',now())",
      [ids.membership, ids.customer, ids.program],
    );
    await database.pool.query(
      "INSERT INTO loyalty_cards(id,membership_id,qr_token_hash,qr_token_encrypted,status,created_at) VALUES($1,$2,$3,'cipher','active',now())",
      [ids.card, ids.membership, randomUUID()],
    );
    return {
      ...ids,
      buy: (reference: string = randomUUID(), key: string = randomUUID()) =>
        service.purchase(
          ids.owner,
          ids.restaurant,
          {
            card_id: ids.card,
            location_id: ids.location,
            sale_reference: reference,
          },
          key,
        ),
    };
  }
  async function count(
    table: 'purchases' | 'rewards' | 'loyalty_ledger_entries',
    membership: string,
  ) {
    return Number(
      (
        await database.pool.query(
          `SELECT count(*) AS count FROM ${table} WHERE membership_id=$1`,
          [membership],
        )
      ).rows[0]?.count,
    );
  }

  it('AC-001/002: compras concurrentes crean un sello, premio FIFO y reintentos no duplican', async () => {
    const f = await fixture();
    const key = randomUUID();
    const first = await f.buy('sale-1', key);
    expect(first.balance).toBe(1);
    expect(await f.buy('sale-1', key)).toEqual(first);
    await expect(f.buy('changed', key)).rejects.toMatchObject({ status: 409 });
    await expect(f.buy('sale-1')).rejects.toMatchObject({ status: 409 });
    await Promise.all([f.buy('sale-2'), f.buy('sale-3')]);
    expect(await count('purchases', f.membership)).toBe(3);
    expect(await count('rewards', f.membership)).toBe(1);
    expect(await service.preview(f.customer, f.card)).toMatchObject({
      balance: 1,
      benefits_version: 3,
    });
    expect(
      Number(
        (
          await database.pool.query(
            'SELECT count(*) AS count FROM reward_purchase_allocations WHERE membership_id=$1',
            [f.membership],
          )
        ).rows[0]?.count,
      ),
    ).toBe(2);
  });
  it('AC-002: rechaza cliente, sucursal ajena, programa pausado y autoconcesión sin efectos', async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(
      service.purchase(
        f.customer,
        f.restaurant,
        { card_id: f.card, location_id: f.location, sale_reference: 'a' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.purchase(
        f.owner,
        f.restaurant,
        { card_id: f.card, location_id: other.location, sale_reference: 'a' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await database.pool.query(
      "UPDATE loyalty_programs SET status='paused' WHERE id=$1",
      [f.program],
    );
    await expect(f.buy()).rejects.toMatchObject({ status: 409 });
    await database.pool.query(
      "UPDATE loyalty_programs SET status='active' WHERE id=$1",
      [f.program],
    );
    await database.pool.query('UPDATE memberships SET user_id=$1 WHERE id=$2', [
      f.owner,
      f.membership,
    ]);
    await expect(f.buy()).rejects.toMatchObject({ status: 403 });
    expect(await count('purchases', f.membership)).toBe(0);
    expect(await count('loyalty_ledger_entries', f.membership)).toBe(0);
  });
  it('AC-003: entrega única concurrente en programa finalizado sin segundo débito', async () => {
    const f = await fixture(1);
    await f.buy();
    const reward = (
      await database.pool.query(
        'SELECT id FROM rewards WHERE membership_id=$1',
        [f.membership],
      )
    ).rows[0]?.id as string;
    await database.pool.query(
      "UPDATE loyalty_programs SET status='ended' WHERE id=$1",
      [f.program],
    );
    const results = await Promise.allSettled([
      service.redeem(
        f.owner,
        f.restaurant,
        reward,
        { location_id: f.location },
        randomUUID(),
      ),
      service.redeem(
        f.owner,
        f.restaurant,
        reward,
        { location_id: f.location },
        randomUUID(),
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await count('loyalty_ledger_entries', f.membership)).toBe(2);
    expect(
      (
        await database.pool.query(
          'SELECT status,redeemed_location_id FROM rewards WHERE id=$1',
          [reward],
        )
      ).rows[0],
    ).toEqual({ status: 'redeemed', redeemed_location_id: f.location });
  });
  it('AC-004: reversión compensa premio disponible, reasigna compras restantes y conserva historial', async () => {
    const f = await fixture();
    const first = await f.buy();
    await f.buy();
    await f.buy();
    const result = await service.reverse(
      f.owner,
      f.restaurant,
      first.purchase_id as string,
      { reason: 'Devolución' },
      randomUUID(),
    );
    expect(result.balance).toBe(0);
    expect(await count('purchases', f.membership)).toBe(3);
    const rewards = await database.pool.query(
      'SELECT status FROM rewards WHERE membership_id=$1',
      [f.membership],
    );
    expect(rewards.rows.map((row) => row.status).sort()).toEqual([
      'available',
      'cancelled',
    ]);
    expect(
      Number(
        (
          await database.pool.query(
            'SELECT count(*) AS count FROM reward_purchase_allocations WHERE membership_id=$1 AND released_at IS NULL',
            [f.membership],
          )
        ).rows[0]?.count,
      ),
    ).toBe(2);
    await expect(f.buy('new', randomUUID())).resolves.toMatchObject({
      balance: 1,
    });
  });
  it('AC-004: premio entregado impide toda reversión y no deja compensaciones', async () => {
    const f = await fixture(1);
    const purchase = await f.buy();
    const reward = (
      await database.pool.query(
        'SELECT id FROM rewards WHERE membership_id=$1',
        [f.membership],
      )
    ).rows[0]?.id as string;
    await service.redeem(
      f.owner,
      f.restaurant,
      reward,
      { location_id: f.location },
      randomUUID(),
    );
    await expect(
      service.reverse(
        f.owner,
        f.restaurant,
        purchase.purchase_id as string,
        { reason: 'Devolución' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await count('loyalty_ledger_entries', f.membership)).toBe(2);
    expect(
      (
        await database.pool.query(
          'SELECT reversed_at FROM purchases WHERE id=$1',
          [purchase.purchase_id],
        )
      ).rows[0]?.reversed_at,
    ).toBeNull();
  });
  it('AC-005: consentimiento vigente cierra, cancela pendientes y conserva movimientos', async () => {
    const f = await fixture();
    await f.buy();
    await f.buy();
    await f.buy();
    const consent = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 3, accepted: true },
      randomUUID(),
    );
    const key = randomUUID();
    const result = await service.close(
      f.owner,
      f.restaurant,
      f.card,
      { consent_id: consent.id },
      key,
    );
    expect(result.status).toBe('closed');
    expect(
      await service.close(
        f.owner,
        f.restaurant,
        f.card,
        { consent_id: consent.id },
        key,
      ),
    ).toEqual(result);
    expect(
      (
        await database.pool.query(
          'SELECT status,qr_token_encrypted FROM loyalty_cards WHERE id=$1',
          [f.card],
        )
      ).rows[0],
    ).toEqual({ status: 'blocked', qr_token_encrypted: null });
    expect(
      (
        await database.pool.query(
          'SELECT status FROM memberships WHERE id=$1',
          [f.membership],
        )
      ).rows[0]?.status,
    ).toBe('closed');
    expect(
      Number(
        (
          await database.pool.query(
            'SELECT sum(stamp_delta) AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
            [f.membership],
          )
        ).rows[0]?.balance,
      ),
    ).toBe(0);
    expect(await count('purchases', f.membership)).toBe(3);
    expect(
      (
        await database.pool.query(
          'SELECT status FROM rewards WHERE membership_id=$1',
          [f.membership],
        )
      ).rows[0]?.status,
    ).toBe('cancelled');
    await expect(f.buy()).rejects.toMatchObject({ status: 409 });
  });
  it('AC-005: rechaza consentimiento ajeno, revocado, caducado y versión obsoleta sin cerrar', async () => {
    const f = await fixture();
    await expect(
      service.consent(
        f.owner,
        f.card,
        { benefits_version: 0, accepted: true },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    const revoked = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 0, accepted: true },
      randomUUID(),
    );
    await service.revoke(
      f.customer,
      f.card,
      revoked.id as string,
      randomUUID(),
    );
    await expect(
      service.close(
        f.owner,
        f.restaurant,
        f.card,
        { consent_id: revoked.id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const expired = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 0, accepted: true },
      randomUUID(),
    );
    now = new Date(now.getTime() + 16 * 60 * 1000);
    await expect(
      service.close(
        f.owner,
        f.restaurant,
        f.card,
        { consent_id: expired.id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const stale = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 0, accepted: true },
      randomUUID(),
    );
    await f.buy();
    await expect(
      service.close(
        f.owner,
        f.restaurant,
        f.card,
        { consent_id: stale.id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await database.pool.query(
          'SELECT status FROM memberships WHERE id=$1',
          [f.membership],
        )
      ).rows[0]?.status,
    ).toBe('active');
  });
  it('AC-006: compra/cierre concurrentes solo permiten una transición compatible', async () => {
    const f = await fixture();
    const consent = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 0, accepted: true },
      randomUUID(),
    );
    const results = await Promise.allSettled([
      f.buy(),
      service.close(
        f.owner,
        f.restaurant,
        f.card,
        { consent_id: consent.id },
        randomUUID(),
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const membership = (
      await database.pool.query('SELECT status FROM memberships WHERE id=$1', [
        f.membership,
      ])
    ).rows[0];
    expect(await count('purchases', f.membership)).toBe(
      membership?.status === 'closed' ? 0 : 1,
    );
  });
  it('AC-002: revocar personal impide reutilizar resultado idempotente', async () => {
    const f = await fixture();
    const key = randomUUID();
    await f.buy('repeat', key);
    await database.pool.query(
      "UPDATE restaurant_employees SET status='suspended' WHERE id=$1",
      [f.employee],
    );
    await expect(f.buy('repeat', key)).rejects.toMatchObject({ status: 403 });
    expect(await count('purchases', f.membership)).toBe(1);
  });

  it('AC-003/004/006: canje y reversión concurrentes conservan un resultado único', async () => {
    const f = await fixture(1);
    const purchase = await f.buy('permanent-reference');
    const reward = (
      await database.pool.query(
        'SELECT id FROM rewards WHERE membership_id=$1',
        [f.membership],
      )
    ).rows[0]?.id as string;
    const results = await Promise.allSettled([
      service.redeem(
        f.owner,
        f.restaurant,
        reward,
        { location_id: f.location },
        randomUUID(),
      ),
      service.reverse(
        f.owner,
        f.restaurant,
        purchase.purchase_id as string,
        { reason: 'Devolución concurrente' },
        randomUUID(),
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const state = (
      await database.pool.query('SELECT status FROM rewards WHERE id=$1', [
        reward,
      ])
    ).rows[0]?.status;
    const reversed = (
      await database.pool.query(
        'SELECT reversed_at FROM purchases WHERE id=$1',
        [purchase.purchase_id],
      )
    ).rows[0]?.reversed_at;
    expect(Boolean(reversed)).toBe(state === 'cancelled');
    expect(
      Number(
        (
          await database.pool.query(
            'SELECT sum(stamp_delta) AS balance FROM loyalty_ledger_entries WHERE membership_id=$1',
            [f.membership],
          )
        ).rows[0]?.balance,
      ),
    ).toBe(0);
    await expect(f.buy('permanent-reference')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('AC-002/003/004: Employee no revierte y personal no autocanjea', async () => {
    const f = await fixture(1);
    const purchase = await f.buy();
    const employeeRole = (
      await database.pool.query<{ id: string }>(
        "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'employee',now()) ON CONFLICT(rol_type) DO UPDATE SET rol_type=excluded.rol_type RETURNING id",
        [randomUUID()],
      )
    ).rows[0]?.id;
    await database.pool.query(
      'UPDATE restaurant_employees SET role_id=$1 WHERE id=$2',
      [employeeRole, f.employee],
    );
    await expect(
      service.reverse(
        f.owner,
        f.restaurant,
        purchase.purchase_id as string,
        { reason: 'No permitido' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await database.pool.query('UPDATE memberships SET user_id=$1 WHERE id=$2', [
      f.owner,
      f.membership,
    ]);
    const reward = (
      await database.pool.query(
        'SELECT id FROM rewards WHERE membership_id=$1',
        [f.membership],
      )
    ).rows[0]?.id as string;
    await expect(
      service.redeem(
        f.owner,
        f.restaurant,
        reward,
        { location_id: f.location },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await database.pool.query('SELECT status FROM rewards WHERE id=$1', [
          reward,
        ])
      ).rows[0]?.status,
    ).toBe('available');
    expect(await count('loyalty_ledger_entries', f.membership)).toBe(2);
  });

  it('AC-005/006: revocar y cerrar serializa el consumo sin resultados parciales', async () => {
    const f = await fixture();
    const consent = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 0, accepted: true },
      randomUUID(),
    );
    const results = await Promise.allSettled([
      service.revoke(f.customer, f.card, consent.id as string, randomUUID()),
      service.close(
        f.owner,
        f.restaurant,
        f.card,
        { consent_id: consent.id },
        randomUUID(),
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const record = (
      await database.pool.query(
        'SELECT revoked_at,consumed_at FROM closure_consents WHERE id=$1',
        [consent.id],
      )
    ).rows[0];
    expect(Boolean(record?.revoked_at)).not.toBe(Boolean(record?.consumed_at));
    const state = (
      await database.pool.query('SELECT status FROM memberships WHERE id=$1', [
        f.membership,
      ])
    ).rows[0]?.status;
    expect(state).toBe(record?.consumed_at ? 'closed' : 'active');
  });

  it('audita al ejecutor del cierre con saldo cero y conserva correlación de petición sin duplicar replay', async () => {
    const f = await fixture(1);
    const purchase = await service.purchase(
      f.owner,
      f.restaurant,
      {
        card_id: f.card,
        location_id: f.location,
        sale_reference: 'correlated',
      },
      randomUUID(),
      'http-purchase',
    );
    expect(purchase.balance).toBe(0);
    const entries = await database.pool.query(
      'SELECT request_id FROM loyalty_ledger_entries WHERE membership_id=$1',
      [f.membership],
    );
    expect(
      entries.rows.every((row) => row.request_id === 'http-purchase'),
    ).toBe(true);
    const consent = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 1, accepted: true },
      randomUUID(),
      'http-consent',
    );
    const key = randomUUID();
    await service.close(
      f.owner,
      f.restaurant,
      f.card,
      { consent_id: consent.id },
      key,
      'http-close',
    );
    await service.close(
      f.owner,
      f.restaurant,
      f.card,
      { consent_id: consent.id },
      key,
      'http-replay',
    );
    const audit = await database.pool.query(
      'SELECT actor_id,request_id,action FROM audit_events WHERE restaurant_id=$1 ORDER BY action',
      [f.restaurant],
    );
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        { actor_id: f.owner, request_id: 'http-close', action: 'card_closed' },
        {
          actor_id: f.customer,
          request_id: 'http-consent',
          action: 'closure_consent_created',
        },
      ]),
    );
    expect(
      audit.rows.filter((row) => row.action === 'card_closed'),
    ).toHaveLength(1);
  });
  async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
    const tables = {
      memberships: ['id', f.membership],
      loyalty_cards: ['id', f.card],
      purchases: ['membership_id', f.membership],
      rewards: ['membership_id', f.membership],
      loyalty_ledger_entries: ['membership_id', f.membership],
      reward_purchase_allocations: ['membership_id', f.membership],
      closure_consents: ['card_id', f.card],
      audit_events: ['restaurant_id', f.restaurant],
      idempotency_records: ['actor_id', f.owner],
    };
    const result: Record<string, unknown> = {};
    for (const [table, [column, id]] of Object.entries(tables)) {
      result[table] = (
        await database.pool.query(
          `SELECT * FROM ${table} WHERE ${column}=$1 ORDER BY id`,
          [id],
        )
      ).rows;
    }
    return result;
  }

  it('AC-002 accepts equivalent uppercase UUIDs and replays the same command', async () => {
    const f = await fixture();
    const key = randomUUID();
    const result = await service.purchase(
      f.owner,
      f.restaurant.toUpperCase(),
      {
        card_id: f.card.toUpperCase(),
        location_id: f.location.toUpperCase(),
        sale_reference: 'upper',
      },
      key,
    );
    expect(result).toMatchObject({ membership_id: f.membership, balance: 1 });
    expect(await f.buy('upper', key)).toEqual(result);
    expect(await count('purchases', f.membership)).toBe(1);
  });

  it('AC-002 concurrent identical retries commit exactly one purchase, ledger, reward and audit', async () => {
    const f = await fixture(1),
      key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => f.buy('same', key)),
    );
    for (const result of results) expect(result).toEqual(results[0]);
    expect(await count('purchases', f.membership)).toBe(1);
    expect(await count('rewards', f.membership)).toBe(1);
    expect(await count('loyalty_ledger_entries', f.membership)).toBe(2);
    expect(
      (
        await database.pool.query(
          'SELECT action FROM audit_events WHERE restaurant_id=$1',
          [f.restaurant],
        )
      ).rows,
    ).toEqual([{ action: 'purchase_created' }]);
    expect(await service.preview(f.customer, f.card)).toMatchObject({
      balance: 0,
      benefits_version: 1,
    });
  });

  it.each([
    ['restaurants', 'restaurant', 'suspended', 403],
    ['users', 'owner', 'suspended', 403],
    ['users', 'customer', 'suspended', 403],
    ['restaurant_employees', 'employee', 'suspended', 403],
    ['locations', 'location', 'inactive', 409],
    ['loyalty_programs', 'program', 'paused', 409],
    ['loyalty_programs', 'program', 'ended', 409],
    ['memberships', 'membership', 'suspended', 409],
    ['loyalty_cards', 'card', 'blocked', 409],
  ] as const)(
    'AC-002 rejects %s/%s=%s without any persisted effects',
    async (table, resource, status, expected) => {
      const f = await fixture(1);
      await database.pool.query(`UPDATE ${table} SET status=$1 WHERE id=$2`, [
        status,
        f[resource],
      ]);
      const before = await snapshot(f);
      await expect(f.buy()).rejects.toMatchObject({ status: expected });
      expect(await snapshot(f)).toEqual(before);
    },
  );

  it('AC-001/002 rolls back a failure after reward allocation and retries without partial effects', async () => {
    const f = await fixture(1),
      key = randomUUID();
    const before = await snapshot(f);
    await database.pool.query(`CREATE FUNCTION fail_purchase_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='purchase_created' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_purchase_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_purchase_audit()`);
    try {
      await expect(f.buy('retry-after-rollback', key)).rejects.toThrow(
        'injected audit failure',
      );
      expect(await snapshot(f)).toEqual(before);
    } finally {
      await database.pool.query(
        'DROP TRIGGER fail_purchase_audit ON audit_events; DROP FUNCTION fail_purchase_audit()',
      );
    }
    expect(await f.buy('retry-after-rollback', key)).toMatchObject({
      balance: 0,
    });
    expect(await count('purchases', f.membership)).toBe(1);
    expect(await count('rewards', f.membership)).toBe(1);
    expect(await count('loyalty_ledger_entries', f.membership)).toBe(2);
  });

  it('AC-005 rolls back consumed consent, cancelled rewards and QR invalidation if closing audit fails', async () => {
    const f = await fixture(2),
      key = randomUUID();
    await f.buy();
    await f.buy();
    await f.buy();
    const consent = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 3, accepted: true },
      randomUUID(),
    );
    const before = await snapshot(f);
    await database.pool.query(`CREATE FUNCTION fail_close_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='card_closed' THEN RAISE EXCEPTION 'injected close failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_close_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_close_audit()`);
    try {
      await expect(
        service.close(
          f.owner,
          f.restaurant,
          f.card,
          { consent_id: consent.id },
          key,
        ),
      ).rejects.toThrow('injected close failure');
      expect(await snapshot(f)).toEqual(before);
    } finally {
      await database.pool.query(
        'DROP TRIGGER fail_close_audit ON audit_events; DROP FUNCTION fail_close_audit()',
      );
    }
    expect(
      await service.close(
        f.owner,
        f.restaurant,
        f.card,
        { consent_id: consent.id },
        key,
      ),
    ).toMatchObject({ status: 'closed' });
  });

  it('AC-005 rejects consent exactly at expiration and preserves every benefit', async () => {
    const f = await fixture();
    const consent = await service.consent(
      f.customer,
      f.card,
      { benefits_version: 0, accepted: true },
      randomUUID(),
    );
    const before = await snapshot(f);
    const previous = now;
    now = new Date(String(consent.expires_at));
    try {
      await expect(
        service.close(
          f.owner,
          f.restaurant,
          f.card,
          { consent_id: consent.id },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await snapshot(f)).toEqual(before);
    } finally {
      now = previous;
    }
  });
});
