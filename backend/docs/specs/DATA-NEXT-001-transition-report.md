# DATA-NEXT-001 — Inventario previo a la transición telefónica

Estado: aceptada para preparación local por LOYALTY-NEXT-001/P1. Fecha: 2026-10-19.

## Problema y alcance

Antes de convertir el esquema 0004 se necesita identificar conflictos y guardar la contabilidad existente sin atribuir propiedad a un teléfono no verificado. Esta entrega implementa un informe de solo lectura para copias locales; no implementa conversión, recuperación de tarjeta ni reglas pendientes D-01–D-05.

## Referencias

LOYALTY-NEXT-001 NC-005/006/010, AC-13; BR-012/013/014/017/020/021 en su contexto histórico; DB-003, DB-004, [DB-006](../decisions/DB-006-phone-customer-transition.md).

## Contrato

Comando: `node --import tsx backend/scripts/transition-report.ts`. Entrada única `TRANSITION_DATABASE_URL`, definida explícitamente por el ejecutor, PostgreSQL en `localhost` o `127.0.0.1`, base con prefijo `loyalty_test_` o `loyalty_copy_`, sin query ni fragmento. Rechaza URL ausente, remota, esquema no PostgreSQL o nombre fuera del ámbito local. No carga `.env`, no utiliza `DATABASE_URL` ni ejecuta migraciones. El destino debe contener las tablas del esquema 0004.

Salida JSON versionada: `schemaVersion: 1`, `sourceSchema: '0004'`, `mode: 'read-only'`, `conversionAllowed: false`, `counts` por tabla, `memberships` con UUID/saldo/compras/premios disponibles y consumidos, `findings` con código, nivel y UUID afectados. No incluye fecha variable: repetir sobre el mismo snapshot devuelve idéntico contenido ordenado. No emitir nombres, teléfonos, correos, referencias de venta, tokens, claves ni credenciales. El informe tiene información interna; guardarlo fuera de Git.

La librería `collectTransitionReport(client)` usa una conexión dedicada y transacción `REPEATABLE READ READ ONLY`, consulta metadatos y datos, y finaliza con `ROLLBACK` incluso si falla. El nivel mantiene una fotografía consistente para todas las lecturas; el rollback reafirma que no hay efectos persistidos. Rechaza tablas con columnas de la transición nueva para no aplicar semántica heredada a premios nuevos. SQL limitado a lectura, `BEGIN` y `ROLLBACK`; límites locales de sentencia/bloqueo para no quedar esperando escrituras.

Códigos de hallazgo: `customer_phone_missing`, `customer_phone_noncanonical`, `customer_phone_unverified`, `canonical_phone_collision`, `mixed_account`, `owner_missing`, `owner_ambiguous`, `legacy_admin`, `multiple_active_programs`, `legacy_invitation`, `local_password_present`, `purchase_requires_review`, `ledger_requires_review`, `negative_balance`, `reward_requires_review`, `legacy_reward_already_debited`, `legacy_reward_with_remaining_balance`. Niveles `blocker` (impide conversión automática) e `info` (preservar/revisar). Un valor presente en `users.phone` nunca se considera verificado. `conversionAllowed` siempre es false, incluso en una base vacía.

El inventario de premios disponibles/canjeados comprueba débito histórico neto igual a `-stamps_spent`, número de asignaciones activas igual a meta y coherencia de entrega; no descuenta nada. La reconciliación completa de la aplicación y prueba de restauración son tareas posteriores.

Salida del proceso: 0 si pudo producir informe (conflictos incluidos); 1 ante configuración/consulta fallida. Errores de CLI son genéricos y no imprimen URL, mensajes SQL ni credenciales. No aplica HTTP, autenticación remota o permisos de caja.

## Criterios de aceptación

- AC-001 — URL local explícita válida se acepta; URL de producción, vacía o con parámetros se rechaza sin mostrar secretos.
- AC-002 — Un snapshot con teléfonos ausentes/duplicados/no verificados, cuentas mixtas, varios owners/admins/programas genera hallazgos por UUID, sin datos personales ni credenciales.
- AC-003 — Un premio histórico disponible con débito y excedente conserva balance y premio; se clasifica como ya debitado y reporta excedente, nunca como tarjeta vacía que deba reiniciarse.
- AC-004 — Dos ejecuciones dan el mismo informe y los datos antes/después coinciden; todas las lecturas están dentro de transacción de solo lectura y rollback, también tras fallo.
- AC-005 — Una base posterior a 0004 se rechaza explícitamente para evitar clasificar premios nuevos como heredados.

## Trazabilidad y validación

| Criterio | Nivel | Archivo/prueba | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| AC-001/004/005 | Unit | `tests/unit/transition-report.test.ts` | RED: cuatro expectativas fallaron antes de implementar. GREEN: 12/12. |
| AC-002/003/004 | PostgreSQL | `tests/integration/transition-report.test.ts` | Dos casos correctos con PostgreSQL 17 temporal; conservación íntegra de las 16 tablas y repetición idéntica. El primer intento detectó un cast incorrecto del fixture, corregido antes de verificar comportamiento. |

Comandos ejecutados: `npm run test:unit --workspace backend -- tests/unit/transition-report.test.ts`, `npm run test:db -- --project integration tests/integration/transition-report.test.ts` y `npm run typecheck --workspace backend`. Biome sobre los tres archivos correcto. No se consultó un destino remoto ni se cargó `.env`. Esta evidencia valida el informe y sus controles; no afirma conversión, migración de producto ni ensayo de restauración.

## Preguntas y riesgos

D-01–D-05 permanecen pendientes para su implementación afectada. El informe no normaliza números arbitrarios porque faltan contexto de país y posesión; solo agrupa coincidencias exactas ya canónicas y marca los demás para revisión. No entrega datos remotos ni prueba backup/restore. El rol usado debe poder leer las tablas privadas únicamente en la copia aislada; no se cambian grants ni RLS.
