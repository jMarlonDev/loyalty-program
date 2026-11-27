import { config as loadDotEnv } from 'dotenv';
import { Pool } from 'pg';
import { createApp } from '../../backend/src/app';
import { SupabaseIdentityProvider } from '../../backend/src/infrastructure/identity-provider';
import { LocalAuthStore } from '../../backend/src/infrastructure/local-auth';
import { PgNextRepository } from '../../backend/src/infrastructure/next-repository';
import { createBaseApp } from '../../backend/src/presentation/http/base-app';
import { createApiBridge } from './bridge';
import { loadRuntimeConfig } from './config';
import { createLocalSessionAuth } from './local-session-auth';
import { publicConfig } from './public-config';
import { createRealtime } from './realtime';
import { createSessionHandler, safeNext } from './session';
import { createSupabaseAuth } from './supabase-auth';

let runtime: ReturnType<typeof createRuntime> | undefined;
class RuntimeConfigurationError extends Error {}
const liveness = createBaseApp({
  checkDatabase: async () => {
    throw new Error('Use runtime readiness');
  },
});

function parseCooldown(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
    console.error('Ignoring invalid STAMP_COOLDOWN_MINUTES');
    return undefined;
  }
  return minutes;
}

function createRuntime() {
  // Runtime only; no variables are serialized into the browser bundle.
  loadDotEnv({ path: ['.env', 'backend/.env'], quiet: true });
  let settings: ReturnType<typeof loadRuntimeConfig>;
  try {
    settings = loadRuntimeConfig(process.env);
  } catch {
    console.error('Invalid server configuration. Run npm run env:check.');
    throw new RuntimeConfigurationError();
  }
  const development = process.env.NODE_ENV !== 'production';
  const pool = new Pool({
    connectionString: settings.databaseUrl,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    query_timeout: 6000,
    max: 10,
  });
  pool.on('error', () => console.error('Database connection unavailable'));
  const realtime = createRealtime({
    pool,
    origin: settings.origin,
    tokenEncryptionKey: settings.cardTokenEncryptionKey,
    development,
  });
  // AUTH-LOCAL-001 (D-07): cuentas locales por defecto; Supabase Auth opcional.
  const localAuth =
    settings.authProvider === 'local' ? new LocalAuthStore(pool) : undefined;
  const app = createApp({
    pool,
    identityProvider:
      localAuth ??
      new SupabaseIdentityProvider({
        url: settings.supabaseUrl,
        apiKey: settings.supabasePublishableKey,
      }),
    cardTokenEncryptionKey: settings.cardTokenEncryptionKey,
    corsOrigins: settings.corsOrigins,
    publicOrigin: settings.origin,
    // D-06: STAMP_COOLDOWN_MINUTES solo se respeta fuera de producción.
    stampCooldownMinutes: development
      ? parseCooldown(process.env.STAMP_COOLDOWN_MINUTES)
      : undefined,
    log: (entry) => console.info(JSON.stringify(entry)),
  });
  const api = createApiBridge({
    app,
    origin: settings.origin,
    development,
  });
  const session = createSessionHandler({
    auth: localAuth
      ? createLocalSessionAuth(localAuth)
      : createSupabaseAuth({
          url: settings.supabaseUrl,
          apiKey: settings.supabasePublishableKey,
        }),
    origin: settings.origin,
  });
  return {
    api,
    session,
    realtime,
    close: async () => {
      await realtime.close();
      await pool.end();
    },
  };
}

export async function closeRuntime() {
  const current = runtime;
  runtime = undefined;
  await current?.close();
}

export async function upgradeCustomerEvents(request: Request) {
  runtime ??= createRuntime();
  return runtime.realtime.gateway.upgrade(request);
}

export function customerEventsGateway() {
  if (!runtime) throw new Error('Realtime runtime is not initialized');
  return runtime.realtime.gateway;
}

export async function handleApi(request: Request): Promise<Response> {
  if (
    request.method === 'GET' &&
    new URL(request.url).pathname === '/api/public-config'
  ) {
    loadDotEnv({ path: ['.env', 'backend/.env'], quiet: true });
    return publicConfig(process.env);
  }
  if (new URL(request.url).pathname === '/health')
    return liveness.fetch(request);
  try {
    runtime ??= createRuntime();
    return await (new URL(request.url).pathname.startsWith('/api/session')
      ? runtime.session(request)
      : runtime.api(request));
  } catch (error) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/session/google')
      return new Response(null, {
        status: 302,
        headers: {
          'Cache-Control': 'no-store',
          location: `/auth?${new URLSearchParams({
            error: 'AUTH_UNAVAILABLE',
            next: safeNext(url.searchParams.get('next')),
          })}`,
        },
      });
    const configuration = error instanceof RuntimeConfigurationError;
    return Response.json(
      {
        error: {
          code: configuration ? 'CONFIGURATION_ERROR' : 'SERVICE_UNAVAILABLE',
          message: configuration
            ? 'El servicio aún no está configurado. Contacta al administrador.'
            : 'El servicio no está disponible. Inténtalo de nuevo en un momento.',
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
