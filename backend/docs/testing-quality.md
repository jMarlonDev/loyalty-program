# Revisión de calidad — 2026-10-18

> Informe histórico anterior a las correcciones de acceso móvil y sesión. Las cifras, configuración y limitaciones describen aquella revisión; consultar el [estado vigente](development-status.md) para los cambios posteriores.

La suite pasa **400/400 pruebas en 28 archivos**, frente a las 210 anteriores: 6 de tooling, 217 unitarias, 159 de integración y 18 E2E. Se añadieron 190 pruebas y se reforzaron casos existentes. El alcance es el backend implementado; frontend continúa reservado.

## Resultado reproducible

```bash
npm run test:db -- --coverage --sequence.shuffle --sequence.seed=20261018
npm run check
npm run build
npm run db:check
npm run generate
```

Ejecución agregada final: 400 correctas, orden aleatorio, PostgreSQL 17 real, salida 0 y limpieza completada. Biome, TypeScript, build e historial Drizzle correctos; generación sin cambios. `git diff --check` satisfactorio. No hubo modificación de esquema ni nuevas migraciones.

| Métrica V8 sobre todo `src/` | Resultado | Umbral global |
| --- | --- | --- |
| Líneas | 94,36 % (1071/1135) | 90 % |
| Sentencias | 92,78 % (1131/1219) | 90 % |
| Ramas | 90,47 % (722/798) | 90 % |
| Funciones | 95,54 % (279/292) | 90 % |

Informes locales generados en `coverage/index.html`, `coverage/lcov.info` y `coverage/coverage-summary.json`, excluidos de Git. El umbral se aplica al conjunto; no garantiza ese porcentaje para cada archivo. Ningún archivo de `src/` se excluyó para mejorar la métrica.

## Hallazgos corregidos

1. **UUID equivalentes rechazados.** Programas/fidelización aceptaban mayúsculas en la validación pero comparaban algunas referencias con UUID en minúsculas devueltos por PostgreSQL. RED: compra válida devolvía 404; unitarias mostraban falta de normalización. Se normalizan rutas/cuerpos sin mutar la entrada y se comprueba también replay idempotente.
2. **Conexión insegura tras fallar rollback.** El error de ROLLBACK ocultaba el original y la conexión regresaba al pool. Dos pruebas unitarias demostraron el fallo. Se conserva el error original, incluida la traducción de unicidad, y se descarta la conexión si no pudo revertir.
3. **Dependencias entre tests.** Identidad y programas compartían precondiciones entre casos. Una prueba E2E de edición fallaba sola con 404 en lugar de 200. Cada escenario prepara sus datos; la suite completa pasa con orden aleatorio.
4. **Arranque prematuro de PostgreSQL.** `pg_isready` mediante socket podía detectar el servidor provisional de initdb; se observó `the database system is starting up`. Ahora se comprueba TCP dentro del contenedor antes de ejecutar Vitest.

## Cobertura de escenarios

| Parte / referencia | Comprobaciones reforzadas |
| --- | --- |
| DB-001–004, TESTDB-001 AC-006/007 | 84 casos de integridad: grafo SQL en 16 tablas; 31 FK, 16 CHECK, nulabilidad, unicidad, índices parciales, cruces entre membresías, NO ACTION y RLS CRUD |
| IDENTITY-001, BR-008/009 | Perfiles independientes, concurrencia contra suspensión real, cierre, sujetos con mismo correo, campos inmutables; timeout que aborta y respuestas malformadas del proveedor |
| STAFF-001, BR-003/010/011 | Recursos ajenos, destinatarios inválidos, tokens cifrados, replay sin auditoría duplicada y rollback completo ante fallo de auditoría |
| PROGRAMS-001, BR-004/012/018/019 | Paginación completa sin saltos/duplicados y aislada por restaurante/cliente, rollback de inscripción y bloqueo de condiciones, QR rotado y reintentos |
| LOYALTY-001, BR-013–021 | Concurrencia, estados bloqueados, revocación/vencimiento de consentimiento, rollback de compras/premios/cierre y conservación contable |
| TX-001 | Claves separadas por actor, conflicto entre operaciones, retry después de rollback sin consumir clave, descarte de conexión fallida |
| CORE/OPS | 35 rutas privadas rechazan anónimos antes de proveedor/BD; bytes UTF-8, errores/logs/CORS; JSON inválido en cuatro módulos sin cambios en ninguna tabla |
| BACKEND-001 E2E | Ciclo HTTP completo: personal, inscripción, consultas, movimientos, rotación QR, compras, entrega, reversión, consentimiento revocado, cierre y reinscripción |

Los fallos de auditoría se inyectan en la base temporal para comprobar rollback de todos los efectos, no solo el código de error. Los tests de validación separan entradas inválidas para evitar que un error oculte otro.

## Datos de prueba y eliminación

- `test:db` crea PostgreSQL temporal en Docker, puerto local aleatorio y credencial efímera; elimina `DATABASE_URL` del entorno de Vitest y no carga `.env`.
- Cada suite crea una base exclusiva `loyalty_test_<uuid>` y aplica las migraciones locales existentes. No reutiliza la base del usuario.
- La suite SQL inserta registros relacionados en las 16 tablas, incluida compra, premio, asignación y movimientos de saldo cero. Los intentos inválidos se revierten y se comprueba que los datos originales permanecen intactos.
- La suite de integridad comprueba en `pg_database` que su base ya no existe después de `cleanup()`. El rol RLS temporal también se revierte.
- El runner detiene y elimina su contenedor en `finally`, incluso cuando una prueba falla. Inventario Docker final sin contenedores `loyalty-test-*`; no quedaron fixtures de esta revisión.

## Límites y próximos pasos

Los proveedores de identidad se sustituyen por dobles explícitos; estas pruebas no validan Google OAuth ni correo real. El arranque real de `main.ts`, señales del proceso y fallos de infraestructura del despliegue conservan cobertura limitada (17,07 % de líneas en `main.ts`); se probó el cierre unitario, HTTP real en puerto temporal y la compilación, no un despliegue. CI, prueba de carga y validación externa siguen pendientes.

La integridad entre restaurantes y las reglas agregadas se aplican también en los casos de uso; las FK por sí solas no sustituyen los permisos. El umbral global no demuestra ausencia de defectos ni disponibilidad productiva. Las nuevas migraciones siguen sin aplicarse a Supabase; requieren autorización específica del destino. Cambios locales sin commit/push en esta revisión.
