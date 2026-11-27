function isPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split('.').map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

export function isLanOrigin(origin: string): boolean {
  try {
    return isPrivateIpv4(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function parseAppOrigin(
  value: string | undefined,
  options: { allowPrivateHttp?: boolean } = {},
): string {
  const origin = value?.trim();
  try {
    const url = new URL(origin ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !origin ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          (local || (options.allowPrivateHttp && isPrivateIpv4(url.hostname)))
        ))
    )
      throw new Error();
    return origin;
  } catch {
    throw new Error('Invalid configuration: APP_ORIGIN');
  }
}

export function isPublicOrigin(origin: string): boolean {
  try {
    const url = new URL(parseAppOrigin(origin));
    const host = url.hostname;
    return (
      url.protocol === 'https:' &&
      !(
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host === '[::1]' ||
        host === '[::]' ||
        /^\[(?:fc|fd|fe[89ab])/i.test(host) ||
        /^(?:127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
          host,
        )
      )
    );
  } catch {
    return false;
  }
}
