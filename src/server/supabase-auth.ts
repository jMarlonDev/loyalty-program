import {
  type PublicUser,
  type SessionAuth,
  SessionError,
  type TokenSession,
} from './session';

interface Options {
  url: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
function publicUser(value: unknown): PublicUser {
  if (!value || typeof value !== 'object')
    throw new SessionError(503, 'Respuesta de identidad inválida.');
  const user = value as Record<string, unknown>;
  if (typeof user.id !== 'string' || typeof user.email !== 'string')
    throw new SessionError(503, 'Respuesta de identidad inválida.');
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  return {
    id: user.id,
    email: user.email,
    ...(typeof metadata?.full_name === 'string'
      ? { full_name: metadata.full_name }
      : {}),
  };
}
function tokenSession(value: unknown): TokenSession {
  const data = value as Record<string, unknown>;
  if (
    !data ||
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    typeof data.expires_in !== 'number' ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  )
    throw new SessionError(503, 'Respuesta de identidad inválida.');
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    user: publicUser(data.user),
  };
}
export function createSupabaseAuth(options: Options): SessionAuth {
  const base = `${options.url.replace(/\/$/, '')}/auth/v1`;
  async function request(
    path: string,
    method: string,
    body?: unknown,
    access?: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(`${base}${path}`, {
        method,
        redirect: 'error',
        headers: {
          apikey: options.apiKey,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(access ? { authorization: `Bearer ${access}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      });
    } catch {
      throw new SessionError(
        503,
        'El servicio de identidad no está disponible.',
      );
    }
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const error =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      const code =
        typeof error.code === 'string' ? error.code : error.error_code;
      if (code === 'email_not_confirmed')
        throw new SessionError(
          401,
          'Confirma tu correo desde el enlace que recibiste antes de iniciar sesión.',
          'EMAIL_NOT_CONFIRMED',
        );
      if (code === 'signup_disabled')
        throw new SessionError(
          503,
          'El registro de cuentas está deshabilitado. Contacta al administrador.',
          'SIGNUP_DISABLED',
        );
      if (
        code === 'email_provider_disabled' ||
        code === 'email_address_not_authorized'
      )
        throw new SessionError(
          503,
          'El servicio de correo aún no está habilitado para completar el registro. Contacta al administrador.',
          'EMAIL_PROVIDER_ERROR',
        );
      if (code === 'weak_password')
        throw new SessionError(
          400,
          'La contraseña no cumple los requisitos de seguridad. Prueba una contraseña más larga con letras, números y símbolos.',
          'WEAK_PASSWORD',
        );
      if (
        response.status === 429 ||
        code === 'over_email_send_rate_limit' ||
        code === 'over_request_rate_limit'
      )
        throw new SessionError(
          429,
          'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
          'RATE_LIMITED',
        );
      if ([400, 401, 403, 422].includes(response.status))
        throw new SessionError(
          401,
          'No se pudo validar el acceso. Revisa tus datos o confirma tu correo.',
        );
      throw new SessionError(
        503,
        'El servicio de identidad no está disponible.',
      );
    }
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new SessionError(503, 'Respuesta de identidad inválida.');
    }
  }
  return {
    async login(email, password) {
      return tokenSession(
        await request('/token?grant_type=password', 'POST', {
          email,
          password,
        }),
      );
    },
    async signup(email, password, fullName, confirmation) {
      const path = confirmation
        ? `/signup?redirect_to=${encodeURIComponent(confirmation.redirect)}`
        : '/signup';
      const data = (await request(path, 'POST', {
        email,
        password,
        data: { full_name: fullName },
        ...(confirmation
          ? {
              code_challenge: confirmation.challenge,
              code_challenge_method: 's256',
            }
          : {}),
      })) as Record<string, unknown>;
      return data?.access_token ? tokenSession(data) : null;
    },
    async user(access) {
      return publicUser(await request('/user', 'GET', undefined, access));
    },
    async refresh(refresh_token) {
      return tokenSession(
        await request('/token?grant_type=refresh_token', 'POST', {
          refresh_token,
        }),
      );
    },
    async logout(access) {
      await request('/logout?scope=local', 'POST', undefined, access);
    },
    async recover(email, redirect, challenge) {
      await request(
        `/recover?redirect_to=${encodeURIComponent(redirect)}`,
        'POST',
        { email, code_challenge: challenge, code_challenge_method: 's256' },
      );
    },
    async updatePassword(access, password) {
      await request('/user', 'PUT', { password }, access);
    },
    async exchange(auth_code, code_verifier) {
      return tokenSession(
        await request('/token?grant_type=pkce', 'POST', {
          auth_code,
          code_verifier,
        }),
      );
    },
    googleUrl(redirect, challenge) {
      const url = new URL(`${base}/authorize`);
      url.search = new URLSearchParams({
        provider: 'google',
        redirect_to: redirect,
        code_challenge: challenge,
        code_challenge_method: 's256',
      }).toString();
      return url.href;
    },
  };
}
