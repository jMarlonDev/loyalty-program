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
- AC-002 — Cada llamada obtiene una base exclusiva, migrada con las 16 tablas actuales; los datos no se comparten entre llamadas.
- AC-003 — Reaplicar migraciones no duplica el historial ni modifica datos existentes.
- AC-004 — PostgreSQL rechaza violaciones reales de FK, CHECK y unicidad sin persistir filas inválidas.
- AC-005 — La limpieza se puede repetir y no elimina la base de control ni bases de otra suite.
- AC-006 — Un grafo sintético insertado directamente mediante SQL recorre las 16 tablas. Las FK, nulabilidad y acciones referenciales migradas coinciden con Drizzle; cada relación rechaza referencias huérfanas, los CHECK rechazan sus límites inválidos y las FK compuestas rechazan membresías cruzadas.
- AC-007 — Las restricciones únicas y parciales impiden duplicados y permiten reutilización solo en los estados previstos por DB-003. Cada intento inválido se revierte y conserva el grafo válido. Al terminar se comprueba que la base exclusiva ya no existe.

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

## Ampliación de integridad — 2026-10-18

`tests/integration/schema-integrity.test.ts` añade 84 escenarios sobre PostgreSQL 17 real. Inserta por SQL un grafo de las 16 tablas, con compra, premio, asignación y movimientos cuyo saldo final es cero. Compara las 31 FK migradas (columnas, destinos, orden compuesto y NO ACTION) y toda la nulabilidad con Drizzle; ejercita huérfanos por relación, 16 CHECK, claves primarias no nulas, unicidad de negocio y QR, cuatro cruces de membresías existentes y los índices parciales de membresías/asignaciones. Los rechazos comprueban SQLSTATE; cuando puede haber restricciones solapadas, la prueba de catálogo verifica todas y los casos compuestos verifican además el nombre concreto.

DB-004 se verifica sobre las 16 tablas con un rol ordinario temporal: aun concediendo permisos SQL, RLS oculta filas, impide INSERT y hace que UPDATE/DELETE afecten cero filas. El rol se revierte junto con la transacción; después se comprueba que los registros originales siguen presentes. Cada operación negativa revierte su transacción y el cierre elimina la base exclusiva, comprobando su ausencia en `pg_database` mediante la conexión de control.

Evidencia: primera ejecución de la suite parcial, 67/68 correctas; el fallo era exclusivamente la representación `name[]` del catálogo por `pg`, corregida convirtiendo `attname` a `text` en la consulta del test. No fue un fallo del esquema ni se presenta como RED de negocio. Ejecución final: `npm run test:db -- --project integration tests/integration/schema-integrity.test.ts`, 84/84 correctas y runner finalizado con código 0 tras limpieza. Typecheck, Biome del archivo y `git diff --check` satisfactorios. No se modificaron esquema, migraciones ni Supabase.

Estas pruebas comprueban integridad estructural y controles existentes; permisos de negocio, coherencia entre restaurantes y agregados contables continúan siendo responsabilidad de los casos de uso y sus pruebas transaccionales, según DB-003. No se impusieron restricciones SQL nuevas por inferencia.
