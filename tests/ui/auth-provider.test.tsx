import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/lib/auth';

const user = { id: 'a', email: 'ana@example.test' };
const success = () => Response.json({ data: { user } });
const failed = (status = 503) =>
  Response.json(
    { error: { message: 'Servicio temporalmente no disponible' } },
    { status },
  );
function setup() {
  const fetch = vi
    .fn()
    .mockImplementation(async (input) =>
      input === '/api/session' ? success() : Response.json({ data: user }),
    );
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const hook = renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  });
  return { ...hook, fetch, client };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('SESSION-003 conserva identidad validada aunque la consulta del perfil falle', async () => {
  const { result, fetch } = setup();
  fetch.mockResolvedValueOnce(failed());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.user).toEqual(user);
  expect(result.current.error).toBeTruthy();
});
it('SESSION-003 caída de red al recargar conserva usuario y caché', async () => {
  const { result, fetch, client } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  client.setQueryData(['cards'], ['card']);
  fetch.mockRejectedValueOnce(new TypeError('offline'));
  await act(() => result.current.reload());
  expect(result.current.user).toEqual(user);
  expect(client.getQueryData(['cards'])).toEqual(['card']);
});
it('SESSION-003 access expirado con refresh temporalmente indisponible no cierra sesión', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  fetch.mockResolvedValueOnce(failed(401)).mockResolvedValueOnce(failed());
  await act(() => result.current.reload());
  expect(result.current.user).toEqual(user);
  expect(result.current.error).toBeTruthy();
});
it('SESSION-003 refresh revocado sí limpia usuario y caché', async () => {
  const { result, fetch, client } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  client.setQueryData(['cards'], ['card']);
  fetch.mockResolvedValueOnce(failed(401)).mockResolvedValueOnce(failed(401));
  await act(() => result.current.reload());
  expect(result.current.user).toBeNull();
  expect(client.getQueryData(['cards'])).toBeUndefined();
});
it('SESSION-003 recupera automáticamente al volver al foco o conexión', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  const count = fetch.mock.calls.length;
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(fetch.mock.calls.length).toBeGreaterThan(count);
  const secondCount = fetch.mock.calls.length;
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  expect(fetch.mock.calls.length).toBeGreaterThan(secondCount);
});
it('SESSION-003 renueva en segundo plano mientras la página está visible', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  vi.useFakeTimers();
  // Focus schedules the same timer used after initial restoration.
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  fetch.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4 * 60_000);
  });
  expect(
    fetch.mock.calls.some(
      ([, init]) => init?.body === JSON.stringify({ action: 'refresh' }),
    ),
  ).toBe(true);
});
it('SESSION-003 fallo de red al cerrar sesión no finge que las cookies se eliminaron', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  fetch.mockRejectedValueOnce(new TypeError('offline'));
  await act(async () => {
    await expect(result.current.logout()).rejects.toThrow('offline');
  });
  expect(result.current.user).toEqual(user);
});
it('SESSION-003 lectura pendiente no restaura usuario después de logout', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  let resolve!: (response: Response) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.reload();
  });
  await act(() => result.current.logout());
  await act(async () => {
    resolve(success());
    await pending;
  });
  expect(result.current.user).toBeNull();
});
it('SESSION-003 cierre recibido de otra pestaña limpia identidad y consultas', async () => {
  const channels: {
    onmessage?: (event: { data: unknown }) => void;
    close: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage?: (event: { data: unknown }) => void;
      close = vi.fn();
      postMessage = vi.fn();
      constructor() {
        channels.push(this);
      }
    },
  );
  const { result, client } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  client.setQueryData(['cards'], ['card']);
  await act(async () => {
    channels[0].onmessage?.({ data: 'logout' });
  });
  expect(result.current.user).toBeNull();
  expect(client.getQueryData(['cards'])).toBeUndefined();
});
it('SESSION-003 recargas simultáneas comparten restauración', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  fetch.mockClear();
  await act(async () => {
    await Promise.all([result.current.reload(), result.current.reload()]);
  });
  expect(
    fetch.mock.calls.filter(([input]) => input === '/api/session'),
  ).toHaveLength(1);
});
it('SESSION-003 un 503 previo al handler de logout conserva sesión para reintentar', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  fetch.mockResolvedValueOnce(failed());
  await act(async () => {
    await expect(result.current.logout()).rejects.toThrow();
  });
  expect(result.current.user).toEqual(user);
});
it('SESSION-003 logout con cookies eliminadas cierra aunque falle revocación remota', async () => {
  const { result, fetch } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  const response = failed();
  response.headers.set('X-Session-Cleared', '1');
  fetch.mockResolvedValueOnce(response);
  await act(async () => {
    await expect(result.current.logout()).rejects.toThrow();
  });
  expect(result.current.user).toBeNull();
});
it('SESSION-003 espera el alta del perfil antes de habilitar consultas de tarjetas', async () => {
  let finish!: (response: Response) => void;
  const { result, fetch } = setup();
  fetch.mockResolvedValueOnce(failed(404)).mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(result.current.user).toBeNull();
  await act(async () => finish(Response.json({ data: user })));
  await waitFor(() => expect(result.current.user).toEqual(user));
});
it('SESSION-003 logout limpia QR pendiente incluso fuera de la pantalla de escaneo', async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.user).toEqual(user));
  sessionStorage.setItem('loyalty.pending-card-scan', 'pending');
  await act(() => result.current.logout());
  expect(sessionStorage.getItem('loyalty.pending-card-scan')).toBeNull();
});
