import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { NodeRequest } from 'srvx/node';
import { describe, expect, it, vi } from 'vitest';
import { createApiBridge } from '../../src/server/bridge';
import { handleApi } from '../../src/server/runtime';

vi.mock('dotenv', () => ({ config: vi.fn() }));

describe('STACK-001 integración del transporte en Start', () => {
  it.each([
    ['/join/example', '/join/example'],
    ['https://evil.test/private', '/app'],
  ])(
    'AUTH-002 AC-004 Google sin configuración conserva destino local %s',
    async (next, expected) => {
      vi.stubEnv('APP_ORIGIN', 'private-invalid-origin');
      try {
        const response = await handleApi(
          new Request(
            `http://localhost/api/session/google?${new URLSearchParams({ next })}`,
          ),
        );
        expect(response.status).toBe(302);
        const location = new URL(
          response.headers.get('location') ?? '',
          'http://localhost',
        );
        expect(location.pathname).toBe('/auth');
        expect(location.searchParams.get('error')).toBe('AUTH_UNAVAILABLE');
        expect(location.searchParams.get('next')).toBe(expected);
        expect(response.headers.getSetCookie()).toHaveLength(0);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
  it('AUTH-002 AC-003 configuración inválida explica preparación sin divulgar valores', async () => {
    vi.stubEnv('APP_ORIGIN', 'private-invalid-origin');
    try {
      const response = await handleApi(
        new Request('http://localhost/api/session'),
      );
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe('CONFIGURATION_ERROR');
      expect(body.error.message).toContain('configurado');
      expect(JSON.stringify(body)).not.toContain('private-invalid-origin');
      expect(response.headers.getSetCookie()).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('normaliza Request del adaptador Node de Nitro sin perder método ni JSON', async () => {
    const req = new IncomingMessage(new Socket());
    req.method = 'POST';
    req.url = '/api/v1/profiles';
    req.headers = {
      host: 'localhost',
      'content-type': 'application/json',
      'transfer-encoding': 'chunked',
    };
    req.push(JSON.stringify({ full_name: 'Cliente' }));
    req.push(null);
    const request = new NodeRequest({ req });
    const bridge = createApiBridge({
      app: {
        fetch: async (input) =>
          Response.json({ method: input.method, body: await input.json() }),
      },
      origin: 'http://localhost',
    });
    const response = await bridge(request);
    expect(await response.json()).toEqual({
      method: 'POST',
      body: { full_name: 'Cliente' },
    });
    req.destroy();
  });
  it('conserva correlación y envelope de salud sin configuración externa', async () => {
    const response = await handleApi(
      new Request('http://localhost/health', {
        headers: { 'X-Request-Id': 'health-test' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: 'ok' } });
    expect(response.headers.get('X-Request-Id')).toBe('health-test');
  });
  it('salud conserva HEAD sin cuerpo y rechaza POST desconocido', async () => {
    expect(
      await (
        await handleApi(
          new Request('http://localhost/health', { method: 'HEAD' }),
        )
      ).text(),
    ).toBe('');
    expect(
      (
        await handleApi(
          new Request('http://localhost/health', { method: 'POST' }),
        )
      ).status,
    ).toBe(404);
  });
  it('preserva IP del adaptador sin confiar en X-Forwarded-For', async () => {
    const fetch = vi.fn(async () => Response.json({ data: true }));
    const bridge = createApiBridge({
      app: { fetch },
      origin: 'http://localhost',
    });
    const request = new Request('http://localhost/api/v1/me', {
      headers: { 'x-forwarded-for': 'attacker' },
    });
    Object.defineProperty(request, 'ip', { value: '127.0.0.2' });
    await bridge(request);
    expect(fetch).toHaveBeenCalledWith(expect.any(Request), {
      remoteAddress: '127.0.0.2',
    });
  });
});
