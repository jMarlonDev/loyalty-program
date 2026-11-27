# NEXT-002 — Propietario y operadores sin catálogo de roles

Estado: D-01/D-02 aceptadas (acceso sin OTP e invitación privada con correo autenticado); implementación en curso. Fecha: 2026-10-19.

## Problema y alcance

El dueño configura el programa y obtiene su QR imprimible. El empleado verifica su correo, deja un teléfono de contacto y se vincula mediante invitación al restaurante y dispone del escáner para comprar/canjear. Desaparecen selectores Owner/Admin/Employee y permisos configurables; el servidor mantiene propiedad directa y vínculo de operador por negocio. P2/P3 sustituyen esas autorizaciones después de migrar referencias.

## Referencias

[LOYALTY-NEXT-001](../../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente), NC-002/003/007/010, AC-01/05/06/14; BR-002/003/005–012/017–020/023/026/030/031 de [reglas](../business-rules.md); [NEXT-001](NEXT-001-phone-identity.md), [NEXT-003](NEXT-003-cycles-redemption.md), [NEXT-005](NEXT-005-data-transition.md). Sustituye ROLE-001 y los payloads de rol de STAFF-001/FLOW-001 para el nuevo modelo.

## Contrato

### Autoridades y aislamiento

Propietario: cuenta autenticada cuyo ID coincide con `restaurants.owner_user_id` persistido. Operador: cuenta autenticada con vínculo activo en ese restaurante; el teléfono es dato de contacto, no prueba de identidad. Cliente: entidad telefónica y sesión independiente. Una persona puede tener ambas cuentas, pero no se infiere vínculo de operador por propiedad, teléfono autodeclarado, email, código público o UUID.

La cuenta de dueño/personal mantiene Supabase Auth y correo verificado, sin contraseña local nueva. No transferir ownership mediante invitación, modificación de empleado o nombre de rol. Las filas sin owner directo resuelto no se vuelven propiedad del primer visitante; se reportan para conversión. Un Admin heredado nunca se transforma automáticamente en propietario.

| Operación | Propietario directo | Operador activo | Cliente |
| --- | --- | --- | --- |
| Crear/configurar/publicar su programa y QR | Sí, según condiciones bloqueadas | No por el vínculo | No |
| Invitar/revocar operadores | D-02 | No | No |
| Escanear tarjeta/comprobante | Solo con vínculo operador separado | Sí, solo su restaurante | No |
| Registrar compra/entregar premio | Solo con vínculo operador separado y sin autooperación | Sí, solo su restaurante y sin autooperación | No |
| Leer tarjeta/recuperar comprobante propio | Solo con sesión cliente propia | Solo con sesión cliente propia | Sí |
| Corregir/cerrar con consentimiento | Soporte restringido según NEXT-003 | No | Puede confirmar consentimiento; no ejecutar cierre |

Autorización se revalida en transacción y antes de replay. La revocación impide inmediatamente nuevas compras/canjes/resoluciones aunque la pestaña conserve una vista anterior. Una cuenta sin vínculo recibe 403 en operación genérica; un recurso de otro restaurante se oculta como 404. No confiar en `role`, `owner_user_id`, `employee_id`, `customer_id` o permisos enviados por navegador.

### Dueño y programa

Se conservan rutas de restaurante/programa existentes bajo `/api/v1`, sus nombres de parámetro de router/OpenAPI y las validaciones de diseño de PROGRAMS-001. `POST /restaurants`: `{name:string,email?:string,phone?:string}`; nombre 1–255 y contactos opcionales. Creador queda propietario directo. No crear automáticamente vínculo de caja. No añadir catálogo de sucursales al asistente inicial: conservar ubicación interna existente o preparar una ubicación operativa por defecto documentada al crear un negocio nuevo, sin fusionar sucursales históricas.

`POST /restaurants/:id/programs` y `PATCH /restaurants/:id/programs/:programId` pasan a propietario directo exclusivamente; se conserva `:id` del router de programas y `:restaurantId` en rutas de personal. Conservar `{name,description?,stamps_required,reward_description,logo_url?,background_color?,text_color?,card_message?}` y `status` al editar. La primera inscripción bloquea meta/premio; diseño/nombre no cambian `public_code`. QR oficial contiene URL pública HTTPS del programa con nombre y enlace legible; se puede descargar/imprimir y decodificar. GET público no inscribe ni concede beneficios. D-05 aceptada: la interfaz prioriza un programa principal sin imponer unicidad SQL ni eliminar históricos.

