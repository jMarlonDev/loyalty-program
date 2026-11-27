import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinStaffPage } from '../../src/features/join-staff';

const state = vi.hoisted(() => ({
  api: vi.fn(),
  user: null as { id: string; email: string } | null,
  signup: vi.fn(),
  assign: vi.fn(),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  api: state.api,
}));
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: state.user,
    loading: false,
    error: null,
    signup: state.signup,
    login: vi.fn(),
  }),
}));
beforeEach(() => {
  state.api.mockReset();
  state.user = null;
  state.signup.mockReset().mockResolvedValue({ confirmationRequired: false });
  state.assign.mockReset();
  sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...window.location,
      hash: '#token=abc',
      assign: state.assign,
    },
  });
});

describe('/join-staff', () => {
  it('muestra la invitación y guarda el token fuera de la URL', async () => {
    state.api.mockResolvedValue({
      data: {
        restaurant_name: 'Casa Sol',
        location_name: 'Centro',
        expires_at: '2026-12-01T00:00:00Z',
      },
    });
    render(<JoinStaffPage />);
    expect(
      await screen.findByText('Te invitan a Casa Sol · Sucursal Centro'),
    ).toBeVisible();
    expect(state.api).toHaveBeenCalledWith('/staff-invitations/preview', {
      method: 'POST',
      body: { token: 'abc' },
    });
    expect(sessionStorage.getItem('loyalty:staff-invitation')).toBe('abc');
    expect(
      screen.getByRole('button', { name: 'Ya tengo cuenta' }),
    ).toBeVisible();
  });

  it('informa de una invitación vencida', async () => {
    state.api.mockRejectedValue(new Error('Invitación vencida.'));
    render(<JoinStaffPage />);
    expect(await screen.findByText('Invitación vencida.')).toBeVisible();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
  });

  it('registra la cuenta y acepta la invitación', async () => {
    state.api.mockResolvedValueOnce({
      data: {
        restaurant_name: 'Casa Sol',
        location_name: 'Centro',
        expires_at: 'x',
      },
    });
    const view = render(<JoinStaffPage />);
    await screen.findByText(/Te invitan a/);
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'ana@x.test' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secreta-123' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Crear cuenta y unirme/ }),
    );
    await waitFor(() =>
      expect(state.signup).toHaveBeenCalledWith(
        'ana@x.test',
        'secreta-123',
        'Ana',
        '/app',
      ),
    );
    state.user = { id: 'u', email: 'ana@x.test' };
    state.api.mockResolvedValueOnce({
      data: { restaurant_name: 'Casa Sol', location_name: 'Centro' },
    });
    view.rerender(<JoinStaffPage />);
    await waitFor(() =>
      expect(state.api).toHaveBeenCalledWith('/staff-invitations/accept', {
        method: 'POST',
        body: { token: 'abc' },
      }),
    );
    await waitFor(() => expect(state.assign).toHaveBeenCalledWith('/app'));
  });
});
