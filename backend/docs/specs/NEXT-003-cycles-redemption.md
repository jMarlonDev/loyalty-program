# NEXT-003 — Compras, premios y entrega por comprobante

Estado: D-03/D-04 aceptadas (ciclos separados y envío al teléfono registrado del titular); implementación en curso. Fecha: 2026-10-19.

## Problema y alcance

Cada compra real confirmada por personal vinculado acredita +1. Al completar la meta, el cliente ve el premio y su tarjeta llena; el reinicio ocurre al entregar el premio, tras escanear y confirmar un comprobante distinto del QR de tarjeta. P5/P7/P8 incorporan este comportamiento sin perder premios o excedentes históricos. La ruta de prueba local puede usar adapters; no equivale a envío WhatsApp real.

## Referencias

[LOYALTY-NEXT-001](../../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente), NC-003/005/007/008/009, AC-05/06/09/10/11/12/13; BR-005/007/012–018/023/025–028/030–032 de [reglas](../business-rules.md). [NEXT-001](NEXT-001-phone-identity.md) fija convenciones; [NEXT-002](NEXT-002-operators.md), permisos; [NEXT-004](NEXT-004-realtime.md), eventos; [NEXT-005](NEXT-005-data-transition.md), conversión. Sustituye débito al generar y prohibición de canje por empleado de LOYALTY-001/ROLE-001 para el modelo nuevo; conserva auditoría, libro, idempotencia, compensaciones y premios históricos.

## Contrato

### Entradas y respuestas

Convenciones de NEXT-001. Todos los endpoints operator requieren cuenta verificada, vínculo activo del restaurante, Origin permitido e Idempotency-Key para mutaciones. La identidad del empleado se obtiene de sesión/vínculo, nunca del JSON. El cliente no tiene acceso operator aunque conozca QR o UUID. No admitir `stamps`, `quantity`, `balance`, `employee_id` ni `customer_id` como parámetros de compra/canje.

`PurchaseInput`: `{restaurant_id:uuid,location_id:uuid,card_id:uuid,sale_reference:string}`. Referencia con trim, 1–100 caracteres conforme al esquema existente, sin controles; preservar mayúsculas/minúsculas mientras se conserve el ámbito histórico. El operador escribe una referencia real de venta, no una generada por el escáner. La unicidad comercial sigue `(location_id,sale_reference)` y todas las entidades deben pertenecer al mismo restaurante.

`PurchaseResult`: `{purchase:{id:uuid,card_id:uuid,sale_reference:string,stamps_earned:1,created_at:date_time},card:CustomerCard,event_id:uuid}`. Card es snapshot canónico de NEXT-001 tras commit. Un snapshot posterior a un replay puede contener saldo mayor: el replay conserva la constancia original y la UI reconcilia el detalle actual por separado.

`RedemptionInput`: `{restaurant_id:uuid,location_id:uuid,token:base64url43,confirm:true}`. `RedemptionResult`: `{redemption:{id:uuid,reward_id:uuid,card_id:uuid,redeemed_at:date_time},card:CustomerCard,event_id:uuid}`. El ID de constancia se mantiene en reintentos; un `confirm:false`, falta de confirmación o QR de tarjeta no entrega.

`VoucherView`: `{reward_id:uuid,card_id:uuid,purpose:"reward",token:base64url43,version:integer>=1,expires_at:date_time}`. Solo titular con sesión suficiente según NEXT-001 recupera el token para renderizar QR; personal obtiene una vista mínima de validación mediante scan, nunca acceso al secreto almacenado. `DeliveryTask`: `{delivery_id:uuid,reward_id:uuid,status:"pending",recipient_masked:string}`. El destinatario nunca viene del cuerpo ni lo elige el operador.

| Método/ruta | Entrada y permiso adicional | Resultado y efectos |
| --- | --- | --- |
| `POST /operator/purchases` | `PurchaseInput`; programa activo, tarjeta/inscripción activas, ubicación activa y no autooperación. | 201 `PurchaseResult`; +1 fijo y transacción descrita abajo. |
| `POST /operator/redemptions` | `RedemptionInput`; token de propósito reward, premio disponible; operación permitida aunque el programa esté ended. | 201 `RedemptionResult`; una entrega, consumo del token y débito según accounting_mode. |
| `GET /customer/rewards/:rewardId/voucher` | Cookie de titular, sesión verificada suficientemente confiable, premio disponible. | 200 `VoucherView`; lectura sin débito. 409 si requiere reemisión técnica o falta material recuperable. |
| `POST /customer/rewards/:rewardId/voucher/reissue` | Titular, Origin, Idempotency-Key; `{}`; límite de reemisión. | 200 `VoucherView`; incrementa versión y revoca todos los tokens previos del premio, sin otro beneficio/débito. |
| `POST /customer/rewards/:rewardId/resend` | Titular, Origin, Idempotency-Key; `{}`; premio disponible, D-04. | 202 `DeliveryTask`; tarea al teléfono registrado del titular, sin canje ni otro premio. |
| `POST /operator/rewards/:rewardId/resend` | Vínculo del restaurante del premio; `{restaurant_id:uuid}`; estado disponible, límites y D-04. | 202 `DeliveryTask`; mismo teléfono registrado del titular, sin sustituirlo por correo/teléfono del operador. |

