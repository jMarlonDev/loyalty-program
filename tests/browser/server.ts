import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createTestDatabase } from '../../backend/tests/helpers/database';

// This upstream lives only in the browser harness. Production always verifies
// tokens through SupabaseIdentityProvider, including when this fixture is used.
const users = new Map<
  string,
  {
    id: string;
    email: string;
    email_confirmed_at: string | null;
    user_metadata: { full_name: string };
  }
>();
const sessions = new Map<string, string>();
const passwords = new Map<string, string>();
const codes = new Map<string, { email: string; challenge: string }>();
const mailbox = new Map<string, string>();
const database = await createTestDatabase();
const upstream = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let input: Record<string, string>;
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    res.writeHead(400).end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const reply = (status: number, data: unknown) => {
    res
      .writeHead(status, { 'content-type': 'application/json' })
      .end(JSON.stringify(data));
  };
  const bearer = req.headers.authorization?.replace(/^Bearer /, '');
  if (url.pathname === '/__test/mail') {
    const link = mailbox.get(url.searchParams.get('email') ?? '');
    reply(link ? 200 : 404, { url: link });
    return;
  }
  if (
    url.pathname === '/auth/v1/signup' ||
    url.pathname === '/auth/v1/recover'
  ) {
    const email = input.email;
    const challenge = input.code_challenge;
    const redirect = url.searchParams.get('redirect_to');
    if (
      !email ||
      !challenge ||
      redirect !== 'http://127.0.0.1:3100/api/session/callback'
    ) {
      reply(400, { error: 'bad_signup' });
      return;
    }
    if (!users.has(email)) {
      const metadata = (input as unknown as { data?: { full_name: string } })
        .data;
      users.set(email, {
        id: randomUUID(),
        email,
        email_confirmed_at: null,
        user_metadata: {
          full_name: metadata?.full_name ?? 'Registro de prueba',
        },
      });
    }
    if (url.pathname === '/auth/v1/signup')
      passwords.set(email, input.password ?? '');
    const code = randomUUID();
    codes.set(code, { email, challenge });
    mailbox.set(email, `${redirect}?code=${code}`);
    reply(200, users.get(email));
    return;
  }
  if (url.pathname === '/auth/v1/authorize') {
    const redirect = url.searchParams.get('redirect_to');
    const challenge = url.searchParams.get('code_challenge');
    if (
      redirect !== 'http://127.0.0.1:3100/api/session/callback' ||
      !challenge
    ) {
      reply(400, { error: 'bad_redirect' });
      return;
    }
    const code = randomUUID();
    codes.set(code, { email: 'google@example.test', challenge });
    res.writeHead(302, { location: `${redirect}?code=${code}` }).end();
    return;
  }
  if (url.pathname === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    const code =
      grant === 'pkce' ? codes.get(input.auth_code ?? '') : undefined;
    if (grant === 'pkce') {
      codes.delete(input.auth_code ?? '');
      if (
        !code ||
        createHash('sha256')
          .update(input.code_verifier ?? '')
          .digest('base64url') !== code.challenge
      ) {
        reply(400, { error: 'invalid_code' });
        return;
      }
    }
    const email =
      grant === 'pkce'
        ? code?.email
        : grant === 'refresh_token'
          ? sessions.get(input.refresh_token ?? '')
          : input.email;
    if (
      !email ||
      (grant !== 'refresh_token' &&
        grant !== 'pkce' &&
        input.password !== (passwords.get(email) ?? 'test-password-123'))
    ) {
      reply(400, { error: 'invalid_credentials' });
      return;
    }
    let user = users.get(email);
    if (!user) {
      user = {
        id: randomUUID(),
        email,
        email_confirmed_at: new Date().toISOString(),
        user_metadata: { full_name: email.split('@')[0] ?? 'Prueba' },
      };
      users.set(email, user);
    }
    if (grant === 'pkce') user.email_confirmed_at = new Date().toISOString();
    if (!user.email_confirmed_at) {
      reply(400, { error: 'email_not_confirmed' });
      return;
    }
    const access = `fixture-${randomUUID()}`;
    const refresh = `refresh-${randomUUID()}`;
    sessions.set(access, email);
    sessions.set(refresh, email);
    reply(200, {
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      user,
    });
    return;
  }
  if (url.pathname === '/auth/v1/user') {
    const email = bearer ? sessions.get(bearer) : undefined;
    const user = email ? users.get(email) : undefined;
    if (user && req.method === 'PUT' && input.password)
      passwords.set(user.email, input.password);
    reply(user ? 200 : 401, user ?? { error: 'invalid_token' });
    return;
  }
  if (url.pathname === '/auth/v1/logout') {
    if (bearer) sessions.delete(bearer);
    res.writeHead(204).end();
    return;
  }
  reply(404, { error: 'not_implemented_in_fixture' });
});
await new Promise<void>((resolve) =>
  upstream.listen(3101, '127.0.0.1', resolve),
);
const address = upstream.address();
if (!address || typeof address === 'string')
  throw new Error('Auth fixture could not bind');
const config = database.pool.options;
const env = {
  ...process.env,
  DATABASE_URL: config.connectionString,
  SUPABASE_URL: `http://127.0.0.1:${address.port}`,
  SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
  CARD_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  APP_ORIGIN: 'http://127.0.0.1:3100',
  PORT: '3100',
  HOST: '127.0.0.1',
  NODE_ENV:
    process.env.LOYALTY_BROWSER_PRODUCTION === '1' ? 'production' : 'test',
};
const child = spawn(
  process.execPath,
  process.env.LOYALTY_BROWSER_PRODUCTION === '1'
    ? ['.output/server/index.mjs']
    : [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        '3100',
        '--strictPort',
      ],
  { env, stdio: 'inherit' },
);
let stopping = false;
async function cleanup() {
  if (stopping) return;
  stopping = true;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', () => resolve());
  });
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  await database.cleanup();
}
process.on('SIGTERM', () => void cleanup().finally(() => process.exit(0)));
process.on('SIGINT', () => void cleanup().finally(() => process.exit(0)));
child.once('exit', (code) => {
  if (!stopping) void cleanup().finally(() => process.exit(code ?? 1));
});
