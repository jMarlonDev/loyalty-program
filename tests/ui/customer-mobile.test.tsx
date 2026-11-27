import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerCardsPage } from '../../src/features/customer';
import type { CardView } from '../../src/lib/types';

const state = vi.hoisted(() => ({
  session: null as { phone_masked: string } | null,
  origin: 'https://loyalty.example' as string | null,
  error: null as Error | null,
  card: null as CardView | null,
}));
const restaurantId = '11111111-1111-4111-8111-111111111111';
const cardId = '22222222-2222-4222-8222-222222222222';
function card(overrides: Partial<CardView> = {}): CardView {
  return {
    id: cardId,
    membership_id: '33333333-3333-4333-8333-333333333333',
    program_id: '44444444-4444-4444-8444-444444444444',
    restaurant_id: restaurantId,
    restaurant_name: 'Café Central',
    program_name: 'Club Visitas',
    status: 'active',
    version: 1,
    balance: 2,
    target: 8,
    cycle: {
      id: '55555555-5555-4555-8555-555555555555',
      number: 1,
      state: 'collecting',
      stamps: 2,
      target: 8,
    },
    rewards: [],
    program: {
      name: 'Club Visitas',
      description: null,
      stamps_required: 8,
      reward_description: 'Un café',
      logo_url: null,
      background_color: '#22346B',
      text_color: '#FFFFFF',
      card_message: null,
      public_code: 'club',
    },
    ...overrides,
  };
}
vi.mock('../../src/lib/public-config', () => ({
  useAppOrigin: () => ({ origin: state.origin, isPublic: true, error: null }),
}));
vi.mock('../../src/lib/realtime', () => ({ useCardEvents: vi.fn() }));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <span data-testid="qr-value">{value}</span>
  ),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useCustomerAction: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
  useCustomerSession: () => ({
    data: state.session,
    isLoading: false,
    error: state.error,
    refetch: vi.fn(),
  }),
  useCustomerResource: (path: string | null) => ({
    data:
      path === '/customer/cards'
        ? [state.card ?? card()]
        : path?.endsWith('/qr')
          ? { token: 'a'.repeat(43) }
          : path?.startsWith('/customer/cards/')
            ? (state.card ?? card())
            : undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
beforeEach(() => {
  state.session = { phone_masked: '••• 45 67' };
  state.origin = 'https://loyalty.example';
  state.error = null;
  state.card = null;
  window.history.replaceState({}, '', '/cards');
});
describe('NEXT tarjeta móvil sin cuenta', () => {
  it('sin dispositivo recordado no inventa tarjetas ni pide contraseña', () => {
    state.session = null;
    render(<CustomerCardsPage />);
    expect(screen.getByText('Tus tarjetas viven en tu teléfono')).toBeVisible();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
  });

  it('lista las tarjetas del teléfono y abre el detalle con su QR', async () => {
    render(<CustomerCardsPage />);
    expect(screen.getByRole('heading', { name: 'Mis tarjetas' })).toBeVisible();
    expect(screen.getByText(/Café Central/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Club Visitas/ }));
    expect(await screen.findByTestId('qr-value')).toHaveTextContent(
      `https://loyalty.example/scan#token=${'a'.repeat(43)}&restaurant=${restaurantId}`,
    );
    expect(window.location.search).toBe(`?card=${cardId}`);
  });

  it('recargar /cards?card conserva el detalle y no pide identidad', async () => {
    window.history.replaceState({}, '', `/cards?card=${cardId}`);
    render(<CustomerCardsPage />);
    expect(
      await screen.findByRole('heading', { name: 'Club Visitas', level: 1 }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Teléfono')).not.toBeInTheDocument();
  });

  it('muestra un QR de canje distinto cuando el premio está disponible', async () => {
    const rewardCard = card({
      cycle: {
        ...card().cycle!,
        state: 'reward_available',
        stamps: 8,
      },
      rewards: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          description: 'Un café',
          status: 'available',
          accounting_mode: 'debit_on_redemption',
          earned_at: '2026-10-19T00:00:00.000Z',
          voucher: { token: 'b'.repeat(43), expires_at: null },
          whatsapp_url: 'https://wa.me/573001234567',
        },
      ],
    });
    state.card = rewardCard;
    state.session = { phone_masked: '••• 45 67' };
    window.history.replaceState({}, '', `/cards?card=${cardId}`);
    render(<CustomerCardsPage />);
    expect(screen.getByText('Tu premio')).toBeVisible();
    expect(
      await screen.findByText('QR de tu premio', { exact: false }),
    ).toBeVisible();
    expect(
      screen
        .getAllByTestId('qr-value')
        .map((node) => node.textContent)
        .find((value) => value?.startsWith('https://loyalty.example/reward')),
    ).toBe(
      `https://loyalty.example/reward#token=${'b'.repeat(43)}&restaurant=${restaurantId}`,
    );
  });

  it('un fallo temporal conserva el mensaje y ofrece reintentar', () => {
    state.session = null;
    state.error = new Error('Conexión interrumpida');
    render(<CustomerCardsPage />);
    expect(screen.getByText('Conexión interrumpida')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Iniciar sesión/ }),
    ).not.toBeInTheDocument();
  });
});
