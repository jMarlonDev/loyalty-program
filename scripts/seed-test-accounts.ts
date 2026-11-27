import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import { Pool } from 'pg';
import { createApp } from '../backend/src/app';
import { SupabaseIdentityProvider } from '../backend/src/infrastructure/identity-provider';
import { loadRuntimeConfig } from '../src/server/config';
import {
  assertMigrationHistory,
  createSeedManifest,
  ensureSeedAccount,
  type MigrationRecord,
  type SeedManifest,
  saveSeedManifest,
  validateSeedDestination,
} from './test-accounts-core';

const manifestPath = resolve('.cache/test-accounts.json');
const lockPath = `${manifestPath}.lock`;
type AccountName = keyof SeedManifest['accounts'];
type Resource = Record<string, unknown>;

function field(value: Resource, name: string): string {
  const result = value[name];
  if (typeof result !== 'string' || !result)
    throw new Error('La API devolvió datos de prueba incompletos.');
  return result;
}

async function requiredMigrations(): Promise<MigrationRecord[]> {
  const directory = resolve('backend/drizzle');
  const journal = JSON.parse(
    await readFile(`${directory}/meta/_journal.json`, 'utf8'),
  ) as {
    entries: { tag: string; when: number }[];
  };
  return Promise.all(
    journal.entries.map(async (entry) => ({
      hash: createHash('sha256')
        .update(await readFile(`${directory}/${entry.tag}.sql`, 'utf8'))
        .digest('hex'),
      created_at: String(entry.when),
    })),
  );
}

