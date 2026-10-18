# TX-001 — Transacciones y reintentos

Estado: aceptada para implementación el 2026-10-18 por solicitud vigente.

## Problema y alcance

Infraestructura común para las fases 2–7 de [BACKEND-001](BACKEND-001-plan-de-negocio.md). BR-009, BR-013 a BR-017 y BR-020/021 requieren efectos atómicos, acceso vigente y reintentos sin duplicados.

## Contrato

`withTransaction(pool, work)` abre una transacción, confirma el resultado o revierte todos sus efectos y libera la conexión. Las violaciones de unicidad se traducen a conflicto seguro sin detalles de SQL.

Cada comando de negocio bloquea restaurante (`FOR UPDATE`) y perfil activo (`FOR SHARE`) y verifica pertenencia/estado dentro de la transacción antes de consultar resultados idempotentes. Ese bloqueo serializa cambios del mismo restaurante, incluidas modificaciones de permisos y beneficios. No promete concurrencia paralela dentro del mismo restaurante en esta versión.

`Idempotency-Key`: texto ASCII visible de 1–255 caracteres, sin espacios. La clave pertenece al actor en todo el backend. La huella incluye operación y cuerpo canónico (claves de objeto ordenadas, orden de arrays conservado). Se bloquea actor/clave con advisory lock transaccional y se persiste resultado JSON. Mismo contenido devuelve el resultado; distinto contenido devuelve `409 IDEMPOTENCY_CONFLICT`. Los rechazos no guardan resultados. La autorización se revalida antes de reproducir uno. Identificadores/fechas proceden del servidor.

## Criterios de aceptación

- AC-001 — Canonicalización ignora orden de claves, distingue operación/contenido y rechaza claves inválidas.
- AC-002 — Fallos revierten escrituras y liberan conexión; transacciones posteriores funcionan.
- AC-003 — Reintentos simultáneos realizan un solo efecto; conflicto no añade efectos.
- AC-004 — Usuario suspendido/cerrado y restaurante inexistente se rechazan sin cambios; cada caso de uso aplica además su política.

## Trazabilidad y validación

| Criterios | Prueba | Evidencia |
| --- | --- | --- |
| AC-001 | unit `transactions.test.ts` | RED: ocho fallos; GREEN: diez pruebas |
| AC-002 a AC-004 | integration `transactions.test.ts` | Tres pruebas con PostgreSQL aislado: rollback, concurrencia/replay y acceso |

## Riesgos

Los adaptadores de los módulos deben mantener un orden uniforme de bloqueos: restaurante, perfil y clave idempotente. Creación de restaurante bloquea perfil y clave, al no existir restaurante aún. No cargar credenciales de desarrollo en pruebas. No hay transacción distribuida con Supabase.
