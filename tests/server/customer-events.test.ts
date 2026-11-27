import { describe, expect, it, vi } from 'vitest';
import {
  type CustomerCardEvent,
  type CustomerEventPrincipal,
  createCustomerEventGateway,
} from '../../src/server/customer-events';

const origin = 'https://loyalty.example';
const cardId = '11111111-1111-4111-8111-111111111111';
const foreignCardId = '22222222-2222-4222-8222-222222222222';
const principal: CustomerEventPrincipal = {
  sessionId: 'session-a',
  customerId: 'customer-a',
};
const event: CustomerCardEvent = {
  event_id: '33333333-3333-4333-8333-333333333333',
  card_id: cardId,
  version: 2,
  type: 'purchase.recorded',
};

function setup() {
  let active = true;
  let allowed = true;
  let now = 0;
  let leaseSequence = 0;
  const leases = new Set<string>();
  const authorization = {
    authenticate: vi.fn(async () => (active ? principal : null)),
    isActive: vi.fn(async () => active),
    cardAccess: vi.fn(async (_principal: CustomerEventPrincipal, id: string) =>
      allowed && id === cardId ? { version: 1 } : null,
    ),
  };
  const connections = {
    acquire: vi.fn(async (_sessionId: string, maximum: number) => {
      if (leases.size >= maximum) return null;
      const lease = `lease-${++leaseSequence}`;
      leases.add(lease);
      return lease;
    }),
    refresh: vi.fn(async (lease: string) => leases.has(lease)),
    release: vi.fn(async (lease: string) => {
      leases.delete(lease);
    }),
  };
  const gateway = createCustomerEventGateway({
    origin,
    authorization,
    connections,
    now: () => now,
  });
  const peer = { id: 'peer-a', send: vi.fn(), close: vi.fn() };
  const request = (requestOrigin?: string) =>
    new Request(`${origin}/api/v1/customer/events`, {
      headers: requestOrigin === undefined ? {} : { Origin: requestOrigin },
    });
  return {
    gateway,
    peer,
    authorization,
    connections,
    leases,
    request,
    revoke: () => {
      active = false;
    },
    denyCard: () => {
      allowed = false;
    },
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    subscribe: () =>
      gateway.message(
        peer.id,
        JSON.stringify({ type: 'subscribe', card_id: cardId }),
      ),
  };
}