async function main() {
  config({ path: ['.env', 'backend/.env'], quiet: true });
  const settings = loadRuntimeConfig(process.env);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey)
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY en el entorno local del servidor.',
    );
  validateSeedDestination(settings);
  const pool = new Pool({
    connectionString: settings.databaseUrl,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    max: 2,
  });
  let locked = false;
  try {
    // Read-only preflight. Never invoke a migration tool from account creation.
    let history: MigrationRecord[];
    try {
      history = (
        await pool.query<MigrationRecord>(
          'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at, id',
        )
      ).rows;
    } catch {
      throw new Error(
        'No se pudo verificar el historial de migraciones. No se crearon cuentas.',
      );
    }
    assertMigrationHistory(await requiredMigrations(), history);
    await mkdir(dirname(manifestPath), { recursive: true, mode: 0o700 });
    try {
      const lock = await open(lockPath, 'wx', 0o600);
      locked = true;
      await lock.writeFile(String(process.pid));
      await lock.close();
    } catch {
      throw new Error(
        'Hay otra preparación de cuentas en curso o un archivo de bloqueo pendiente. Consulta docs/testing-accounts.md.',
      );
    }
    let manifest: SeedManifest;
    try {
      manifest = JSON.parse(
        await readFile(manifestPath, 'utf8'),
      ) as SeedManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(
          'El manifiesto existente no se pudo leer; se conserva sin reemplazar.',
        );
      manifest = createSeedManifest(settings);
    }
    validateSeedDestination(settings, manifest);
    const save = () => saveSeedManifest(manifestPath, manifest);
    // Credentials are durable before the first remote write, even on interruption.
    await save();
    console.info(
      'Preparando las tres cuentas autorizadas; el progreso se guarda localmente.',
    );
    const tokens = {} as Record<AccountName, string>;
    for (const name of ['admin', 'employee', 'customer'] as const) {
      tokens[name] = await ensureSeedAccount({
        manifest,
        account: manifest.accounts[name],
        serviceKey,
        publicKey: settings.supabasePublishableKey,
        save,
      });
    }
    const app = createApp({
      pool,
      identityProvider: new SupabaseIdentityProvider({
        url: settings.supabaseUrl,
        apiKey: settings.supabasePublishableKey,
        timeoutMs: 10000,
      }),
      cardTokenEncryptionKey: settings.cardTokenEncryptionKey,
    });
    async function call(
      account: AccountName,
      path: string,
      body?: unknown,
      key?: string,
    ): Promise<unknown> {
      const response = await app.request(`/api/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${tokens[account]}`,
          'Content-Type': 'application/json',
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: { code?: string };
        };
        const code = payload.error?.code;
        const safeCode =
          typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` ${code}` : '';
        throw new Error(
          `Falló un paso de negocio (${response.status}${safeCode}). El manifiesto permite reintentar.`,
        );
      }
      return ((await response.json()) as { data: unknown }).data;
    }
    async function key(name: string) {
      if (!manifest.steps[name]) {
        manifest.steps[name] = { key: randomUUID() };
        await save();
      }
      return manifest.steps[name].key;
    }
    async function step(
      name: string,
      account: AccountName,
      path: string,
      body: unknown,
      select = (value: Resource): Resource => ({ id: field(value, 'id') }),
    ) {
      const previous = manifest.steps[name]?.result;
      if (previous) return previous;
      const idempotencyKey = await key(name);
      const result = select(
        (await call(account, path, body, idempotencyKey)) as Resource,
      );
      manifest.steps[name] = { key: idempotencyKey, result };
      await save();
      return result;
    }
    for (const name of ['admin', 'employee', 'customer'] as const)
      await step(`profile-${name}`, name, '/profiles', {
        full_name: manifest.accounts[name].fullName,
      });
    const restaurant = await step('restaurant', 'admin', '/restaurants', {
      name: `Restaurante de prueba ${manifest.runId.slice(0, 8)}`,
    });
    const restaurantPath = `/restaurants/${field(restaurant, 'id')}`;
    await step('location', 'admin', `${restaurantPath}/locations`, {
      name: 'Sucursal de prueba',
      address: 'Dirección de prueba',
      city: 'Bogotá',
      department: 'Bogotá',
    });
    const program = await step(
      'program',
      'admin',
      `${restaurantPath}/programs`,
      {
        name: 'Club de prueba',
        stamps_required: 5,
        reward_description: 'Premio de prueba al completar cinco sellos',
        background_color: '#172554',
        text_color: '#FFFFFF',
      },
      (value) => ({
        id: field(value, 'id'),
        public_code: field(value, 'public_code'),
      }),
    );
    if (!manifest.steps['employee-accept']?.result) {
      const invitation = (await call(
        'admin',
        `${restaurantPath}/invitations`,
        {
          email: manifest.accounts.employee.email,
          role: 'employee',
        },
        await key('employee-invitation'),
      )) as Resource;
      // Keep invitation tokens in memory; replay can retrieve the same token.
      await step('employee-accept', 'employee', '/invitations/accept', {
        token: field(invitation, 'token'),
      });
    }
    const card = await step(
      'card',
      'customer',
      `/public/programs/${field(program, 'public_code')}/enrollments`,
      {},
      (value) => ({ id: field(value.card as Resource, 'id') }),
    );
    for (const [name, expectedRole] of [
      ['admin', 'owner'],
      ['employee', 'employee'],
    ] as const) {
      const restaurants = (await call(name, '/restaurants')) as Resource[];
      if (
        !restaurants.some(
          (item) =>
            item.id === restaurant.id && item.actor_role === expectedRole,
        )
      )
        throw new Error(
          'La pertenencia de prueba no coincide con el rol esperado.',
        );
    }
    const customerRestaurants = (await call(
      'customer',
      '/restaurants',
    )) as Resource[];
    if (customerRestaurants.length)
      throw new Error(
        'El cliente de prueba tiene pertenencias de personal inesperadas.',
      );
    await call('customer', `/me/cards/${field(card, 'id')}`);
    manifest.links = {
      login: `${settings.origin}/auth`,
      enrollment: `${settings.origin}/join/${field(program, 'public_code')}`,
      card: `${settings.origin}/cards?card=${field(card, 'id')}`,
    };
    manifest.completedAt = new Date().toISOString();
    await save();
    console.info(
      `Tres cuentas verificadas y datos de prueba preparados. Credenciales: ${manifestPath}`,
    );
    console.info(
      'Administrador propietario (owner), empleado y cliente. Consulta docs/testing-accounts.md.',
    );
  } finally {
    if (locked) await unlink(lockPath).catch(() => {});
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Only our own curated messages reach stdout/stderr. Provider/DB responses may
  // contain credentials or internal endpoints and must not be logged verbatim.
  const safe =
    error instanceof Error &&
    /^(Falta SUPABASE_|Auth y DATABASE_URL|El (destino|manifiesto|proveedor|cliente)|Hay otra preparación|No se pudo|La (identidad|API|pertenencia)|Falló un paso|Missing configuration:|Invalid configuration:)/.test(
      error.message,
    );
  console.error(
    safe
      ? error.message
      : 'No se pudo completar la preparación. Revisa configuración y conexión; se conserva el progreso sin mostrar secretos.',
  );
  process.exitCode = 1;
});
