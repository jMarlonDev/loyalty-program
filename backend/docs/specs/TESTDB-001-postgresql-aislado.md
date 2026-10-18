# TESTDB-001 — PostgreSQL aislado para pruebas

Estado: implementada. Fecha: 2026-10-18.

## Problema y alcance

La fase 0 de BACKEND-001 necesita ejecutar integración y E2E sobre PostgreSQL real sin tocar Supabase ni la base de desarrollo. Se proporciona un helper compartido, guardas unitarias y pruebas de la migración existente. No cambia reglas de negocio ni el esquema.

## Referencias

- [BACKEND-001](BACKEND-001-plan-de-negocio.md), fase 0.
- [Flujo de pruebas](../workflow.md): aislamiento obligatorio y limpieza exclusiva de recursos propios.
- [DB-001](../decisions/DB-001.md) y [DB-002](../decisions/DB-002.md): integridad del esquema existente.

## Contrato

`createTestDatabase()` requiere exclusivamente `TEST_DATABASE_URL` explícita; no carga `.env`. Solo acepta PostgreSQL en `localhost` o `127.0.0.1`, base `loyalty_test_*`, sin parámetros que puedan cambiar la conexión. Rechaza el mismo destino que `DATABASE_URL`, incluso con credenciales distintas. Crea una base nueva `loyalty_test_<uuid>`, aplica el historial Drizzle real y devuelve `{ pool, db, migrate, cleanup }`. `cleanup()` es idempotente y elimina únicamente esa base creada por la llamada. El usuario PostgreSQL temporal necesita permiso CREATEDB.

## Criterios de aceptación

- AC-001 — Configuración ausente, mal formada, remota, no identificada como prueba o coincidente con desarrollo se rechaza antes de abrir conexión, sin imprimir credenciales.
- AC-002 — Cada llamada obtiene una base exclusiva, migrada con las once tablas originales; los datos no se comparten entre llamadas.
- AC-003 — Reaplicar migraciones no duplica el historial ni modifica datos existentes.
- AC-004 — PostgreSQL rechaza violaciones reales de FK, CHECK y unicidad sin persistir filas inválidas.
- AC-005 — La limpieza se puede repetir y no elimina la base de control ni bases de otra suite.

## Trazabilidad y validación

| Criterio | Nivel | Archivo/prueba | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| AC-001 | unit | `tests/unit/test-database.test.ts` | RED: 9 guardas fallaron; GREEN: 10 casos pasan |
| AC-002, AC-003 | integration | `tests/integration/migrations.test.ts` | RED: 0 tablas frente a 11; GREEN: migración y reejecución correctas |
| AC-004 | integration | `tests/integration/migrations.test.ts` | RED: tablas ausentes; GREEN: PostgreSQL rechaza con 23503, 23505 y 23514 |
| AC-005 | integration | `tests/integration/migrations.test.ts` | RED: fixture ausente; GREEN: aislamiento y limpieza idempotente correctos |

Comandos ejecutados: `npm run test:unit -- tests/unit/test-database.test.ts` (10 casos), `npm run test:integration -- tests/integration/migrations.test.ts` (4 casos, `TEST_DATABASE_URL` explícita al contenedor temporal PostgreSQL 17), `npm run typecheck` y Biome sobre los tres archivos TypeScript, todos satisfactorios. La base de control permanece mientras otras suites usan el contenedor; el cierre de sesión retira el contenedor completo.

## Preguntas y riesgos

La conexión es deliberadamente local; CI debe exponer PostgreSQL como servicio local. Estas pruebas validan infraestructura, no los flujos funcionales del producto. El helper nunca reutiliza ni limpia una base suministrada por el usuario; solo bases únicas creadas por él.
