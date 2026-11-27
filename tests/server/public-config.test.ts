import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../../src/server/runtime';

vi.mock('dotenv', () => ({ config: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

describe('MOBILE-001 origen canónico para enlaces compartidos', () => {
  it('AC-005 publica LAN en desarrollo y la rechaza en producción', async () => {
    vi.stubEnv('APP_ORIGIN', 'http://192.168.33.9:3000');
    vi.stubEnv('NODE_ENV', 'development');
    const request = new Request('http://internal/api/public-config');
    const response = await handleApi(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { appOrigin: 'http://192.168.33.9:3000' },
    });
    vi.stubEnv('NODE_ENV', 'production');
    expect((await handleApi(request)).status).toBe(503);
  });
  it('publica únicamente APP_ORIGIN sin exigir DB ni confiar en Host', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://lealtad.example.com');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'private-test-value');
    const response = await handleApi(
      new Request('https://internal.example/api/public-config', {
        headers: { 'x-forwarded-host': 'evil.example' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { appOrigin: 'https://lealtad.example.com' },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
  it.each([
    '',
    'http://public.example',
    'https://user:secret@example.com',
    'https://example.com/path',
  ])(
    'rechaza configuración pública inválida sin reflejarla: %s',
    async (origin) => {
      vi.stubEnv('APP_ORIGIN', origin);
      const response = await handleApi(
        new Request('http://localhost/api/public-config'),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: {
          code: 'CONFIGURATION_ERROR',
          message:
            'No se pudo obtener la dirección de la aplicación. Contacta al administrador.',
        },
      });
    },
  );
});
