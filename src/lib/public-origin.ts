export function parseAppOrigin(value: string | undefined): string {
  const origin = value?.trim();
  try {
    const url = new URL(origin ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !origin ||
      url.origin !== origin ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
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
