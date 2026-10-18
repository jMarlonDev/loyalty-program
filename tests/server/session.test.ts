import { describe, expect, it, vi } from 'vitest';
import {
  createSessionHandler,
  type SessionAuth,
  SessionError,
} from '../../src/server/session';

const user = { id: 'user-id', email: 'ana@example.test', full_name: 'Ana' };
const session = {
  user,
  access_token: 'private-access',
  refresh_token: 'private-refresh',
  expires_in: 3600,
};
function setup() {
  const auth: SessionAuth = {
    login: vi.fn().mockResolvedValue(session),
    signup: vi.fn().mockResolvedValue(null),
    user: vi.fn().mockResolvedValue(user),
    refresh: vi.fn().mockResolvedValue({ ...session, access_token: 'renewed' }),
    logout: vi.fn().mockResolvedValue(undefined),
    recover: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    exchange: vi.fn().mockResolvedValue(session),
    googleUrl: vi.fn(
      (redirect, challenge) =>
        `https://provider.test/authorize?redirect_to=${encodeURIComponent(redirect)}&code_challenge=${challenge}`,
    ),
  };
  return {
    auth,
    handle: createSessionHandler({
      auth,
      origin: 'https://loyalty.test',
      secure: true,
    }),
  };
}
function post(body: unknown, origin = 'https://loyalty.test', cookie = '') {
  return new Request('https://loyalty.test/api/session', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}
describe('AUTH sesión servidor', () => {
  it('AUTH-01 impide login CSRF antes de llamar al proveedor', async () => {
    const { auth, handle } = setup();
    expect(
      (
        await handle(
          post(
            { action: 'login', email: user.email, password: 'password123' },
            'https://evil.test',
          ),
        )
      ).status,
    ).toBe(403);
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('AUTH-01/02 login emite cookies HttpOnly Secure y no tokens JSON', async () => {
    const { handle } = setup();
    const r = await handle(
      post({ action: 'login', email: user.email, password: 'password123' }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      data: { user, confirmationRequired: false },
    });
    const cookies = r.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(
      cookies.every(
        (c) =>
          c.includes('HttpOnly') &&
          c.includes('Secure') &&
          c.includes('SameSite=Lax') &&
          c.includes('Path=/'),
      ),
    ).toBe(true);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('AUTH-01 registro pendiente no fabrica sesión', async () => {
    const { handle } = setup();
    const r = await handle(
      post({
        action: 'signup',
        email: user.email,
        password: 'password123',
        full_name: 'Ana',
      }),
    );
    expect(await r.json()).toEqual({
      data: { user: null, confirmationRequired: true },
    });
    expect(r.headers.getSetCookie()).toHaveLength(2);
    expect(r.headers.getSetCookie().join(';')).toContain('loyalty-verifier');
  });
  it('AUTH-01 rechaza payloads y JSON inválido', async () => {
    const { handle, auth } = setup();
    expect(
      (await handle(post({ action: 'login', email: 'no', password: '' })))
        .status,
    ).toBe(400);
    expect((await handle(post(['login']))).status).toBe(400);
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('AUTH-02 lee solo usuario validado por proveedor', async () => {
    const { handle, auth } = setup();
    const r = await handle(
      new Request('https://loyalty.test/api/session', {
        headers: { cookie: '__Host-loyalty-access=private-access' },
      }),
    );
    expect(await r.json()).toEqual({ data: { user } });
    expect(auth.user).toHaveBeenCalledWith('private-access');
  });
  it('AUTH-02 una sesión ausente requiere autenticar', async () => {
    const { handle } = setup();
    expect(
      (await handle(new Request('https://loyalty.test/api/session'))).status,
    ).toBe(401);
  });
  it('AUTH-02 renueva exclusivamente con refresh HttpOnly', async () => {
    const { handle, auth } = setup();
    const r = await handle(
      post(
        { action: 'refresh' },
        undefined,
        '__Host-loyalty-refresh=private-refresh',
      ),
    );
    expect(r.status).toBe(200);
    expect(auth.refresh).toHaveBeenCalledWith('private-refresh');
    expect(r.headers.getSetCookie()[0]).toContain('renewed');
  });
  it('AUTH-02 logout revoca y elimina cookies', async () => {
    const { handle, auth } = setup();
    const r = await handle(
      post(
        { action: 'logout' },
        undefined,
        '__Host-loyalty-access=private-access',
      ),
    );
    expect(r.status).toBe(200);
    expect(auth.logout).toHaveBeenCalledWith('private-access');
    expect(r.headers.getSetCookie().every((c) => c.includes('Max-Age=0'))).toBe(
      true,
    );
  });
  it('AUTH-03 Google crea PKCE y limita retorno local', async () => {
    const { handle, auth } = setup();
    const r = await handle(
      new Request(
        'https://loyalty.test/api/session/google?next=https://evil.test',
      ),
    );
    expect(r.status).toBe(302);
    expect(auth.googleUrl).toHaveBeenCalledWith(
      'https://loyalty.test/api/session/callback',
      expect.stringMatching(/^[\w-]{43}$/),
    );
    expect(r.headers.getSetCookie().join(';')).toContain('HttpOnly');
    expect(r.headers.getSetCookie().join(';')).not.toContain('evil.test');
  });
  it('AUTH-03 callback sin verifier no canjea código', async () => {
    const { handle, auth } = setup();
    expect(
      (
        await handle(
          new Request(
            'https://loyalty.test/api/session/callback?code=untrusted',
          ),
        )
      ).status,
    ).toBe(302);
    expect(auth.exchange).not.toHaveBeenCalled();
  });
  it('AUTH-03 callback canjea código una vez y limpia PKCE', async () => {
    const { handle, auth } = setup();
    const r = await handle(
      new Request('https://loyalty.test/api/session/callback?code=good', {
        headers: {
          cookie:
            '__Host-loyalty-verifier=valid-verifier; __Host-loyalty-next=%2Fcards',
        },
      }),
    );
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/cards');
    expect(auth.exchange).toHaveBeenCalledWith('good', 'valid-verifier');
    expect(
      r.headers.getSetCookie().filter((c) => c.includes('Max-Age=0')),
    ).toHaveLength(2);
  });
  it('AUTH-01 login admite contraseñas históricas cortas', async () => {
    const { handle } = setup();
    expect(
      (
        await handle(
          post({ action: 'login', email: user.email, password: 'legacy' }),
        )
      ).status,
    ).toBe(200);
  });
  it('AUTH-02 errores imprevistos no exponen secretos', async () => {
    const { handle, auth } = setup();
    vi.mocked(auth.login).mockRejectedValue(
      new Error('secret database password'),
    );
    const r = await handle(
      post({ action: 'login', email: user.email, password: 'password123' }),
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('secret');
  });
  it('AUTH-002 AC-001 conserva el código público de confirmación en la respuesta JSON', async () => {
    const { handle, auth } = setup();
    vi.mocked(auth.login).mockRejectedValueOnce(
      new SessionError(401, 'Confirma tu correo.', 'EMAIL_NOT_CONFIRMED'),
    );
    const response = await handle(
      post({ action: 'login', email: user.email, password: 'password123' }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'EMAIL_NOT_CONFIRMED', message: 'Confirma tu correo.' },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
  it('AUTH-01 limita bytes UTF-8 antes de llamar al proveedor', async () => {
    const { handle, auth } = setup();
    const response = await handle(
      post({ action: 'login', email: user.email, password: 'é'.repeat(4200) }),
    );
    expect(response.status).toBe(413);
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('AUTH-01 exige Origin incluso en login sin cookies', async () => {
    const { handle } = setup();
    const request = post({
      action: 'login',
      email: user.email,
      password: 'password',
    });
    request.headers.delete('origin');
    expect((await handle(request)).status).toBe(403);
  });
  it('AUTH-03 callback no permite redirección externa en cookie manipulada', async () => {
    const { handle } = setup();
    const response = await handle(
      new Request('https://loyalty.test/api/session/callback?code=good', {
        headers: {
          cookie:
            '__Host-loyalty-verifier=valid; __Host-loyalty-next=%2F%2Fevil.test',
        },
      }),
    );
    expect(response.headers.get('location')).toBe('/app');
  });
  it.each([
    ['?error=access_denied&error_description=private-token', 'AUTH_CANCELLED'],
    ['?error=server_error&error_description=private-token', 'AUTH_UNAVAILABLE'],
    ['', 'AUTH_LINK_EXPIRED'],
  ])(
    'AUTH-002 AC-002 callback %s retorna al formulario con next y sin secretos',
    async (query, code) => {
      const { auth, handle } = setup();
      const response = await handle(
        new Request(`https://loyalty.test/api/session/callback${query}`, {
          headers: {
            cookie:
              '__Host-loyalty-next=%2Fjoin%2Fprogram-code; __Host-loyalty-access=existing-session',
          },
        }),
      );
      expect(response.status).toBe(302);
      const location = new URL(
        response.headers.get('location') ?? '',
        'https://loyalty.test',
      );
      expect(location.pathname).toBe('/auth');
      expect(location.searchParams.get('error')).toBe(code);
      expect(location.searchParams.get('next')).toBe('/join/program-code');
      expect(location.href).not.toContain('private-token');
      expect(auth.exchange).not.toHaveBeenCalled();
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(
        response.headers
          .getSetCookie()
          .every((cookie) => cookie.includes('Max-Age=0')),
      ).toBe(true);
      expect(response.headers.getSetCookie().join(';')).not.toContain(
        'loyalty-access',
      );
    },
  );
  it.each([
    [new SessionError(401, 'private-provider-message'), 'AUTH_LINK_EXPIRED'],
    [new Error('private-provider-message'), 'AUTH_UNAVAILABLE'],
  ])(
    'AUTH-002 AC-002 fallo de intercambio %s no termina en JSON',
    async (error, code) => {
      const { auth, handle } = setup();
      vi.mocked(auth.exchange).mockRejectedValueOnce(error);
      const response = await handle(
        new Request(
          'https://loyalty.test/api/session/callback?code=private-code',
          {
            headers: {
              cookie:
                '__Host-loyalty-verifier=verifier; __Host-loyalty-next=%2F%2Fevil.test',
            },
          },
        ),
      );
      expect(response.status).toBe(302);
      const location = new URL(
        response.headers.get('location') ?? '',
        'https://loyalty.test',
      );
      expect(location.searchParams.get('error')).toBe(code);
      expect(location.searchParams.get('next')).toBe('/app');
      expect(location.href).not.toContain('private');
    },
  );
});

it('SESSION-003 refresh persiste 400 días y renueva cookies sin exponer tokens', async () => {
  const { handle } = setup();
  const response = await handle(
    post(
      { action: 'refresh' },
      undefined,
      '__Host-loyalty-refresh=private-refresh',
    ),
  );
  expect(
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-loyalty-refresh=')),
  ).toContain('Max-Age=34560000');
  expect(await response.json()).toEqual({ data: { user } });
});
it('SESSION-003 fallo de revocación confirma borrado de cookies al navegador', async () => {
  const { auth, handle } = setup();
  vi.mocked(auth.logout).mockRejectedValueOnce(
    new SessionError(503, 'Servicio no disponible'),
  );
  const response = await handle(
    post(
      { action: 'logout' },
      undefined,
      '__Host-loyalty-access=private-access',
    ),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get('X-Session-Cleared')).toBe('1');
  expect(
    response.headers
      .getSetCookie()
      .every((cookie) => cookie.includes('Max-Age=0')),
  ).toBe(true);
});
