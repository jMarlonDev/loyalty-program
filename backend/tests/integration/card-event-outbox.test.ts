import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type CardEventNotification,
  CardEventOutbox,
  createCardEventListener,
} from '../../src/infrastructure/card-event-outbox.js';
import type { TestDatabase } from '../helpers/database.js';
import { fixture, sourceDatabase } from '../helpers/transition-fixture.js';

describe('NEXT-004 PostgreSQL outbox across independent connections', () => {
  let database: TestDatabase;
  let cardId: string;
  let version = 0;
  const listeners: ReturnType<typeof createCardEventListener>[] = [];
  beforeAll(async () => {
    database = await sourceDatabase();
    cardId = (await fixture(database)).card!;
    await database.migrate();
  });
  afterEach(async () => {
    await Promise.all(listeners.splice(0).map((listener) => listener.stop()));
    await database.pool.query('DELETE FROM card_events_outbox');
  });
  afterAll(async () => {
    await database?.cleanup();
  });

  async function insert(client: Pick<PoolClient, 'query'> = database.pool) {
    const event: CardEventNotification = {
      event_id: randomUUID(),
      card_id: cardId,
      version: ++version,
      type: 'purchase.recorded',
    };
    await client.query(
      `INSERT INTO card_events_outbox(id,card_id,version,type,occurred_at,available_at)
      VALUES($1,$2,$3,$4,now(),now())`,
      [event.event_id, event.card_id, event.version, event.type],
    );
    return event;
  }

  async function listener() {
    const events: CardEventNotification[] = [];
    const pids: number[] = [];
    let disconnects = 0;
    const consumer = createCardEventListener({
      async connect() {
        const client = await database.pool.connect();
        pids.push(
          (
            await client.query<{ pid: number }>(
              'SELECT pg_backend_pid() AS pid',
            )
          ).rows[0]!.pid,
        );
        return client;
      },
      async onEvent(event) {
        events.push(event);
      },
      async onDisconnect() {
        disconnects++;
      },
      reconnectMilliseconds: 20,
    });
    listeners.push(consumer);
    await consumer.start();
    return { events, pids, consumer, disconnected: () => disconnects };
  }

  it('AC-003 publishes only committed rows and rollback remains silent', async () => {
    const consumer = await listener();
    const writer = await database.pool.connect();
    const dispatcher = new CardEventOutbox(database.pool);
    try {
      await writer.query('BEGIN');
      await insert(writer);
      expect(await dispatcher.dispatchBatch()).toBe(0);
      await writer.query('ROLLBACK');
      expect(await dispatcher.dispatchBatch()).toBe(0);
      expect(consumer.events).toEqual([]);
      await writer.query('BEGIN');
      const committed = await insert(writer);
      expect(await dispatcher.dispatchBatch()).toBe(0);
      await writer.query('COMMIT');
      expect(await dispatcher.dispatchBatch()).toBe(1);
      await expect.poll(() => consumer.events).toEqual([committed]);
    } finally {
      writer.release();
    }
  });

  it('AC-008 two dispatchers publish once and every listener receives the same minimal event', async () => {
    const [first, second] = await Promise.all([listener(), listener()]);
    const event = await insert();
    const results = await Promise.all([
      new CardEventOutbox(database.pool).dispatchBatch(),
      new CardEventOutbox(database.pool).dispatchBatch(),
    ]);
    expect(results.reduce((total, value) => total + value, 0)).toBe(1);
    await expect.poll(() => first.events).toEqual([event]);
    await expect.poll(() => second.events).toEqual([event]);
    expect(Object.keys(first.events[0]!).sort()).toEqual([
      'card_id',
      'event_id',
      'type',
      'version',
    ]);
    const stored = (
      await database.pool.query(
        'SELECT published_at,lease_token,lease_until,attempts FROM card_events_outbox WHERE id=$1',
        [event.event_id],
      )
    ).rows[0];
    expect(stored).toMatchObject({
      lease_token: null,
      lease_until: null,
      attempts: 1,
    });
    expect(stored.published_at).toBeInstanceOf(Date);
  });

  it('AC-008 a new dispatcher recovers an expired lease without changing event identity', async () => {
    const consumer = await listener();
    const event = await insert();
    const claims = await new CardEventOutbox(database.pool).claim();
    expect(claims).toHaveLength(1);
    const restarted = new CardEventOutbox(database.pool);
    expect(await restarted.dispatchBatch()).toBe(0);
    await database.pool.query(
      "UPDATE card_events_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",
      [event.event_id],
    );
    expect(await restarted.dispatchBatch()).toBe(1);
    expect(await new CardEventOutbox(database.pool).publishClaims(claims)).toBe(
      0,
    );
    await expect.poll(() => consumer.events).toEqual([event]);
    expect(
      (
        await database.pool.query(
          'SELECT attempts FROM card_events_outbox WHERE id=$1',
          [event.event_id],
        )
      ).rows[0].attempts,
    ).toBe(2);
  });

  it('AC-003 rollback after pg_notify leaves the event pending and emits nothing', async () => {
    const consumer = await listener();
    const event = await insert();
    const dispatcher = new CardEventOutbox(database.pool);
    const claims = await dispatcher.claim();
    await database.pool.query(`CREATE FUNCTION fixture_reject_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'fixture publication failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fixture_reject_publication BEFORE UPDATE ON card_events_outbox FOR EACH ROW EXECUTE FUNCTION fixture_reject_publication()`);
    try {
      await expect(dispatcher.publishClaims(claims)).rejects.toThrow();
      expect(
        (
          await database.pool.query(
            'SELECT published_at FROM card_events_outbox WHERE id=$1',
            [event.event_id],
          )
        ).rows[0].published_at,
      ).toBeNull();
      expect(consumer.events).toEqual([]);
    } finally {
      await database.pool.query(
        'DROP TRIGGER fixture_reject_publication ON card_events_outbox; DROP FUNCTION fixture_reject_publication()',
      );
    }
    expect(await dispatcher.publishClaims(claims)).toBe(1);
    await expect.poll(() => consumer.events).toEqual([event]);
  });

  it('AC-008 listener loss invalidates local clients, reconnects and cleans the dedicated connection', async () => {
    const consumer = await listener();
    expect(consumer.pids).toHaveLength(1);
    await database.pool.query('SELECT pg_terminate_backend($1)', [
      consumer.pids[0],
    ]);
    await expect.poll(() => consumer.disconnected()).toBe(1);
    await expect.poll(() => consumer.pids.length).toBe(2);
    const event = await insert();
    expect(await new CardEventOutbox(database.pool).dispatchBatch()).toBe(1);
    await expect.poll(() => consumer.events).toEqual([event]);
    await consumer.consumer.stop();
    await consumer.consumer.stop();
    await expect
      .poll(
        async () =>
          (
            await database.pool.query(
              'SELECT pid FROM pg_stat_activity WHERE pid=ANY($1::int[])',
              [consumer.pids],
            )
          ).rowCount,
      )
      .toBe(0);
  });
});
