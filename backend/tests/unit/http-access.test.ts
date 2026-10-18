import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const publicRoutes = new Set([
  'GET /health',
  'GET /ready',
  'GET /openapi.json',
  'GET /api/v1/public/programs/:code',
]);
function fixture() {
  const query = vi.fn();
  const connect = vi.fn();
  const verifyAccessToken = vi.fn();
  const app = createApp({
    pool: { query, connect } as unknown as Pool,
    identityProvider: { verifyAccessToken },
    cardTokenEncryptionKey: 'ab'.repeat(32),
  });
  return { app, query, connect, verifyAccessToken };
}
const operations = fixture().app.routes.filter(
  ({ method, path }) =>
    ['GET', 'POST', 'PATCH', 'DELETE'].includes(method) &&
    !publicRoutes.has(`${method} ${path}`),
);

describe('BACKEND-001 AC-005 acceso anónimo en todas las rutas privadas montadas', () => {
  it.each(operations)(
    '$method $path rechaza antes del proveedor y persistencia',
    async ({ method, path }) => {
      const { app, query, connect, verifyAccessToken } = fixture();
      const response = await app.request(
        path.replace(
          /:[A-Za-z_][A-Za-z0-9_]*/g,
          'abcdef01-2345-4678-abcd-0123456789ab',
        ),
        {
          method,
          headers: { 'X-Request-Id': 'access-contract' },
        },
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        error: { code: 'UNAUTHENTICATED', request_id: 'access-contract' },
      });
      expect(verifyAccessToken).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    },
  );
});
