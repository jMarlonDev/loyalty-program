import { describe, expect, it, vi } from 'vitest';
import { createApiBridge } from '../../src/server/bridge';

const app = {
  fetch: vi.fn(async (request: Request) =>
    Response.json({ authorization: request.headers.get('authorization') }),
  ),
};
describe('AUTH-04 API cookie bridge', () => {
  it('injecta cookie como Bearer y no la reenvía como cookie', async () => {
    const fetch = vi.fn(async (request: Request) =>
      Response.json({
        authorization: request.headers.get('authorization'),
        cookie: request.headers.get('cookie'),
      }),
    );
    const handle = createApiBridge({
      app: { fetch },
      origin: 'https://loyalty.test',
    });
    const r = await handle(
      new Request('https://loyalty.test/api/v1/me', {
        headers: { cookie: '__Host-loyalty-access=private' },
      }),
    );
    expect(await r.json()).toEqual({
      authorization: 'Bearer private',
      cookie: null,
    });
  });
  it('rechaza mutación cross-origin antes de negocio', async () => {
    app.fetch.mockClear();
    const handle = createApiBridge({ app, origin: 'https://loyalty.test' });
    const r = await handle(
      new Request('https://loyalty.test/api/v1/profiles', {
        method: 'POST',
        headers: {
          cookie: '__Host-loyalty-access=private',
          origin: 'https://evil.test',
        },
        body: '{}',
      }),
    );
    expect(r.status).toBe(403);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it('preserva Bearer explícito para integradores', async () => {
    const handle = createApiBridge({ app, origin: 'https://loyalty.test' });
    const r = await handle(
      new Request('https://loyalty.test/api/v1/me', {
        headers: {
          authorization: 'Bearer external',
          cookie: '__Host-loyalty-access=browser',
        },
      }),
    );
    expect(await r.json()).toEqual({ authorization: 'Bearer external' });
  });
  it('deniega respuestas cacheables de identidad', async () => {
    const handle = createApiBridge({ app, origin: 'https://loyalty.test' });
    expect(
      (await handle(new Request('https://loyalty.test/api/v1/me'))).headers.get(
        'cache-control',
      ),
    ).toBe('no-store');
  });
});

describe('NEXT-001 customer cookie bridge', () => {
  const token = Buffer.alloc(32, 7).toString('base64url');
  const expires = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
  it('forwards only the cookie-derived customer token and issues a hardened cookie', async () => {
    let seen: string | undefined;
    const app = {
      fetch: async (request: Request) => {
        seen = request.headers.get('x-customer-session') ?? undefined;
        return Response.json(
          { ok: true },
          {
            headers: {
              'x-customer-token': token,
              'x-customer-expires': expires.toISOString(),
            },
          },
        );
      },
    };
    const handle = createApiBridge({ app, origin: 'https://loyalty.test' });
    const response = await handle(
      new Request('https://loyalty.test/api/v1/customer/cards', {
        headers: {
          cookie: `__Host-loyalty_customer=${token}`,
          'x-customer-session': 'attacker-token',
        },
      }),
    );
    expect(seen).toBe(token);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`__Host-loyalty_customer=${token}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(response.headers.get('x-customer-token')).toBeNull();
  });

  it('clears the device cookie and never trusts a client internal header without a cookie', async () => {
    let seen: string | null = 'not-called';
    const app = {
      fetch: async (request: Request) => {
        seen = request.headers.get('x-customer-session');
        return new Response(null, {
          status: 204,
          headers: { 'x-customer-clear': '1' },
        });
      },
    };
    const handle = createApiBridge({ app, origin: 'https://loyalty.test' });
    const response = await handle(
      new Request('https://loyalty.test/api/v1/customer/session', {
        method: 'DELETE',
        headers: { 'x-customer-session': token },
      }),
    );
    expect(seen).toBeNull();
    expect(response.headers.get('set-cookie')).toContain(
      '__Host-loyalty_customer=;',
    );
  });
});
