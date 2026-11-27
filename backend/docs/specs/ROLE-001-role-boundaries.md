# ROLE-001 — Separación de permisos y recorridos por rol

Estado: backend implementado y validado; UI/navegador en integración. Fecha: 2026-10-18.

## Problema y alcance

La solicitud vigente limita Employee a escanear tarjetas y registrar compras que
suman un sello. Owner/Admin dispone de administración completa del restaurante.
El cliente inicia en sus tarjetas, ve sellos actualizados y conserva la inscripción
por programa y la confirmación de cierre. Los permisos HTTP deben coincidir con
la UI, incluyendo el acceso directo a rutas y los reintentos idempotentes.

Esta revisión sustituye las autorizaciones históricas de STAFF-001 y LOYALTY-001
que permitían a Employee canjear/cerrar o impedían a Admin gestionar otros Admin.
Conserva identidad Supabase, protección del Owner, separación entre restaurantes,
consentimiento del cliente y reglas de contabilidad. No cambia esquema ni aplica
migraciones remotas.

## Referencias

BR-002, BR-003, BR-005–BR-007, BR-009–BR-017 y BR-020–BR-021;
[STAFF-001](STAFF-001-restaurants-staff.md),
[LOYALTY-001](LOYALTY-001-operaciones.md),
[MOBILE-QR-001](MOBILE-QR-001-mobile-scan.md).

## Contrato

Se conservan rutas, payloads y códigos de éxito existentes. Los rechazos de un rol
conocido son 403; los recursos de otro restaurante siguen 404. No se persiste
ningún cambio, auditoría o resultado idempotente en una solicitud rechazada.

- `POST /api/v1/restaurants`: 403 para identidad con pertenencias activas todas
  Employee. Sin pertenencias activas, o con alguna Owner/Admin, puede crear un
  restaurante propio por autoservicio; eso no concede permisos en otros negocios.
- `GET /api/v1/restaurants` y `GET /api/v1/restaurants/:id` incluyen
  `actor_role` obtenido de la pertenencia activa autenticada al restaurante.
  La consulta singular nunca hereda un rol de otro negocio ni acepta el rol del cliente.
- Owner/Admin puede actualizar el estado del restaurante y reactivarlo, gestionar
  Admin/Employee, invitar cualquiera de esos roles y revocar su invitación.
  La pertenencia Owner sigue inmutable por estas operaciones.
- Employee conserva lecturas mínimas de restaurante/sucursales, resolución del QR
  privado y `POST .../purchases`, con identidad, tarjeta y sucursal válidas.
- `POST .../rewards/:id/redeem`, reversión y `POST .../cards/:id/close` exigen
  Owner/Admin. Se revalida la autorización antes de recuperar un replay.
- El cliente sigue sin poder concederse sellos, canjear o cerrar directamente.
  Puede consultar su tarjeta y confirmar/revocar consentimiento de cierre.

La autorización y mutación ocurren en la misma transacción PostgreSQL con los
bloqueos existentes de restaurante/actor. La creación consulta todas las
pertenencias activas del actor, no solo una página de resultados de UI.

## Criterios de aceptación

- AC-001 — Employee no crea restaurantes, sucursales, programas ni gestiona
  personal. Los rechazos directos no generan efectos persistidos.
- AC-002 — Admin puede administrar otros Admin/Employee y el estado de su
  restaurante; no cambia Owner ni actúa sobre recursos de otro restaurante.
- AC-003 — Employee registra un sello por compra válida y resuelve QR, pero recibe
  403 al canjear, revertir o cerrar incluso con consentimiento válido o replay
  previamente autorizado; el saldo, premio, consentimiento y auditoría se conservan.
- AC-004 — Identidad sin pertenencias activas conserva autoservicio y una identidad
  mixta Owner/Admin+Employee también, respetando el aislamiento de cada negocio.
- AC-005 — `/app` conduce Employee a escaneo/operaciones, cliente sin pertenencias
  a sus tarjetas y Owner/Admin a administración. El alta explícita de negocio usa
  `?onboarding=business` solo sin pertenencias o con Owner/Admin; Employee ignora
  ese parámetro. Navegación y rutas directas respetan el rol del negocio; la sesión
  y sus controles permanecen disponibles.
