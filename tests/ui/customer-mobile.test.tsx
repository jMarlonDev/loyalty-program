import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerCardsPage } from '../../src/features/customer';

const state = vi.hoisted(() => ({
  user: { id: 'customer' } as { id: string } | null,
  error: null as string | null,
  calls: [] as (string | null)[],
}));
const card = {
  id: '22222222-2222-4222-8222-222222222222',
  restaurant_id: '11111111-1111-4111-8111-111111111111',
  program_name: 'Club Visitas',
  status: 'active',
  balance: 2,
  stamps_required: 8,
};
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: state.user,
    error: state.error,
    loading: false,
    reload: vi.fn(),
  }),
}));
vi.mock('../../src/lib/public-config', () => ({
  useAppOrigin: () => ({
    origin: 'https://loyalty.example',
    isPublic: true,
    error: null,
  }),
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <span data-testid="qr-value">{value}</span>
  ),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useAction: () => ({}),
  useCollection: (path: string | null) => ({
    items: path === '/me/cards' ? [card] : [],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useResource: (path: string | null) => {
    state.calls.push(path);
    return {
      data: path?.endsWith('/qr')
        ? { token: 'a'.repeat(43) }
        : path?.startsWith('/me/cards/')
          ? card
          : undefined,
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));
beforeEach(() => {
  state.user = { id: 'customer' };
  state.error = null;
  state.calls = [];
  window.history.replaceState({}, '', '/cards');
});
describe('tarjeta móvil persistente', () => {
  it('abrir tarjeta conserva enlace y QR usa origen público con fragmento', async () => {
    render(<CustomerCardsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Club Visitas' }));
    expect(await screen.findByTestId('qr-value')).toHaveTextContent(
      `https://loyalty.example/scan#token=${'a'.repeat(43)}&restaurant=${card.restaurant_id}`,
    );
    expect(window.location.search).toBe(`?card=${card.id}`);
  });
  it('recarga /cards?card conserva detalle sin volver a seleccionar', async () => {
    window.history.replaceState({}, '', `/cards?card=${card.id}`);
    render(<CustomerCardsPage />);
    expect(
      await screen.findByRole('heading', { name: 'Club Visitas', level: 1 }),
    ).toBeVisible();
    expect(state.calls).toContain(`/me/cards/${card.id}`);
  });
  it('error temporal muestra reintento sin pedir acceder de nuevo', () => {
    state.user = null;
    state.error = 'No se pudo consultar tu sesión.';
    render(<CustomerCardsPage />);
    expect(screen.getByText(state.error)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Entrar a mis tarjetas/ }),
    ).not.toBeInTheDocument();
  });
});
