import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanPage } from '../../src/features/scan';
import {
  cardScanUrl,
  readPendingScan,
  savePendingScan,
} from '../../src/lib/card-qr';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  error: null as string | null,
  restaurant: null as { name: string; actor_role: string } | null,
  restaurantError: null as Error | null,
  calls: [] as (string | null)[],
}));
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: state.user,
    error: state.error,
    loading: false,
    reload: vi.fn(),
  }),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useResource: (path: string | null) => {
    state.calls.push(path);
    return {
      data: state.restaurant,
      error: state.restaurantError,
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));
vi.mock('../../src/features/operations', () => ({
  OperationsPanel: ({
    initialToken,
    restaurantId,
  }: {
    initialToken: string;
    restaurantId: string;
  }) => (
    <p data-testid="operation" data-token={initialToken}>
      {restaurantId}
    </p>
  ),
}));
const scan = {
  token: 'a'.repeat(43),
  restaurantId: '11111111-1111-4111-8111-111111111111',
};
beforeEach(() => {
  state.user = null;
  state.error = null;
  state.restaurant = null;
  state.restaurantError = null;
  state.calls = [];
  sessionStorage.clear();
  window.history.replaceState(
    {},
    '',
    cardScanUrl(window.location.origin, scan),
  );
});
describe('entrada privada QR', () => {
  it('limpia fragmento y retoma login sin enviar el token en next', async () => {
    render(<ScanPage />);
    const link = await screen.findByRole('link', {
      name: 'Iniciar sesión para agregar un sello',
    });
    expect(link).toHaveAttribute('href', '/auth?next=%2Fscan');
    expect(window.location.href).not.toContain(scan.token);
    expect(window.location.hash).toBe('');
    expect(readPendingScan()).toEqual(scan);
    expect(state.calls.every((path) => path === null)).toBe(true);
  });
  it('recupera QR pendiente tras login y exige consulta del restaurante', async () => {
    window.history.replaceState({}, '', '/scan');
    savePendingScan(scan);
    state.user = { id: 'staff' };
    state.restaurant = { name: 'Negocio', actor_role: 'employee' };
    render(<ScanPage />);
    expect(await screen.findByTestId('operation')).toHaveAttribute(
      'data-token',
      scan.token,
    );
    expect(state.calls).toContain(`/restaurants/${scan.restaurantId}`);
  });
  it('no muestra formulario con acceso rechazado ni con token inválido', async () => {
    state.user = { id: 'customer' };
    state.restaurantError = new Error('No autorizado');
    render(<ScanPage />);
    expect(await screen.findByText('No autorizado')).toBeVisible();
    expect(screen.queryByTestId('operation')).not.toBeInTheDocument();
  });
  it('no confunde fallo temporal de sesión con cierre de sesión', async () => {
    state.error = 'Error temporal. Reintenta.';
    render(<ScanPage />);
    expect(await screen.findByText(state.error)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Iniciar sesión/ }),
    ).not.toBeInTheDocument();
  });
});

it('conserva escaneo al comprobar sesión ausente y lo borra al cerrar sesión expresamente', async () => {
  render(<ScanPage />);
  await screen.findByRole('link', {
    name: 'Iniciar sesión para agregar un sello',
  });
  act(() => window.dispatchEvent(new Event('loyalty:session-ended')));
  expect(readPendingScan()).toEqual(scan);
  act(() => window.dispatchEvent(new Event('loyalty:logout')));
  expect(readPendingScan()).toBeNull();
});
it('abre un segundo QR en la misma pestaña de escaneo', async () => {
  state.user = { id: 'staff' };
  state.restaurant = { name: 'Negocio', actor_role: 'employee' };
  render(<ScanPage />);
  await screen.findByTestId('operation');
  const next = { ...scan, token: 'b'.repeat(43) };
  act(() => {
    window.history.pushState({}, '', cardScanUrl(window.location.origin, next));
    window.dispatchEvent(new Event('hashchange'));
  });
  expect(screen.getByTestId('operation')).toHaveAttribute(
    'data-token',
    next.token,
  );
  expect(window.location.hash).toBe('');
});
