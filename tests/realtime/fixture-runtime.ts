// Isolated infrastructure fixture. Never mount these handlers in the application.
import { randomUUID } from 'node:crypto';
import { createCustomerEventGateway } from '../../src/server/customer-events';

const leases = new Set<string>();
const revoked = new Set<string>();
const cardId = '11111111-1111-4111-8111-111111111111';

export const gateway = createCustomerEventGateway({
  origin: process.env.REALTIME_FIXTURE_ORIGIN ?? '',
  authorization: {
    async authenticate(request) {
      const token = request.headers
        .get('cookie')
        ?.split('; ')
        .find((part) => part.startsWith('fixture_session='))
        ?.split('=')[1];
      if (
        !['fixture-a', 'fixture-b', 'fixture-other'].includes(token ?? '') ||
        revoked.has(token ?? '')
      )
        return null;
      return {
        sessionId: token ?? '',
        customerId: token === 'fixture-other' ? 'other' : 'customer',
      };
    },
    async isActive(principal) {
      return !revoked.has(principal.sessionId);
    },
    async cardAccess(principal, id) {
      return principal.customerId === 'customer' && id === cardId
        ? { version: 1 }
        : null;
    },
  },
  connections: {
    async acquire(_sessionId, maximum) {
      if (leases.size >= maximum) return null;
      const lease = randomUUID();
      leases.add(lease);
      return lease;
    },
    async refresh(lease) {
      return leases.has(lease);
    },
    async release(lease) {
      leases.delete(lease);
    },
  },
});

export async function control(command: { type: string; session?: string }) {
  if (command.type === 'publish') {
    await gateway.publish({
      event_id: randomUUID(),
      card_id: cardId,
      version: 2,
      type: 'purchase.recorded',
    });
  } else if (command.type === 'revoke' && command.session) {
    revoked.add(command.session);
    await gateway.heartbeat();
  } else if (command.type === 'close') {
    await gateway.close();
  }
  return { connections: leases.size };
}
