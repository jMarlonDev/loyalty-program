import {
  cookieName,
  readCookie,
  SessionError,
  sameOrigin,
  sessionFailure,
} from './session';
export function createApiBridge(options: {
  app: {
    fetch: (
      request: Request,
      connection?: { remoteAddress?: string },
    ) => Promise<Response> | Response;
  };
  origin: string;
}) {
  const secure = options.origin.startsWith('https:');
  return async (request: Request): Promise<Response> => {
    const headers = new Headers(request.headers);
    const access = readCookie(request, cookieName('access', secure));
    if (!headers.has('authorization') && access) {
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        !sameOrigin(request, options.origin)
      )
        return sessionFailure(
          new SessionError(403, 'Origen de solicitud no permitido.'),
        );
      headers.set('authorization', `Bearer ${access}`);
    }
    headers.delete('cookie');
    // These properties come from the server adapter, never HTTP forwarding headers.
    const incoming = request as Request & {
      ip?: string;
      context?: { clientAddress?: string };
    };
    const remoteAddress = incoming.context?.clientAddress ?? incoming.ip;
    // srvx Request implements Web APIs without Undici's private fields. Build
    // from public properties instead of passing it to Undici's copy constructor.
    const init: RequestInit & { duplex: 'half' } = {
      method: request.method,
      headers,
      body: request.body,
      signal: request.signal,
      duplex: 'half',
    };
    const response = await options.app.fetch(
      new Request(request.url, init),
      remoteAddress ? { remoteAddress } : {},
    );
    const result = new Response(response.body, response);
    result.headers.set('cache-control', 'no-store');
    result.headers.append('vary', 'Cookie');
    return result;
  };
}
