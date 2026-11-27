import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNextEventAdapters } from '../../src/infrastructure/customer-events.js';
import { PgNextRepository } from '../../src/infrastructure/next-repository.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

describe('NEXT-004 PostgreSQL event authorization and leases', () => {
  let database: TestDatabase;
  let repository: PgNextRepository;
  let adapters: ReturnType<typeof createNextEventAdapters>;
  let token = '';
  let principal: Awaited<ReturnType<PgNextRepository['authenticate']>>;
  let cardId = '';

  beforeAll(async () => {
    database = await createTestDatabase();
    repository = new PgNextRepository(database.pool, {
      tokenEncryptionKey: 'ab'.repeat(32),
      publicOrigin: 'https://loyalty.test',
    });
    const restaurant = randomUUID();
    const program = randomUUID();
    await database.pool.query(
      "INSERT INTO restaurants(id,name,status,created_at,updated_at) VALUES($1,'Next','active',now(),now())",
      [restaurant],
    );
    await database.pool.query(
      `INSERT INTO loyalty_programs(id,restaurant_id,name,public_code,stamps_required,reward_description,status,created_at,updated_at)
       VALUES($1,$2,'Next',$3,3,'Premio','active',now(),now())`,
      [program, restaurant, `events-${randomUUID().slice(0, 12)}`],
    );
    const started = await repository.startSession({
      phone: '3005550000',
      country: 'CO',
    });
    token = started.token;
    principal = started.principal;
    const enrolled = await repository.enroll(
      started.principal,
      (
        await database.pool.query<{ public_code: string }>(
          'SELECT public_code FROM loyalty_programs WHERE id=$1',
          [program],
        )
      ).rows[0]!.public_code,
    );
    cardId = enrolled.id;
    adapters = createNextEventAdapters({
      pool: database.pool,
      repository,
      readToken: (request) => request.headers.get('x-token') ?? undefined,
    });
  });
  afterAll(async () => {
    if (database) await database.cleanup();
  });

  const request = () =>
    new Request('https://loyalty.test/api/v1/customer/events', {
      headers: { 'x-token': token },
    });

  it('authenticates only a live opaque session and authorizes only its cards', async () => {
    const authenticated = await adapters.authorization.authenticate(request());
    expect(authenticated).toEqual({
      sessionId: principal.session_id,
      customerId: principal.user_id,
    });
    expect(
      await adapters.authorization.authenticate(
        new Request('https://loyalty.test', {
          headers: { 'x-token': 'x'.repeat(43) },
        }),
      ),
    ).toBeNull();
    expect(await adapters.authorization.isActive(authenticated!)).toBe(true);
    expect(
      await adapters.authorization.cardAccess(authenticated!, cardId),
    ).toEqual({ version: 0 });
    expect(
      await adapters.authorization.cardAccess(authenticated!, randomUUID()),
    ).toBeNull();
  });

  it('bounds connections across repositories and expires abandoned leases', async () => {
    const leases: string[] = [];
    for (let index = 0; index < 5; index++) {
      const lease = await adapters.connections.acquire(principal.session_id, 5);
      expect(lease).toBeTruthy();
      leases.push(lease!);
    }
    expect(
      await adapters.connections.acquire(principal.session_id, 5),
    ).toBeNull();
    expect(await adapters.connections.refresh(leases[0]!)).toBe(true);
    await adapters.connections.release(leases[0]!);
    const replacement = await adapters.connections.acquire(
      principal.session_id,
      5,
    );
    expect(replacement).toBeTruthy();
    await database.pool.query(
      "UPDATE customer_event_leases SET expires_at=now()-interval '1 second' WHERE session_id=$1",
      [principal.session_id],
    );
    const recovered = await adapters.connections.acquire(
      principal.session_id,
      5,
    );
    expect(recovered).toBeTruthy();
    await adapters.connections.release(recovered!);
  });

  it('rejects revoked sessions without deleting card history', async () => {
    await repository.endSession(principal.session_id);
    expect(await adapters.authorization.authenticate(request())).toBeNull();
    expect(
      await adapters.authorization.isActive({
        sessionId: principal.session_id,
        customerId: principal.user_id,
      }),
    ).toBe(false);
    expect(
      (
        await database.pool.query(
          'SELECT status FROM loyalty_cards WHERE id=$1',
          [cardId],
        )
      ).rows[0].status,
    ).toBe('active');
  });
});
