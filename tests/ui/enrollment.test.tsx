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
const cardFixture = {
  id: 'card-id',
  program_name: 'Club',
  balance: 0,
  target: 8,
  cycle: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'owner', email: 'owner@example.test' };
  state.session = null;
  state.error = null;
  state.isSuccess = false;
  state.logout.mockResolvedValue(undefined);
  state.customer.mockResolvedValue({
    existing: false,
    reenrollment: false,
    card: cardFixture,
  });
});
async function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));
  fireEvent.change(await screen.findByLabelText('Teléfono'), {
    target: { value: '300 123 4567' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Obtener mi tarjeta' }));
}
describe('NEXT alta por teléfono sin cuenta', () => {
  it('muestra Unirme y Ahora no antes de pedir el teléfono', () => {
    render(<EnrollmentPage code="club" />);
    expect(screen.getByRole('button', { name: 'Unirme' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeVisible();
    expect(screen.queryByLabelText('Teléfono')).not.toBeInTheDocument();
    expect(state.customer).not.toHaveBeenCalled();
  });

  it('Ahora no deja una pantalla neutra sin inscribir', () => {
    render(<EnrollmentPage code="club" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
    expect(screen.getByText(/No creamos ninguna tarjeta/)).toBeVisible();
    expect(state.customer).not.toHaveBeenCalled();
  });

  it('Unirme pide solo país y teléfono y crea la tarjeta', async () => {
    render(<EnrollmentPage code="club" />);
    await openForm();
    expect(screen.queryByLabelText(/correo/i)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(state.customer).toHaveBeenCalledWith({
        path: '/customer/enrollments',
        body: { public_code: 'club', phone: '300 123 4567', country: 'CO' },
      }),
    );
    expect(
      await screen.findByRole('link', { name: 'Ver mi tarjeta' }),
    ).toHaveAttribute('href', '/cards?card=card-id');
  });

  it('muestra el aviso de reinscripción', async () => {
    state.customer.mockResolvedValue({
      existing: false,
      reenrollment: true,
      notice:
        'Este número ya participó en el programa. Se creó una tarjeta nueva sin sellos.',
      card: cardFixture,
    });
    render(<EnrollmentPage code="club" />);
    await openForm();
    expect(
      await screen.findByText(/ya participó en el programa/),
    ).toBeVisible();
  });

  it('409 explica que ya hay tarjeta activa y cómo transferirla', async () => {
    state.customer.mockRejectedValue(
      new ApiError(409, 'CARD_ALREADY_ACTIVE', 'x'),
    );
    render(<EnrollmentPage code="club" />);
    await openForm();
    expect(
      await screen.findByText('Este número ya tiene una tarjeta activa.'),
    ).toBeVisible();
    expect(screen.getByText(/transfieran tu tarjeta/)).toBeVisible();
  });

  it('429 avisa de demasiados intentos', async () => {
    state.customer.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'x'));
    render(<EnrollmentPage code="club" />);
    await openForm();
    expect(
      await screen.findByText('Demasiados intentos. Intenta más tarde.'),
    ).toBeVisible();
  });

  it('con sesión recupera la misma tarjeta sin formulario ni botones', async () => {
    state.session = { phone_masked: '••• 45 67' };
    state.customer.mockResolvedValue({
      existing: true,
      same_program: true,
      card: cardFixture,
    });
    render(<EnrollmentPage code="club" />);
    await waitFor(() =>
      expect(state.customer).toHaveBeenCalledWith({
        path: '/customer/enrollments',
        body: { public_code: 'club' },
      }),
    );
    expect(
      await screen.findByRole('link', { name: 'Ver mi tarjeta' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Teléfono')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Unirme' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /otro teléfono/i }),
    ).not.toBeInTheDocument();
  });

  it('si la tarjeta es de otro programa lo explica y muestra esa tarjeta', async () => {
    state.session = { phone_masked: '••• 45 67' };
    state.customer.mockResolvedValue({
      existing: true,
      same_program: false,
      card: { ...cardFixture, program_name: 'Otro club' },
    });
    render(<EnrollmentPage code="club" />);
    expect(
      await screen.findByText(
        'Este dispositivo ya tiene una tarjeta activa en Otro club.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver mi tarjeta' })).toBeVisible();
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
