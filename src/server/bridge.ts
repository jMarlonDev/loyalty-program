import { createCustomerCookie } from './customer-cookie';
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
  development?: boolean;
}) {
  const secure = options.origin.startsWith('https:');
  const customerCookie = createCustomerCookie({
    origin: options.origin,
    development: options.development,
  });
  // NEXT-006: identificador opaco del dispositivo para limitar intentos de
  // inscripción. No autentica a nadie; solo agrupa intentos por navegador.
  const deviceCookie = secure ? '__Host-loyalty_device' : 'loyalty_device_dev';
  return async (request: Request): Promise<Response> => {
    const headers = new Headers(request.headers);
    headers.delete('x-customer-session');
    headers.delete('x-loyalty-device');
    headers.delete('x-loyalty-client-address');
    let device = readCookie(request, deviceCookie);
    let newDevice: string | undefined;
    if (!device || !/^[A-Za-z0-9_-]{43}$/.test(device)) {
      newDevice = Buffer.from(
        crypto.getRandomValues(new Uint8Array(32)),
      ).toString('base64url');
      device = newDevice;
    }
    headers.set('x-loyalty-device', device);
    const customer = customerCookie.read(request);
    if (customer) headers.set('x-customer-session', customer);
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
    if (remoteAddress) headers.set('x-loyalty-client-address', remoteAddress);
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
    const issued = response.headers.get('x-customer-token');
    if (issued) {
      const expires = response.headers.get('x-customer-expires');
      const expiresAt = expires ? new Date(expires) : new Date(0);
      if (Number.isFinite(expiresAt.getTime()))
        result.headers.append(
          'set-cookie',
          customerCookie.issue(issued, expiresAt, new Date()),
        );
    }
    if (newDevice)
      result.headers.append(
        'set-cookie',
        `${deviceCookie}=${newDevice}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000${secure ? '; Secure' : ''}`,
      );
    if (response.headers.has('x-customer-clear'))
      result.headers.append('set-cookie', customerCookie.clear());
    result.headers.delete('x-customer-token');
    result.headers.delete('x-customer-expires');
    result.headers.delete('x-customer-clear');
    result.headers.set('cache-control', 'no-store');
    result.headers.append('vary', 'Cookie');
    return result;
  };
}
