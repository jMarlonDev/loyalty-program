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
    rewards: [],
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
  vi.useFakeTimers();
  focusManager.setFocused(true);
  state.stamps = 0;
  state.fail = false;
  state.request.mockReset().mockImplementation(async (path: string) => {
    if (state.fail)
      return Response.json(
        { error: { message: 'Conexión interrumpida' } },
        { status: 503 },
      );
    if (path.endsWith('/customer/session'))
      return Response.json({
        data: {
          authenticated: true,
          phone_masked: '••• 45 67',
          expires_at: new Date().toISOString(),
        },
      });
    if (path.endsWith('/qr'))
      return Response.json({ data: { token: 'a'.repeat(43) } });
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
describe('FLOW-002 tarjeta abierta en otro dispositivo', () => {
  it('consulta de nuevo y muestra el sello recibido sin recargar', async () => {
    show();
    await settle();
    expect(screen.getByRole('img', { name: '0 de 8 sellos' })).toBeVisible();
    state.stamps = 1;
    await settle(10_100);
    expect(screen.getByRole('img', { name: '1 de 8 sellos' })).toBeVisible();
  });
  it('pausa en segundo plano y actualiza al volver a foco', async () => {
    show();
    await settle();
    act(() => focusManager.setFocused(false));
    state.request.mockClear();
    state.stamps = 2;
    await settle(10_100);
    expect(state.request).not.toHaveBeenCalled();
    act(() => focusManager.setFocused(true));
    await settle();
    expect(screen.getByRole('img', { name: '2 de 8 sellos' })).toBeVisible();
  });
  it('permite actualizar manualmente y conserva sellos ante fallo de conexión', async () => {
    state.stamps = 3;
    show();
    await settle();
    state.fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar tarjeta' }));
    await settle();
    expect(screen.getByRole('img', { name: '3 de 8 sellos' })).toBeVisible();
    expect(screen.getAllByText('Conexión interrumpida').length).toBeGreaterThan(
      0,
    );
  });
});
