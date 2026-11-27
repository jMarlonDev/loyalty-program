export interface AppConfig {
  port: number;
  databaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  cardTokenEncryptionKey: string;
  corsOrigins: string[];
  /** AUTH-LOCAL-001 (D-07): `local` por defecto; `supabase` conserva Supabase Auth. */
  authProvider: 'local' | 'supabase';
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

function validUrl(value: string, name: string, protocols: string[]): URL {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol) || !url.hostname) throw new Error();
    return url;
  } catch {
    throw new Error(`Invalid configuration: ${name}`);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const portValue = env.PORT ?? '3000';
  const port = Number(portValue);
  if (
    !/^\d+$/.test(portValue) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error('Invalid configuration: PORT');
  }
  const databaseUrl = required(env, 'DATABASE_URL');
  validUrl(databaseUrl, 'DATABASE_URL', ['postgres:', 'postgresql:']);
  const authProvider = env.AUTH_PROVIDER?.trim() || 'local';
  if (authProvider !== 'local' && authProvider !== 'supabase')
    throw new Error('Invalid configuration: AUTH_PROVIDER');
  const supabaseRequired = authProvider === 'supabase';
  const supabaseUrl =
    supabaseRequired || env.SUPABASE_URL?.trim()
      ? required(env, 'SUPABASE_URL')
      : '';
  const parsedSupabaseUrl = supabaseUrl
    ? validUrl(supabaseUrl, 'SUPABASE_URL', ['https:', 'http:'])
    : null;
  if (
    parsedSupabaseUrl &&
    (parsedSupabaseUrl.username ||
      parsedSupabaseUrl.password ||
      parsedSupabaseUrl.pathname !== '/' ||
      parsedSupabaseUrl.search ||
      parsedSupabaseUrl.hash ||
      (parsedSupabaseUrl.protocol === 'http:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(
          parsedSupabaseUrl.hostname,
        )))
  ) {
    throw new Error('Invalid configuration: SUPABASE_URL');
  }
  const publishable = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const supabasePublishableKey =
    supabaseRequired || publishable
      ? required(
          { ...env, SUPABASE_PUBLISHABLE_KEY: publishable },
          'SUPABASE_PUBLISHABLE_KEY',
        )
      : '';
  const cardTokenEncryptionKey = required(env, 'CARD_TOKEN_ENCRYPTION_KEY');
  if (!/^[a-f0-9]{64}$/i.test(cardTokenEncryptionKey))
    throw new Error('Invalid configuration: CARD_TOKEN_ENCRYPTION_KEY');
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    const url = validUrl(origin, 'CORS_ORIGINS', ['https:', 'http:']);
    if (url.origin !== origin || url.username || url.password)
      throw new Error('Invalid configuration: CORS_ORIGINS');
  }
  return {
    port,
    databaseUrl,
    supabaseUrl: parsedSupabaseUrl?.origin ?? '',
    supabasePublishableKey,
    cardTokenEncryptionKey,
    corsOrigins,
    authProvider,
  };
}
