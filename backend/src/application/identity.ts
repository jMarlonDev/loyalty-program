import type {
  Profile,
  ProfilePatch,
  VerifiedIdentity,
} from '../domain/identity.js';
import { AppError } from './errors.js';

export interface IdentityProvider {
  verifyAccessToken(token: string): Promise<VerifiedIdentity>;
}

export interface ProfileRepository {
  createIfAbsent(
    profile: Profile,
  ): Promise<{ profile: Profile; created: boolean }>;
  findById(id: string): Promise<Profile | null>;
  updateActive(
    id: string,
    patch: ProfilePatch,
    now: Date,
  ): Promise<Profile | null>;
}

export interface IdentityDependencies {
  identityProvider: IdentityProvider;
  profiles: ProfileRepository;
  now?: () => Date;
}

function requireVerified(identity: VerifiedIdentity) {
  if (!identity.emailVerified)
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'El correo debe estar verificado.',
    );
}

function requireActive(profile: Profile | null): Profile {
  if (!profile)
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'No existe el perfil.');
  if (profile.status !== 'active')
    throw new AppError(403, 'PROFILE_INACTIVE', 'El perfil no está activo.');
  return profile;
}

function parseProfile(body: unknown, registration: boolean): ProfilePatch {
  const invalid = () =>
    new AppError(
      400,
      'INVALID_INPUT',
      'Nombre o teléfono inválidos; no se permiten otros campos.',
    );
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw invalid();
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== 'full_name' && key !== 'phone')
  )
    throw invalid();
  const patch: ProfilePatch = {};
  if (registration || Object.hasOwn(input, 'full_name')) {
    if (typeof input.full_name !== 'string') throw invalid();
    const fullName = input.full_name.trim();
    if (
      fullName.length < 1 ||
      fullName.length > 255 ||
      fullName.includes('\u0000')
    )
      throw invalid();
    patch.full_name = fullName;
  }
  if (Object.hasOwn(input, 'phone')) {
    if (input.phone === null) patch.phone = null;
    else {
      if (typeof input.phone !== 'string') throw invalid();
      const phone = input.phone.trim();
      if (phone.length < 1 || phone.length > 20 || phone.includes('\u0000'))
        throw invalid();
      patch.phone = phone;
    }
  }
  return patch;
}

export function createIdentityService(deps: IdentityDependencies) {
  const now = deps.now ?? (() => new Date());
  return {
    async authenticate(
      authorization: string | undefined,
    ): Promise<VerifiedIdentity> {
      const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
      if (!match?.[1])
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Se requiere una sesión válida.',
        );
      const identity = await deps.identityProvider.verifyAccessToken(match[1]);
      requireVerified(identity);
      return identity;
    },
    async register(
      identity: VerifiedIdentity,
      body: unknown,
    ): Promise<{ profile: Profile; created: boolean }> {
      requireVerified(identity);
      const patch = parseProfile(body, true);
      const date = now();
      const result = await deps.profiles.createIfAbsent({
        id: identity.id,
        email: identity.email,
        full_name: patch.full_name as string,
        phone: patch.phone ?? null,
        status: 'active',
        created_at: date,
        updated_at: date,
      });
      requireActive(result.profile);
      return result;
    },
    async getMe(identity: VerifiedIdentity): Promise<Profile> {
      requireVerified(identity);
      return requireActive(await deps.profiles.findById(identity.id));
    },
    async updateMe(
      identity: VerifiedIdentity,
      body: unknown,
    ): Promise<Profile> {
      requireVerified(identity);
      const patch = parseProfile(body, false);
      return requireActive(
        await deps.profiles.updateActive(identity.id, patch, now()),
      );
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
