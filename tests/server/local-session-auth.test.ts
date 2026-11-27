import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../backend/src/application/errors';
import type { LocalAuthStore } from '../../backend/src/infrastructure/local-auth';
import { createLocalSessionAuth } from '../../src/server/local-session-auth';
import { SessionError } from '../../src/server/session';

function setup() {
  const store = {
    login: vi.fn(),
    signup: vi.fn(),
    user: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    updatePassword: vi.fn(),
  };
  return {
    store,
    auth: createLocalSessionAuth(store as unknown as LocalAuthStore),
  };
}

describe('AUTH-LOCAL-001 adaptador SessionAuth local', () => {
  it('traduce AppError a SessionError conservando status, código y mensaje', async () => {
    const { store, auth } = setup();
    store.login.mockRejectedValue(
      new AppError(429, 'RATE_LIMITED', 'Demasiados intentos.'),
    );
    const error = await auth.login('a@b.co', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SessionError);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect((error as Error).message).toBe('Demasiados intentos.');
  });

  it('no oculta errores inesperados como SessionError', async () => {
    const { store, auth } = setup();
    store.user.mockRejectedValue(new Error('boom'));
    const error = await auth.user('t').catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(SessionError);
  });

  it('delega login, signup, refresh, logout y updatePassword', async () => {
    const { store, auth } = setup();
    store.login.mockResolvedValue('L');
    store.signup.mockResolvedValue('S');
    store.refresh.mockResolvedValue('R');
    await expect(auth.login('a@b.co', 'p')).resolves.toBe('L');
    await expect(auth.signup('a@b.co', 'p', 'Ana')).resolves.toBe('S');
    await expect(auth.refresh('r')).resolves.toBe('R');
    await auth.logout('t');
    await auth.updatePassword('t', 'Nueva1234');
    expect(store.logout).toHaveBeenCalledWith('t');
    expect(store.updatePassword).toHaveBeenCalledWith('t', 'Nueva1234');
  });

  it('recover, exchange y googleUrl responden 501 NOT_AVAILABLE', async () => {
    const { auth } = setup();
    for (const call of [
      () => auth.recover('a@b.co', 'https://x.test', 'c'),
      () => auth.exchange('code', 'verifier'),
      () => Promise.resolve().then(() => auth.googleUrl('https://x.test', 'c')),
    ]) {
      const error = await call().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SessionError);
      expect(error).toMatchObject({ status: 501, code: 'NOT_AVAILABLE' });
    }
  });
});