Errores comunes NEXT-001. Casos específicos 409 `CONFLICT`: venta repetida con otra clave, cuerpo distinto para misma clave, comprobante/premio consumido, comprobante vencido/revocado, programa cerrado a compras o tarjeta bloqueada. Token malformado: 400; token bien formado pero ajeno/propósito equivocado/no encontrado: 404 sin diferenciar existencia. Cliente autenticado que intenta operator: 403; cuenta de personal sin vínculo: 403 o 404 para recurso ajeno según NEXT-002. Autoacreditación/autocanje: 403. Dependencia comercial indispensable no disponible: 503; WhatsApp caído no impide conservar premio ni entregar por alternativa cliente disponible.

### Ciclo y transacción comercial

Para el modelo nuevo: `collecting` 0…N-1 → `reward_available` N → `redeemed`; la entrega crea el siguiente ciclo `collecting` en 0 manteniendo cliente, inscripción y QR de tarjeta. D-03 aceptada: las compras posteriores abren un ciclo separado y generan su propio premio; no se reinicia ni se descarta el ciclo pendiente. El canje descuenta solo el ciclo del premio entregado.

Bloqueo coherente: restaurante/actor → tarjeta/inscripción/ciclo → premio/comprobante cuando corresponda; usar el mismo orden en compra, entrega, revocación y soporte. Verificar vínculo/autooperación dentro de la transacción, también antes de replay. Identidad de operación usa cuenta autenticada + endpoint/recurso + clave + hash del cuerpo normalizado; no la referencia de venta sola.

Compra atómica: verificar referencia comercial → insertar compra +1 → movimiento +1 → asignación al ciclo → si alcanza N, un premio para ese ciclo y allocations de compras → comprobante activo → tarea de WhatsApp según D-04 → incremento de versión de tarjeta → evento outbox → auditoría → idempotencia. No crear débito en la generación del premio nuevo. Restricciones SQL de ciclo/premio y venta única arbitran carreras; un error después de escribir auditoría/outbox revierte todo.

Entrega atómica: revalidar autorización y comprobante → localizar premio y política contable → consumir comprobante/premio → registrar empleado, ubicación y constancia → debitar N solo si `accounting_mode="debit_on_redemption"` → cerrar ciclo y abrir el siguiente si corresponde → versión/evento/auditoría/idempotencia. Para `legacy_debited` no descontar de nuevo ni reiniciar excedentes existentes. Dos transacciones concurrentes sobre un premio permiten una entrega; otra operación recibe 409. La misma clave/cuerpo retorna constancia anterior después de revalidar actor, incluso cuando ese mismo comando ya consumió el token.

La interfaz solo confirma tras respuesta del servidor. En timeout conserva exactamente cuerpo y clave para reintentar; no crea otra referencia de venta ni afirma sello/canje offline. Si se perdió respuesta después del commit, consultar/reintentar el mismo comando recupera su resultado sin repetir movimientos.

### Propósito y vida del comprobante

Token aleatorio de 32 bytes, hash único para validar y cifrado autenticado servidor solo donde se necesite recuperar QR/enviar. Vinculado a premio, tarjeta, restaurante, versión y caducidad técnica. Propósitos distintos del token cliente/tarjeta/invitación; sus tablas/validadores no son intercambiables. URL de QR transporta secreto en fragmento; GET y vistas previas de WhatsApp no producen efectos.

Estados comprobante: `active`, `consumed`, `revoked`, `expired`. Estados premio: `available`, `redeemed`, `cancelled`. Expiración técnica propuesta 30 días; no vence el premio ni sus sellos. Reemisión bajo titularidad suficientemente confiable invalida versión anterior y crea una nueva; tareas antiguas nunca pueden volver a activar token previo. Una copia del QR consumido permite solo constancia que no exponga PII, jamás segundo canje. La UI permite lectura manual equivalente a escáner.

### WhatsApp y alternativa de entrega

D-04 aceptada: envío al teléfono registrado del cliente al completar la meta, con reenvío desde tarjeta propia u operador vinculado al escanear tarjeta llena. No enviar por defecto al operador que valida. Consentimiento transaccional y condiciones del proveedor se resuelven antes de integración real; el teléfono de contacto no autoriza marketing.

Outbox registra `pending`, lease/intentos, siguiente intento, ID proveedor y versión comprobante; adapter envía fuera de transacción. Estados delivery: `pending` → `accepted` → `delivered`, o `failed` con causa pública recuperable. Respuesta del proveedor significa aceptado, no entregado ni canjeado. Callbacks deben validar autenticidad, deduplicar por ID proveedor y evitar regresión de estado; callbacks no consumen premios. No guardar token claro en payload de outbox: referenciar comprobante y resolver material cifrado justo al enviar.

