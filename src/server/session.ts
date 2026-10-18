import { createHash, randomBytes } from 'node:crypto';
export interface PublicUser {
  id: string;
  email: string;
  full_name?: string;
}
export interface TokenSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: PublicUser;
}
export interface SessionAuth {
  login(email: string, password: string): Promise<TokenSession>;
  signup(
    email: string,
    password: string,
    fullName: string,
    confirmation?: { redirect: string; challenge: string },
  ): Promise<TokenSession | null>;
  user(accessToken: string): Promise<PublicUser>;
  refresh(refreshToken: string): Promise<TokenSession>;
  logout(accessToken: string): Promise<void>;
  recover(email: string, redirect: string, challenge: string): Promise<void>;
  updatePassword(accessToken: string, password: string): Promise<void>;
  exchange(code: string, verifier: string): Promise<TokenSession>;
  googleUrl(redirect: string, challenge: string): string;
}
export interface SessionOptions {
  auth: SessionAuth;
  origin: string;
  secure?: boolean;
}

export class SessionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = status === 401 ? 'UNAUTHENTICATED' : 'SESSION_ERROR',
  ) {
    super(message);
  }
}
export function cookieName(name: string, secure: boolean) {
  return `${secure ? '__Host-' : ''}loyalty-${name}`;
}
export function readCookie(request: Request, name: string): string | undefined {
  const pair = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`));
  if (!pair) return undefined;
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return undefined;
  }
}
function cookie(name: string, value: string, seconds: number, secure: boolean) {
  return `${cookieName(name, secure)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(seconds)}${secure ? '; Secure' : ''}`;
}
export function sessionCookies(
  session: TokenSession,
  secure: boolean,
): string[] {
  return [
    cookie(
      'access',
      session.access_token,
      Math.max(0, Math.min(session.expires_in, 86400)),
      secure,
    ),
    cookie('refresh', session.refresh_token, 60 * 60 * 24 * 400, secure),
  ];
}
export function clearSessionCookies(secure: boolean): string[] {
  return ['access', 'refresh', 'verifier', 'next'].map((name) =>
    cookie(name, '', 0, secure),
  );
}
export function sameOrigin(request: Request, origin: string) {
  return (
    request.headers.get('origin') === origin &&
    request.headers.get('sec-fetch-site') !== 'cross-site'
  );
}
export function safeNext(value: string | null | undefined): string {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32)
    ? value
    : '/app';
}
function json(data: unknown, status = 200, cookies: string[] = []) {
  const response = Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
  });
  for (const value of cookies) response.headers.append('set-cookie', value);
  return response;
}
export function sessionFailure(error: unknown) {
  const known = error instanceof SessionError;
  return json(
    {
      error: {
        code: known ? error.code : 'SESSION_ERROR',
        message: known
          ? error.message
          : 'El servicio de identidad no está disponible.',
      },
    },
    known ? error.status : 503,
  );
}
export function createSessionHandler(options: SessionOptions) {
  const secure = options.secure ?? options.origin.startsWith('https:');
  const get = (request: Request, name: string) =>
    readCookie(request, cookieName(name, secure));
  const token = (request: Request) => {
    const value = get(request, 'access');
    if (!value) throw new SessionError(401, 'Inicia sesión para continuar.');
    return value;
  };
  const redirect = (location: string, cookies: string[]) => {
    const result = new Response(null, {
      status: 302,
      headers: { location, 'Cache-Control': 'no-store' },
    });
    for (const value of cookies) result.headers.append('set-cookie', value);
    return result;
  };
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/api/session/google') {
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url');
        return redirect(
          options.auth.googleUrl(
            `${options.origin}/api/session/callback`,
            challenge,
          ),
          [
            cookie('verifier', verifier, 600, secure),
            cookie('next', safeNext(url.searchParams.get('next')), 600, secure),
          ],
        );
      }
      if (
        request.method === 'GET' &&
        url.pathname === '/api/session/callback'
      ) {
        const callbackFailure = (error: string) =>
          redirect(
            `/auth?${new URLSearchParams({
              error,
              next: safeNext(get(request, 'next')),
            })}`,
            [cookie('verifier', '', 0, secure), cookie('next', '', 0, secure)],
          );
        const providerError = url.searchParams.get('error');
        if (providerError)
          return callbackFailure(
            providerError === 'access_denied'
              ? 'AUTH_CANCELLED'
              : 'AUTH_UNAVAILABLE',
          );
        const code = url.searchParams.get('code');
        const verifier = get(request, 'verifier');
        if (!code || !verifier) return callbackFailure('AUTH_LINK_EXPIRED');
        let session: TokenSession;
        try {
          session = await options.auth.exchange(code, verifier);
        } catch (error) {
          return callbackFailure(
            error instanceof SessionError &&
              [400, 401, 403, 422].includes(error.status)
              ? 'AUTH_LINK_EXPIRED'
              : 'AUTH_UNAVAILABLE',
          );
        }
        return redirect(safeNext(get(request, 'next')), [
          ...sessionCookies(session, secure),
          cookie('verifier', '', 0, secure),
          cookie('next', '', 0, secure),
        ]);
      }
      if (url.pathname !== '/api/session')
        return json(
          { error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } },
          404,
        );
      if (request.method === 'GET')
        return json({
          data: { user: await options.auth.user(token(request)) },
        });
      if (request.method !== 'POST')
        return json(
          {
            error: {
              code: 'METHOD_NOT_ALLOWED',
              message: 'Método no permitido.',
            },
          },
          405,
        );
      if (!sameOrigin(request, options.origin))
        throw new SessionError(403, 'Origen de solicitud no permitido.');
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new SessionError(400, 'Se requiere JSON válido.');
      const reader = request.body?.getReader();
      let raw = '';
      let bytes = 0;
      const decoder = new TextDecoder();
      if (reader) {
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 8192) {
              await reader.cancel();
              throw new SessionError(413, 'La solicitud es demasiado grande.');
            }
            raw += decoder.decode(chunk.value, { stream: true });
          }
          raw += decoder.decode();
        } finally {
          reader.releaseLock();
        }
      }
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(raw);
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new Error();
      } catch {
        throw new SessionError(400, 'Se requiere JSON válido.');
      }
      const action = input.action;
      if (action === 'logout') {
        let access = get(request, 'access');
        try {
          const refresh = get(request, 'refresh');
          if (!access && refresh)
            access = (await options.auth.refresh(refresh)).access_token;
          if (access) await options.auth.logout(access);
        } catch (error) {
          if (error instanceof SessionError && error.status === 401)
            return json(
              { data: { user: null } },
              200,
              clearSessionCookies(secure),
            );
          const response = sessionFailure(error);
          response.headers.set('X-Session-Cleared', '1');
          for (const value of clearSessionCookies(secure))
            response.headers.append('set-cookie', value);
          return response;
        }
        return json({ data: { user: null } }, 200, clearSessionCookies(secure));
      }
      if (action === 'refresh') {
        const refresh = get(request, 'refresh');
        if (!refresh)
          throw new SessionError(401, 'Inicia sesión para continuar.');
        const session = await options.auth.refresh(refresh);
        return json(
          { data: { user: session.user } },
          200,
          sessionCookies(session, secure),
        );
      }
      if (action === 'password') {
        if (
          typeof input.password !== 'string' ||
          input.password.length < 8 ||
          input.password.length > 256
        )
          throw new SessionError(
            400,
            'Usa una contraseña de entre 8 y 256 caracteres.',
          );
        await options.auth.updatePassword(token(request), input.password);
        return json({ data: { updated: true } });
      }
      if (!['login', 'signup', 'recover'].includes(String(action)))
        throw new SessionError(400, 'Acción desconocida.');
      if (
        typeof input.email !== 'string' ||
        input.email.length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
      )
        throw new SessionError(400, 'Escribe un correo válido.');
      if (action === 'recover') {
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url');
        await options.auth.recover(
          input.email,
          `${options.origin}/api/session/callback`,
          challenge,
        );
        return json({ data: { sent: true } }, 200, [
          cookie('verifier', verifier, 600, secure),
          cookie('next', '/auth?mode=reset', 600, secure),
        ]);
      }
      if (
        typeof input.password !== 'string' ||
        input.password.length < (action === 'login' ? 1 : 8) ||
        input.password.length > 256
      )
        throw new SessionError(
          400,
          'Revisa la contraseña. Usa al menos 8 caracteres al registrarte.',
        );
      if (
        action === 'signup' &&
        (typeof input.full_name !== 'string' ||
          input.full_name.trim().length < 1 ||
          input.full_name.length > 255)
      )
        throw new SessionError(400, 'Escribe tu nombre.');
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256')
        .update(verifier)
        .digest('base64url');
      const session =
        action === 'login'
          ? await options.auth.login(input.email, input.password)
          : await options.auth.signup(
              input.email,
              input.password,
              (input.full_name as string).trim(),
              { redirect: `${options.origin}/api/session/callback`, challenge },
            );
      return json(
        {
          data: { user: session?.user ?? null, confirmationRequired: !session },
        },
        200,
        session
          ? sessionCookies(session, secure)
          : [
              cookie('verifier', verifier, 600, secure),
              cookie(
                'next',
                safeNext(
                  typeof input.next === 'string' ? input.next : undefined,
                ),
                600,
                secure,
              ),
            ],
      );
    } catch (error) {
      return sessionFailure(error);
    }
  };
}
