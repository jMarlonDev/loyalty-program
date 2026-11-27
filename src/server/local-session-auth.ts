import { AppError } from '../../backend/src/application/errors';
import type { LocalAuthStore } from '../../backend/src/infrastructure/local-auth';
import { type SessionAuth, SessionError } from './session';

/**
 * AUTH-LOCAL-001: adapta el almacén local (scrypt + sesiones opacas) al
 * contrato SessionAuth que ya usa el manejador de cookies del staff.
 * Sin recuperación por correo ni Google: el admin restablece contraseñas.
 */
async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError)
      throw new SessionError(error.status, error.message, error.code);
    throw error;
  }
}

const unsupported = () =>
  new SessionError(
    501,
    'No disponible con cuentas locales. Pide al administrador que restablezca tu contraseña.',
    'NOT_AVAILABLE',
  );

export function createLocalSessionAuth(store: LocalAuthStore): SessionAuth {
  return {
    login: (email, password) => mapped(() => store.login(email, password)),
    signup: (email, password, fullName) =>
      mapped(() => store.signup(email, password, fullName)),
    user: (access) => mapped(() => store.user(access)),
    refresh: (refresh) => mapped(() => store.refresh(refresh)),
    logout: (access) => mapped(() => store.logout(access)),
    updatePassword: (access, password) =>
      mapped(() => store.updatePassword(access, password)),
    recover: async () => {
      throw unsupported();
    },
    exchange: async () => {
      throw unsupported();
    },
    googleUrl: () => {
      throw unsupported();
    },
  };
}