describe('NEXT-004 customer event authorization', () => {
  it('AC-006 refreshes shared leases and closes a connection whose lease expires', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.gateway.heartbeat();
    expect(fixture.connections.refresh).toHaveBeenCalledWith('lease-1');
    fixture.leases.clear();
    await fixture.gateway.heartbeat();
    expect(fixture.peer.close).toHaveBeenCalledWith(
      1008,
      'Connection lease expired',
    );
  });

  it('AC-006 releases a lease acquired after the socket already disconnected', async () => {
    const fixture = setup();
    let releaseAcquire: ((lease: string) => void) | undefined;
    fixture.connections.acquire.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAcquire = resolve;
        }),
    );
    const connecting = fixture.gateway.connect(fixture.peer, principal);
    await vi.waitFor(() => expect(releaseAcquire).toBeDefined());
    await fixture.gateway.disconnect(fixture.peer.id);
    releaseAcquire?.('delayed-lease');
    await connecting;
    expect(fixture.connections.release).toHaveBeenCalledWith('delayed-lease');
  });

  it('AC-006 bounds subscriptions independently from incoming message rate', async () => {
    const fixture = setup();
    fixture.authorization.cardAccess.mockResolvedValue({ version: 1 });
    await fixture.gateway.connect(fixture.peer, principal);
    for (let index = 0; index < 11; index++) {
      const id = `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
      await fixture.gateway.message(
        fixture.peer.id,
        JSON.stringify({ type: 'subscribe', card_id: id }),
      );
    }
    expect(fixture.peer.send).toHaveBeenLastCalledWith(
      '{"type":"error","code":"RATE_LIMITED"}',
    );
    expect(fixture.authorization.cardAccess).toHaveBeenCalledTimes(10);
  });

  it('AC-002 prevents extra data from leaking through a producer event', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.subscribe();
    fixture.peer.send.mockClear();
    await expect(
      fixture.gateway.publish({
        ...event,
        phone: 'unwanted',
      } as CustomerCardEvent),
    ).rejects.toThrow('Invalid card event');
    expect(fixture.peer.send).not.toHaveBeenCalled();
  });

  it('AC-005 closes safely when persistent authorization is unavailable', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    fixture.authorization.isActive.mockRejectedValue(
      new Error('private infrastructure error'),
    );
    await fixture.subscribe();
    expect(fixture.peer.close).toHaveBeenCalledWith(
      1011,
      'Service unavailable',
    );
    expect(fixture.leases.size).toBe(0);
  });
  it.each([
    undefined,
    'https://attacker.example',
    `${origin}.attacker.example`,
  ])(
    'AC-001 rejects invalid origin %s before authenticating the handshake',
    async (requestOrigin) => {
      const fixture = setup();
      await expect(
        fixture.gateway.upgrade(fixture.request(requestOrigin)),
      ).rejects.toMatchObject({ status: 403 });
      expect(fixture.authorization.authenticate).not.toHaveBeenCalled();
    },
  );

  it('AC-001 authenticates an allowed origin and rejects expired or missing sessions', async () => {
    const fixture = setup();
    await expect(
      fixture.gateway.upgrade(fixture.request(origin)),
    ).resolves.toEqual(principal);
    fixture.revoke();
    await expect(
      fixture.gateway.upgrade(fixture.request(origin)),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('AC-002 authorizes subscription and checks access again before delivery', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.subscribe();
    expect(fixture.peer.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'subscribed', card_id: cardId, version: 1 }),
    );
    await fixture.gateway.publish(event);
    expect(fixture.peer.send).toHaveBeenLastCalledWith(JSON.stringify(event));
    fixture.peer.send.mockClear();
    fixture.denyCard();
    await fixture.gateway.publish({ ...event, version: 3 });
    expect(fixture.peer.send).not.toHaveBeenCalled();
  });

  it('AC-002 rejects foreign cards without revealing their identity and cannot publish commands', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.gateway.message(
      fixture.peer.id,
      JSON.stringify({ type: 'subscribe', card_id: foreignCardId }),
    );
    expect(fixture.peer.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'error', code: 'NOT_FOUND' }),
    );
    await fixture.gateway.message(
      fixture.peer.id,
      JSON.stringify({
        type: 'purchase.recorded',
        card_id: cardId,
        balance: 99,
      }),
    );
    expect(fixture.peer.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'error', code: 'INVALID_INPUT' }),
    );
    fixture.peer.send.mockClear();
    await fixture.gateway.publish(event);
    expect(fixture.peer.send).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'subscribe', card_id: cardId, balance: 99 },
    { type: 'subscribe', card_id: cardId, last_version: -1 },
    { type: 'subscribe', card_id: cardId, last_version: 1.5 },
    { type: 'subscribe', card_id: 'NOT-A-UUID' },
    { type: 'ping', session: 'secret' },
  ])(
    'AC-002 rejects noncanonical or extra payload fields %#',
    async (message) => {
      const fixture = setup();
      await fixture.gateway.connect(fixture.peer, principal);
      await fixture.gateway.message(fixture.peer.id, JSON.stringify(message));
      expect(fixture.peer.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'error', code: 'INVALID_INPUT' }),
      );
      expect(fixture.authorization.cardAccess).not.toHaveBeenCalled();
    },
  );

  it('AC-005 revocation closes idle connections during heartbeat and releases capacity', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.subscribe();
    fixture.revoke();
    await fixture.gateway.heartbeat();
    expect(fixture.peer.close).toHaveBeenCalledWith(
      1008,
      'Authorization expired',
    );
    expect(fixture.leases.size).toBe(0);
    fixture.peer.send.mockClear();
    await fixture.gateway.publish(event);
    expect(fixture.peer.send).not.toHaveBeenCalled();
  });

  it('AC-005 a blocked card is removed from an idle subscription', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.subscribe();
    fixture.denyCard();
    await fixture.gateway.heartbeat();
    fixture.peer.send.mockClear();
    await fixture.gateway.publish(event);
    expect(fixture.peer.send).not.toHaveBeenCalled();
  });

  it('AC-006 enforces shared session capacity and idempotent disconnect cleanup', async () => {
    const fixture = setup();
    const peers = Array.from({ length: 6 }, (_, index) => ({
      id: `peer-${index}`,
      send: vi.fn(),
      close: vi.fn(),
    }));
    for (const peer of peers) await fixture.gateway.connect(peer, principal);
    expect(peers[5].close).toHaveBeenCalledWith(1008, 'Connection limit');
    expect(fixture.leases.size).toBe(5);
    await fixture.gateway.disconnect(peers[0].id);
    await fixture.gateway.disconnect(peers[0].id);
    expect(fixture.leases.size).toBe(4);
    expect(fixture.connections.release).toHaveBeenCalledTimes(1);
    await fixture.gateway.close();
    expect(fixture.leases.size).toBe(0);
  });

  it('AC-006 rejects oversized frames and repeated invalid messages', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.gateway.message(fixture.peer.id, 'x'.repeat(2049));
    expect(fixture.peer.close).toHaveBeenCalledWith(1009, 'Message too large');
    await fixture.gateway.connect(fixture.peer, principal);
    for (let index = 0; index < 3; index++)
      await fixture.gateway.message(fixture.peer.id, '{}');
    expect(fixture.peer.close).toHaveBeenLastCalledWith(
      1008,
      'Invalid messages',
    );
    expect(fixture.leases.size).toBe(0);
  });

  it('AC-006 limits incoming messages and keeps ping free of business effects', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    for (let index = 0; index < 20; index++)
      await fixture.gateway.message(fixture.peer.id, '{"type":"ping"}');
    expect(fixture.peer.send).toHaveBeenLastCalledWith('{"type":"pong"}');
    await fixture.gateway.message(fixture.peer.id, '{"type":"ping"}');
    expect(fixture.peer.send).toHaveBeenLastCalledWith(
      '{"type":"error","code":"RATE_LIMITED"}',
    );
    expect(fixture.authorization.cardAccess).not.toHaveBeenCalled();
    fixture.advance(10001);
    await fixture.gateway.message(fixture.peer.id, '{"type":"ping"}');
    expect(fixture.peer.send).toHaveBeenLastCalledWith('{"type":"pong"}');
  });

  it('AC-006 closes unresponsive peers and releases leases on server shutdown', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    fixture.advance(60001);
    await fixture.gateway.heartbeat();
    expect(fixture.peer.close).toHaveBeenCalledWith(1008, 'Heartbeat expired');
    expect(fixture.leases.size).toBe(0);
  });

  it('AC-002 unsubscribe prevents subsequent delivery', async () => {
    const fixture = setup();
    await fixture.gateway.connect(fixture.peer, principal);
    await fixture.subscribe();
    await fixture.gateway.message(
      fixture.peer.id,
      JSON.stringify({ type: 'unsubscribe', card_id: cardId }),
    );
    fixture.peer.send.mockClear();
    await fixture.gateway.publish(event);
    expect(fixture.peer.send).not.toHaveBeenCalled();
  });
});
