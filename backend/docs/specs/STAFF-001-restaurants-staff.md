# STAFF-001 — Restaurantes, sucursales y personal

Estado: implementada; integración general coordinada por composición. Fecha: 2026-10-18.

## Problema y alcance

Fase 2 de BACKEND-001: autoservicio de restaurante con Owner, administración por
jerarquía y pertenencia, sucursales e invitaciones de siete días. Conserva historial
y utiliza DB-003 sin migrar el destino remoto.

## Referencias

BR-003, BR-007, BR-009, BR-010, BR-011 y BR-012; BACKEND-001 AC-006, AC-007,
AC-015. Identidad verificada por IDENTITY-001; esquema incremental DB-003 y
[DB-005](../decisions/DB-005.md), retirada del identificador manual autorizada por
la solicitud del 2026-10-18.

## Contrato

Prefijo `/api/v1`; todos los endpoints exigen identidad con correo verificado y
perfil activo. Cada comando exige `Idempotency-Key`; actor, rol efectivo, fechas,
IDs y restaurant_id se determinan en servidor/ruta. Se rechazan campos inesperados.
Respuestas `{ data }`; listas `{ data, next_cursor }`. Fechas ISO UTC.
Listas por UUID ascendente, `limit` por defecto 20, máximo 100 y cursor UUID.

| Método/ruta | Entrada | Permiso / resultado |
| --- | --- | --- |
| POST `/restaurants` | `{name,email?,phone?}` | Perfil activo con autoservicio según ROLE-001; 201, restaurante active y Owner atómicos |
| GET `/restaurants` | limit/cursor | Restaurantes de pertenencias activas; incluye suspendidos para Owner/Admin |
| GET `/restaurants/:id` | — | Personal activo del mismo restaurante; incluye actor_role verificado (ROLE-001 AC-007); Owner/Admin accede suspendido |
| PATCH `/restaurants/:id` | `{name?,email?,phone?,status?}` | Owner/Admin; status active/suspended Owner/Admin |
| GET/POST `/restaurants/:id/locations` | POST `{name,address,city,department,phone?}` | Consulta personal; creación Owner/Admin, 201 |
| PATCH `/restaurants/:id/locations/:target` | `{name?,address?,city?,department?,phone?,status?}` | Owner/Admin, estado active/inactive, sin borrar historial |
| GET `/restaurants/:id/employees` | limit/cursor | Owner/Admin |
| PATCH `/restaurants/:id/employees/:target` | `{role?,status?}` | Owner/Admin gestiona Admin/Employee; status active/suspended/disabled |
| GET/POST `/restaurants/:id/invitations` | POST `{email,role}` | Owner/Admin según jerarquía; role admin/employee; 201 con token opaco |
| POST `/restaurants/:id/invitations/:target/revoke` | `{}` | Owner/Admin según rol invitado; solo pending, 200 |
| POST `/invitations/accept` | `{token}` | Correo verificado igual al invitado; 200 con pertenencia |

Nombre/campos geográficos hasta 255 caracteres, address hasta 2000, teléfono
hasta 20. El restaurante no solicita ni expone slug; mantiene su UUID interno y
permite nombres repetidos entre negocios independientes. Email normalizado a
minúsculas. PATCH no vacío; nullable email/phone admite null. Una edición de personal
no puede apuntar al Owner ni asignar Owner. Admin puede gestionar Admin/Employee; ROLE-001 conserva la protección del Owner.

La invitación conserva hash SHA-256 de un token aleatorio de 32 bytes y caduca a
los siete días. El token se entrega solo al crear/reintentar ese comando; listados
no exponen token ni hash. Para conservar la respuesta de reintentos se almacena
una copia cifrada AES-256-GCM en el resultado idempotente, usando la clave de
servidor `CARD_TOKEN_ENCRYPTION_KEY`; nunca se guarda el token en claro.
La aceptación verifica permisos actuales del emisor,
estado del restaurante y del emisor, correo del receptor y caducidad. Repetir la
aceptación no duplica personal ni reactiva a un empleado desactivado después.
Invitar a alguien con pertenencia previa respeta la jerarquía sobre su rol actual.

