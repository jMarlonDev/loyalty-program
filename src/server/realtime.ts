import type { Pool } from 'pg';
import {
  CardEventOutbox,
  createCardEventListener,
} from '../../backend/src/infrastructure/card-event-outbox';
import { createNextEventAdapters } from '../../backend/src/infrastructure/customer-events';
import { PgNextRepository } from '../../backend/src/infrastructure/next-repository';
import { createCustomerCookie } from './customer-cookie';
import {
  type CustomerCardEvent,
  createCustomerEventGateway,
} from './customer-events';

export function createRealtime({
  pool,
  origin,
  tokenEncryptionKey,
  development,
}: {
  pool: Pool;
  origin: string;
  tokenEncryptionKey: string;
  development: boolean;
}) {
  const cookie = createCustomerCookie({ origin, development });
  const repository = new PgNextRepository(pool, {
    tokenEncryptionKey,
    publicOrigin: origin,
  });
  const adapters = createNextEventAdapters({
    pool,
    repository,
    readToken: (request) => cookie.read(request),
  });
  const gateway = createCustomerEventGateway({
    origin,
    authorization: adapters.authorization,
    connections: adapters.connections,
  });
  const outbox = new CardEventOutbox(pool);
  const listener = createCardEventListener({
    connect: () => pool.connect(),
    onEvent: (event) => gateway.publish(event as CustomerCardEvent),
    onDisconnect: async () => undefined,
    reconnectMilliseconds: 1000,
  });
  let dispatching = false;
  const tick = async () => {
    try {
      await gateway.heartbeat();
    } catch {
      console.error('Customer event heartbeat failed');
    }
    if (dispatching) return;
    dispatching = true;
    try {
      await outbox.dispatchBatch(100);
    } catch {
      console.error('Card event outbox dispatch failed');
    } finally {
      dispatching = false;
    }
  };
  const timer = setInterval(() => void tick(), 750);
  timer.unref();
  void listener.start();
  return {
    gateway,
    async close() {
      clearInterval(timer);
      await listener.stop();
      await gateway.close();
    },
  };
}
