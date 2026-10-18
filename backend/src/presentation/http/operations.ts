import { AppError } from '../../application/errors.js';
import type { NativeRoutes } from './native-routes.js';

export interface OperationLog {
  request_id: string;
  method: string;
  status: number;
  duration_ms: number;
}
export interface OperationalOptions {
  corsOrigins: string[];
  requestLimit?: number;
  now?: () => number;
  log?: (entry: OperationLog) => void;
}

const securityHeaders = {
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
};

async function boundedBody(request: Request): Promise<Request> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16 * 1024) {
        void reader.cancel().catch(() => {});
        throw new AppError(413, 'BODY_TOO_LARGE', 'El cuerpo excede 16 KiB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body: body.buffer });
}

export function addOperationalMiddleware(
  app: NativeRoutes,
  options: OperationalOptions,
) {
  const now = options.now ?? Date.now;
  const limit = options.requestLimit ?? 120;
  const windows = new Map<string, { count: number; expires: number }>();
  app.boundary = async (request, connection, headers, next) => {
    if (!new URL(request.url).pathname.startsWith('/api/'))
      return next(request);
    const start = now();
    let status = 500;
    headers.set('Cache-Control', 'no-store');
    for (const [name, value] of Object.entries(securityHeaders))
      headers.set(name, value);
    headers.set('Vary', 'Origin');
    const origin = request.headers.get('Origin');
    if (origin && options.corsOrigins.includes(origin))
      headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'X-Request-Id,Retry-After');
    try {
      if (request.method === 'OPTIONS') {
        headers.set(
          'Access-Control-Allow-Methods',
          'GET,POST,PATCH,DELETE,OPTIONS',
        );
        headers.set(
          'Access-Control-Allow-Headers',
          'Authorization,Content-Type,Idempotency-Key,X-Request-Id',
        );
        headers.set('Access-Control-Max-Age', '600');
        headers.set('Vary', 'Origin, Access-Control-Request-Headers');
        status = 204;
        return new Response(null, { status });
      }
      const address = connection.remoteAddress ?? 'unknown';
      const time = now();
      for (const [key, value] of windows)
        if (value.expires <= time) windows.delete(key);
      let entry = windows.get(address);
      if (!entry) {
        if (windows.size >= 5000) {
          headers.set('Retry-After', '60');
          throw new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.');
        }
        entry = { count: 0, expires: time + 60000 };
        windows.set(address, entry);
      }
      if (++entry.count > limit) {
        headers.set(
          'Retry-After',
          String(Math.max(1, Math.ceil((entry.expires - time) / 1000))),
        );
        throw new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.');
      }
      const response = await next(await boundedBody(request));
      status = response.status;
      return response;
    } catch (error) {
      status = error instanceof AppError ? error.status : 500;
      throw error;
    } finally {
      try {
        options.log?.({
          request_id: headers.get('X-Request-Id') ?? '',
          method: request.method,
          status,
          duration_ms: Math.max(0, now() - start),
        });
      } catch {
        /* Logging must never roll back an already completed command. */
      }
    }
  };
}
