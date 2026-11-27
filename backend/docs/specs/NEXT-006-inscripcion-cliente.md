# NEXT-006 — Inscripción del cliente por teléfono, tarjeta por dispositivo, cierre y transferencia

- Fecha: 2026-11-27 · Estado: implementado en `feat/d01-inscripcion-cliente` · Decisión: D-01 (AGENTS.md, revisión 2026-11-27)
- Sustituye en NEXT-001 el inicio de sesión por teléfono (`POST/DELETE /customer/session`): el teléfono **crea** tarjetas, pero ya no **abre** una tarjeta existente.

## Reglas

| ID | Regla |
| --- | --- |
| R-01 | El QR del local muestra el programa (nombre, sellos, recompensa) con «Unirme» / «Ahora no». Inscribirse es decisión del cliente. |
| R-02 | Al unirse, el cliente escribe solo su teléfono, que se normaliza a E.164 (`300 123 4567` + CO = `+573001234567`). Sin contraseña ni otros datos. |
| R-03 | La tarjeta se entrega de inmediato con 0 sellos y no expira. |
| R-04 | Sesión del dispositivo: cookie httpOnly de 400 días con un token opaco (solo se guarda su hash) **ligado a una tarjeta** (`customer_sessions.card_id`). No hay «cerrar sesión». La UI guarda en caché local solo datos de visualización. |
| R-05 | Un dispositivo solo tiene una tarjeta activa. Si el dispositivo con sesión vuelve a enviar la inscripción, se devuelve su tarjeta (`200 existing:true`) y nunca se crea otra, aunque sea otro programa (`same_program:false`). |
| R-06 | Si el número tiene una tarjeta ACTIVA en el programa, responde `409 CARD_ALREADY_ACTIVE` «Este número ya tiene una tarjeta activa», sin sesión, sellos ni datos. Audit `ENROLL_REJECTED_ACTIVE`. |
| R-07 | Si el número solo tiene tarjetas CERRADAS en el programa, se crea una nueva desde cero con `is_reenrollment=true` y `previous_cards_count=N`, y el aviso «Este número ya participó en el programa. Se creó una tarjeta nueva sin sellos.» Audit `CARD_REENROLLED`. |
| R-08 | Límite de 5 intentos de alta por hora por IP y por dispositivo (cookie opaca `loyalty_device`); el sexto devuelve `429`. Las IP y los dispositivos se guardan como hash en `enrollment_attempts`. |
| R-09 | Concurrencia: lock consultivo por teléfono, más el índice único parcial `memberships_open_user_program_unique` (una membresía no cerrada por cliente y programa; el teléfono es único en `customers`). |
| R-10 | «Salir del programa», con doble confirmación en la UI y `confirm:true` en la API: la membresía y la tarjeta pasan a `closed` (`closed_at`, `close_reason='customer_exit'`). Se pierden los sellos del ciclo y los premios `available` pasan a `cancelled`, con sus comprobantes revocados. Se revocan las sesiones de esa tarjeta y se borra la cookie. No se borra ninguna fila. Audit `CARD_CLOSED` con `stamps_lost` y `rewards_lost`. |
| R-11 | Admin: lista de tarjetas con estado, fechas, «Reinscrito (N)» y teléfono enmascarado `+57 300 *** 4567`. El detalle muestra el teléfono completo, el historial y las tarjetas anteriores. |
| R-12 | Transferencia: el dueño, o un empleado con `can_transfer_cards`, verifica a la persona en el local y genera un QR de un solo uso válido 10 minutos (`/transfer#token=<token>`). Al consumirlo se revocan todas las sesiones de esa tarjeta (y las heredadas del cliente) y se abre sesión en el dispositivo nuevo. Un token consumido o vencido devuelve `409 TRANSFER_INVALID`. Audit `CARD_TRANSFER_ISSUED` y `CARD_TRANSFERRED`. |
| R-13 | La verificación por SMS/WhatsApp queda preparada y desactivada (`backend/src/application/phone-verification.ts`, `PHONE_VERIFICATION=disabled`). |

Riesgo residual aceptado: quien llegue primero con un número que no tiene tarjeta activa puede inscribirlo. No obtiene acceso a tarjetas ajenas ya activas.

## Contrato (`/api/v1`)

| Operación | Autorización | Resultado |
| --- | --- | --- |
| `POST /customer/enrollments` `{public_code, phone?, country?}` | Dispositivo sin sesión o con ella; Origin | 201 tarjeta nueva y cookie · 200 `existing` · 409 · 429 |
| `GET /customer/session` | Sesión | Incluye `card_id` |
| `POST /customer/cards/:cardId/close` `{confirm:true}` | Sesión dueña de la tarjeta | `{stamps_lost, rewards_lost}` y borra la cookie |
| `POST /customer/transfers/claim` `{token}` | Dispositivo nuevo | 201 tarjeta y cookie · 409 |
| `GET /restaurants/:rid/cards[?phone&country]` | Dueño (con `phone`, también un empleado con permiso) | Lista enmascarada |
| `GET /restaurants/:rid/cards/:cardId` | Dueño | Detalle con teléfono completo |
| `POST /restaurants/:rid/cards/:cardId/transfers` | Dueño o empleado con permiso | `{token, url, expires_at}` |
| `PATCH /restaurants/:rid/employees/:targetId/transfer-permission` | Dueño | `{id, can_transfer_cards}` |

Eliminados: `POST /customer/session` y `DELETE /customer/session`.

## Datos (migración 0007, aditiva)

Ajuste del modelo pedido al esquema existente: `Card` = `memberships` + `loyalty_cards`, y `DeviceSession` = `customer_sessions`.

- `memberships` + `is_reenrollment`, `previous_cards_count`, `close_reason`.
- `loyalty_cards.status` admite `closed`.
- `customer_sessions` + `card_id` (FK) y `user_agent`.
- `restaurant_employees` + `can_transfer_cards`.
- Tablas nuevas `card_transfers` y `enrollment_attempts`, con RLS y sin permisos para `anon` ni `authenticated`.

## Pruebas

`backend/tests/integration/enrollment-d01.test.ts` cubre R-01–R-12 en los casos 1–8 de la petición más el límite de intentos. `tests/ui` cubre «Unirme» / «Ahora no», el 409, la tarjeta existente y la salida con doble confirmación. Los contratos están en `tests/unit/next-openapi.test.ts` y `openapi.test.ts`.
