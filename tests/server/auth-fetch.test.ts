import { afterEach, describe, expect, it, vi } from 'vitest';
import { authFetch } from '../../src/lib/auth';

afterEach(() => vi.unstubAllGlobals());
describe('AUTH-02 renovación cliente sin exponer tokens', () => {
  it('reintenta una vez tras renovar cookie y conserva payload idempotente', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          data: { user: { id: 'a', email: 'ana@example.test' } },
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: { id: 'purchase' } }));
    vi.stubGlobal('fetch', fetch);
    const options = {
      method: 'POST',
      headers: { 'Idempotency-Key': 'same-key' },
      body: '{"card_id":"id"}',
    };
    expect((await authFetch('/api/v1/purchases', options)).ok).toBe(true);
    expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[2]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      action: 'refresh',
    });
  });
  it('no reintenta una mutación rechazada por permisos', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    expect((await authFetch('/api/v1/private')).status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refresh inválido conserva el 401 original sin bucle', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({ error: { message: 'expirada' } }, { status: 401 }),
      );
    vi.stubGlobal('fetch', fetch);
    expect((await authFetch('/api/v1/me')).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it('SESSION-003 un fallo temporal de refresh no se disfraza de sesión inválida', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(
      Response.json(
        { error: { message: 'Intenta de nuevo' } },
        { status: 503 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  expect((await authFetch('/api/v1/me')).status).toBe(503);
});
it('SESSION-003 varias peticiones expiradas comparten una renovación', async () => {
  let calls = 0;
  const fetch = vi.fn().mockImplementation(async (input) => {
    if (input === '/api/session')
      return Response.json({
        data: { user: { id: 'a', email: 'ana@example.test' } },
      });
    return ++calls <= 2
      ? new Response(null, { status: 401 })
      : Response.json({ data: {} });
  });
  vi.stubGlobal('fetch', fetch);
  expect(
    (await Promise.all([authFetch('/one'), authFetch('/two')])).every(
      (result) => result.ok,
    ),
  ).toBe(true);
  expect(
    fetch.mock.calls.filter(([input]) => input === '/api/session'),
  ).toHaveLength(1);
});
