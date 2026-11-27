import { defineWebSocketHandler } from 'nitro';
import type { CustomerEventPrincipal } from '../../../../../src/server/customer-events';
import {
  customerEventsGateway,
  upgradeCustomerEvents,
} from '../../../../../src/server/runtime';

export default defineWebSocketHandler({
  async upgrade(request) {
    return { context: await upgradeCustomerEvents(request) };
  },
  open(peer) {
    void customerEventsGateway().connect(
      peer,
      peer.context as CustomerEventPrincipal,
    );
  },
  message(peer, message) {
    void customerEventsGateway().message(peer.id, message.text());
  },
  close(peer) {
    void customerEventsGateway().disconnect(peer.id);
  },
  error(peer) {
    void customerEventsGateway().disconnect(peer.id);
  },
});
