import { config } from 'dotenv';
import { isPublicOrigin } from '../src/lib/public-origin';
import { loadRuntimeConfig } from '../src/server/config';

config({ path: ['.env', 'backend/.env'], quiet: true });
const required = [
  'DATABASE_URL',
  'APP_ORIGIN',
  'SUPABASE_URL',
  'CARD_TOKEN_ENCRYPTION_KEY',
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (
  !(
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
  )?.trim()
)
  missing.push('SUPABASE_PUBLISHABLE_KEY');
if (missing.length) {
  console.error(
    `Faltan variables: ${missing.join(', ')}. Consulta .env.example.`,
  );
  process.exitCode = 1;
} else {
  try {
    const settings = loadRuntimeConfig(process.env);
    if (process.argv.includes('--public') && !isPublicOrigin(settings.origin))
      throw new Error(
        'APP_ORIGIN debe ser una dirección pública HTTPS para compartir enlaces con celulares. localhost solo funciona en este computador.',
      );
    console.info(
      'Configuración válida. No se comprobó conexión PostgreSQL ni el proveedor Auth.',
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Configuración inválida.',
    );
    process.exitCode = 1;
  }
}
