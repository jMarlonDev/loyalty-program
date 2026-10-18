import { describe, expect, it, vi } from 'vitest';
import { SupabaseIdentityProvider } from '../../src/infrastructure/identity-provider.js';

const user = {
  id: 'dd4092e0-1951-47e0-af5c-bc0dbb94eaf8',
  email: 'customer@example.test',
  email_confirmed_at: '2026-10-18T12:00:00.000Z',
};
function setup(response: Response) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  const provider = new SupabaseIdentityProvider({
    url: 'https://project.supabase.co',
    apiKey: 'test-key',
    fetch: fetcher,
  });
  return { provider, fetcher };
}

describe('IDENTITY-001 Supabase verification adapter', () => {
  it('AC-001 verifies remotely and ignores role metadata', async () => {
    const { provider, fetcher } = setup(
      Response.json({ ...user, user_metadata: { role: 'owner' } }),
    );
    expect(await provider.verifyAccessToken('token')).toEqual({
      id: user.id,
      email: user.email,
      emailVerified: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/user',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: { apikey: 'test-key', Authorization: 'Bearer token' },
      }),
    );
  });
  it('AC-001 distinguishes unconfirmed email from phone confirmation', async () => {
    const { provider } = setup(
      Response.json({
        ...user,
        email_confirmed_at: null,
        confirmed_at: '2026-10-18T12:00:00Z',
      }),
    );
    expect((await provider.verifyAccessToken('token')).emailVerified).toBe(
      false,
    );
  });
  it.each([401, 403])(
    'AC-001 maps denied token %i without exposing provider body',
    async (status) => {
      const { provider } = setup(
        Response.json({ message: 'secret-provider-details' }, { status }),
      );
      await expect(
        provider.verifyAccessToken('secret-token'),
      ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    },
  );
  it.each([429, 500, 502])(
    'AC-005 treats provider %i as unavailable',
    async (status) => {
      const { provider } = setup(
        new Response('secret-provider-details', { status }),
      );
      await expect(provider.verifyAccessToken('token')).rejects.toMatchObject({
        status: 503,
        code: 'IDENTITY_UNAVAILABLE',
      });
    },
  );
  it.each([
    {},
    { ...user, id: 'not-a-uuid' },
    { ...user, email: null },
    { ...user, email: 'a'.repeat(256) },
    { ...user, email_confirmed_at: 123 },
  ])('AC-005 rejects malformed identity %j', async (body) => {
    const { provider } = setup(Response.json(body));
    await expect(provider.verifyAccessToken('token')).rejects.toMatchObject({
      status: 503,
      code: 'IDENTITY_UNAVAILABLE',
    });
  });
  it('AC-005 masks network failure and sets a request timeout', async () => {
    const { provider, fetcher } = setup(Response.json(user));
    fetcher.mockRejectedValue(new Error('secret-network-details'));
    await expect(provider.verifyAccessToken('token')).rejects.toMatchObject({
      status: 503,
      code: 'IDENTITY_UNAVAILABLE',
    });
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('AC-005 rejects invalid JSON', async () => {
    const { provider } = setup(new Response('not-json'));
    await expect(provider.verifyAccessToken('token')).rejects.toMatchObject({
      status: 503,
      code: 'IDENTITY_UNAVAILABLE',
    });
  });
});