Las respuestas de restaurante del modelo nuevo usan `access:{is_owner:boolean,can_operate:boolean}` obtenido del servidor, sin `actor_role`; ninguna bandera del cliente se usa como autorización. Preservar el DTO heredado solo durante compatibilidad explícita de NEXT-005, sin seguir mostrando un selector de roles.

### Teléfono de contacto del operador (sin OTP)

El personal se autentica con Supabase Auth y correo verificado. Al aceptar una invitación puede registrar un teléfono normalizado como dato de contacto; no se envía ni valida código OTP y ese número no acredita identidad ni autoriza caja por sí solo. La autorización operativa depende únicamente de la invitación consumida y del vínculo activo con el restaurante. No reutilizar un número autodeclarado para inferir propiedad, autoacreditación o acceso a tarjetas de clientes.

### Invitación privada y vínculo (D-02 aceptada)

Se reutilizan rutas existentes; desaparece `role` del payload. Owner invitando a otro empleado no le concede propiedad. Si el dueño atiende caja, debe aceptar explícitamente una invitación/vínculo propio; no se activa implícitamente al crear restaurante. Esta posibilidad queda incluida en D-02, sin resucitar selector de rol.

`OperatorMembership`: `{id:uuid,restaurant_id:uuid,user_id:uuid,status:"active"|"suspended"|"disabled",phone_masked:string,joined_at:date_time,ended_at:date_time|null}`. El user_id es respuesta de gestión autorizada, nunca entrada que sustituye prueba de identidad. `OperatorInvitation`: `{id:uuid,restaurant_id:uuid,email:string,status:"pending"|"accepted"|"revoked"|"expired",expires_at:date_time}`. La respuesta de creación añade `{invitation:OperatorInvitation,token:base64url43}` para que dueño comparta enlace privado; token fuera de query/logs.

| Método/ruta | Payload y permiso | Respuesta/efecto |
| --- | --- | --- |
| `POST /restaurants/:restaurantId/invitations` | Propietario; `{email:string}` correo normalizado válido 1–255; Origin, Idempotency-Key. | 201 invitación/token; único uso, 7 días, emisor cuenta propietario persistida. Reemitir no reactiva una invitación revocada. |
| `POST /invitations/accept` | Cuenta con email verificado igual al invitado; `{token:base64url43}`; Origin, Idempotency-Key. | 200 `OperatorMembership`; consume invitación una vez, crea/reactiva vínculo, audita. Nunca modifica propietario. |
| `GET /restaurants/:restaurantId/employees` | Propietario; cursor/limit. | 200 lista de `OperatorMembership`; no catálogo de roles. |
| `GET /restaurants/:restaurantId/invitations` | Propietario; cursor/limit. | 200 lista de `OperatorInvitation`; no devuelve token en listado ni invitaciones de otro negocio. |
| `PATCH /restaurants/:restaurantId/employees/:targetId` | Propietario; `{status:"suspended"|"disabled"}`; Origin, Idempotency-Key. | 200 `OperatorMembership`; revoca capacidad operativa. Reactivación exige nueva invitación aceptada, no un rol enviado. |
| `POST /restaurants/:restaurantId/invitations/:targetId/revoke` | Propietario; `{}`; Origin, Idempotency-Key. | 200 `OperatorInvitation` con revoked; no elimina auditoría. |

Cuenta equivocada/correo no verificado: 403; token inválido/ajeno: 404; expiración/consumo/estado incompatible: 409. Reintento mismo comando retorna resultado previo después de revalidar autorización; aceptar de nuevo con clave distinta una invitación consumida no crea otro vínculo. Cada transición, consumo, auditoría e idempotencia son atómicos; índices arbitran invitaciones/vínculos concurrentes. Las invitaciones históricas con role quedan en cuarentena y se revocan/reemiten bajo reporte de migración, nunca se reinterpretan como propiedad.

### Escaneo operativo

