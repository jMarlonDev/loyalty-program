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
