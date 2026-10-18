# LOYALTY-001 — Compras, premios, reversión y cierre confirmado

Estado: implementada y validada con PostgreSQL aislado. Fecha: 2026-10-18.

## Problema y referencias

Implementa fases 5–7 de [BACKEND-001](BACKEND-001-plan-de-negocio.md), reglas [BR-005, BR-012 a BR-017, BR-020/021](../business-rules.md) y persistencia [DB-003](../decisions/DB-003.md). Compras, contabilidad, asignaciones, consentimiento e idempotencia se escriben en una única transacción PostgreSQL. El restaurante se bloquea antes del actor y se comprueba autorización actual antes de reutilizar un resultado.

## Contratos HTTP

Prefijo `/api/v1`, identidad verificada Supabase, errores comunes y `Idempotency-Key` obligatorio en comandos. UUID del actor, personal, sellos y fechas se obtienen en servidor. Se rechazan campos desconocidos.

| Método/ruta | Entrada | Salida |
| --- | --- | --- |
| POST `/restaurants/:id/purchases` | `{card_id, location_id, sale_reference}` | 201 `{data: {purchase_id, membership_id, balance, rewards}}` |
| POST `/restaurants/:id/rewards/:rewardId/redeem` | `{location_id}` | 200 `{data: {reward_id, status}}` |
| POST `/restaurants/:id/purchases/:purchaseId/reverse` | `{reason}` | 200 `{data: {purchase_id, status, balance, rewards}}` |
| GET `/me/cards/:cardId/closure-preview` | Sin cuerpo | `{data: {card_id, benefits_version, balance, rewards}}` |
| POST `/me/cards/:cardId/closure-consents` | `{benefits_version, accepted:true}` | 201 `{data: {id, card_id, benefits_version, expires_at}}` |
| DELETE `/me/cards/:cardId/closure-consents/:consentId` | Sin cuerpo | 200 `{data: {id, revoked:true}}` |
| POST `/restaurants/:id/cards/:cardId/close` | `{consent_id}` | 200 `{data: {card_id, status:'closed'}}` |

Compras requieren restaurante, personal, sucursal, programa, membresía y tarjeta activos y del mismo restaurante. No se permite autocompra ni autocanje. Canjear admite programa pausado/finalizado y no crea débito adicional. La referencia de venta no puede reutilizarse tras reversión. Una compra genera exactamente +1, luego premios por bloques de meta y asignaciones FIFO de compras válidas; los excedentes quedan como saldo.

Owner/Admin revierte con motivo: si una asignación activa financió un premio entregado se rechaza todo. Para premios disponibles afectados, cancela, libera asignaciones, compensa su débito, resta el sello original y recalcula. Compras/movimientos originales nunca se eliminan. La reversión de membresía cerrada se rechaza.

El titular obtiene vista previa y consiente la versión actual con aceptación explícita. Consentimiento dura quince minutos, se puede revocar y solo se consume una vez. Personal activo ejecuta cierre con consentimiento de ese titular/tarjeta, versión actual y vigencia. Cierre cancela pendientes, anula saldo por un movimiento, cierra membresía, bloquea tarjeta, invalida QR y conserva historial. Toda mutación de beneficios incrementa su versión.

Errores: 400 entrada inválida; 401 sesión; 403 rol/estado/autooperación; 404 recurso ajeno/inexistente; 409 referencia, clave, estado, consentimiento o versión incompatible. Rechazos no persisten efectos. Repetición de clave/cuerpo devuelve resultado original tras validar acceso; clave con otro cuerpo da 409. Una revocación de acceso impide incluso ese replay.

## Criterios de aceptación y trazabilidad

| AC | Reglas | Prueba |
| --- | --- | --- |
| 001 | BR-013/014 | Unit plan FIFO y validación; integración compras + premios + excedentes |
| 002 | BR-005/012/013 | Integración rechazos y reintentos/concurrencia sin efectos duplicados |
| 003 | BR-015/016 | Integración canje único concurrente, programa finalizado, no autocompra/canje |
| 004 | BR-017 | Integración reversión compensatoria/recalcular y rechazo atómico si premio entregado |
| 005 | BR-020/021 | Integración consentimiento, revocación, caducidad, versión y cierre lógico |
| 006 | BR-013/020/021 | Integración concurrencia compra/cierre/canje/reversión, conservación de historial |

## Validación y límites

RED: cinco pruebas unitarias fallaron por asignaciones incorrectas, ausencia de validación y autoconcesión permitida; nueve pruebas de integración fallaron por saldo ausente y permisos/consentimientos sin implementar. GREEN: cinco pruebas unitarias y doce de integración con PostgreSQL 17, incluyendo compras/canje simultáneos, canje contra reversión, compra contra cierre y revocación contra cierre. Se verifica tanto la respuesta como efectos persistidos y ausencia de efectos en rechazos. Biome sobre los archivos del módulo satisfactorio.

Comandos: `npm run test:unit -- tests/unit/loyalty.test.ts`; `npm run test:integration -- tests/integration/loyalty.test.ts` con `TEST_DATABASE_URL` explícita local. Los tests usan fixtures de identidad; no representan verificación del proveedor real. El cifrado/rotación/consulta de QR pertenece al módulo de programas; este módulo solo invalida el QR al cerrar. No incluye cancelación administrativa libre ni ajustes manuales. El frontend debe mostrar la vista previa antes de enviar su versión aceptada; el backend valida titular, versión y aceptación pero no puede probar qué vio una persona en pantalla.

## Refinamiento de verificación — 2026-10-18

Los UUID válidos admiten hexadecimal en mayúsculas y se normalizan a minúsculas antes de comparar recursos o calcular la identidad de un reintento. Cambiar únicamente la representación de un UUID no cambia el recurso ni el comando. Las pruebas de atomicidad inducen un fallo de auditoría después de escribir efectos y verifican rollback de negocio, auditoría e idempotencia; un reintento posterior puede completar el comando.

- RED real: una compra con UUID de restaurante válido en mayúsculas devolvía 404 al compararlo con la representación canónica de PostgreSQL. Dos regresiones unitarias de los módulos demostraron la falta de normalización; GREEN tras normalizar rutas/cuerpos sin mutar la entrada. La integración prueba además replay con representación minúscula y una única compra persistida.
- Nuevas verificaciones: ocho reintentos simultáneos producen una compra/premio/auditoría y dos movimientos; matriz de nueve estados bloqueados compara todas las filas de negocio y auxiliares antes/después; fallos inducidos de auditoría revierten incluso asignaciones de premios y consumo de consentimiento/cierre/QR; vencimiento se rechaza en el instante exacto. Las entradas inválidas se prueban individualmente manteniendo válidos los demás campos, con límites de referencia, motivo y meta.
- Verificación focal: 24 pruebas unitarias de fidelización; 27 de integración dentro de la ejecución conjunta programas/fidelización (41/41 correctas con PostgreSQL 17 temporal). `npm run check` global también pasó (6 tooling y 217 unit en ese momento). Los fixtures y triggers se limitan a bases temporales; no se utiliza Supabase ni `.env`.
- Repetición focal con orden aleatorio (`--sequence.shuffle --sequence.seed=20261018`): 41/41 correctas; no depende del orden previo de ejecución. Ambas ejecuciones finalizaron con limpieza automática.
