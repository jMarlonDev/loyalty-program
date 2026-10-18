# STACK-001 — Aplicación fullstack TanStack Start

Estado: integración fullstack implementada y comprobada localmente; evidencia final en [estado de desarrollo](../development-status.md). Las cifras parciales siguientes conservan la historia de implementación. Fecha: 2026-10-18.

## Problema y alcance

La solicitud vigente autoriza sustituir Hono y el servidor separado por TanStack Start con frontend React en el mismo proyecto, conservando los casos de uso, persistencia y contratos HTTP. La documentación y las pruebas de negocio existentes son el ancla de esta migración. Frontend queda autorizado por esta solicitud. La referencia visual orienta presentación; no introduce Wallet, sellos iniciales, estadísticas ni reglas ausentes en las specs de negocio.

## Referencias

BACKEND-001, CORE-001, IDENTITY-001, STAFF-001, PROGRAMS-001, LOYALTY-001 y OPS-001; todas las BR del catálogo canónico continúan vigentes. No hay cambios de esquema ni migraciones de datos requeridos por cambiar el transporte.

## Contrato

Start sirve UI, rutas `/api/v1/*`, `/health`, `/ready` y `/openapi.json`. La capa HTTP recibe `Request` y devuelve `Response` estándar. Se conservan métodos, rutas, payloads, códigos, autenticación, aislamiento, idempotencia y transacciones existentes. El transporte no interpreta permisos ni cambia reglas.

El contexto de conexión opcional `remoteAddress` únicamente procede del adaptador servidor de confianza; nunca se toma de cabeceras enviadas por el cliente. En despliegues que no lo proporcionen, el limitador aplica una ventana conservadora compartida por proceso. El límite de cuerpo continúa en 16 KiB medidos en bytes incluso si Content-Length miente. CORS, correlación, no-store y logs seguros se conservan en errores y preflight.

## Criterios de aceptación

- AC-001 — Las 400 pruebas existentes conservan resultados; suites de negocio ejecutadas antes y después con PostgreSQL temporal aislado.
- AC-002 — Los handlers usan Web Request/Response sin Hono; montaje bajo Start y catálogo de 39 operaciones se conservan; AC-008 añade dos lecturas administrativas (41 totales).
- AC-003 — Parámetros de ruta, query, HEAD, errores, IDs de correlación y cuerpos preservan su contrato; rutas desconocidas no ejecutan mutaciones.
- AC-004 — CORS, seguridad, límite de cuerpo, rate limiting y logs conservan comportamiento; direcciones de conexión confiables tienen ventanas separadas y cabeceras no pueden evadirlas.
- AC-005 — El frontend invoca los contratos existentes desde el mismo origen, presenta errores accesibles y personalización visual sin cambiar la contabilidad.
- AC-006 — Build fullstack y comandos de desarrollo, pruebas y despliegue documentados; configuración ausente se diagnostica sin filtrar secretos.

## Trazabilidad y validación

| Criterio | Nivel | Archivo/prueba | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| AC-001 / todas BR | unit/integration/e2e | suites existentes backend/tests | Baseline 400 originales GREEN; post 409/409 GREEN con PostgreSQL17 temporal |
| AC-002 / CORE-001 | unit | native-http.test.ts, http-access.test.ts, openapi.test.ts | GREEN: catálogo exacto de 41 operaciones y autenticación antes de persistencia |
| AC-003 / CORE-001 | unit/e2e | native-http.test.ts, http-base.test.ts, suites HTTP | GREEN: Request/Response, HEAD, params y suites previas |
| AC-004 / OPS-001 | unit | native-http.test.ts, operations.test.ts | RED: segunda IP recibió 429; Content-Length falso eludió límite. GREEN tras transporte nativo |
| AC-005 | frontend | pruebas frontend/root | Coordinación agente frontend |
| AC-006 | build/operacional | build y smoke de Start | Coordinación agente principal |

## Preguntas y riesgos

Supabase remoto solo tiene migración inicial según última comprobación; el cambio local no demuestra proveedor Google/correo ni despliegue real. El limitador por proceso requiere política de infraestructura en despliegues con múltiples instancias. La configuración privada nunca debe entrar en el bundle cliente. No afirmar integración Wallet a partir de referencias visuales.

## Lecturas aditivas para la interfaz