Cada escritura bloquea restaurante y actor y verifica acceso antes de idempotencia;
creación bloquea actor y serializa por clave. Misma clave/contenido devuelve el
resultado original; contenido distinto 409. Se registra auditoría sin tokens.
Restaurante suspendido bloquea operación salvo administración por Owner/Admin para
reactivación. No se borran sucursales, personal ni invitaciones.

Errores: 400 `INVALID_INPUT`/`INVALID_IDEMPOTENCY_KEY`; 401 autenticación;
403 `FORBIDDEN` o estado de actor; 404 `NOT_FOUND` para pertenencias/recursos ajenos;
409 `CONFLICT` para unicidad, invitación vencida/revocada o cambios incompatibles.
Sin efectos persistidos tras rechazo; creación restaurante/Owner e invitación/
pertenencia/auditoría son una sola transacción.

## Criterios de aceptación

- AC-001 — Crear restaurante crea exactamente un Owner y un evento; replay no duplica.
- AC-002 — Jerarquía y aislamiento rechazan Employee administrativo, Admin sobre
  Owner y recursos ajenos; Owner nunca se modifica por gestión ordinaria.
- AC-003 — Sucursales conservan historial y solo personal administrativo activo
  del restaurante puede mutar; restaurante suspendido permite su reactivación por Owner/Admin.
- AC-004 — Invitación dura siete días, se almacena hash y la acepta solo correo
  verificado destinatario si el emisor conserva permisos; repetir no duplica.
- AC-005 — Invitaciones vencidas/revocadas, emisor suspendido o degradado, y
  conflictos de contenido rechazan sin persistencia parcial.
- AC-006 — HTTP aplica JSON estricto, UUID, paginación, estados y códigos; las
  listas no incluyen secretos y respetan pertenencia.
- AC-007 — Concurrencia/reintentos mantienen una pertenencia por usuario/restaurante,
  decisiones actuales dentro de transacción y auditoría de cambios válidos.
- AC-008 — Crear restaurante requiere solo nombre; admite contacto opcional y
  nombres repetidos sin colisiones. Rechaza slug como campo desconocido. La
  migración incremental retira la columna/constraint y conserva UUID, relaciones,
  contactos e historial; no altera los códigos QR de programas ni de tarjetas.

## Trazabilidad y validación

| Reglas | Criterios | Pruebas | Evidencia |
| --- | --- | --- | --- |
| BR-003, BR-007, BR-010 | AC-002 | unit `staff.test.ts` | RED 3 fallos de política; GREEN 4 pruebas |
| BR-009, BR-010, BR-012 | AC-001–AC-003, AC-007 | integration `staff.test.ts` | RED sin restaurante/Owner ni rechazos; GREEN 9 escenarios PostgreSQL |
| BR-011 | AC-004, AC-005 | integration `staff.test.ts` | RED sin invitación/aceptación; GREEN con caducidad, revocación, concurrencia y permisos actuales |
| Contratos BACKEND-001 | AC-006 | unit `staff-http.test.ts` | RED 5 fallos HTTP 404; GREEN 5 pruebas |
| BR-009, BR-010, DB-005 | AC-008 | tooling `schema.test.ts`; unit `staff-http.test.ts`; integration `staff.test.ts`, `schema-upgrade.test.ts` | RED: nombre solo 400, slug aceptado y columna existente; GREEN tooling/HTTP; integración pendiente de repetición por timeouts del entorno |

Evidencia del 2026-10-18:

- `npx vitest run --project unit tests/unit/staff.test.ts`: 3 fallos RED
  (política inicial permitía todo); luego 4 correctas.
- `npx vitest run --project unit tests/unit/staff-http.test.ts`: 5 fallos RED
  (rutas ausentes devolvían 404), luego 5 correctas. Conjunto unit: 9 correctas.
