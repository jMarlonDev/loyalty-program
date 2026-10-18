import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIdentityService,
  type ProfileRepository,
} from '../../src/application/identity.js';
import type { Profile, VerifiedIdentity } from '../../src/domain/identity.js';

const identity: VerifiedIdentity = {
  id: 'dd4092e0-1951-47e0-af5c-bc0dbb94eaf8',
  email: 'customer@example.test',
  emailVerified: true,
};
const now = new Date('2026-10-18T12:00:00.000Z');

function setup() {
  const records = new Map<string, Profile>();
  const profiles: ProfileRepository = {
    createIfAbsent: vi.fn(async (profile) => {
      const existing = records.get(profile.id);
      if (existing) return { profile: existing, created: false };
      records.set(profile.id, profile);
      return { profile, created: true };
    }),
    findById: vi.fn(async (id) => records.get(id) ?? null),
    updateActive: vi.fn(async (id, patch, updated_at) => {
      const profile = records.get(id);
      if (!profile) return null;
      if (profile.status !== 'active') return profile;
      const updated = { ...profile, ...patch, updated_at };
      records.set(id, updated);
      return updated;
    }),
  };
  const identityProvider = { verifyAccessToken: vi.fn(async () => identity) };
  const service = createIdentityService({
    profiles,
    identityProvider,
    now: () => now,
  });
  return { service, profiles, records, identityProvider };
}

describe('IDENTITY-001 identity and own profile', () => {
  let context: ReturnType<typeof setup>;
  beforeEach(() => {
    context = setup();
  });

  it('AC-001 authenticates only through the verified provider identity', async () => {
    expect(await context.service.authenticate('Bearer access-token')).toEqual(
      identity,
    );
    expect(context.identityProvider.verifyAccessToken).toHaveBeenCalledWith(
      'access-token',
    );
  });

  it.each([undefined, '', 'Basic access-token', 'Bearer ', 'Bearer a b'])(
    'AC-001 rejects malformed authentication %s',
    async (header) => {
      await expect(context.service.authenticate(header)).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
      expect(context.identityProvider.verifyAccessToken).not.toHaveBeenCalled();
      expect(context.records.size).toBe(0);
    },
  );

  it('AC-001 rejects unverified email without persisting', async () => {
    context.identityProvider.verifyAccessToken.mockResolvedValue({
      ...identity,
      emailVerified: false,
    });
    await expect(
      context.service.authenticate('Bearer token'),
    ).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
    await expect(
      context.service.register(
        { ...identity, emailVerified: false },
        { full_name: 'Ana' },
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(context.profiles.createIfAbsent).not.toHaveBeenCalled();
  });

  it('AC-002 creates once, captures verified id/email and preserves fields on retry', async () => {
    const first = await context.service.register(identity, {
      full_name: ' Ana ',
      phone: ' +573001234567 ',
    });
    expect(first).toEqual({
      created: true,
      profile: {
        id: identity.id,
        email: identity.email,
        full_name: 'Ana',
        phone: '+573001234567',
        status: 'active',
        created_at: now,
        updated_at: now,
      },
    });
    const second = await context.service.register(identity, {
      full_name: 'Other',
    });
    expect(second.created).toBe(false);
    expect(second.profile).toEqual(first.profile);
    expect(context.records.size).toBe(1);
  });

  it('AC-002 never merges distinct subjects by their email', async () => {
    await context.service.register(identity, { full_name: 'Ana' });
    await context.service.register(
      { ...identity, id: '16171e51-2162-420a-a5c5-0b3eb0817ad8' },
      { full_name: 'Other' },
    );
    expect(context.records.size).toBe(2);
  });

  it('AC-003 reads and edits only own profile, preserves omitted fields and clears phone', async () => {
    await context.service.register(identity, {
      full_name: 'Ana',
      phone: '+573001234567',
    });
    expect((await context.service.getMe(identity)).id).toBe(identity.id);
    const edited = await context.service.updateMe(identity, { phone: null });
    expect(edited).toMatchObject({
      id: identity.id,
      full_name: 'Ana',
      phone: null,
    });
    const renamed = await context.service.updateMe(identity, {
      full_name: ' Ana María ',
    });
    expect(renamed.full_name).toBe('Ana María');
    expect(context.profiles.updateActive).toHaveBeenLastCalledWith(
      identity.id,
      { full_name: 'Ana María' },
      now,
    );
  });

  it.each([
    null,
    [],
    {},
    { full_name: '' },
    { full_name: 'a'.repeat(256) },
    { full_name: 'Ana', phone: '1'.repeat(21) },
    { full_name: 'Ana', phone: '' },
    { full_name: 'Ana', phone: 1 },
    { full_name: 'Ana', id: 'other' },
    { full_name: 'Ana', email: 'attacker@test' },
    { full_name: 'Ana', role: 'owner' },
    { full_name: 'Ana', password: 'secret' },
  ])(
    'AC-003 rejects invalid registration without effects: %j',
    async (body) => {
      await expect(
        context.service.register(identity, body),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
      expect(context.profiles.createIfAbsent).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { status: 'active' }, { full_name: null }, { phone: false }])(
    'AC-003 rejects invalid patch without effects: %j',
    async (body) => {
      await expect(
        context.service.updateMe(identity, body),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
      expect(context.profiles.updateActive).not.toHaveBeenCalled();
    },
  );

  it('AC-003 returns 404 for a missing own profile', async () => {
    await expect(context.service.getMe(identity)).rejects.toMatchObject({
      status: 404,
      code: 'PROFILE_NOT_FOUND',
    });
    await expect(
      context.service.updateMe(identity, { full_name: 'Ana' }),
    ).rejects.toMatchObject({ status: 404, code: 'PROFILE_NOT_FOUND' });
  });

  it.each(['suspended', 'closed'] as const)(
    'AC-004 refuses read, update and repeated registration for %s profile',
    async (status) => {
      context.records.set(identity.id, {
        id: identity.id,
        email: identity.email,
        full_name: 'Ana',
        phone: null,
        status,
        created_at: now,
        updated_at: now,
      });
      await expect(context.service.getMe(identity)).rejects.toMatchObject({
        status: 403,
        code: 'PROFILE_INACTIVE',
      });
      await expect(
        context.service.register(identity, { full_name: 'Reactivated' }),
      ).rejects.toMatchObject({ status: 403, code: 'PROFILE_INACTIVE' });
      await expect(
        context.service.updateMe(identity, { full_name: 'Updated' }),
      ).rejects.toMatchObject({ status: 403, code: 'PROFILE_INACTIVE' });
      expect(context.records.get(identity.id)).toMatchObject({
        status,
        full_name: 'Ana',
      });
    },
  );
});
