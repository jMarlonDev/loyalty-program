# NEXT-001 — Identidad telefónica, inscripción y sesión del cliente

Estado: D-01 aceptada sin OTP (acceso simple por teléfono); implementación en curso. Fecha: 2026-10-19.

## Problema y alcance

El cliente abre el QR público, se identifica con su teléfono y vuelve a la misma tarjeta meses después. No necesita correo, contraseña ni Google. La cuenta de personal sigue separada. Esta spec cubre P4 y los cimientos independientes de P1; acepta el riesgo de suplantación por conocimiento del número y no transforma clientes reales.

## Referencias

[LOYALTY-NEXT-001](../../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente), NC-001/004/005/006/010, AC-02/03/04/13; BR-004/008/009/016/018/022/023/024/025/030/031 de [reglas](../business-rules.md). [NEXT-005](NEXT-005-data-transition.md) define migración; [NEXT-004](NEXT-004-realtime.md), notificaciones. Sustituye identidad cliente de IDENTITY-001, inscripción de PROGRAMS-001 y sesión cliente de SESSION-003; conserva las sesiones de cuenta del personal.

## Contrato

### Convenciones compartidas por NEXT-001–005

Prefijo `/api/v1`; éxito `{data:DTO}`, listas `{data:DTO[],next_cursor:string|null}`, sin datos en 204. Error `{error:{code:string,message:string,request_id:string}}`; cabecera `X-Request-Id` según CORE-001. Campos JSON en snake_case, objetos estrictos sin propiedades adicionales. UUID válido se normaliza en minúsculas; timestamps ISO 8601 UTC. `limit` entero 1–100, default 20; cursor UUID exclusivo. Todas las respuestas con sesiones, tarjetas o QR usan `Cache-Control: no-store`.

Mutaciones protegidas por cookie requieren `Origin` exacto permitido; ausencia o diferencia responde 403 `FORBIDDEN`, incluso desde cliente autenticado. Nunca usar `Access-Control-Allow-Origin: *` con credenciales. `Idempotency-Key` requerida donde se indica: string 1–128 de ASCII alfanumérico/guion/guion bajo; clave calculada por actor autenticado + operación + recurso y hash del payload normalizado. Revalidar permiso y vigencia de identidad/vínculo antes de devolver replay; el estado cambiado por el propio comando exitoso no impide devolver su constancia. Mismo comando conserva respuesta y estado HTTP original; misma clave con otro cuerpo responde 409 `CONFLICT`. El header no acredita una compra ni sustituye su referencia comercial.

