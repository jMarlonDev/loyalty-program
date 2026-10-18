import { access, cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Instalación de alcance repositorio; no modifica la configuración global.
const source = new URL('../skills/', import.meta.url);
const destination = new URL('../../.agents/skills/', import.meta.url);
const names = await readdir(source);
// Fallar antes de copiar si existe una skill; nunca sobrescribir trabajo ajeno.
for (const name of names) {
  try {
    await access(new URL(`${name}/`, destination));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(
    `La skill ${name} ya existe. Revisar y sincronizar manualmente.`,
  );
}
await mkdir(destination, { recursive: true });
for (const name of names) {
  await cp(new URL(`${name}/`, source), new URL(`${name}/`, destination), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
}
console.log(`Skills instaladas en ${fileURLToPath(destination)}`);
