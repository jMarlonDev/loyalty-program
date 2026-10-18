import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAuth } from '../../src/server/supabase-auth';

const user = {
  id: 'aaa',
  email: 'ana@example.test',
  user_metadata: { full_name: 'Ana' },
  app_metadata: { role: 'service_role' },
};
const tokens = {
  user,
  access_token: 'a',
  refresh_token: 'r',
  expires_in: 3600,
};
function setup(body: unknown = tokens, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  return {
    fetch,
    auth: createSupabaseAuth({
      url: 'https://project.supabase.co',
      apiKey: 'public-key',
      fetch,
    }),
  };
}
describe('AUTH Supabase adapter contract', () => {
  it('password grant y datos públicos limitados', async () => {
    const { auth, fetch } = setup();
    const data = await auth.login('ana@example.test', 'password123');
    expect(data.user).toEqual({
      id: 'aaa',
      email: 'ana@example.test',
      full_name: 'Ana',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          email: 'ana@example.test',
          password: 'password123',
        }),
      }),
    );
  });
  it('renovación y PKCE usan grants distintos', async () => {
    const { auth, fetch } = setup();
    await auth.refresh('r');
    expect(fetch.mock.calls[0][0]).toContain('grant_type=refresh_token');
    fetch.mockResolvedValueOnce(Response.json(tokens));
    await auth.exchange('code', 'verifier');
    expect(fetch.mock.calls[1][0]).toContain('grant_type=pkce');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      auth_code: 'code',
      code_verifier: 'verifier',
    });
  });
  it('signup pendiente y metadata nombre', async () => {
    const { auth, fetch } = setup(user);
    expect(
      await auth.signup('ana@example.test', 'password123', 'Ana'),
    ).toBeNull();
    expect(JSON.parse(fetch.mock.calls[0][1].body).data).toEqual({
      full_name: 'Ana',
    });
  });
  it.each([400, 401, 403, 422])(
    'credenciales inválidas %s no revelan mensajes del proveedor',
    async (status) => {
      const { auth } = setup({ error: 'secret-sensitive' }, status);
      await expect(auth.login('a', 'p')).rejects.toMatchObject({ status: 401 });
    },
  );
  it('fallo red y payload corrupto son indisponibilidad', async () => {
    const { auth, fetch } = setup({});
    await expect(auth.login('a', 'p')).rejects.toMatchObject({ status: 503 });
    fetch.mockRejectedValueOnce(new Error('sensitive'));
    await expect(auth.user('a')).rejects.toMatchObject({ status: 503 });
  });
  it('Google enlaza callback y challenge s256', () => {
    const { auth } = setup();
    const url = new URL(
      auth.googleUrl('https://loyalty.test/api/session/callback', 'challenge'),
    );
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(url.searchParams.get('redirect_to')).toBe(
      'https://loyalty.test/api/session/callback',
    );
  });
  it.each([
    ['email_not_confirmed', 400, 401, 'EMAIL_NOT_CONFIRMED'],
    ['signup_disabled', 422, 503, 'SIGNUP_DISABLED'],
    ['email_provider_disabled', 400, 503, 'EMAIL_PROVIDER_ERROR'],
    ['email_address_not_authorized', 400, 503, 'EMAIL_PROVIDER_ERROR'],
    ['weak_password', 422, 400, 'WEAK_PASSWORD'],
    ['over_email_send_rate_limit', 429, 429, 'RATE_LIMITED'],
    ['over_request_rate_limit', 429, 429, 'RATE_LIMITED'],
  ])(
    'AUTH-002 AC-001 interpreta %s sin exponer contenido externo',
    async (code, upstreamStatus, status, expectedCode) => {
      const { auth } = setup(
        { code, msg: 'private-provider-detail' },
        upstreamStatus,
      );
      const error = await auth
        .signup('ana@example.test', 'password123', 'Ana')
        .catch((error: unknown) => error);
      expect(error).toMatchObject({ status, code: expectedCode });
      expect(String(error)).not.toContain('private-provider-detail');
    },
  );
  it('AUTH-002 AC-001 admite error_code y respuesta no JSON de rate limit', async () => {
    const { auth, fetch } = setup(
      { error_code: 'email_not_confirmed', message: 'private' },
      400,
    );
    await expect(auth.login('a', 'p')).rejects.toMatchObject({
      code: 'EMAIL_NOT_CONFIRMED',
    });
    fetch.mockResolvedValueOnce(
      new Response('private-gateway', { status: 429 }),
    );
    await expect(auth.login('a', 'p')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });
});