La integración de frontend requiere valores reales del programa, ya persistidos y públicos, en las lecturas de tarjetas: `stamps_required`, `reward_description`, `logo_url`, `background_color`, `text_color`, `card_message`, `public_code`. Se añaden sin cambiar claves existentes, saldos, permisos o transacciones. La lista de restaurantes añade `actor_role` derivado de la asignación activa del usuario autenticado; no lo recibe del cliente ni concede permisos nuevos. Criterio AC-007: las lecturas propias contienen esos datos vigentes; otras identidades conservan rechazo/aislamiento. Pruebas de integración verifican datos PostgreSQL reales antes y después.

## Resultados administrativos y mostrador (AC-008)

Lecturas de datos ya existentes, derivadas de BR-001/002/003/007/013/014/015/017/021:

- `GET /api/v1/restaurants/:id/programs/:programId/results`: Owner/Admin activos; `{data:{customers,active_cards,purchases,available_rewards,redeemed_rewards}}`. `customers` cuenta usuarios distintos inscritos históricamente; `active_cards` solo tarjetas e inscripciones activas; `purchases` cuenta compras no revertidas. Premios cuentan estados exactos. No se calcula dinero porque no hay importes persistidos.
- `GET /api/v1/restaurants/:id/programs/:programId/customers`: mismos permisos y paginación UUID existente. `{data:[{id,user_id,full_name,email,status,joined_at,card_id,balance,purchases,available_rewards,redeemed_rewards}],next_cursor}`. Una fila por inscripción, incluidas cerradas para conservar historial; `id` es membership_id. Saldo es suma del libro, compras excluyen revertidas.
- Rechazos: Employee 403, ajenos 404, programa de otro restaurante 404, parámetros inválidos 400. Las lecturas nunca escriben compras, premios, movimientos ni auditoría.
- `resolveCard` añade `customer_name`, `customer_email` y `available_rewards:[{id,description,status}]` para que personal que ya puede registrar compras y canjear identifique el premio. Solo por token activo y restaurante autorizado; se conserva rechazo de otros tenants. No expone token almacenado ni datos adicionales del perfil.

Pruebas AC-008: primero E2E 404 por ausencia de rutas; después agregados PostgreSQL con libro compensatorio, premios en tres estados, compra revertida y tenant/roles. Prueba de resolución exige datos reales y rechaza token fuera de restaurante.


## Evidencia backend — 2026-10-18

- Antes: 400 pruebas originales correctas; tests de migración observaron RED real por ventana de conexión y cuerpo con Content-Length falso (429/200 y 200/413).
- Lecturas AC-007 RED por ausencia de campos de programa y actor_role; AC-008 RED por 404 y datos de mostrador ausentes. Después PostgreSQL confirma los campos, la personalización vigente, paginación, sumas compensatorias, exclusión de compras revertidas, premios por estado, roles e aislamiento.
- `npm run check --workspace backend`: Biome, tipos, 6 tooling y 222 unit correctos. `node scripts/test-db.mjs --coverage --sequence.shuffle --sequence.seed=20261018` desde backend: 409/409 en 29 archivos, 163 integración y 18 E2E con HTTP real. Cobertura 97,34 % líneas, 95,90 % sentencias, 90,90 % ramas y 99,04 % funciones; umbral 90 % satisfecho.
- Corregida fixture nueva que reutilizaba un cliente reservado por una prueba de paginación; segunda identidad propia elimina dependencia del orden. Un estado de fixture `inactive` se corrigió a `disabled`, conforme al esquema existente; no se alteraron reglas.
- Sin dependencias Hono en src/tests, migraciones remotas, cambios de esquema ni credenciales. La capa de casos de uso sigue intacta salvo dos consultas aditivas. El arranque y cierre de producción se integran desde Start/Nitro raíz; `main.ts` ya no inicia servidor separado.

## Directorio del equipo (AC-009)

La lista existente `GET /api/v1/restaurants/:restaurantId/employees` añade `full_name` y `email` del perfil vinculado para identificar integrantes al asignar permisos. Conserva acceso exclusivo Owner/Admin y aislamiento: Employee recibe 403, usuarios ajenos 404. No cambia altas, asignaciones ni permisos y no expone teléfono u otros campos del perfil. Prueba PostgreSQL del directorio precede al JOIN de lectura.

AC-009 validado: RED por ausencia de full_name/email; GREEN en 14/14 pruebas staff de integración después del JOIN de solo lectura y schema OpenAPI EmployeeDirectory. Check estático/tooling/unit posterior correcto. La cobertura completa de409 pruebas anterior no se repitió únicamente por esta consulta; cierre global raíz registra el conjunto final410.