`POST /operator/scans`: `{restaurant_id:uuid,purpose:"card"|"reward",token:base64url43}`. No requiere Idempotency-Key porque es lectura, pero sí cuenta/vínculo/Origin y límites de consultas. Tipo card usa solo tabla/validador de tarjeta, reward solo comprobante; intercambiar propósito devuelve 404. URL de entrada solo acepta origen canónico o del navegador configurado y token en fragmento; la UI extrae token sin navegar al dominio escaneado. Cámara y entrada manual convergen en mismo endpoint.

Respuesta 200 `OperatorScan`: `{purpose:"card"|"reward",card:{id:uuid,program_id:uuid,program_name:string,phone_masked:string,balance:integer>=0,target:integer>0,version:integer>=0},reward:{id:uuid,description:string,status:"available"|"redeemed"|"cancelled"}|null,allowed_actions:("purchase"|"redeem"|"resend")[]}`. Para reward, devolver solo comprobante autorizado; nunca teléfono completo, hash/ciphertext, token, historial ajeno o cookies. allowed_actions es información de UI; cada mutación valida de nuevo. Autooperación rechaza 403 sin revelar más datos. Escaneo repetido nunca crea compra, premio, entrega o identidad.

Los endpoints de compra/canje son NEXT-003. Vincular personal sin invitación consumida es inadmisible; la autoacreditación se controla comparando la identidad de operador con la del titular de la tarjeta.

## Criterios de aceptación

- AC-001 — Dueño configura solo sus programas, conserva public_code al editar diseño y bloqueo de condiciones. QR impreso/descargado decodifica programa correcto sin conceder personal o sellos.
- AC-002 — Registrarse con correo/teléfono o QR público no activa operador; invitación privada aceptada por la cuenta/correo correctos crea un único vínculo. No existe campo de rol.
- AC-003 — Dueño sin vínculo no opera caja; operador activo compra y canjea solo en su restaurante, sin administración. Revocación y reintento revalidan acceso.
- AC-004 — Email distinto, token ajeno/vencido/consumido y cambio de cuenta rechazan sin vínculo, consumo parcial o ascenso de permisos.
- AC-005 — Escaneo solo consulta mínima; identidad cliente/personal vinculada impide autoacreditación y autocanje aun cuando sus UUID sean distintos.
- AC-006 — UI dirige dueño a programa/QR y empleado al escáner, permite entrada manual, muestra referencia de venta/confirmación y error recuperable; rutas directas respetan autorización servidor.
- AC-007 — Owner/admin heredados ambiguos y invitaciones antiguas se reportan sin dar propiedad automática, borrar vínculos históricos o alterar IDs usados por compras/premios.

## Trazabilidad y validación

| BR → NC → aceptación del plan | Criterio | Nivel / archivo / nombre previsto | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| BR-002/010/018/019 → NC-002 → AC-01 | AC-001 | integración `backend/tests/integration/next-owner.test.ts`: `owner alone edits stable public program`; navegador `tests/browser/customer-flow.spec.ts`: `prints the stable restaurant qr` | Pendiente |
| BR-003/007/011/026 → NC-003 → AC-05 | AC-002/004 | integración `backend/tests/integration/next-flow.test.ts`: `consumes an account-bound invitation once` | Pendiente |
| BR-005/007/010/026 → NC-003/007 → AC-05 | AC-003 | integración `backend/tests/integration/operator-authorization.test.ts`: `owner requires an independent operator membership`, `revocation denies replay` | Pendiente |
| BR-009/022/023/026 → NC-005/007 → AC-06 | AC-005 | integración `backend/tests/integration/operator-scans.test.ts`: `scan has no accounting effects and rejects linked self identity` | Pendiente |
| BR-002/007/023 → NC-002/003 → AC-14 | AC-006 | UI `tests/ui/next-workspace.test.tsx`, `tests/ui/operator-scanner.test.tsx`: `offers one context-appropriate route without role selectors` | Pendiente |
| BR-003/030 → NC-010 → AC-13 | AC-007 | integración `backend/tests/integration/next-schema-upgrade.test.ts`: `does not promote historical admins` | Pendiente |

## Preguntas y riesgos

D-02 queda aceptada: invitación privada con correo autenticado y vínculo explícito también para el dueño que atiende. D-01 no usa OTP; D-05 mantiene un programa principal sin unicidad destructiva. No quitar tablas/roles ni anunciar nuevas autorizaciones hasta que conversión y rutas antiguas estén controladas. Una pantalla oculta no sustituye rechazo servidor.
