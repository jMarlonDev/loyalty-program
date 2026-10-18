import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  it('AC-001 rejects employee and outsider creation without persistence', async () => {
    await expect(
      repo.create(employee, restaurant, input, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.create(other, restaurant, input, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int AS n FROM loyalty_programs',
        )
      ).rows[0].n,
    ).toBe(0);
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
});
