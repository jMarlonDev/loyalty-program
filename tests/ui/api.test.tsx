import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, useAction, useCollection } from '../../src/lib/api';
import { authFetch } from '../../src/lib/auth';

vi.mock('../../src/lib/auth', () => ({ authFetch: vi.fn() }));
const request = vi.mocked(authFetch);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}
beforeEach(() => request.mockReset());
afterEach(() => vi.unstubAllGlobals());
describe('cliente fullstack', () => {
  it('MOBILE-001 AC-008 registra y reintenta en HTTP sin randomUUID', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
      ),
    });
    request
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockImplementation(async () => response({ data: { id: 'ok' } }));
    const { result } = renderHook(() => useAction(), { wrapper });
    const operation = {
      path: '/purchases',
      body: { sale_reference: 'LAN-001' },
    };
    await act(async () => {
      await expect(result.current.mutateAsync(operation)).rejects.toThrow(
        'Network error',
      );
    });
    await act(async () => {
      await result.current.mutateAsync(operation);
    });
    const keys = request.mock.calls.map(([, options]) =>
      new Headers(options?.headers).get('Idempotency-Key'),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[a-zA-Z0-9-]{16,128}$/);
    expect(keys[1]).toBe(keys[0]);
    await act(async () => {
      await result.current.mutateAsync(operation);
    });
    const next = new Headers(request.mock.calls[2]?.[1]?.headers).get(
      'Idempotency-Key',
    );
    expect(next).not.toBe(keys[0]);
  });
  it('conserva el error de autorización del servidor', async () => {
    request.mockResolvedValue(
      response({ error: { code: 'FORBIDDEN', message: 'Sin permiso' } }, 403),
    );
    await expect(api('/restaurants')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Sin permiso',
    });
  });
  it('envía JSON same-origin y clave de idempotencia sin token persistente', async () => {
    request.mockResolvedValue(response({ data: { ok: true } }));
    await api('/test', {
      method: 'POST',
      body: { name: 'Negocio' },
      key: 'same-operation',
    });
    expect(request).toHaveBeenCalledWith(
      '/api/v1/test',
      expect.objectContaining({
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'same-operation',
        },
        body: '{"name":"Negocio"}',
      }),
    );
  });
  it('reutiliza clave tras fallo ambiguo y la cambia tras éxito', async () => {
    request
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockImplementation(async () => response({ data: { id: 'ok' } }));
    const { result } = renderHook(() => useAction(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          path: '/purchases',
          body: { sale_reference: '001' },
        });
      } catch {}
    });
    await act(async () => {
      await result.current.mutateAsync({
        path: '/purchases',
        body: { sale_reference: '001' },
      });
    });
    const first = request.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const second = request.mock.calls[1]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(first['Idempotency-Key']).toBe(second['Idempotency-Key']);
    await act(async () => {
      await result.current.mutateAsync({
        path: '/purchases',
        body: { sale_reference: '002' },
      });
    });
    const third = request.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(third['Idempotency-Key']).not.toBe(first['Idempotency-Key']);
  });
  it('no elimina registros anteriores al cargar la siguiente página', async () => {
    request
      .mockResolvedValueOnce(
        response({ data: [{ id: 'a' }], next_cursor: 'a' }),
      )
      .mockResolvedValueOnce(
        response({ data: [{ id: 'b' }], next_cursor: null }),
      );
    const { result } = renderHook(
      () => useCollection<{ id: string }>('/restaurants'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(result.current.items).toEqual([{ id: 'a' }, { id: 'b' }]),
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      '/api/v1/restaurants?limit=20&cursor=a',
    );
  });
});
