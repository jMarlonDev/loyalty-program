export interface AppConfig {
  port: number;
  databaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  cardTokenEncryptionKey: string;
  corsOrigins: string[];
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
  const supabaseUrl = required(env, 'SUPABASE_URL');
  const parsedSupabaseUrl = validUrl(supabaseUrl, 'SUPABASE_URL', [
    'https:',
    'http:',
  ]);
  if (
    parsedSupabaseUrl.username ||
    parsedSupabaseUrl.password ||
    parsedSupabaseUrl.pathname !== '/' ||
    parsedSupabaseUrl.search ||
    parsedSupabaseUrl.hash ||
    (parsedSupabaseUrl.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(parsedSupabaseUrl.hostname))
  ) {
    throw new Error('Invalid configuration: SUPABASE_URL');
  }
  const supabasePublishableKey = required(
    {
      ...env,
      SUPABASE_PUBLISHABLE_KEY:
        env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
    },
    'SUPABASE_PUBLISHABLE_KEY',
  );
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
    supabaseUrl: parsedSupabaseUrl.origin,
    supabasePublishableKey,
    cardTokenEncryptionKey,
    corsOrigins,
  };
}
