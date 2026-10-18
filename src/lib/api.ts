import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef } from 'react';
import { authFetch } from './auth';
import type { Page } from './types';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await authFetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    signal: options.signal,
    headers: {
      ...(options.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'REQUEST_FAILED',
      data?.error?.message ??
        'No pudimos completar la solicitud. Inténtalo de nuevo.',
    );
  return data as T;
}
export function useResource<T>(path: string | null) {
  return useQuery({
    queryKey: [path],
    queryFn: ({ signal }) =>
      api<{ data: T }>(path ?? '', { signal }).then((result) => result.data),
    enabled: Boolean(path),
    retry: false,
  });
}
export function useCollection<T>(path: string | null) {
  const query = useInfiniteQuery({
    queryKey: [path],
    queryFn: ({ pageParam, signal }) =>
      api<Page<T>>(
        `${path}${path?.includes('?') ? '&' : '?'}limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: Boolean(path),
    retry: false,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.data) ?? [],
  };
}
export function useAction<T = Record<string, unknown>>() {
  const client = useQueryClient();
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  return useMutation({
    mutationFn: async ({
      path,
      body = {},
      method = 'POST',
    }: {
      path: string;
      body?: unknown;
      method?: string;
    }) => {
      const fingerprint = JSON.stringify({ path, body, method });
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, key: crypto.randomUUID() };
      return api<{ data: T }>(path, {
        method,
        body: method === 'DELETE' ? undefined : body,
        key: pending.current.key,
      }).then((result) => result.data);
    },
    onSuccess: () => {
      pending.current = null;
      void client.invalidateQueries();
    },
    retry: false,
  });
}
