import { getConnInfo } from '@hono/node-server/conninfo';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { AppError } from '../../application/errors.js';
import type { AppEnv } from './base-app.js';

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
export function addOperationalMiddleware(
  app: Hono<AppEnv>,
  options: OperationalOptions,
) {
  const now = options.now ?? Date.now;
  const limit = options.requestLimit ?? 120;
  const windows = new Map<string, { count: number; expires: number }>();
  app.use('/api/*', async (c, next) => {
    const start = now();
    c.header('Cache-Control', 'no-store');
    await next();
    try {
      options.log?.({
        request_id: c.get('requestId'),
        method: c.req.method,
        status: c.res.status,
        duration_ms: Math.max(0, now() - start),
      });
    } catch {
      /* A failed log sink must not change a completed command. */
    }
  });
  app.use('/api/*', secureHeaders());
  app.use(
    '/api/*',
    cors({
      origin: options.corsOrigins,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Idempotency-Key',
        'X-Request-Id',
      ],
      exposeHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    }),
  );
  app.use('/api/*', async (c, next) => {
    let address = 'unknown';
    try {
      address = getConnInfo(c).remote.address ?? address;
    } catch {
      /* In-process tests have no connection. */
    }
    const time = now();
    for (const [key, value] of windows)
      if (value.expires <= time) windows.delete(key);
    let entry = windows.get(address);
    if (!entry) {
      if (windows.size >= 5000) {
        c.header('Retry-After', '60');
        throw new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.');
      }
      entry = { count: 0, expires: time + 60000 };
      windows.set(address, entry);
    }
    if (++entry.count > limit) {
      c.header(
        'Retry-After',
        String(Math.max(1, Math.ceil((entry.expires - time) / 1000))),
      );
      throw new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.');
    }
    await next();
  });
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: () => {
        throw new AppError(413, 'BODY_TOO_LARGE', 'El cuerpo excede 16 KiB.');
      },
    }),
  );
}
