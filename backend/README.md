# Backend de loyalty-program

Entorno de desarrollo configurado; sin servidor, endpoints ni lógica de aplicación. Arquitectura de monolito por capas. La entrada de contexto es [docs/index.md](docs/index.md); las [reglas de negocio](docs/business-rules.md) son la fuente de verdad del comportamiento.

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
npm run check             # Biome + TypeScript + pruebas de tooling
npm run format            # corrige formato/imports
npm run test:tooling      # esquema/configuración; no son tests de negocio
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:watch
npm run test:coverage
```

Unit, integración y E2E están configurados pero aún vacíos; ejecutar sus comandos devuelve error por ausencia de tests. No hay métricas funcionales ni scripts dev/start/build hasta autorizar código de aplicación. Integración y E2E futuros deben usar PostgreSQL aislado mediante `TEST_DATABASE_URL`; Vitest no carga automáticamente las credenciales de desarrollo.

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

Plan de implementación documentado: [BACKEND-001](docs/specs/BACKEND-001-plan-de-negocio.md), con registro por QR mediante correo/contraseña o Google OAuth usando Supabase Auth. Reglas y decisiones confirmadas: [reglas de negocio](docs/business-rules.md). El plan aún no está implementado y no cambia los comandos de preparación. Evidencia y limitaciones: [AGENTS.md](AGENTS.md).

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
