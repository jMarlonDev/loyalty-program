import { describe, expect, it, vi } from 'vitest';
import {
  createSessionHandler,
  type SessionAuth,
} from '../../src/server/session';

const user = { id: 'review-user', email: 'review@example.test' };
function setup() {
  const session = {
    user,
    access_token: 'renewed-access',
    refresh_token: 'renewed-refresh',
    expires_in: 3600,
  };
  const auth: SessionAuth = {
    login: vi.fn().mockResolvedValue(session),
    signup: vi.fn().mockResolvedValue(null),
    user: vi.fn().mockResolvedValue(user),
    refresh: vi.fn().mockResolvedValue(session),
    logout: vi.fn().mockResolvedValue(undefined),
    recover: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    exchange: vi.fn().mockResolvedValue(session),
    googleUrl: vi.fn().mockReturnValue('https://provider.test'),
  };
  return {
    auth,
    handle: createSessionHandler({ auth, origin: 'https://loyalty.test' }),
  };
}

describe('AUTH revisión independiente del cierre de sesión', () => {
  it('revoca la sesión del proveedor aunque la cookie de acceso ya haya caducado', async () => {
    const { auth, handle } = setup();
    const response = await handle(
      new Request('https://loyalty.test/api/session', {
        method: 'POST',
        headers: {
          origin: 'https://loyalty.test',
          'content-type': 'application/json',
          cookie: '__Host-loyalty-refresh=still-valid-refresh',
        },
        body: JSON.stringify({ action: 'logout' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(auth.refresh).toHaveBeenCalledWith('still-valid-refresh');
    expect(auth.logout).toHaveBeenCalledWith('renewed-access');
    expect(
      response.headers
        .getSetCookie()
        .every((cookie) => cookie.includes('Max-Age=0')),
    ).toBe(true);
    expect(await response.text()).not.toContain('renewed-access');
  });
});

import { createBaseApp } from '../../backend/src/presentation/http/base-app';

describe('STACK-001 revisión de consulta Web', () => {
  it('interpreta parámetros repetidos igual al leer uno o el objeto completo', async () => {
    const app = createBaseApp({ checkDatabase: async () => {} });
    app.get('/query', (context) =>
      context.json({
        single: context.req.query('limit'),
        collection: context.req.query().limit,
      }),
    );
    const response = await app.request('/query?limit=1&limit=20');
    expect(await response.json()).toEqual({ single: '1', collection: '1' });
  });
});
