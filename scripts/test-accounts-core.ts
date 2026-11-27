import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface SeedAccount {
  label: string;
  role: 'owner' | 'employee' | 'customer';
  email: string;
  password: string;
  fullName: string;
  id?: string;
}
export interface SeedManifest {
  version: 1;
  runId: string;
  createdAt: string;
  projectUrl: string;
  databaseFingerprint: string;
  accounts: Record<'admin' | 'employee' | 'customer', SeedAccount>;
  steps: Record<string, { key: string; result?: Record<string, unknown> }>;
  links?: { login: string; enrollment: string; card: string };
  completedAt?: string;
}
interface Destination {
  supabaseUrl: string;
  databaseUrl: string;
}
export interface MigrationRecord {
  hash: string;
  created_at: string;
}

function databaseFingerprint(value: string) {
  const url = new URL(value);
  // A password rotation does not change the destination or invalidate progress.
  return createHash('sha256')
    .update(
      `${url.hostname}:${url.port || '5432'}${url.pathname}:${url.username}`,
    )
    .digest('hex');
}

export function validateSeedDestination(
  settings: Destination,
  manifest?: SeedManifest,
) {
  const auth = new URL(settings.supabaseUrl);
  const database = new URL(settings.databaseUrl);
  const authProject = /^([a-z0-9-]+)\.supabase\.co$/.exec(auth.hostname)?.[1];
  const databaseProject =
    /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(database.hostname)?.[1] ??
    /^postgres\.([a-z0-9-]+)$/.exec(decodeURIComponent(database.username))?.[1];
  if (authProject && databaseProject && authProject !== databaseProject)
    throw new Error(
      'Auth y DATABASE_URL pertenecen a proyectos Supabase diferentes.',
    );
  if (
    manifest &&
    (manifest.version !== 1 ||
      manifest.projectUrl !== auth.origin ||
      manifest.databaseFingerprint !==
        databaseFingerprint(settings.databaseUrl))
  )
    throw new Error('El manifiesto pertenece a otro proyecto o base de datos.');
}

export function createSeedManifest(settings: Destination): SeedManifest {
  validateSeedDestination(settings);
  const runId = randomUUID();
  const suffix = runId.slice(0, 8);
  const account = (
    name: string,
    label: string,
    role: SeedAccount['role'],
  ): SeedAccount => ({
    label,
    role,
    email: `loyalty-${name}-${suffix}@example.com`,
    password: `Lp!${randomBytes(24).toString('base64url')}9a`,
    fullName: `${label} de prueba`,
  });
  return {
    version: 1,
    runId,
    createdAt: new Date().toISOString(),
    projectUrl: new URL(settings.supabaseUrl).origin,
    databaseFingerprint: databaseFingerprint(settings.databaseUrl),
    accounts: {
      admin: account('admin', 'Administrador propietario', 'owner'),
      employee: account('employee', 'Empleado', 'employee'),
      customer: account('customer', 'Cliente', 'customer'),
    },
    steps: {},
  };
}

export async function saveSeedManifest(path: string, manifest: SeedManifest) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  await rename(temporary, path);
}

export function assertMigrationHistory(
  expected: MigrationRecord[],
  actual: MigrationRecord[],
) {
  if (
    expected.length !== actual.length ||
    expected.some(
      (migration, index) =>
        migration.hash !== actual[index]?.hash ||
        String(migration.created_at) !== String(actual[index]?.created_at),
    )
  )
    throw new Error(
      'El destino tiene migraciones pendientes o distintas. Revisarlas antes de crear cuentas; este comando no las aplica.',
    );
}

interface AuthUser {
  id?: string;
  email?: string;
  email_confirmed_at?: string;
  app_metadata?: { loyalty_seed_run?: string };
}
function assertOwnedUser(user: AuthUser, account: SeedAccount, runId: string) {
  if (
    typeof user.id !== 'string' ||
    user.email?.toLowerCase() !== account.email ||
    !user.email_confirmed_at ||
    user.app_metadata?.loyalty_seed_run !== runId ||
    (account.id && account.id !== user.id)
  )
    throw new Error(
      'La identidad no pertenece a esta ejecución de prueba. No se modificó su contraseña.',
    );
  return user.id;
}

export async function ensureSeedAccount(options: {
  manifest: SeedManifest;
  account: SeedAccount;
  serviceKey: string;
  publicKey: string;
  fetcher?: typeof fetch;
  save: () => Promise<void>;
}) {
  const { manifest, account } = options;
  const fetcher = options.fetcher ?? fetch;
  const endpoint = `${manifest.projectUrl}/auth/v1`;
  if (!account.id) {
    const response = await fetcher(`${endpoint}/admin/users`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        apikey: options.serviceKey,
        Authorization: `Bearer ${options.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName },
        app_metadata: { loyalty_seed_run: manifest.runId },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const user = (await response.json()) as AuthUser;
      account.id = assertOwnedUser(user, account, manifest.runId);
      await options.save();
    } else if (response.status !== 400 && response.status !== 422) {
      throw new Error(
        `No se pudo crear la cuenta de prueba (HTTP ${response.status}).`,
      );
    }
    // A response lost after creation can yield an existing-email error on retry.
    // Authentication plus the server-managed run marker proves our ownership.
  }
  const response = await fetcher(`${endpoint}/token?grant_type=password`, {
    method: 'POST',
    redirect: 'error',
    headers: { apikey: options.publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `No se pudo iniciar sesión de prueba (HTTP ${response.status}).`,
    );
  const session = (await response.json()) as {
    access_token?: string;
    user?: AuthUser;
  };
  if (!session.user || typeof session.access_token !== 'string')
    throw new Error('El proveedor devolvió una sesión de prueba inválida.');
  account.id = assertOwnedUser(session.user, account, manifest.runId);
  await options.save();
  return session.access_token;
}