- AC-006 — La tarjeta del cliente se actualiza tras nuevas compras sin otorgar
  permisos operativos; conserva su consentimiento explícito para cierre.

- AC-007 — Lista y detalle de restaurante devuelven el mismo `actor_role` verificado
  para Owner/Admin/Employee; no exponen detalle ni rol a un actor ajeno. El escaneo
  directo conserva las operaciones administrativas de Owner/Admin.

## Trazabilidad y validación

| BR | Criterio | Nivel/prueba | Evidencia |
| --- | --- | --- | --- |
| BR-003, BR-007, BR-010 | AC-001, AC-004 | integration staff.test.ts | RED Employee creó negocio; GREEN rechazo sin efectos y autoservicio mixto |
| BR-002, BR-003, BR-010, BR-011 | AC-002 | unit staff.test.ts; integration staff.test.ts | RED promoción false y gestión/estado 403; GREEN Admin gestiona y reactiva |
| BR-005–BR-007, BR-015, BR-017, BR-020 | AC-003 | integration loyalty.test.ts; programs.test.ts; e2e card-lifecycle.test.ts | RED canje/cierre y replay permitidos a Employee; GREEN 403 sin efectos, sello/QR conservados |
| BR-003, BR-009 | AC-007 | integration staff.test.ts | RED rol ausente en los tres roles; GREEN detalle/lista coherentes y separación por negocio |
| BR-003, BR-005, BR-009 | AC-005, AC-006 | UI workspace/auth/operations/customer/management; navegador | UI RED 9 fallos esperados; GREEN suites afectadas y regresión de pérdida de permiso. Resultado global en development-status.md |

## Evidencia backend — 2026-10-18

- RED unitario: promoción Admin→Admin devolvía false (1 fallo y 3 correctas).
- RED PostgreSQL: 5 fallos esperados y 42 correctas en personal/fidelización;
  luego 4 fallos aislados acreditaron canje, cierre y ambos replays aceptados
  indebidamente para Employee. No fueron errores de imports o entorno.
- GREEN: `npm run check --workspace backend` correcto (Biome, tipos, 7 tooling,
  221 unitarias). `npm run test:db --workspace backend -- --project integration
  --project e2e tests/integration/staff.test.ts tests/integration/loyalty.test.ts
  tests/integration/programs.test.ts tests/e2e/card-lifecycle.test.ts`: 67/67.
  El ciclo HTTP crea Owner, Admin, Employee y cliente, comprueba rechazo Employee
  y éxito Admin en canje/cierre, y recorre QR, sello, reversión y consentimiento.
- Harness con PostgreSQL 17 aislado y limpieza automática; no utiliza `.env` ni
  Supabase. Estas comprobaciones no prueban Google/SMTP ni despliegue real.
- `git diff --check` correcto. La validación global y aceptación UI/navegador
  corresponden al cierre coordinado de la tarea.

## Regresión de detalle de restaurante detectada en navegador

- AC-007: `/scan` obtenía el restaurante individual sin `actor_role`, por lo que
  Owner/Admin perdía visualmente canje/cierre en esa ruta. La lista sí tenía rol.
- RED: tres pruebas PostgreSQL (Owner/Admin/Employee) fallaron por ausencia del
  campo. GREEN: el detalle incorpora exclusivamente el rol retornado por
  `requireStaff` para ese actor/restaurante; OpenAPI utiliza `RestaurantWithRole`.
- Se verifica 404 para negocio ajeno y una misma identidad administrativa en A
  con rol Employee en B, sin trasladar el permiso de A a B.
- `npm run test:db --workspace backend -- --project integration
  tests/integration/staff.test.ts`: 21/21. `npm run check --workspace backend`:
  lint/tipos, 7 tooling y 221 unitarias correctos. `git diff --check` limpio.
  No se repitió la suite backend completa para esta adición de respuesta; la
  aceptación de navegador se reejecuta desde el ensamblaje.

## Preguntas y riesgos

Los roles son por restaurante; no existe administrador global. Las credenciales
de prueba no se versionan. Crear cuentas reales o aplicar migraciones requiere
un destino disponible y evidencia de ejecución independiente de los tests locales.
