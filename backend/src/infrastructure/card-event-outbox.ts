import type { Pool, PoolClient } from 'pg';

export type CardEventNotification = {
  event_id: string;
  card_id: string;
  version: number;
  type:
    | 'purchase.recorded'
    | 'reward.available'
    | 'reward.redeemed'
    | 'card.changed';
};
export type CardEventClaim = { id: string; lease: string };
export const CARD_EVENT_CHANNEL = 'loyalty_card_events';

export class CardEventOutbox {
  constructor(
    private readonly pool: Pool,
    private readonly leaseMilliseconds = 30000,
  ) {}

  async claim(maximum = 100): Promise<CardEventClaim[]> {
    const { rows } = await this.pool.query<CardEventClaim>(
      `WITH candidates AS (
         SELECT id FROM card_events_outbox
         WHERE published_at IS NULL
           AND available_at <= now()
           AND (lease_until IS NULL OR lease_until < now())
         ORDER BY available_at, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE card_events_outbox AS outbox
       SET lease_token = gen_random_uuid(),
           lease_until = now() + ($2::int * interval '1 millisecond'),
           attempts = attempts + 1
       FROM candidates
       WHERE outbox.id = candidates.id
       RETURNING outbox.id, outbox.lease_token AS lease`,
      [maximum, this.leaseMilliseconds],
    );
    return rows;
  }

  async publishClaims(claims: CardEventClaim[]): Promise<number> {
    if (claims.length === 0) return 0;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<CardEventNotification>(
        `UPDATE card_events_outbox AS outbox
         SET published_at = now(), lease_token = NULL, lease_until = NULL
         FROM unnest($1::uuid[], $2::uuid[]) AS claimed(id, lease)
         WHERE outbox.id = claimed.id
           AND outbox.lease_token = claimed.lease
           AND outbox.published_at IS NULL
         RETURNING outbox.id AS event_id, outbox.card_id, outbox.version, outbox.type`,
        [claims.map((claim) => claim.id), claims.map((claim) => claim.lease)],
      );
      for (const event of rows) {
        await client.query('SELECT pg_notify($1, $2)', [
          CARD_EVENT_CHANNEL,
          JSON.stringify({
            event_id: event.event_id,
            card_id: event.card_id,
            version: event.version,
            type: event.type,
          }),
        ]);
      }
      await client.query('COMMIT');
      return rows.length;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async dispatchBatch(maximum = 100) {
    return this.publishClaims(await this.claim(maximum));
  }
}

export function createCardEventListener(options: {
  connect(): Promise<PoolClient>;
  onEvent(event: CardEventNotification): Promise<void>;
  onDisconnect(): Promise<void>;
  reconnectMilliseconds?: number;
}) {
  let client: PoolClient | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let starting: Promise<void> | null = null;
  let generation = 0;

  const parse = (payload: string | undefined): CardEventNotification | null => {
    if (!payload) return null;
    try {
      const event = JSON.parse(payload) as Record<string, unknown>;
      if (
        typeof event.event_id !== 'string' ||
        typeof event.card_id !== 'string' ||
        typeof event.version !== 'number' ||
        ![
          'purchase.recorded',
          'reward.available',
          'reward.redeemed',
          'card.changed',
        ].includes(String(event.type))
      )
        return null;
      return event as CardEventNotification;
    } catch {
      return null;
    }
  };

  const schedule = () => {
    if (stopped || reconnect) return;
    reconnect = setTimeout(() => {
      reconnect = null;
      void open();
    }, options.reconnectMilliseconds ?? 1000);
  };

  const lost = (current: PoolClient, error?: Error) => {
    if (client !== current) return;
    client = null;
    current.release(true);
    if (!stopped) void options.onDisconnect().catch(() => undefined);
    if (error) schedule();
    else schedule();
  };

  const open = async (): Promise<void> => {
    if (stopped || client) return;
    let current: PoolClient;
    try {
      current = await options.connect();
    } catch {
      schedule();
      return;
    }
    if (stopped) {
      current.release(true);
      return;
    }
    client = current;
    current.on('notification', (message) => {
      if (message.channel !== CARD_EVENT_CHANNEL) return;
      const event = parse(message.payload);
      if (event) void options.onEvent(event).catch(() => undefined);
    });
    current.on('error', (error) => lost(current, error));
    current.on('end', () => lost(current));
    try {
      await current.query(`LISTEN ${CARD_EVENT_CHANNEL}`);
    } catch (error) {
      lost(current, error instanceof Error ? error : undefined);
      return;
    }
  };

  const start = async () => {
    if (starting) return starting;
    stopped = false;
    generation++;
    const own = generation;
    starting = (async () => {
      try {
        await open();
      } finally {
        if (own === generation) starting = null;
      }
    })();
    return starting;
  };

  return {
    async start() {
      await start();
    },
    async stop() {
      stopped = true;
      generation++;
      starting = null;
      if (reconnect) {
        clearTimeout(reconnect);
        reconnect = null;
      }
      const current = client;
      client = null;
      if (current) {
        await current
          .query(`UNLISTEN ${CARD_EVENT_CHANNEL}`)
          .catch(() => undefined);
        current.removeAllListeners();
        current.release(true);
      }
    },
  };
}
