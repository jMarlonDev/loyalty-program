import { defineWebSocketHandler } from 'nitro';
import type { CustomerEventPrincipal } from '../../src/server/customer-events';
import { gateway } from './fixture-runtime';

export default defineWebSocketHandler({
  async upgrade(request) {
    return { context: { principal: await gateway.upgrade(request) } };
  },
  async open(peer) {
    await gateway.connect(
      peer,
      peer.context.principal as CustomerEventPrincipal,
    );
  },
  async message(peer, message) {
    await gateway.message(peer.id, message.text());
  },
  async close(peer) {
    await gateway.disconnect(peer.id);
  },
});
