import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export type CardEvent = {
  event_id: string;
  card_id: string;
  version: number;
  type: 'purchase.recorded' | 'reward.available' | 'reward.redeemed';
};

export function useCardEvents(cardId: string | null, enabled = true) {
  const client = useQueryClient();
  useEffect(() => {
    if (!cardId || !enabled || typeof WebSocket === 'undefined') return;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry = 500;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      const url = new URL('/api/v1/customer/events', window.location.href);
      url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.addEventListener('open', () => {
        retry = 500;
        socket?.send(JSON.stringify({ type: 'subscribe', card_id: cardId }));
        void client.invalidateQueries({ queryKey: ['customer'] });
        clearInterval(ping);
        ping = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN)
            socket.send('{"type":"ping"}');
        }, 20_000);
      });
      socket.addEventListener('message', (message) => {
        try {
          const event = JSON.parse(String(message.data)) as Partial<CardEvent>;
          if (
            event.type === 'purchase.recorded' ||
            event.type === 'reward.available' ||
            event.type === 'reward.redeemed'
          )
            void client.invalidateQueries({ queryKey: ['customer'] });
        } catch {
          /* Ignore non-event messages. */
        }
      });
      socket.addEventListener('close', () => {
        clearInterval(ping);
        if (stopped) return;
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 10_000);
      });
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      socket?.close();
    };
  }, [cardId, enabled, client]);
}
