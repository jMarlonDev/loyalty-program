import { config as loadDotEnv } from 'dotenv';
import { Pool } from 'pg';
import { createApp } from '../../backend/src/app';
import { SupabaseIdentityProvider } from '../../backend/src/infrastructure/identity-provider';
import { createBaseApp } from '../../backend/src/presentation/http/base-app';
import { createApiBridge } from './bridge';
import { loadRuntimeConfig } from './config';
import { publicConfig } from './public-config';
import { createSessionHandler, safeNext } from './session';
import { createSupabaseAuth } from './supabase-auth';

let runtime: ReturnType<typeof createRuntime> | undefined;
class RuntimeConfigurationError extends Error {}
const liveness = createBaseApp({
  checkDatabase: async () => {
    throw new Error('Use runtime readiness');
  },
});

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
  const pool = new Pool({
    connectionString: settings.databaseUrl,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    query_timeout: 6000,
    max: 10,
  });
  pool.on('error', () => console.error('Database connection unavailable'));
  const app = createApp({
    pool,
    identityProvider: new SupabaseIdentityProvider({
      url: settings.supabaseUrl,
      apiKey: settings.supabasePublishableKey,
    }),
    cardTokenEncryptionKey: settings.cardTokenEncryptionKey,
    corsOrigins: settings.corsOrigins,
    log: (entry) => console.info(JSON.stringify(entry)),
  });
  const api = createApiBridge({ app, origin: settings.origin });
  const session = createSessionHandler({
    auth: createSupabaseAuth({
      url: settings.supabaseUrl,
      apiKey: settings.supabasePublishableKey,
    }),
    origin: settings.origin,
  });
  return { api, session, close: () => pool.end() };
}

export async function closeRuntime() {
  const current = runtime;
  runtime = undefined;
  await current?.close();
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
