import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from '../../src/features/auth-page';

const auth = vi.hoisted(() => ({
  user: null as null | { email: string },
  loading: false,
  error: null as string | null,
  signup: vi.fn(),
  google: vi.fn(),
  reload: vi.fn(),
}));
vi.mock('../../src/lib/auth', () => ({ useAuth: () => auth }));
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.error = null;
  auth.signup.mockResolvedValue({ confirmationRequired: true });
  window.history.replaceState({}, '', '/auth?mode=signup');
});

function fillSignup() {
  fireEvent.change(screen.getByLabelText('Nombre completo'), {
    target: { value: 'Ana' },
  });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: 'ana@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'test-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('ACCESS-001 destino y errores de acceso', () => {
  it('conserva la elección de tarjetas también al confirmar el registro por correo', async () => {
    render(<AuthPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mis tarjetas' }));
    fillSignup();
    await waitFor(() =>
      expect(auth.signup).toHaveBeenCalledWith(
        'ana@example.test',
        'test-password',
        'Ana',
        '/cards',
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Revisa tu correo');
  });
  it('conserva el enlace de inscripción en Google y correo', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth?mode=signup&next=%2Fjoin%2Fclub',
    );
    render(<AuthPage />);
    expect(
      screen.queryByRole('button', { name: 'Mis tarjetas' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Google' }));
    expect(auth.google).toHaveBeenCalledWith('/join/club');
  });
  it('explica callback caducado sin reflejar texto remoto', () => {
    window.history.replaceState(
      {},
      '',
      '/auth?error=AUTH_LINK_EXPIRED&error_description=private-provider-detail',
    );
    render(<AuthPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('enlace');
    expect(
      screen.queryByText(/private-provider-detail/),
    ).not.toBeInTheDocument();
  });
  it('muestra fallo inicial y permite reintentar la sesión', () => {
    auth.error = 'El servicio aún no está configurado.';
    render(<AuthPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(auth.error);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(auth.reload).toHaveBeenCalledOnce();
  });
  it('ofrece continuar con la sesión existente hacia un destino local seguro', () => {
    auth.user = { email: 'ana@example.test' };
    window.history.replaceState({}, '', '/auth?next=https://outside.example');
    render(<AuthPage />);
    expect(screen.getByRole('link', { name: /Continuar/ })).toHaveAttribute(
      'href',
      '/app',
    );
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Google' }),
    ).not.toBeInTheDocument();
  });
});
