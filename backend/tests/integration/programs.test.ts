import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { PgProgramRepository } from '../../src/infrastructure/programs-repository.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('PROGRAMS-001 PostgreSQL', () => {
  let database: TestDatabase, repo: PgProgramRepository;
  const owner = randomUUID(),
    employee = randomUUID(),
    customer = randomUUID(),
    other = randomUUID(),
    restaurant = randomUUID(),
    foreignRestaurant = randomUUID();
  const input = {
    name: 'Café',
    stamps_required: 3,
    reward_description: 'Gratis',
    background_color: '#FFFFFF',
    text_color: '#000000',
  };
  beforeAll(async () => {
    database = await createTestDatabase();
    repo = new PgProgramRepository(database.pool, {
      tokenEncryptionKey: 'ab'.repeat(32),
    });
    for (const id of [owner, employee, customer, other])
      await database.pool.query(
        "INSERT INTO users(id,full_name,email,status,created_at,updated_at) VALUES($1,'Test',$2,'active',now(),now())",
        [id, `${id}@test.example`],
      );
    for (const id of [restaurant, foreignRestaurant])
      await database.pool.query(
        "INSERT INTO restaurants(id,name,slug,status,created_at,updated_at) VALUES($1,'Café',$2,'active',now(),now())",
        [id, id],
      );
    for (const [actor, role] of [
      [owner, 'owner'],
      [employee, 'employee'],
    ]) {
      const roleId = randomUUID();
      await database.pool.query(
        'INSERT INTO roles(id,rol_type,created_at) VALUES($1,$2,now())',
        [roleId, role],
      );
      await database.pool.query(
        "INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at) VALUES($1,$2,$3,$4,'active',now(),now(),now())",
        [randomUUID(), actor, restaurant, roleId],
      );
    }
  });
  afterAll(async () => {
    if (database) await database.cleanup();
  });
  const create = () => repo.create(owner, restaurant, input, randomUUID());
  it('STACK-001 AC-008 exposes tenant-safe administrative results and paginated customers', async () => {
    const program = await create();
    const enrolled = await repo.enroll(
      customer,
      String(program.public_code),
      randomUUID(),
    );
    const membershipId = enrolled.membership.id;
    const locationId = randomUUID();
    const staffId = (
      await database.pool.query(
        'SELECT id FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2',
        [owner, restaurant],
      )
    ).rows[0].id;
    await database.pool.query(
      "INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at) VALUES($1,$2,'Branch','Address','City','Region','active',now(),now())",
      [locationId, restaurant],
    );
    for (const reversed of [false, true])
      await database.pool.query(
        'INSERT INTO purchases(id,membership_id,employee_id,location_id,stamps_earned,created_at,reversed_at) VALUES($1,$2,$3,$4,1,now(),$5)',
        [
          randomUUID(),
          membershipId,
          staffId,
          locationId,
          reversed ? new Date() : null,
        ],
      );
    for (const delta of [3, -1])
      await database.pool.query(
        'INSERT INTO loyalty_ledger_entries(id,membership_id,stamp_delta,created_at) VALUES($1,$2,$3,now())',
        [randomUUID(), membershipId, delta],
      );
    for (const status of ['available', 'redeemed', 'cancelled'])
      await database.pool.query(
        "INSERT INTO rewards(id,membership_id,description,stamps_spent,status,earned_at) VALUES($1,$2,'Reward',3,$3,now())",
        [randomUUID(), membershipId, status],
      );
    const app = createApp({
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      identityProvider: {
        verifyAccessToken: async (token) => ({
          id: token,
          email: `${token}@test.example`,
          emailVerified: true,
        }),
      },
    });
    const path = `/api/v1/restaurants/${restaurant}/programs/${program.id}`;
    const headers = { Authorization: `Bearer ${owner}` };
    const results = await app.request(`${path}/results`, { headers });
    expect(results.status).toBe(200);
    expect(await results.json()).toEqual({
      data: {
        customers: 1,
        active_cards: 1,
        purchases: 1,
        available_rewards: 1,
        redeemed_rewards: 1,
      },
    });
    const customers = await app.request(`${path}/customers?limit=1`, {
      headers,
    });
    expect(customers.status).toBe(200);
    expect(await customers.json()).toMatchObject({
      data: [
        {
          id: membershipId,
          user_id: customer,
          full_name: 'Test',
          email: `${customer}@test.example`,
          card_id: enrolled.card.id,
          balance: 2,
          purchases: 1,
          available_rewards: 1,
          redeemed_rewards: 1,
        },
      ],
      next_cursor: null,
    });
    const secondCustomer = randomUUID();
    await database.pool.query(
      "INSERT INTO users(id,full_name,email,status,created_at,updated_at) VALUES($1,'Second customer',$2,'active',now(),now())",
      [secondCustomer, `${secondCustomer}@test.example`],
    );
    await repo.enroll(
      secondCustomer,
      String(program.public_code),
      randomUUID(),
    );
    const page = await (
      await app.request(`${path}/customers?limit=1`, { headers })
    ).json();
    expect(page.data).toHaveLength(1);
    expect(page.next_cursor).toBeTruthy();
    const next = await (
      await app.request(
        `${path}/customers?limit=1&cursor=${page.next_cursor}`,
        { headers },
      )
    ).json();
    expect(next.data[0].id).not.toBe(page.data[0].id);
    expect(next.next_cursor).toBeNull();
    for (const suffix of ['results', 'customers']) {
      expect((await app.request(`${path}/${suffix}`)).status).toBe(401);
      expect(
        (
          await app.request(`${path}/${suffix}`, {
            headers: { Authorization: `Bearer ${employee}` },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await app.request(`${path}/${suffix}`, {
            headers: { Authorization: `Bearer ${customer}` },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await app.request(
            `/api/v1/restaurants/${foreignRestaurant}/programs/${program.id}/${suffix}`,
            { headers },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await app.request(
            `/api/v1/restaurants/${restaurant}/programs/${randomUUID()}/${suffix}`,
            { headers },
          )
        ).status,
      ).toBe(404);
    }
    expect(
      (await app.request(`${path}/customers?limit=101`, { headers })).status,
    ).toBe(400);
    expect(
      (await app.request(`${path}/customers?cursor=bad`, { headers })).status,
    ).toBe(400);
  });
  it('STACK-001 AC-008 resolves customer and only available rewards for authorized counter staff', async () => {
    const program = await create();
    const enrolled = await repo.enroll(
      customer,
      String(program.public_code),
      randomUUID(),
    );
    const available = randomUUID();
    for (const [id, status] of [
      [available, 'available'],
      [randomUUID(), 'redeemed'],
      [randomUUID(), 'cancelled'],
    ])
      await database.pool.query(
        "INSERT INTO rewards(id,membership_id,description,stamps_spent,status,earned_at) VALUES($1,$2,'Reward',3,$3,now())",
        [id, enrolled.membership.id, status],
      );
    const qr = await repo.getQr(customer, String(enrolled.card.id));
    expect(
      await repo.resolveCard(employee, restaurant, qr.token),
    ).toMatchObject({
      customer_name: 'Test',
      customer_email: `${customer}@test.example`,
      available_rewards: [
        { id: available, description: 'Reward', status: 'available' },
      ],
    });
    await expect(
      repo.resolveCard(employee, foreignRestaurant, qr.token),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('AC-001 rejects employee and outsider creation without persistence', async () => {
    const before = (
      await database.pool.query('SELECT id FROM loyalty_programs ORDER BY id')
    ).rows;
    await expect(
      repo.create(employee, restaurant, input, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.create(other, restaurant, input, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await database.pool.query('SELECT id FROM loyalty_programs ORDER BY id'))
        .rows,
    ).toEqual(before);
  });
  it('AC-001 creates and retries without duplicating; exposes public minimum', async () => {
    const key = randomUUID(),
      program = await repo.create(owner, restaurant, input, key);
    expect(await repo.create(owner, restaurant, input, key)).toMatchObject({
      id: program.id,
    });
    await expect(
      repo.create(owner, restaurant, { ...input, name: 'Changed' }, key),
    ).rejects.toMatchObject({ status: 409 });
    const publicProgram = await repo.publicByCode(String(program.public_code));
    expect(publicProgram).toMatchObject({
      id: program.id,
      name: 'Café',
      restaurant_name: 'Café',
    });
    expect(publicProgram).not.toHaveProperty('restaurant_id');
    expect(publicProgram).not.toHaveProperty('terms_locked');
  });
  it('AC-002/003 concurrent enrollment creates one card, locks terms permanently, allows design', async () => {
    const program = await create();
    const enrolled = await Promise.all(
      Array.from({ length: 6 }, () =>
        repo.enroll(customer, String(program.public_code), randomUUID()),
      ),
    );
    expect(enrolled.filter((value) => value.created)).toHaveLength(1);
    expect(new Set(enrolled.map((value) => value.card.id)).size).toBe(1);
    await expect(
      repo.update(
        owner,
        restaurant,
        String(program.id),
        { stamps_required: 4 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await repo.update(
        owner,
        restaurant,
        String(program.id),
        { name: 'New name' },
        randomUUID(),
      ),
    ).toMatchObject({ name: 'New name', terms_locked: true });
    await database.pool.query(
      "UPDATE memberships SET status='closed',closed_at=now() WHERE id=$1",
      [enrolled[0]?.membership.id],
    );
    const fresh = await repo.enroll(
      customer,
      String(program.public_code),
      randomUUID(),
    );
    expect(fresh.created).toBe(true);
    expect(fresh.card.id).not.toBe(enrolled[0]?.card.id);
    await expect(
      repo.update(
        owner,
        restaurant,
        String(program.id),
        { reward_description: 'Different' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('AC-003/006 rejects enrollment for paused/ended and forbids reactivation', async () => {
    const program = await create();
    await repo.update(
      owner,
      restaurant,
      String(program.id),
      { status: 'paused' },
      randomUUID(),
    );
    await expect(
      repo.enroll(customer, String(program.public_code), randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    await repo.update(
      owner,
      restaurant,
      String(program.id),
      { status: 'ended' },
      randomUUID(),
    );
    await expect(
      repo.update(
        owner,
        restaurant,
        String(program.id),
        { status: 'active' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      repo.publicByCode(String(program.public_code)),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('STACK-001 AC-007 exposes current program design and target on owned cards', async () => {
    const program = await repo.create(
      owner,
      restaurant,
      {
        ...input,
        logo_url: 'https://example.test/logo.png',
        card_message: 'Gracias por volver',
      },
      randomUUID(),
    );
    const enrollment = await repo.enroll(
      customer,
      String(program.public_code),
      randomUUID(),
    );
    const expected = {
      stamps_required: input.stamps_required,
      reward_description: input.reward_description,
      background_color: input.background_color,
      text_color: input.text_color,
      logo_url: 'https://example.test/logo.png',
      card_message: 'Gracias por volver',
      public_code: program.public_code,
    };
    expect(
      await repo.cardDetails(customer, String(enrollment.card.id)),
    ).toMatchObject(expected);
    const list = await repo.listCards(customer, { cursor: null, limit: 100 });
    expect(
      list.data.find((card) => card.id === enrollment.card.id),
    ).toMatchObject(expected);
    await repo.update(
      owner,
      restaurant,
      String(program.id),
      { background_color: '#225533' },
      randomUUID(),
    );
    expect(
      await repo.cardDetails(customer, String(enrollment.card.id)),
    ).toMatchObject({ ...expected, background_color: '#225533' });
    await expect(
      repo.cardDetails(other, String(enrollment.card.id)),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('AC-004 isolates own details/history and paginates cards', async () => {
    const program = await create(),
      enrollment = await repo.enroll(
        customer,
        String(program.public_code),
        randomUUID(),
      );
    expect(
      await repo.cardDetails(customer, String(enrollment.card.id)),
    ).toMatchObject({ id: enrollment.card.id, balance: 0 });
    for (const read of [
      () => repo.cardDetails(other, String(enrollment.card.id)),
      () =>
        repo.cardHistory(other, String(enrollment.card.id), 'movements', {
          cursor: null,
          limit: 20,
        }),
      () => repo.getQr(other, String(enrollment.card.id)),
    ])
      await expect(read()).rejects.toMatchObject({ status: 404 });
    const another = await create();
    await repo.enroll(customer, String(another.public_code), randomUUID());
    const list = await repo.listCards(customer, { cursor: null, limit: 1 });
    expect(list.data).toHaveLength(1);
    expect(list.next_cursor).toBeTruthy();
    const next = await repo.listCards(customer, {
      cursor: list.next_cursor,
      limit: 1,
    });
    expect(next.data[0]?.id).not.toBe(list.data[0]?.id);
  });
  it('AC-005 recovers own QR, rotates and rejects old/foreign tokens without cleartext storage', async () => {
    const program = await create(),
      enrollment = await repo.enroll(
        customer,
        String(program.public_code),
        randomUUID(),
      ),
      card = String(enrollment.card.id);
    const first = await repo.getQr(customer, card);
    expect((await repo.resolveCard(employee, restaurant, first.token)).id).toBe(
      card,
    );
    const key = randomUUID(),
      second = await repo.rotateQr(customer, card, key);
    expect(second.token).not.toBe(first.token);
    expect(await repo.rotateQr(customer, card, key)).toEqual(second);
    await expect(
      repo.resolveCard(employee, restaurant, first.token),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      repo.resolveCard(employee, foreignRestaurant, second.token),
    ).rejects.toMatchObject({ status: 404 });
    const persisted = (
      await database.pool.query(
        'SELECT qr_token_hash,qr_token_encrypted FROM loyalty_cards WHERE id=$1',
        [card],
      )
    ).rows[0];
    expect(JSON.stringify(persisted)).not.toContain(second.token);
    const replay = (
      await database.pool.query(
        'SELECT result FROM idempotency_records WHERE actor_id=$1 AND key=$2',
        [customer, key],
      )
    ).rows[0];
    expect(JSON.stringify(replay)).not.toContain(second.token);
  });
  it('AC-003 rechecks profile and program before idempotent replay', async () => {
    const program = await create(),
      key = randomUUID();
    await repo.enroll(customer, String(program.public_code), key);
    await repo.update(
      owner,
      restaurant,
      String(program.id),
      { status: 'paused' },
      randomUUID(),
    );
    await expect(
      repo.enroll(customer, String(program.public_code), key),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('AC-002 serializes first enrollment against concurrent terms changes', async () => {
    const program = await create();
    const [edit, enrollment] = await Promise.allSettled([
      repo.update(
        owner,
        restaurant,
        String(program.id),
        { stamps_required: 9 },
        randomUUID(),
      ),
      repo.enroll(customer, String(program.public_code), randomUUID()),
    ]);
    expect(enrollment.status).toBe('fulfilled');
    const final = await repo.get(owner, restaurant, String(program.id));
    expect(final.terms_locked).toBe(true);
    expect(final.stamps_required).toBe(edit.status === 'fulfilled' ? 9 : 3);
    if (edit.status === 'rejected')
      expect(edit.reason).toMatchObject({ status: 409 });
  });
  it('AC-003 blocks suspended profile, restaurant and membership without new effects', async () => {
    const program = await create();
    await database.pool.query(
      "UPDATE users SET status='suspended' WHERE id=$1",
      [customer],
    );
    try {
      await expect(
        repo.enroll(customer, String(program.public_code), randomUUID()),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await database.pool.query(
        "UPDATE users SET status='active' WHERE id=$1",
        [customer],
      );
    }
    await database.pool.query(
      "UPDATE restaurants SET status='suspended' WHERE id=$1",
      [restaurant],
    );
    try {
      await expect(
        repo.enroll(customer, String(program.public_code), randomUUID()),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await database.pool.query(
        "UPDATE restaurants SET status='active' WHERE id=$1",
        [restaurant],
      );
    }
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int AS n FROM memberships WHERE program_id=$1',
          [program.id],
        )
      ).rows[0].n,
    ).toBe(0);
    const enrollment = await repo.enroll(
      customer,
      String(program.public_code),
      randomUUID(),
    );
    await database.pool.query(
      "UPDATE memberships SET status='suspended' WHERE id=$1",
      [enrollment.membership.id],
    );
    await expect(
      repo.enroll(customer, String(program.public_code), randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      repo.getQr(customer, String(enrollment.card.id)),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int AS n FROM memberships WHERE program_id=$1',
          [program.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('AC-001 rechecks staff permission before replaying a creation result', async () => {
    const key = randomUUID();
    await repo.create(owner, restaurant, input, key);
    await database.pool.query(
      "UPDATE restaurant_employees SET status='suspended' WHERE user_id=$1",
      [owner],
    );
    try {
      await expect(
        repo.create(owner, restaurant, input, key),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await database.pool.query(
        "UPDATE restaurant_employees SET status='active' WHERE user_id=$1",
        [owner],
      );
    }
  });
  it('AC-004 returns persisted own ledger and rewards with balance derived from entries', async () => {
    const program = await create(),
      enrollment = await repo.enroll(
        customer,
        String(program.public_code),
        randomUUID(),
      );
    await database.pool.query(
      'INSERT INTO loyalty_ledger_entries(id,membership_id,stamp_delta,created_at) VALUES($1,$2,2,now())',
      [randomUUID(), enrollment.membership.id],
    );
    const reward = randomUUID();
    await database.pool.query(
      "INSERT INTO rewards(id,membership_id,description,stamps_spent,status,earned_at) VALUES($1,$2,'Reward',3,'available',now())",
      [reward, enrollment.membership.id],
    );
    expect(
      (await repo.cardDetails(customer, String(enrollment.card.id))).balance,
    ).toBe(2);
    expect(
      (
        await repo.cardHistory(
          customer,
          String(enrollment.card.id),
          'movements',
          { cursor: null, limit: 20 },
        )
      ).data[0],
    ).toMatchObject({
      membership_id: enrollment.membership.id,
      stamp_delta: 2,
    });
    expect(
      (
        await repo.cardHistory(
          customer,
          String(enrollment.card.id),
          'rewards',
          { cursor: null, limit: 20 },
        )
      ).data[0],
    ).toMatchObject({ id: reward });
  });
  it('AC-001/003/005 atomically audits commands once with HTTP correlation and without tokens', async () => {
    const requestId = 'program-audit-test';
    const key = randomUUID();
    const program = await repo.create(owner, restaurant, input, key, requestId);
    await repo.create(owner, restaurant, input, key, requestId);
    await repo.update(
      owner,
      restaurant,
      String(program.id),
      { name: 'Audited' },
      randomUUID(),
      requestId,
    );
    const enrollment = await repo.enroll(
      customer,
      String(program.public_code),
      randomUUID(),
      requestId,
    );
    const rotated = await repo.rotateQr(
      customer,
      String(enrollment.card.id),
      randomUUID(),
      requestId,
    );
    const events = (
      await database.pool.query(
        'SELECT actor_id,restaurant_id,action,resource_id,request_id,details FROM audit_events WHERE request_id=$1 ORDER BY action',
        [requestId],
      )
    ).rows;
    expect(events).toHaveLength(4);
    expect(events.map((row) => row.action)).toEqual([
      'card.rotate',
      'program.create',
      'program.enroll',
      'program.update',
    ]);
    expect(
      events.every(
        (row) =>
          row.restaurant_id === restaurant && row.request_id === requestId,
      ),
    ).toBe(true);
    expect(events.find((row) => row.action === 'program.create')).toMatchObject(
      { actor_id: owner, resource_id: program.id },
    );
    expect(events.find((row) => row.action === 'program.enroll')).toMatchObject(
      { actor_id: customer, resource_id: enrollment.membership.id },
    );
    expect(JSON.stringify(events)).not.toContain(rotated.token);
    expect(events.every((row) => JSON.stringify(row.details) === '{}')).toBe(
      true,
    );
  });
  it('AC-004 pages every own card exactly once without relying on other test fixtures', async () => {
    const expected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const program = await create();
      const enrollment = await repo.enroll(
        other,
        String(program.public_code),
        randomUUID(),
      );
      expected.push(String(enrollment.card.id));
      await repo.enroll(customer, String(program.public_code), randomUUID());
    }
    const actual: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 3; page++) {
      const result = await repo.listCards(other, { cursor, limit: 2 });
      expect(result.data).toHaveLength(page < 2 ? 2 : 1);
      expect(result.data.every((row) => row.user_id === other)).toBe(true);
      actual.push(...result.data.map((row) => String(row.id)));
      cursor = result.next_cursor;
      if (page < 2) expect(cursor).toBe(result.data.at(-1)?.id);
    }
    expect(cursor).toBeNull();
    expect(actual).toEqual(expected.sort());
    expect(
      await repo.listCards(other, { cursor: actual.at(-1) ?? null, limit: 2 }),
    ).toEqual({ data: [], next_cursor: null });
  });

  it('AC-002/003 rolls back membership, card and locked terms if enrollment audit fails', async () => {
    const program = await create(),
      key = randomUUID();
    const before = await repo.get(owner, restaurant, String(program.id));
    const beforeCards = (
      await database.pool.query('SELECT id FROM loyalty_cards ORDER BY id')
    ).rows;
    const requestId = randomUUID();
    await database.pool.query(`CREATE FUNCTION fail_enroll_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='program.enroll' THEN RAISE EXCEPTION 'injected enrollment failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_enroll_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_enroll_audit()`);
    try {
      await expect(
        repo.enroll(customer, String(program.public_code), key, requestId),
      ).rejects.toThrow('injected enrollment failure');
      expect(await repo.get(owner, restaurant, String(program.id))).toEqual(
        before,
      );
      expect(
        (
          await database.pool.query(
            'SELECT id FROM memberships WHERE program_id=$1',
            [program.id],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await database.pool.query(
            'SELECT id FROM idempotency_records WHERE actor_id=$1 AND key=$2',
            [customer, key],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await database.pool.query(
            'SELECT id FROM audit_events WHERE request_id=$1',
            [requestId],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (await database.pool.query('SELECT id FROM loyalty_cards ORDER BY id'))
          .rows,
      ).toEqual(beforeCards);
    } finally {
      await database.pool.query(
        'DROP TRIGGER fail_enroll_audit ON audit_events; DROP FUNCTION fail_enroll_audit()',
      );
    }
    const enrolled = await repo.enroll(
      customer,
      String(program.public_code),
      key,
    );
    expect(enrolled.created).toBe(true);
    expect(await repo.get(owner, restaurant, String(program.id))).toMatchObject(
      { terms_locked: true },
    );
    expect(
      (
        await database.pool.query(
          'SELECT id FROM loyalty_cards WHERE membership_id=$1',
          [enrolled.membership.id],
        )
      ).rows,
    ).toEqual([{ id: enrolled.card.id }]);
  });
});