- `npx vitest run --project integration tests/integration/staff.test.ts`, con
  `TEST_DATABASE_URL` PostgreSQL 17 local aislado: 6 fallos RED tras corregir un
  fixture; luego 6 correctas. Tres regresiones adicionales de concurrencia,
  rollback y repetición tras suspensión elevan el resultado a 9 correctas.
- Un intento inicial de integración no tuvo acceso de red local (`EPERM`); no
  cuenta como RED funcional. Se reejecutó con permiso de conexión al contenedor.
  El helper creó y eliminó una BD exclusiva por ejecución, sin cargar `.env`.
- Biome correcto en los ocho archivos de implementación/prueba del módulo.
  El análisis de tipos del repositorio no reportó errores de STAFF; módulos
  paralelos se validan juntos al cerrar la composición.
- Revisión posterior: `text/plain` con cuerpo JSON se aceptaba (RED: 201 frente
  a 400 esperado). Se exige Content-Type `application/json` y las cinco pruebas
  HTTP pasan de nuevo; el rechazo no invoca el repositorio.

## Preguntas y riesgos

La API no envía correo; devuelve token para que el restaurante comparta el enlace.
No hay transferencia de Owner. La prueba de aceptación simula identidad ya
verificada; no prueba el envío/verificación de correo del proveedor.

## Refinamiento de calidad — 2026-10-18

- AC-002: se usan IDs válidos de sucursal, empleado e invitación de otro
  restaurante. Los tres comandos devuelven 404 y conservan recursos, auditoría
  e idempotencia, incluso cuando el actor es Owner de su propio restaurante.
- AC-004: destinatario incorrecto y correo sin verificar dejan la invitación
  pendiente y no crean personal, auditoría ni resultado idempotente. El receptor
  correcto puede aceptarla después. Repetir creación devuelve el mismo token;
  el resultado persistido lo conserva cifrado y la auditoría no lo contiene.
- AC-007: una restricción temporal exclusiva de la BD de prueba provoca fallo
  de auditoría tras escribir pertenencia e invitación. Se comprueba rollback de
  ambas, ausencia de evento/clave y éxito al reintentar la misma clave una vez
  retirada la restricción. Se elimina siempre la restricción mediante finally.
- El reloj del fixture se restablece antes de cada caso. Integración focal inicial
  de identidad/personal: 19/19; el cierre global registra la verificación final.
  Estas pruebas usan PostgreSQL temporal y no modifican Supabase ni reglas nuevas.

## Retirada del identificador manual — 2026-10-18

- DB-005 precede al código y autoriza retirar `slug`. RED observado en tooling
  por columna presente; en HTTP, crear con nombre solo devolvía 400 y suministrar
  `slug` todavía devolvía 201. GREEN posterior: `npm run check` en backend correcto
  con 7 pruebas de tooling y 221 unitarias, además de lint y tipos.
- RED PostgreSQL real: después del upgrade histórico seguía existiendo la columna
  `slug` (una fila frente a cero esperadas en information_schema). Migración
  `0004_remove_restaurant_slug.sql` generada sin modificar 0000–0003; SQL revisado:
  elimina exclusivamente `restaurants_slug_unique` y `restaurants.slug`.
- Se refuerzan upgrade 0003→0004 y reejecución con contactos, Owner, programa,
  membresía y QR existentes; creación concurrente, nombres repetidos e aislamiento.
  Se conserva la prueba de rollback de creación mediante fallo de auditoría,
  sustituyendo el antiguo conflicto del slug eliminado.
- La primera ejecución posterior de los siete archivos afectados no acredita el
  GREEN de integración: 127 pruebas correctas, seis fallos por tiempo de conexión/
  prueba y 19 omitidas por setup, además de timeouts de hooks. No hubo fallos de
  aserción funcional. Se requiere repetición con el entorno sin carga simultánea.
- `npm run generate` posterior no genera cambios adicionales y `npm run db:check`
  es correcto. Sin aplicación remota por el agente del esquema; la coordinación
  principal identifica y valida el destino antes de aplicar la migración autorizada.
