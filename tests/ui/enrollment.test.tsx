import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleProgram } from '../../src/components/loyalty-card';
import { EnrollmentPage, InvitationPage } from '../../src/features/enrollment';
import { ApiError } from '../../src/lib/api';

const state = vi.hoisted(() => ({
  user: { id: 'owner', email: 'owner@example.test' } as {
    id: string;
    email: string;
  } | null,
  session: null as { phone_masked: string } | null,
  card: null as { id: string } | null,
  customer: vi.fn(),
  mutate: vi.fn(),
  reset: vi.fn(),
  error: null as Error | null,
  isSuccess: false,
  logout: vi.fn(),
}));
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: state.user,
    loading: false,
    error: null,
    logout: state.logout,
  }),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  useResource: () => ({ data: exampleProgram, isLoading: false }),
  useCustomerSession: () => ({
    data: state.session,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCustomerAction: () => ({
    mutateAsync: state.customer,
    isPending: false,
    error: null,
  }),
  useAction: () => ({
    mutate: state.mutate,
    reset: state.reset,
    error: state.error,
    isPending: false,
    isSuccess: state.isSuccess,
    data: undefined,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'owner', email: 'owner@example.test' };
  state.session = null;
  state.card = { id: 'card-id' };
  state.error = null;
  state.isSuccess = false;
  state.logout.mockResolvedValue(undefined);
  state.customer.mockImplementation(async (input: { path: string }) =>
    input.path === '/customer/session'
      ? {
          authenticated: true,
          phone_masked: '••• 45 67',
          card: state.card,
        }
      : state.card,
  );
});
describe('NEXT alta por teléfono sin cuenta', () => {
  it('pide solo país y teléfono y crea la tarjeta en una sola operación', async () => {
    render(<EnrollmentPage code="club" />);
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Teléfono'), {
      target: { value: '300 123 4567' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Obtener mi tarjeta' }));
    await waitFor(() =>
      expect(state.customer).toHaveBeenCalledWith({
        path: '/customer/session',
        body: { phone: '300 123 4567', country: 'CO', public_code: 'club' },
      }),
    );
    expect(
      screen.getByRole('link', { name: 'Ver mi tarjeta' }),
    ).toHaveAttribute('href', '/cards?card=card-id');
  });

  it('con sesión válida recupera la misma tarjeta sin pedir identidad', async () => {
    state.session = { phone_masked: '••• 45 67' };
    render(<EnrollmentPage code="club" />);
    expect(await screen.findByText(/Ya te reconocemos/)).toBeVisible();
    expect(screen.queryByLabelText('Teléfono')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(state.customer).toHaveBeenCalledWith({
        path: '/customer/enrollments',
        body: { public_code: 'club' },
      }),
    );
    expect(
      await screen.findByRole('link', { name: 'Ver mi tarjeta' }),
    ).toBeVisible();
  });

  it('permite olvidar el dispositivo sin borrar la tarjeta', async () => {
    state.session = { phone_masked: '••• 45 67' };
    render(<EnrollmentPage code="club" />);
    await screen.findByRole('link', { name: 'Ver mi tarjeta' });
    fireEvent.click(screen.getByRole('button', { name: 'Usar otro teléfono' }));
    await waitFor(() =>
      expect(state.customer).toHaveBeenCalledWith({
        path: '/customer/session',
        method: 'DELETE',
      }),
    );
  });
});
describe('FLOW-001 invitación privada al equipo', () => {
  it('permite salir de la cuenta del dueño y registrarse con el correo invitado', async () => {
    const view = render(<InvitationPage token="staff-token" />);
    expect(screen.getByText('owner@example.test')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Usar otra cuenta' }));
    await waitFor(() => expect(state.logout).toHaveBeenCalledOnce());
    expect(state.mutate).not.toHaveBeenCalled();
    state.user = null;
    view.rerender(<InvitationPage token="staff-token" />);
    expect(
      screen.getByRole('link', { name: 'Crear cuenta de empleado' }),
    ).toHaveAttribute('href', '/auth?mode=signup&next=%2Finvite%2Fstaff-token');
    expect(
      screen.getByRole('link', { name: 'Iniciar sesión' }),
    ).toHaveAttribute('href', '/auth?next=%2Finvite%2Fstaff-token');
  });

  it('acepta únicamente tras la acción explícita y conserva el token', () => {
    render(<InvitationPage token="staff-token" />);
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    expect(state.mutate).toHaveBeenCalledWith({
      path: '/invitations/accept',
      body: { token: 'staff-token' },
    });
  });

  it('un correo equivocado permite cambiar cuenta con instrucciones concretas', () => {
    state.error = new ApiError(403, 'FORBIDDEN', 'No autorizado');
    render(<InvitationPage token="staff-token" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /correo verificado de la invitación/i,
    );
    expect(
      screen.getByRole('button', { name: 'Usar otra cuenta' }),
    ).toBeEnabled();
  });

  it('una invitación caducada o revocada explica cómo continuar', () => {
    state.error = new ApiError(409, 'CONFLICT', 'Conflicto');
    render(<InvitationPage token="staff-token" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/solicita una nueva/i);
  });
});
