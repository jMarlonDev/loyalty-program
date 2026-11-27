import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertMigrationHistory,
  createSeedManifest,
  ensureSeedAccount,
  saveSeedManifest,
  validateSeedDestination,
} from '../../scripts/test-accounts-core';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const settings = {
  supabaseUrl: 'https://project.supabase.co',
  databaseUrl:
    'postgresql://postgres.project:private@pooler.supabase.com:5432/postgres',
};

describe('preparación segura de cuentas de prueba reales', () => {
  it('rechaza migraciones pendientes o hashes modificados', () => {
    const expected = [
      { hash: 'first', created_at: '100' },
      { hash: 'second', created_at: '200' },
    ];
    expect(() =>
      assertMigrationHistory(expected, expected.slice(0, 1)),
    ).toThrow(/migraciones/i);
    expect(() =>
      assertMigrationHistory(expected, [
        { hash: 'changed', created_at: '100' },
        { hash: 'second', created_at: '200' },
      ]),
    ).toThrow(/migraciones/i);
    expect(() => assertMigrationHistory(expected, expected)).not.toThrow();
  });

  it('rechaza proyecto Auth distinto de la conexión y reutilizar manifiesto en otra base', () => {
    const manifest = createSeedManifest(settings);
    expect(() => validateSeedDestination(settings, manifest)).not.toThrow();
    expect(() =>
      validateSeedDestination(
        { ...settings, supabaseUrl: 'https://other.supabase.co' },
        manifest,
      ),
    ).toThrow();
    expect(() =>
      validateSeedDestination(
        {
          ...settings,
          databaseUrl: settings.databaseUrl.replace('/postgres', '/other'),
        },
        manifest,
      ),
    ).toThrow();
  });

  it('guarda tres contraseñas aleatorias, distintas y privadas sin claves de servicio', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'loyalty-accounts-'));
    directories.push(directory);
    const path = join(directory, 'accounts.json');
    const manifest = createSeedManifest(settings);
    await saveSeedManifest(path, manifest);
    expect(
      new Set(
        Object.values(manifest.accounts).map((account) => account.password),
      ).size,
    ).toBe(3);
    expect(
      Object.values(manifest.accounts).every(
        (account) => account.password.length >= 24,
      ),
    ).toBe(true);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const serialized = await readFile(path, 'utf8');
    expect(serialized).not.toContain('private');
    expect(JSON.parse(serialized).runId).toBe(manifest.runId);
  });

  it('guarda la identidad creada antes de que un fallo de login interrumpa la preparación', async () => {
    const manifest = createSeedManifest(settings);
    const account = manifest.accounts.admin;
    const savedIds: (string | undefined)[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: 'created-id',
          email: account.email,
          email_confirmed_at: '2026-10-18',
          app_metadata: { loyalty_seed_run: manifest.runId },
        }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 503 }));
    await expect(
      ensureSeedAccount({
        manifest,
        account,
        serviceKey: 'secret',
        publicKey: 'public',
        fetcher,
        save: async () => {
          savedIds.push(account.id);
        },
      }),
    ).rejects.toThrow('HTTP 503');
    expect(savedIds).toEqual(['created-id']);
    expect(account.id).toBe('created-id');
  });

  it('recupera una creación interrumpida solo si identidad y contraseña corresponden a esta ejecución', async () => {
    const manifest = createSeedManifest(settings);
    const account = manifest.accounts.admin;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ code: 'email_exists' }, { status: 422 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'session-secret',
          user: {
            id: 'account-id',
            email: account.email,
            email_confirmed_at: '2026-10-18',
            app_metadata: { loyalty_seed_run: manifest.runId },
          },
        }),
      );
    const save = vi.fn().mockResolvedValue(undefined);
    const token = await ensureSeedAccount({
      manifest,
      account,
      serviceKey: 'private-service-key',
      publicKey: 'public-key',
      fetcher,
      save,
    });
    expect(token).toBe('session-secret');
    expect(account.id).toBe('account-id');
    expect(save).toHaveBeenCalled();
    expect(JSON.stringify(manifest)).not.toContain('session-secret');
    expect(
      fetcher.mock.calls.every(([, request]) => request?.method === 'POST'),
    ).toBe(true);
  });

  it('rechaza una cuenta ajena sin cambiar su contraseña', async () => {
    const manifest = createSeedManifest(settings);
    const account = manifest.accounts.employee;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ code: 'email_exists' }, { status: 422 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'sensitive',
          user: {
            id: 'other-user',
            email: account.email,
            email_confirmed_at: '2026-10-18',
            app_metadata: { loyalty_seed_run: 'other-run' },
          },
        }),
      );
    await expect(
      ensureSeedAccount({
        manifest,
        account,
        serviceKey: 'secret',
        publicKey: 'public',
        fetcher,
        save: vi.fn(),
      }),
    ).rejects.toThrow(/ejecución/);
    expect(account.id).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('valida acceso existente sin volver a crear usuario ni registrar respuesta sensible', async () => {
    const manifest = createSeedManifest(settings);
    manifest.accounts.customer.id = 'existing-id';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error_description: 'private password and token' },
          { status: 400 },
        ),
      );
    await expect(
      ensureSeedAccount({
        manifest,
        account: manifest.accounts.customer,
        serviceKey: 'secret',
        publicKey: 'public',
        fetcher,
        save: vi.fn(),
      }),
    ).rejects.toThrow('No se pudo iniciar sesión de prueba (HTTP 400).');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('grant_type=password');
  });
});
