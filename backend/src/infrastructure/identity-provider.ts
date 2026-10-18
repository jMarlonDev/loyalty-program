import { AppError } from '../application/errors.js';
import type { IdentityProvider } from '../application/identity.js';
import type { VerifiedIdentity } from '../domain/identity.js';

interface SupabaseOptions {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class SupabaseIdentityProvider implements IdentityProvider {
  constructor(private readonly options: SupabaseOptions) {}
  async verifyAccessToken(token: string): Promise<VerifiedIdentity> {
    const unavailable = () =>
      new AppError(
        503,
        'IDENTITY_UNAVAILABLE',
        'El servicio de identidad no está disponible.',
      );
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(
        `${this.options.url.replace(/\/$/, '')}/auth/v1/user`,
        {
          method: 'GET',
          redirect: 'error',
          headers: {
            apikey: this.options.apiKey,
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
        },
      );
    } catch {
      throw unavailable();
    }
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        401,
        'UNAUTHENTICATED',
        'Se requiere una sesión válida.',
      );
    if (!response.ok) throw unavailable();
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw unavailable();
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      throw unavailable();
    const user = body as Record<string, unknown>;
    if (
      typeof user.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        user.id,
      ) ||
      typeof user.email !== 'string' ||
      user.email.length > 255 ||
      !/^[^\s@]+@[^\s@]+$/.test(user.email) ||
      user.email.includes('\u0000') ||
      (user.email_confirmed_at != null &&
        (typeof user.email_confirmed_at !== 'string' ||
          !Number.isFinite(Date.parse(user.email_confirmed_at))))
    )
      throw unavailable();
    return {
      id: user.id,
      email: user.email,
      emailVerified: typeof user.email_confirmed_at === 'string',
    };
  }
}
