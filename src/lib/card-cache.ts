import type { CardView } from './types';

const key = 'loyalty:last-card';

/** Solo datos de visualización: sin tokens, teléfono ni comprobantes. */
function sanitize(card: CardView): CardView {
  return {
    ...card,
    rewards: card.rewards.map((reward) => ({
      ...reward,
      voucher: null,
      whatsapp_url: null,
    })),
  };
}

export function saveCardCache(card: CardView) {
  try {
    window.localStorage.setItem(key, JSON.stringify(sanitize(card)));
  } catch {}
}

export function readCardCache(cardId?: string): CardView | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const card = JSON.parse(raw) as CardView;
    if (!card?.id || (cardId && card.id !== cardId)) return null;
    return card;
  } catch {
    return null;
  }
}

export function clearCardCache() {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}
