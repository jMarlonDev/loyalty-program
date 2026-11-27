export type CustomerEventPrincipal = { sessionId: string; customerId: string };

export interface CustomerEventAuthorization {
  authenticate(request: Request): Promise<CustomerEventPrincipal | null>;
  isActive(principal: CustomerEventPrincipal): Promise<boolean>;
  cardAccess(
    principal: CustomerEventPrincipal,
    cardId: string,
  ): Promise<{ version: number } | null>;
}

/** The production adapter must count all processes and expire abandoned leases. */
export interface CustomerEventConnectionLimits {
  acquire(sessionId: string, maximum: number): Promise<string | null>;
  refresh(lease: string): Promise<boolean>;
  release(lease: string): Promise<void>;
}

export interface CustomerEventPeer {
  id: string;
  send(message: string): void;
  close(code: number, reason: string): void;
}

export type CustomerCardEvent = {
  event_id: string;
  card_id: string;
  version: number;
  type:
    | 'purchase.recorded'
    | 'reward.available'
    | 'reward.redeemed'
    | 'card.changed';
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const version = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const ownKeys = (value: object, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

type Command =
  | { type: 'ping' }
  | { type: 'subscribe'; card_id: string; last_version?: number }
  | { type: 'unsubscribe'; card_id: string };

function parseCommand(text: string): Command | null {
  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null;
    input = parsed;
  } catch {
    return null;
  }
  if (input.type === 'ping' && ownKeys(input, ['type']))
    return { type: 'ping' };
  if (typeof input.card_id !== 'string' || !uuid.test(input.card_id))
    return null;
  if (input.type === 'unsubscribe' && ownKeys(input, ['type', 'card_id'])) {
    return { type: 'unsubscribe', card_id: input.card_id };
  }
  if (
    input.type === 'subscribe' &&
    ownKeys(input, ['type', 'card_id', 'last_version']) &&
    (!('last_version' in input) || version(input.last_version))
  ) {
    return { type: 'subscribe', card_id: input.card_id };
  }
  return null;
}

type Connection = {
  peer: CustomerEventPeer;
  principal: CustomerEventPrincipal;
  cards: Set<string>;
  lease: string | null;
  closed: boolean;
  queue: Promise<void>;
  queued: number;
  arrivals: number[];
  violations: number;
  lastActivity: number;
};

/** Read-only delivery boundary. Its publisher must supply committed outbox events. */
export function createCustomerEventGateway(options: {
  origin: string;
  authorization: CustomerEventAuthorization;
  connections: CustomerEventConnectionLimits;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const peers = new Map<string, Connection>();
  let stopped = false;

  async function remove(state: Connection, code?: number, reason?: string) {
    if (state.closed) return;
    state.closed = true;
    state.cards.clear();
    peers.delete(state.peer.id);
    const lease = state.lease;
    state.lease = null;
    try {
      if (code !== undefined)
        state.peer.close(code, reason ?? 'Connection closed');
    } finally {
      if (lease) await options.connections.release(lease);
    }
  }

  function enqueue(state: Connection, operation: () => Promise<void>) {
    if (state.closed) return Promise.resolve();
    if (++state.queued > 100) return remove(state, 1011, 'Service unavailable');
    state.queue = state.queue
      .then(async () => {
        if (!state.closed) await operation();
      })
      .catch(() => remove(state, 1011, 'Service unavailable'))
      .finally(() => {
        state.queued--;
      });
    return state.queue;
  }

  async function active(state: Connection) {
    if (!(await options.authorization.isActive(state.principal))) {
      await remove(state, 1008, 'Authorization expired');
      return false;
    }
    return !state.closed;
  }

  function send(state: Connection, data: object) {
    if (!state.closed) state.peer.send(JSON.stringify(data));
  }

  async function invalid(
    state: Connection,
    code: 'INVALID_INPUT' | 'RATE_LIMITED',
  ) {
    send(state, { type: 'error', code });
    if (++state.violations >= 3) await remove(state, 1008, 'Invalid messages');
  }

  return {
    async upgrade(request: Request): Promise<CustomerEventPrincipal> {
      if (request.headers.get('origin') !== options.origin)
        throw new Response(null, { status: 403 });
      if (stopped) throw new Response(null, { status: 503 });
      const principal = await options.authorization.authenticate(request);
      if (!principal) throw new Response(null, { status: 401 });
      return principal;
    },

    async connect(peer: CustomerEventPeer, principal: CustomerEventPrincipal) {
      if (stopped || peers.has(peer.id)) {
        peer.close(1011, 'Service unavailable');
        return;
      }
      const state: Connection = {
        peer,
        principal,
        cards: new Set(),
        lease: null,
        closed: false,
        queue: Promise.resolve(),
        queued: 0,
        arrivals: [],
        violations: 0,
        lastActivity: now(),
      };
      peers.set(peer.id, state);
      await enqueue(state, async () => {
        if (!(await active(state))) return;
        const lease = await options.connections.acquire(principal.sessionId, 5);
        if (state.closed) {
          if (lease) await options.connections.release(lease);
          return;
        }
        if (!lease) {
          await remove(state, 1008, 'Connection limit');
          return;
        }
        state.lease = lease;
      });
    },

    async message(peerId: string, text: string) {
      const state = peers.get(peerId);
      if (!state || state.closed) return;
      if (new TextEncoder().encode(text).byteLength > 2048) {
        await remove(state, 1009, 'Message too large');
        return;
      }
      const instant = now();
      state.arrivals = state.arrivals.filter(
        (arrival) => instant - arrival < 10000,
      );
      if (state.arrivals.length >= 20) {
        await enqueue(state, () => invalid(state, 'RATE_LIMITED'));
        return;
      }
      state.arrivals.push(instant);
      await enqueue(state, async () => {
        if (!(await active(state))) return;
        const command = parseCommand(text);
        if (!command) {
          await invalid(state, 'INVALID_INPUT');
          return;
        }
        state.lastActivity = now();
        if (command.type === 'ping') {
          send(state, { type: 'pong' });
          return;
        }
        if (command.type === 'unsubscribe') {
          state.cards.delete(command.card_id);
          return;
        }
        if (!state.cards.has(command.card_id) && state.cards.size >= 10) {
          await invalid(state, 'RATE_LIMITED');
          return;
        }
        const access = await options.authorization.cardAccess(
          state.principal,
          command.card_id,
        );
        if (state.closed) return;
        if (!access) {
          send(state, { type: 'error', code: 'NOT_FOUND' });
          return;
        }
        state.cards.add(command.card_id);
        send(state, {
          type: 'subscribed',
          card_id: command.card_id,
          version: access.version,
        });
      });
    },

    async publish(event: CustomerCardEvent) {
      if (
        !ownKeys(event, ['event_id', 'card_id', 'version', 'type']) ||
        !uuid.test(event.event_id) ||
        !uuid.test(event.card_id) ||
        !version(event.version) ||
        ![
          'purchase.recorded',
          'reward.available',
          'reward.redeemed',
          'card.changed',
        ].includes(event.type)
      ) {
        throw new Error('Invalid card event');
      }
      await Promise.all(
        [...peers.values()].map((state) =>
          enqueue(state, async () => {
            if (!state.cards.has(event.card_id) || !(await active(state)))
              return;
            const access = await options.authorization.cardAccess(
              state.principal,
              event.card_id,
            );
            if (!access) {
              state.cards.delete(event.card_id);
              return;
            }
            send(state, event);
          }),
        ),
      );
    },

    async disconnect(peerId: string) {
      const state = peers.get(peerId);
      if (state) await remove(state);
    },

    async heartbeat() {
      await Promise.all(
        [...peers.values()].map((state) =>
          enqueue(state, async () => {
            if (now() - state.lastActivity > 60000) {
              await remove(state, 1008, 'Heartbeat expired');
              return;
            }
            if (!(await active(state))) return;
            if (
              !state.lease ||
              !(await options.connections.refresh(state.lease))
            ) {
              await remove(state, 1008, 'Connection lease expired');
              return;
            }
            for (const cardId of state.cards) {
              if (
                !(await options.authorization.cardAccess(
                  state.principal,
                  cardId,
                ))
              )
                state.cards.delete(cardId);
            }
          }),
        ),
      );
    },

    async close() {
      stopped = true;
      await Promise.all(
        [...peers.values()].map((state) =>
          remove(state, 1001, 'Server stopping'),
        ),
      );
    },
  };
}
