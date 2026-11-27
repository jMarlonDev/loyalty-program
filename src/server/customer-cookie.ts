import { parseAppOrigin } from '../lib/public-origin';

export const CUSTOMER_SESSION_MAX_AGE = 400 * 24 * 60 * 60;

function isSessionToken(value: string): boolean {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, 'base64url').toString('base64url') === value
  );
}

/** Transport only: identity, hashing, expiry and revocation live on the server. */
export function createCustomerCookie(options: {
  origin: string;
  development?: boolean;
}) {
  let secure: boolean;
  try {
    const origin = parseAppOrigin(options.origin, {
      allowPrivateHttp: options.development === true,
    });
    secure = origin.startsWith('https:');
    if (!secure && options.development !== true) throw new Error();
  } catch {
    throw new Error('Invalid customer cookie configuration');
  }
  const name = secure ? '__Host-loyalty_customer' : 'loyalty_customer_dev';
  const serialize = (value: string, seconds: number) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;

  return {
    name,
    read(request: Request): string | undefined {
      const matches = (request.headers.get('cookie') ?? '')
        .split(';')
        .map((entry) => entry.trim())
        .filter((entry) => entry.split('=', 1)[0]?.trim() === name);
      if (matches.length !== 1 || !matches[0]?.startsWith(`${name}=`))
        return undefined;
      const value = matches[0].slice(name.length + 1);
      return isSessionToken(value) ? value : undefined;
    },
    issue(token: string, expiresAt: Date, now: Date): string {
      if (!isSessionToken(token))
        throw new Error('Invalid customer session token');
      const remaining = Math.floor(
        (expiresAt.getTime() - now.getTime()) / 1000,
      );
      if (!Number.isFinite(remaining) || remaining <= 0)
        throw new Error('Invalid customer session expiry');
      return serialize(token, Math.min(CUSTOMER_SESSION_MAX_AGE, remaining));
    },
    clear: () => serialize('', 0),
  };
}
