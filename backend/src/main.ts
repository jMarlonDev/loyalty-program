export interface ClosableServer {
  close: (callback: (error?: Error) => void) => unknown;
}

export function createShutdown(
  server: ClosableServer,
  closeDatabase: () => Promise<void>,
) {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }).finally(closeDatabase);
    return pending;
  };
}

import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { config as loadDotEnv } from 'dotenv';
import { Pool } from 'pg';
import { loadConfig } from './config.js';

export async function startServer() {
  loadDotEnv({ quiet: true });
  const settings = loadConfig(process.env);
  const [{ createApp }, { SupabaseIdentityProvider }] = await Promise.all([
    import('./app.js'),
    import('./infrastructure/identity-provider.js'),
  ]);
  const pool = new Pool({
    connectionString: settings.databaseUrl,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    query_timeout: 6000,
  });
  pool.on('error', () => console.error('Database connection unavailable'));
  const app = createApp({
    pool,
    cardTokenEncryptionKey: settings.cardTokenEncryptionKey,
    corsOrigins: settings.corsOrigins,
    log: (entry) => console.info(JSON.stringify(entry)),
    identityProvider: new SupabaseIdentityProvider({
      url: settings.supabaseUrl,
      apiKey: settings.supabasePublishableKey,
    }),
  });
  const server = serve(
    { fetch: app.fetch, port: settings.port },
    ({ port }) => {
      console.info(`HTTP server listening on port ${port}`);
    },
  );
  const shutdown = createShutdown(server, () => pool.end());
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      console.error('Server shutdown timed out');
      process.exit(1);
    }, 10000);
    deadline.unref();
    shutdown()
      .catch(() => {
        console.error('Server shutdown failed');
        process.exitCode = 1;
      })
      .finally(() => {
        clearTimeout(deadline);
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
      });
  };
  server.on('error', () => {
    console.error('HTTP server failed');
    process.exitCode = 1;
    stop();
  });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return { server, shutdown };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer().catch(() => {
    console.error('Server startup failed; verify configuration');
    process.exitCode = 1;
  });
}
