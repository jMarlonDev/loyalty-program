export type ScanPurpose = 'card' | 'reward';
export interface CardScan {
  token: string;
  restaurantId: string;
  purpose?: ScanPurpose;
}
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pendingKey = 'loyalty.pending-card-scan';
const ttl = 10 * 60 * 1000;

export function cardScanUrl(
  origin: string,
  scan: Omit<CardScan, 'purpose'> & { purpose?: ScanPurpose },
): string {
  const url = new URL(scan.purpose === 'reward' ? '/reward' : '/scan', origin);
  url.hash = new URLSearchParams({
    token: scan.token,
    restaurant: scan.restaurantId,
  }).toString();
  return url.toString();
}

export function parseCardScan(
  value: string,
  origin: string,
  restaurantId?: string,
  configuredOrigin?: string | null,
  defaultPurpose: ScanPurpose = 'card',
): CardScan | null {
  const raw = value.trim();
  if (tokenPattern.test(raw) && restaurantId)
    return { token: raw, restaurantId, purpose: defaultPurpose };
  try {
    const url = new URL(raw, origin);
    if (
      (url.origin !== new URL(origin).origin &&
        url.origin !== new URL(configuredOrigin || origin).origin) ||
      !['/scan', '/reward'].includes(url.pathname) ||
      url.search ||
      url.username ||
      url.password
    )
      return null;
    const params = new URLSearchParams(url.hash.slice(1));
    const token = params.get('token') ?? '';
    const restaurant = params.get('restaurant') ?? '';
    const purpose =
      url.pathname === '/reward'
        ? 'reward'
        : params.get('purpose') === 'reward'
          ? 'reward'
          : 'card';
    if (
      !tokenPattern.test(token) ||
      !uuidPattern.test(restaurant) ||
      params.getAll('token').length !== 1 ||
      params.getAll('restaurant').length !== 1 ||
      (params.has('purpose') &&
        !['card', 'reward'].includes(params.get('purpose') ?? ''))
    )
      return null;
    return { token, restaurantId: restaurant, purpose };
  } catch {
    return null;
  }
}

export function clearPendingScan() {
  try {
    sessionStorage.removeItem(pendingKey);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function savePendingScan(scan: CardScan): boolean {
  try {
    sessionStorage.setItem(
      pendingKey,
      JSON.stringify({ ...scan, expiresAt: Date.now() + ttl }),
    );
    return true;
  } catch {
    return false;
  }
}
export function readPendingScan(): CardScan | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null');
    if (
      raw &&
      typeof raw.token === 'string' &&
      tokenPattern.test(raw.token) &&
      typeof raw.restaurantId === 'string' &&
      uuidPattern.test(raw.restaurantId) &&
      (raw.purpose === 'card' || raw.purpose === 'reward') &&
      typeof raw.expiresAt === 'number' &&
      raw.expiresAt > Date.now() &&
      raw.expiresAt <= Date.now() + ttl
    )
      return {
        token: raw.token,
        restaurantId: raw.restaurantId,
        purpose: raw.purpose,
      };
  } catch {
    /* Invalid and expired values are removed below. */
  }
  clearPendingScan();
  return null;
}
