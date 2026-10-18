# ENV-001 — Preparación del backend

Estado: preparación completada el 2026-10-18; ver evidencia de ejecución en AGENTS.md.

## Alcance

Instalar Hono, Drizzle ORM/Kit, PostgreSQL driver y Vitest; configurar TypeScript, calidad, contexto y skills. Preparar esquema y comandos generate/migrate desde el JSON. Excluye servidor, endpoints, casos de uso, autenticación, seeds y ejecución de migraciones sobre la BD del usuario.

## Aceptación

- AC-001: instalación reproducible por npm ci y versiones fijadas.
- AC-002: esquema conserva tablas, tipos, nulabilidad, claves y relaciones del JSON salvo DB-001 y DB-002 autorizados.
- AC-003: generate produce SQL local sin requerir conexión; migrate toma DATABASE_URL de .env y falla claramente si falta.
- AC-004: Vitest separa tooling/unit/integration/e2e sin ocultar suites vacías.
- AC-005: documentos canónicos, plantilla y skills guían trabajo spec-first, spec-anchored y TDD.
- AC-006: no se modifica .env ni se implementan funcionalidades.

## Trazabilidad

AC-002 → `tests/tooling/schema.test.ts` (tooling). AC-001/003/004/005/006 → verificaciones de preparación registradas en AGENTS. No equivalen a tests funcionales.