Reintentos iniciales: hasta 5 con backoff acotado; lease expirada permite recuperar tarea interrumpida. Un timeout puede repetir un mensaje al mismo premio/version; nunca crear otro beneficio. Reenvío manual: separación de 60 segundos y máximo 5/hora por premio; devolver 429 con Retry-After, sin bloquear acceso a QR ya disponible. Si no existe proveedor real configurado, adapter productivo informa indisponibilidad; no marcar `accepted` usando un doble. Recepción/callback real requiere evidencia separada.

Si falla WhatsApp, premio y tarjeta llena permanecen. Sesión cliente confiable obtiene QR mediante voucher como alternativa accesible; reenvío no aumenta saldo. La decisión de exclusividad de canal, si el usuario la exige, debe modificar esta spec antes del código. Se limita la entrega en ese canal sin borrar beneficios.

### Correcciones y consentimiento

No ofrecer reversión/cierre en el recorrido habitual de operador. Mecanismo restringido: propietario directo autenticado inicia soporte en endpoints existentes, con motivo para compensación y consentimiento explícito versionado del titular para cierre. El empleado no adquiere estos permisos por simplificar roles. Una reversión que afecte a premio entregado se rechaza; no editar/borrar movimientos originales. El cierre presenta pérdidas, valida consentimiento sobre la versión actual y conserva historial. Si el catálogo heredado aún autoriza Admin, no activar estas rutas nuevas hasta migrar ownership y cerrar la vía antigua conforme NEXT-005.

## Criterios de aceptación

- AC-001 — Escanear/abrir QR solo lee; compra confirmada de empleado vinculado y referencia única concede exactamente +1. Cliente, empleado ajeno/revocado y autooperación no generan movimientos.
- AC-002 — Reintento, doble clic y dos empleados concurrentes sobre una venta generan una compra; clave repetida con cuerpo distinto rechaza. Fallo inducido antes de commit no deja auditoría/outbox parcial.
- AC-003 — N compras generan un premio/ciclo y mantienen N/N sin débito anticipado; D-03 abre un ciclo separado para la compra siguiente sin perder excedentes.
- AC-004 — WhatsApp usa destinatario de D-04, estados persistidos y reintentos; caída, timeout o callback repetido no duplican beneficio ni canjean.
- AC-005 — QR de tarjeta, premio ajeno y token vencido/revocado/consumido no entregan ni descuentan. Reemitir invalida anterior sin cancelar premio; vistas previas son lecturas inertes.
- AC-006 — Confirmar entrega válida consume una vez, debita N nuevo modelo y abre 0/N con misma tarjeta. Reintento y dos entregas simultáneas dejan una constancia. Próxima compra deja 1/N.
- AC-007 — Premio heredado debitado se entrega sin segundo débito ni pérdida de excedente; corrección/cierre conservan controles, compensaciones e historial.
- AC-008 — Cliente conectado ve sello/premio/reinicio solo después de commit; caída del canal se resuelve leyendo estado canónico.

## Trazabilidad y validación

| BR → NC → aceptación del plan | Criterio | Nivel / archivo / nombre previsto | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| BR-005/007/013/023/026 → NC-003/007 → AC-05/06 | AC-001 | integración `backend/tests/integration/customer-purchases.test.ts`: `records one stamp only after authorized confirmation` | Pendiente |
| BR-013/028/031 → NC-007 → AC-06 | AC-002 | integración `backend/tests/integration/customer-purchases.test.ts`: `serializes duplicate sales and rolls back partial effects` | Pendiente |
| BR-014/016/027 → NC-009 → AC-09 | AC-003 | integración `backend/tests/integration/next-flow.test.ts`: `opens a separated cycle while a reward is pending` | Pendiente |
| BR-027/028/032 → NC-009 → AC-10 | AC-004 | integración `backend/tests/integration/reward-delivery.test.ts`: `retries one reward without treating delivery as redemption` | D-04/proveedor pendiente |
| BR-023/027 → NC-009 → AC-11 | AC-005 | integración `backend/tests/integration/reward-vouchers.test.ts`: `rejects stale and wrong-purpose vouchers without effects` | Pendiente |
| BR-015/027/028 → NC-009 → AC-11/12 | AC-006 | integración `backend/tests/integration/customer-redemptions.test.ts`: `redeems once concurrently and starts the next cycle` | Pendiente |
| BR-006/017/020/021/030 → NC-010 → AC-13 | AC-007 | integración `backend/tests/integration/next-schema-upgrade.test.ts`: `redeems legacy benefits without debiting twice` | Pendiente |
| BR-025/029 → NC-008/009 → AC-07/12/14 | AC-008 | navegador `tests/browser/customer-flow.spec.ts`: `keeps card identity across live redemption` | Pendiente |

## Preguntas y riesgos

D-03/D-04 están aceptadas. Queda elegir y configurar el proveedor real de WhatsApp y validar entrega/callback; el adaptador local no acredita envío real. Credenciales, remitente, plantillas, consentimiento y callback auténtico deben verificarse antes de activar WhatsApp. Un empleado puede inventar una referencia sin POS: la auditoría permite investigar, no prueba que existió pago.
