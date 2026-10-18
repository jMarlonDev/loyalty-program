import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createBaseApp } from '../../src/presentation/http/base-app.js';
import { addOperationalMiddleware } from '../../src/presentation/http/operations.js';

function fixture(limit = 120) {
  let time = 0;
  const log = vi.fn();
  const handler = vi.fn((c: Context) => c.json({ data: 'ok' }));
  const app = createBaseApp({ checkDatabase: async () => {} });
  addOperationalMiddleware(app, {
    corsOrigins: ['https://app.example.test'],
    requestLimit: limit,
    now: () => time,
    log,
  });
  app.all('/api/v1/example', handler);
  return {
    app,
    handler,
    log,
    advance: () => {
      time += 60001;
    },
  };
}
describe('OPS-001 límites y confidencialidad HTTP', () => {
  it('AC-001 CORS explícito con preflight de autorización y clave', async () => {
    const { app } = fixture();
    const allowed = await app.request('/api/v1/example', {
      headers: { Origin: 'https://app.example.test' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.test',
    );
    const rejected = await app.request('/api/v1/example', {
      headers: { Origin: 'https://evil.example.test' },
    });
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await app.request('/api/v1/example', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.test',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization,Idempotency-Key',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain(
      'Idempotency-Key',
    );
  });
  it('AC-002 rechaza cuerpos grandes sin invocar handler', async () => {
    const { app, handler } = fixture();
    const response = await app.request('/api/v1/example', {
      method: 'POST',
      body: 'x'.repeat(16385),
    });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('BODY_TOO_LARGE');
    expect(handler).not.toHaveBeenCalled();
  });
  it('AC-003 limita conexiones sin confiar en X-Forwarded-For y expira ventana', async () => {
    const { app, advance } = fixture(2);
    expect((await app.request('/api/v1/example')).status).toBe(200);
    expect((await app.request('/api/v1/example')).status).toBe(200);
    const blocked = await app.request('/api/v1/example', {
      headers: { 'X-Forwarded-For': 'different-client' },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
    advance();
    expect((await app.request('/api/v1/example')).status).toBe(200);
  });
  it('AC-004 no registra entradas sensibles y no cachea', async () => {
    const { app, log } = fixture();
    const response = await app.request('/api/v1/example?secret=query-secret', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-secret',
        'X-Request-Id': 'trace-001',
      },
      body: 'body-secret',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(log).toHaveBeenCalledWith({
      request_id: 'trace-001',
      method: 'POST',
      status: 200,
      duration_ms: 0,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  });
});
