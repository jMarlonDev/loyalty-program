# Backend de loyalty-program

Backend implementado por módulos y verificado localmente: 210 pruebas correctas, checks y compilación satisfactorios. Estado verificable en [desarrollo por prioridades](docs/development-status.md). Arquitectura de monolito por capas. La entrada de contexto es [docs/index.md](docs/index.md); las [reglas de negocio](docs/business-rules.md) son la fuente de verdad del comportamiento.

## Preparación

Node.js **24.18.1**, npm **12.1.0**; usar `.nvmrc` de la raíz. Desde `backend/`:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run generate
npm run db:check
```

Paquete y lockfile propios; instalar desde la raíz no instala el backend. Dependencias con versiones exactas: Hono y su adaptador Node, Drizzle ORM/Kit, pg, dotenv, TypeScript/tsx, Vitest/cobertura V8 y Biome. `--ignore-scripts` evita lifecycle scripts de terceros; las herramientas se verificaron después de instalar.

## Base de datos

Se conserva el `.env` existente. Si no existe, copiar `.env.example` a `.env` y establecer `DATABASE_URL` para PostgreSQL. Nunca subir credenciales. Las variables del proceso tienen precedencia sobre `.env`.

```bash
npm run generate  # genera SQL local desde db/schema.ts; verifica primero el JSON
npm run db:check  # consistencia del historial de migraciones
npm run migrate   # APLICA las migraciones a DATABASE_URL
```

`generate` no abre conexiones. `migrate` usa `drizzle.migrate.config.ts`, carga `.env` y aplica SQL a una base previamente creada; no crea el servidor PostgreSQL ni la base de datos contenedora. Revisar destino y SQL antes de ejecutarlo. El 2026-10-18 se aplicó la migración inicial al proyecto Supabase del `.env`, por autorización explícita del usuario. La migración inicial sí se validó con `npm run migrate` en PostgreSQL 17 temporal: 11 tablas, 16 claves foráneas y segunda ejecución sin repetir cambios. El contenedor de validación fue retirado. Esta validación no cubre funcionalidades del producto.

El esquema reproduce `SistemaDeFidelizacion.json` (11 tablas, 16 relaciones), con la correcciones autorizadas [DB-001](docs/decisions/DB-001.md) y [DB-002](docs/decisions/DB-002.md). Se versionan esquema, SQL y snapshots para reproducibilidad; no se editan migraciones ya aplicadas. El JSON original se conserva.

## Calidad

```bash
npm run check             # Biome + TypeScript + tooling + unit
npm run format            # corrige formato/imports
npm run test:tooling      # esquema/configuración; no son tests de negocio
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:watch
npm run test:coverage
```

Hay 210 pruebas y la ejecución global pasa íntegramente. Integración/E2E usan PostgreSQL local aislado mediante `TEST_DATABASE_URL` (nombre `loyalty_test_*`, rol con CREATEDB); Vitest no carga `.env`. `npm run test:db` prepara un PostgreSQL 17 temporal mediante Docker y lo retira al terminar; el script fue validado de principio a fin.

```bash
npm run dev              # tsx watch; carga .env y valida configuración
npm run build            # compilación TypeScript a dist/
npm start                # ejecuta dist/src/main.js
npm run test:db          # suites en contenedor PostgreSQL temporal
```

Además de `DATABASE_URL`, el servidor requiere `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY`) y `CARD_TOKEN_ENCRYPTION_KEY` (32 bytes en 64 caracteres hexadecimales). `PORT` por defecto 3000; `CORS_ORIGINS` lista orígenes explícitos separados por coma. La plantilla `.env.example` contiene marcadores, nunca credenciales reales. Guardar la clave de cifrado de forma estable y privada: se usa para recuperar tokens de tarjetas e invitaciones.

API `/api/v1`; `/health`, `/ready` y `/openapi.json`. Antes de usar el backend con datos reales hay que configurar/verificar el proveedor externo y revisar/aplicar explícitamente las nuevas migraciones al destino autorizado. Esta sesión no las aplicó a Supabase.

## Agentes y skills

Leer [AGENTS.md](AGENTS.md) al inicio y actualizarlo al cierre. Seguir el [flujo spec-first/spec-anchored y TDD](docs/workflow.md). Skills mantenidas en `backend/skills/`:

- `loyalty-spec`: especificaciones y trazabilidad.
- `loyalty-tdd`: implementación por pruebas y niveles de calidad.
- `loyalty-schema`: modelo, Drizzle y migraciones.

`npm run skills:install` copia las skills a `.agents/skills/` de la raíz del repositorio, ruta descubrible por Codex y excluida de Git. No sobrescribe skills existentes. Las copias se instalan una vez; tras cambiar `backend/skills/`, revisar y sincronizar sus copias. No se alteran skills globales ni se requieren APIs pagadas/MCP externos. Si el catálogo no se refresca, reiniciar la sesión; AGENTS también enlaza los originales versionados.

## Referencias oficiales consultadas

- [Hono](https://hono.dev/docs/getting-started/basic)
- [Drizzle con PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) — se instalaron versiones estables de npm, no el canal rc del ejemplo actual.
- [Vitest](https://vitest.dev/guide/) y [proyectos de pruebas](https://vitest.dev/config/projects)
- [Skills en Codex](https://learn.chatgpt.com/docs/build-skills)

Plan de implementación documentado: [BACKEND-001](docs/specs/BACKEND-001-plan-de-negocio.md), con registro por QR mediante correo/contraseña o Google OAuth usando Supabase Auth. Reglas y decisiones confirmadas: [reglas de negocio](docs/business-rules.md). La implementación está verificada localmente; consultar los límites externos y operativos. Evidencia y limitaciones: [AGENTS.md](AGENTS.md).

## Mantenimiento de dependencias

Se fija `@esbuild-kit/core-utils > esbuild` en `0.25.12` mediante override para resolver GHSA-67mh-4wv8-2f99 en la cadena de Drizzle Kit. La generación de SQL fue comprobada con este override. Revisarlo al actualizar Drizzle Kit y retirarlo cuando deje de ser necesario. `npm audit` terminó con cero vulnerabilidades tras el ajuste; el registro aún informa de dos paquetes transitivos deprecados.

## Conexión a Supabase

En el panel del proyecto, abrir **Connect** y copiar la cadena con usuario, host y contraseña vigentes a `backend/.env` como `DATABASE_URL`. Para migraciones usar conexión directa; si la red solo tiene IPv4, usar **Session pooler** (puerto 5432). Codificar caracteres reservados de la contraseña en la URL. Fuente: [conexiones de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Después ejecutar `npm run check`, `npm run generate`, `npm run db:check` y `npm run migrate`. No usar `push` ni borrar tablas para resolver conflictos. Aplicación a Supabase completada el 2026-10-18 tras corregir las credenciales locales: 11 tablas, 16 claves foráneas y un registro de migración con hash verificado. Ver AGENTS.md para evidencia y limitaciones.

## Descubrimiento de skills externas

`find-skills` de `vercel-labs/skills` está instalada para Codex en `.agents/skills/find-skills/` de la raíz. El origen y hash están en `../skills-lock.json`; las tres skills loyalty existentes se conservan. No requiere claves API ni configuración global.

Desde la raíz del repositorio (`cd ..` si estás en backend):

```bash
npx --yes skills add https://github.com/vercel-labs/skills --skill find-skills --agent codex --yes
npx --yes skills list --agent codex
npx --yes skills find hono
npx --yes skills find drizzle
npx --yes skills find vitest
```

La skill ayuda a descubrir y evaluar otras skills; no instala automáticamente todos los resultados. Revisar pertinencia y contenido antes de añadirlas. Conservar `skills-lock.json` en Git; `.agents/` permanece excluido y la instalación se reproduce con el comando indicado. El catálogo estará disponible en el siguiente turno; si no se refresca, reiniciar la sesión. Documentación del CLI: https://github.com/vercel-labs/skills.
