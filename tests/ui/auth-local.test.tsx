import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from '../../src/features/auth-page';
import { ForcePasswordChange } from '../../src/features/force-password-change';
import { resetAuthProviderCache } from '../../src/lib/auth-provider-kind';

const auth = vi.hoisted(() => ({
  user: null as null | { email: string; must_change_password?: boolean },
  loading: false,
  error: null as string | null,
  login: vi.fn(),
  signup: vi.fn(),
  google: vi.fn(),
  reload: vi.fn(),
  logout: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock('../../src/lib/auth', () => ({ useAuth: () => auth }));
function config(provider: string) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(Response.json({ data: { authProvider: provider } })),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  resetAuthProviderCache();
  auth.user = null;
  auth.error = null;
  window.history.replaceState({}, '', '/auth');
});
afterEach(() => vi.unstubAllGlobals());

describe('AUTH-LOCAL-001 acceso local', () => {
  it('oculta Google y recuperación y orienta al administrador', async () => {
    config('local');
    render(<AuthPage />);
    expect(
      await screen.findByText(/Pide al administrador que la restablezca/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google' })).toBeNull();
    expect(screen.queryByText('Olvidé mi contraseña')).toBeNull();
  });
  it('con supabase mantiene Google y recuperación', async () => {
    config('supabase');
    render(<AuthPage />);
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByText('Olvidé mi contraseña')).toBeInTheDocument();
  });
  it('muestra el error de credenciales y el de límite de intentos', async () => {
    config('local');
    render(<AuthPage />);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'a@b.test' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'x' },
    });
    auth.login.mockRejectedValueOnce(
      new Error('Correo o contraseña incorrectos.'),
    );
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/ }));
    expect(
      await screen.findByText(/Correo o contraseña incorrectos/),
    ).toBeInTheDocument();
    auth.login.mockRejectedValueOnce(
      new Error('Demasiados intentos. Espera unos minutos.'),
    );
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/ }));
    expect(await screen.findByText(/Demasiados intentos/)).toBeInTheDocument();
  });
  it('registro local no pide confirmar el correo', async () => {
    config('local');
    window.history.replaceState({}, '', '/auth?mode=signup&next=%2Fcards');
    auth.signup.mockResolvedValue({ confirmationRequired: true });
    const assign = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign,
      search: window.location.search,
    });
    render(<AuthPage />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'a@b.test' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'abcdefg1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));
    await waitFor(() => expect(auth.signup).toHaveBeenCalled());
    expect(screen.queryByText(/Revisa tu correo/)).toBeNull();
  });
});

describe('AUTH-LOCAL-001 cambio obligatorio de contraseña', () => {
  const view = () =>
    render(
      <ForcePasswordChange>
        <p>contenido</p>
      </ForcePasswordChange>,
    );
  it('no interfiere sin contraseña temporal', () => {
    auth.user = { email: 'a@b.test' };
    view();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
  it('bloquea la vista, valida en cliente y guarda', async () => {
    auth.user = { email: 'a@b.test', must_change_password: true };
    auth.updatePassword.mockResolvedValue(undefined);
    auth.reload.mockResolvedValue(undefined);
    view();
    expect(screen.queryByText('contenido')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Cambia tu contraseña temporal' }),
    ).toBeInTheDocument();
    const set = (l: string, v: string) =>
      fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
    const submit = () =>
      fireEvent.click(
        screen.getByRole('button', { name: /Guardar contraseña/ }),
      );
    set('Nueva contraseña', 'sololetras');
    set('Confirmar contraseña', 'sololetras');
    submit();
    expect(
      await screen.findByText(/letras y números/, {
        selector: '[role=alert], p, div',
      }),
    ).toBeInTheDocument();
    set('Nueva contraseña', 'abcdefg1');
    set('Confirmar contraseña', 'abcdefg2');
    submit();
    expect(
      await screen.findByText('Las contraseñas no coinciden.'),
    ).toBeInTheDocument();
    set('Confirmar contraseña', 'abcdefg1');
    submit();
    await waitFor(() =>
      expect(auth.updatePassword).toHaveBeenCalledWith('abcdefg1'),
    );
    expect(auth.updatePassword).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(auth.reload).toHaveBeenCalled());
  });
});