Errores comunes: 400 `INVALID_INPUT`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND` para recurso ausente/ajeno, 409 `CONFLICT` para estado/clave incompatible, 429 `RATE_LIMITED` con `Retry-After`, 503 `SERVICE_UNAVAILABLE` cuando falta dependencia imprescindible. Mensajes no filtran si un teléfono tiene cliente/tarjetas. Excepción inesperada: 500 `INTERNAL_ERROR` sin stack o valores sensibles.

### Cookie y primitivas de sesión

En HTTPS: `__Host-loyalty_customer=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=34560000`, sin `Domain`. Solo HTTP de desarrollo local permitido por configuración usa `loyalty_customer_dev`, sin `Secure`; producción rechaza origen HTTP en lugar de degradar seguridad. El nombre de desarrollo no se acepta como cookie de producción. Un servidor con HTTPS de desarrollo usa los atributos seguros de HTTPS.

Token generado exclusivamente en servidor con 32 bytes aleatorios criptográficos, base64url sin padding (43 caracteres); validación sintáctica estricta antes de consulta. Persistir SHA-256 del token, nunca token en claro. `customer_sessions` relaciona hash, cliente, emisión, vencimiento y revocación. La cookie no contiene teléfono, saldo, ID de tarjeta, JWT de personal o comprobante. Duplicidad/ambigüedad del nombre de cookie se rechaza; el parser no acepta otro tipo de credencial como fallback.

`src/server/customer-cookie.ts` y `tests/server/customer-cookie.test.ts` implementan emisión, lectura, hash y borrado. `clear` conserva nombre/path/atributos y usa Max-Age=0. Solo logout o rechazo definitivo de sesión eliminan cookie; un timeout/503 de BD no la borra. La ausencia de sesión produce 401 en recursos privados. Cookie cliente nunca autentica endpoints de personal, y cookies de personal nunca autentican esta API cliente.

API de transporte: `createCustomerCookie({origin,development?:boolean})` devuelve `{name,read(Request),issue(token,expiresAt,now),clear()}`. `issue` limita Max-Age al menor de 400 días y el tiempo restante del vencimiento servidor; nunca extiende una sesión vencida. HTTP solo con development explícito y origen local/LAN validado. Rechazar encodings alternativos y cookies duplicadas. El transporte recibe el token: CSPRNG y SHA-256 pertenecen al backend, evitando una dependencia backend → src/server; su prueba no implica persistencia o autenticación funcional.

La duración objetivo son 400 días; el servidor no admite expiración posterior a la que representa la cookie. No se promete permanencia si el navegador borra/restringe cookies. Renovación como máximo una vez cada 24 horas de uso autenticado: transacción compara versión de sesión, emite token nuevo y extiende vencimiento. Durante 60 segundos el hash anterior solo puede resolver la misma sesión/familia, sin provocar otra rotación; revocar familia invalida ambas generaciones. Concurrencia de pestañas no debe reemplazar cookie nueva por una generación anterior ni resucitar una sesión revocada. Hashes anteriores se eliminan al vencer gracia. Esta rotación necesita pruebas de repositorio antes de habilitarse; un socket abierto no extiende la sesión por sí solo.

### Tipos de respuesta

`PublicProgram`: `{id:uuid,restaurant_id:uuid,restaurant_name:string,public_code:string,name:string,description:string|null,stamps_required:integer>0,reward_description:string,logo_url:https|null,background_color:hex,text_color:hex,card_message:string|null,status:"active"}`. Conserva restricciones de diseño de PROGRAMS-001; no expone personal, teléfonos o participantes.

`CustomerCard`: `{id:uuid,membership_id:uuid,program:PublicProgramSnapshot,status:"active"|"blocked",version:integer>=0,balance:integer>=0,cycle:CycleSummary|null,rewards:RewardSummary[]}`. `PublicProgramSnapshot` contiene mismos campos públicos, con `status:"active"|"paused"|"ended"` para una tarjeta ya adquirida. `CycleSummary`: `{id:uuid,number:integer>=1,state:"collecting"|"reward_available"|"redeemed",stamps:integer>=0,target:integer>0}`. Null solo para tarjeta heredada pendiente de conversión. `RewardSummary`: `{id:uuid,status:"available"|"redeemed"|"cancelled",description:string,delivery_status:"not_requested"|"pending"|"accepted"|"delivered"|"failed",accounting_mode:"legacy_debited"|"debit_on_redemption"}`. El saldo es canónico del libro, no una entrada del navegador. D-03 define la relación final entre ciclos adicionales y saldo, sin perder excedentes heredados.

`CustomerSessionView`: `{authenticated:true,expires_at:date_time,phone_masked:string}`. No devuelve token, hash o teléfono completo. `MembershipSummary`: `{id:uuid,program_id:uuid,status:"active"}`. `CardQr`: `{card_id:uuid,purpose:"card",token:base64url43}`; recuperar token exige descifrado servidor de material existente, nunca revelar hash/ciphertext. La UI genera URL del escáner con fragmento y conserva entrada manual.

### Rutas

| Método/ruta | Entrada y autorización | Salida y efectos |
| --- | --- | --- |
| `GET /public/programs/:code` | Pública; code (`public_code`) ASCII base64url 1–255. Se conserva nombre de parámetro del router existente. | 200 `PublicProgram`; 404 si programa no activo o restaurante no disponible. Lectura sin inscripción ni sellos. |
| `POST /customer/session` | D-01 sin OTP. `{phone:string,country:string,public_code?:string}`; phone 4–32, country ISO alpha-2; Origin y límites. | 201 `CustomerSessionView` + Set-Cookie y cliente existente o nuevo. Respuesta indistinguible entre alta y recuperación. Con `public_code`, inscribe de forma idempotente y devuelve tarjeta. |
| `GET /customer/session` | Cookie cliente válida. | 200 `CustomerSessionView`; lectura/renovación controlada, sin inscripción. |
| `DELETE /customer/session` | Cookie cliente y Origin; `{}` o cuerpo ausente. | 204; revoca familia actual y elimina cookie. Repetición de logout ya terminado es 204 y no afecta beneficios. Fallo transitorio de BD: 503 sin fingir revocación ni borrar cookie. |
| `POST /customer/enrollments` | Cookie válida, Origin, Idempotency-Key; `{public_code:string}`. | 201 `{membership:MembershipSummary,card:CustomerCard}` nueva o 200 existente con otra clave; replay conserva código original. Programa/restaurante activos, inscripción no suspendida. Nueva tarjeta en 0, sin premio. |
| `GET /customer/cards` | Cookie válida; cursor/limit. | 200 lista de `CustomerCard` propias; nunca personal ni tarjetas ajenas. |
| `GET /customer/cards/:cardId` | Cookie válida y pertenencia. | 200 `CustomerCard`; 404 si ajena/inexistente. No exige que el programa admita altas para mostrar beneficios adquiridos. |
| `GET /customer/cards/:cardId/qr` | Propiedad, tarjeta/inscripción activas. | 200 `CardQr`; 409 si falta material recuperable heredado, sin inventar otra tarjeta. |
| `POST /customer/cards/:cardId/qr/rotate` | Propiedad, Origin, Idempotency-Key; `{}`. | 200 `CardQr`; rota token de tarjeta y audita, invalida anterior sin alterar inscripción/saldo. |

Los endpoints de comprobante/reenvío están en NEXT-003. El personal no puede crear estas sesiones en nombre de un teléfono por escanear la tarjeta.

### Alta y recuperación sin OTP

Normalizar y validar teléfono por país en E.164 antes de identificar; no basta una expresión regular. La equivalencia de formatos conduce al mismo cliente. UUID interno estable y teléfono único; no usar el texto del número como clave primaria ni como secreto. El número no cambia al visitar otro programa.

D-01 aceptada: la sesión se crea con el teléfono normalizado sin código OTP ni proveedor SMS. Esto no prueba posesión y no debe presentarse como identidad fuerte. Conocer o reciclar un número puede permitir acceso a la tarjeta asociada; se limita la frecuencia de alta/recuperación, se responde sin enumerar si el teléfono ya existía y se documenta el riesgo. Un teléfono compartido no fusiona identidades ni historiales por sí solo.

Recuperar en otro navegador usa el mismo número y devuelve la misma tarjeta. Un conflicto de titularidad histórica se resuelve con evidencia adicional y procedimiento de soporte; no se inventan teléfonos para clientes existentes ni se fusionan clientes automáticamente. Cambio de número y reclamación histórica no se habilitan como endpoints públicos en esta fase: requieren contrato posterior, conservar IDs/historial y revocar sesiones previas.

### Persistencia e inscripción

Unicidad de teléfono, inscripción abierta `(customer_id,program_id)` y tarjeta por inscripción. Un cliente tiene varias tarjetas. Bloquear programa/inscripción para serializar inscripción con cambio de condiciones; primera inscripción fija terms_locked. Un replay, QR público, registro o recarga nunca crean movimiento +1. Una inscripción suspendida no se evade creando otra; cierre con consentimiento conserva la regla de nueva inscripción desde cero.

Sesiones tienen retención técnica y no borran clientes, tarjetas o movimientos por vencer. Crear sesión no cambia saldo. Lecturas de tarjeta consultan PostgreSQL; el frontend no puede decidir identidad por un número local ni mantener una tarjeta global que sustituya a otra.

## Criterios de aceptación

- AC-001 — La cookie usa 32 bytes opacos, hash persistible, atributos y nombre por entorno; producción rechaza HTTP, tokens malformados y cookies ambiguas. Personal y cliente no comparten credenciales.
- AC-002 — El alta por teléfono no enumera si ya existía, crea una sola inscripción/tarjeta 0/N por programa y no duplica cliente ante reintentos.
- AC-003 — Un teléfono validado con formatos equivalentes y mismo programa recupera misma inscripción/tarjeta; alta inicia 0/N y otro programa crea otra tarjeta aislada.
- AC-004 — Reloj adelantado varios meses conserva tarjeta y saldo con sesión válida; expiración, revocación o alteración no acceden. Recuperación autorizada mantiene IDs/contabilidad.
- AC-005 — Logout revoca solo dispositivo actual y no borra beneficios; 503 no elimina cookie. Renovación simultánea/lectura antigua no revive logout ni reemplaza token nuevo por uno viejo.
- AC-006 — El riesgo de que un tercero conozca el número queda documentado; conflictos de titularidad, teléfono compartido/reciclado y cambios no fusionan identidades ni habilitan reclamaciones automáticas.
- AC-007 — Otra persona recibe 404 al leer tarjeta/QR; QR público y escaneo no otorgan sesión ni sellos. Rotación del QR conserva tarjeta e invalida token anterior.
- AC-008 — Inscripción concurrente y primera inscripción contra cambio de meta preservan unicidad y condiciones; fallo antes de commit no deja sesión, inscripción, auditoría o idempotencia parcial.

## Trazabilidad y validación

| BR → NC → aceptación del plan | Criterio | Nivel / archivo / nombre previsto | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| BR-022/024/031 → NC-001/006 → AC-03/04 | AC-001 | servidor `tests/server/customer-cookie.test.ts`: `issues opaque cookies with environment attributes`, `rejects malformed and duplicate cookies` | Pendiente |
| BR-004/022/024 → NC-001/004 → AC-02/04 | AC-002 | integración `backend/tests/integration/next-flow.test.ts`: `starts a phone session idempotently without enumeration` | Pendiente |
| BR-004/009/018/022 → NC-004/005 → AC-02 | AC-003/008 | integración `backend/tests/integration/customer-enrollments.test.ts`: `recovers the same card under concurrent enrollment` | Pendiente |
| BR-016/024/025 → NC-006 → AC-03/04 | AC-004/005 | integración `backend/tests/integration/customer-sessions.test.ts`: `preserves balances after months and logout`, `serializes renewal and revocation` | Pendiente |
| BR-022/030 → NC-001/010 → AC-04/13 | AC-006 | integración `backend/tests/integration/next-flow.test.ts`: `documents phone-coincidence risk without merging identities` | Pendiente |
| BR-023/031 → NC-005/007 → AC-04/06 | AC-007 | integración `backend/tests/integration/customer-enrollments.test.ts`: `isolates card reads and rotates purpose-bound qr` | Pendiente |
| BR-004/024 → NC-001/006 → AC-02/03/14 | AC-003/004 | navegador `tests/browser/customer-flow.spec.ts`: `returns to the same card after months` | Pendiente |

## Preguntas y riesgos

D-01 se simplificó explícitamente a acceso por teléfono sin OTP. Queda aceptado el riesgo de suplantación; no hay prueba de posesión. Recuperación sensible, teléfono reciclado/compartido y reclamaciones históricas requieren revisión posterior. La integración real de WhatsApp sigue pendiente de proveedor/configuración.
