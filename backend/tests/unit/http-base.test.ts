import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/application/errors.js';
import { createBaseApp } from '../../src/presentation/http/base-app.js';

describe('CORE-001 HTTP base', () => {
  it('AC-002 serves health without accessing database', async () => {
    const checkDatabase = vi.fn(async () => {});
    const response = await createBaseApp({ checkDatabase }).request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: 'ok' } });
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it('AC-002 serves readiness after checking database', async () => {
    const checkDatabase = vi.fn(async () => {});
    const response = await createBaseApp({ checkDatabase }).request('/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: 'ready' } });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it('AC-002 does not leak dependency failure', async () => {
    const app = createBaseApp({
      checkDatabase: async () => {
        throw new Error('postgres://secret');
      },
    });
    const response = await app.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
        request_id: response.headers.get('x-request-id'),
      },
    });
  });

  it('AC-003 preserves safe client correlation', async () => {
    const app = createBaseApp({ checkDatabase: async () => {} });
    const response = await app.request('/health', {
      headers: { 'X-Request-Id': 'request_123-abc' },
    });
    expect(response.headers.get('x-request-id')).toBe('request_123-abc');
  });

  it.each([undefined, '<script>', 'a'.repeat(65)])(
    'AC-003 generates correlation for absent or invalid IDs',
    async (requestId) => {
      const app = createBaseApp({ checkDatabase: async () => {} });
      const response = await app.request('/health', {
        headers: requestId ? { 'X-Request-Id': requestId } : {},
      });
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it('AC-004 returns safe errors for unexpected exceptions', async () => {
    const app = createBaseApp({ checkDatabase: async () => {} });
    app.get('/unexpected', () => {
      throw new Error('password=secret');
    });
    const response = await app.request('/unexpected');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        request_id: response.headers.get('x-request-id'),
      },
    });
  });

  it('AC-004 returns controlled errors with correlation', async () => {
    const app = createBaseApp({ checkDatabase: async () => {} });
    app.get('/denied', () => {
      throw new AppError(403, 'FORBIDDEN', 'Access denied');
    });
    const response = await app.request('/denied', {
      headers: { 'X-Request-Id': 'req-1' },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied',
        request_id: 'req-1',
      },
    });
    expect(response.headers.get('x-request-id')).toBe('req-1');
  });

  it('AC-004 returns JSON for missing routes', async () => {
    const response = await createBaseApp({
      checkDatabase: async () => {},
    }).request('/missing');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        request_id: response.headers.get('x-request-id'),
      },
    });
  });
});
