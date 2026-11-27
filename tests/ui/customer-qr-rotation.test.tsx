import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerCardsPage } from '../../src/features/customer';
import type { CardView } from '../../src/lib/types';

const state = vi.hoisted(() => ({
  stamps: 0,
  fail: false,
  rewards: 0,
  qrN: 0,
  request: vi.fn(),
}));
vi.mock('../../src/lib/public-config', () => ({
  useAppOrigin: () => ({ origin: 'https://loyalty.example', isPublic: true }),
}));
vi.mock('../../src/lib/realtime', () => ({ useCardEvents: vi.fn() }));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <span data-testid="qr-value">{value}</span>
  ),
}));
const cardId = '22222222-2222-4222-8222-222222222222';
const restaurantId = '11111111-1111-4111-8111-111111111111';
function card(): CardView {
  return {
    id: cardId,
    membership_id: '33333333-3333-4333-8333-333333333333',
    program_id: '44444444-4444-4444-8444-444444444444',
    restaurant_id: restaurantId,
    restaurant_name: 'Café',
    program_name: 'Club',
    status: 'active',
    version: state.stamps,
    balance: state.stamps,
    target: 8,
    cycle: {
      id: '55555555-5555-4555-8555-555555555555',
      number: 1,
      state: 'collecting',
      stamps: state.stamps,
      target: 8,
    },
    rewards: Array.from({ length: state.rewards }, (_, i) => ({
      id: `r${i}`,
      description: 'Un café',
      status: 'available' as const,
      accounting_mode: 'debit_on_redemption',
      earned_at: new Date().toISOString(),
      voucher: { token: `v${i}`.padEnd(43, 'v'), expires_at: null },
      whatsapp_url: null,
    })),
    program: {
      name: 'Club',
      description: null,
      stamps_required: 8,
      reward_description: 'Un café',
      logo_url: null,
      background_color: '#22346B',
      text_color: '#FFFFFF',
      card_message: null,
      public_code: 'club',
    },
  };
}
let client: QueryClient;
async function settle(ms = 50) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
  focusManager.setFocused(true);
  state.stamps = 0;
  state.rewards = 0;
  state.qrN = 0;
  state.fail = false;
  state.request.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith('/customer/session'))
      return Response.json({
        data: { authenticated: true, phone_masked: '••• 45 67' },
      });
    if (path.endsWith('/qr')) {
      state.qrN += 1;
      const now = Date.now();
      return Response.json({
        data: {
          card_id: cardId,
          restaurant_id: restaurantId,
          token: `c1qr${state.qrN}`.padEnd(50, 'x'),
          rotates_at: new Date(now + 60_000).toISOString(),
          expires_at: new Date(now + 180_000).toISOString(),
        },
      });
    }
    return Response.json({ data: card() });
  });
  vi.stubGlobal('fetch', state.request);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
  window.history.replaceState({}, '', `/cards?card=${cardId}`);
});
afterEach(() => {
  client.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function show() {
  render(
    <QueryClientProvider client={client}>
      <CustomerCardsPage />
    </QueryClientProvider>,
  );
}
const qrCalls = () =>
  state.request.mock.calls.filter(([p]) => String(p).endsWith('/qr')).length;
describe('QR rotativo y premios pendientes', () => {
  it('vuelve a pedir el QR al llegar a rotates_at sin ocultar el anterior', async () => {
    show();
    await settle();
    expect(qrCalls()).toBe(1);
    expect(screen.getByTestId('qr-countdown')).toHaveTextContent(/60 s/);
    await settle(59_000);
    expect(qrCalls()).toBe(1);
    expect(screen.getByTestId('qr-countdown')).toHaveTextContent(/1 s/);
    await settle(1_100);
    expect(qrCalls()).toBe(2);
    expect(screen.getByTestId('qr-value').textContent).toContain('c1qr2');
    expect(
      window.localStorage.getItem('loyalty:last-card') ?? '',
    ).not.toContain('c1qr');
  });
  it('un premio pendiente muestra el banner y su QR', async () => {
    state.rewards = 1;
    show();
    await settle();
    expect(
      screen.getByText(
        'Tienes un premio pendiente. Puedes reclamarlo en el local o guardarlo y seguir acumulando sellos.',
      ),
    ).toBeVisible();
    expect(
      screen
        .getAllByTestId('qr-value')
        .filter((el) => el.textContent?.includes('/reward')),
    ).toHaveLength(1);
  });
  it('varios premios indican la cantidad y un QR por premio', async () => {
    state.rewards = 2;
    show();
    await settle();
    expect(screen.getByText(/Tienes 2 premios pendientes/)).toBeVisible();
    expect(
      screen
        .getAllByTestId('qr-value')
        .filter((el) => el.textContent?.includes('/reward')),
    ).toHaveLength(2);
  });
});
