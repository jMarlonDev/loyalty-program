# CLAUDE.md — contexto rápido

Fuente de contexto para agentes. Leer esto en lugar de explorar el repo. Reglas completas e historial: `AGENTS.md` (decisiones D-01–D-09, revisión 2026-11-27). Actualizar este archivo al cerrar cada fase.

## Producto
Fidelización con tarjetas virtuales de sellos para restaurantes, mobile-first. Admin (dueño) gestiona sucursales, empleados y programa; empleado solo escanea; cliente acumula sellos y canjea premios.

## Stack (no cambiar)
TanStack Start + React + TanStack Router/Query, shadcn/Radix + Tailwind, Nitro/Node (un solo proceso UI+API), Drizzle ORM + PostgreSQL 17 (Supabase solo como BD), Vitest, Biome, WebSocket propio con outbox. Node 24.18.1 / npm 12.1.0, workspace npm (`backend/`).

## Estructura
- `src/routes` rutas TanStack (`cards`, `scan`, `reward`, `join.$code`, `invite.$token`, `app`, `auth`, `api.*`); `src/features` pantallas; `src/components`; `src/lib` (api, realtime); `src/server` (cookie cliente, eventos, realtime).
- `server/routes/api/v1` rutas Nitro.
- `backend/src/{domain,application,infrastructure,presentation/http}` núcleo; flujo nuevo en `application/next.ts`, `infrastructure/next-repository.ts`, `presentation/http/next-routes.ts`, `next-openapi.ts`.
- `backend/db/schema.ts` esquema; `backend/drizzle/0000–0006` migraciones (no reescribir aplicadas).
- `backend/docs/specs` specs (NEXT-001…005 vigentes), `backend/docs/business-rules.md` reglas BR.
- Tests: `tests/{ui,server,realtime}`, `backend/tests/{unit,integration,e2e,tooling}`.

## Modelo de datos (30 tablas)
Negocio: `restaurants`, `locations` (sucursales), `loyalty_programs`. Personal: `users`, `restaurant_employees`, `operator_invitations` (`roles`, `invitations` heredadas → retirar en P9). Cliente: `customers` (solo teléfono E.164), `customer_sessions` (hash de cookie), `memberships`, `loyalty_cards`. Contabilidad: `purchases`, `loyalty_ledger_entries`, `loyalty_cycles`, `rewards`, `reward_purchase_allocations`, `reward_vouchers`, `reward_deliveries`. Control: `idempotency_records`, `audit_events`, `card_events_outbox`, `customer_event_leases`, `closure_consents`, `enrollment_attempts`. Transferencia: `card_transfers`. Staff: `staff_sessions`, `employee_locations`, `branch_invitations`. Migraciones hasta `0009`.

## Reglas de negocio (no negociables)
1. Cliente = solo teléfono (sin contraseña ni otros datos). El teléfono CREA la tarjeta y no la abre (NEXT-006): un número con tarjeta activa → 409 sin datos. La sesión del dispositivo (cookie de 400 días) está ligada a una tarjeta y no hay logout. 5 altas/hora por IP y dispositivo. «Salir del programa» la cierra y pierde sellos y premios. Cambio de celular: transferencia con QR de un solo uso (10 min) desde el admin o un empleado con `can_transfer_cards`.
2. Admin/empleado: correo + contraseña local (AUTH-LOCAL-001, `backend/src/infrastructure/local-auth.ts`, `AUTH_PROVIDER=local` por defecto). Hash scrypt y tabla `staff_sessions` con hashes de tokens; refresh que rota; 10 fallos/15 min por correo; `must_change_password` obliga a cambiar la contraseña temporal. Misma ruta `/api/session` (SessionAuth local) y cookie distinta de la del cliente. Roles fijos admin|empleado. Las cuentas antiguas de Supabase sin contraseña local no pueden entrar.
3. Admin (BRANCH-001, `backend/src/infrastructure/branch-repository.ts`, `branch-routes.ts`): crea sucursales (nombre, dirección, `physical_point`) y empleados manuales (contraseña temporal mostrada una vez, `must_change_password`). Emite QRs de invitación por sucursal `/join-staff#token=…` (vencimiento, `max_uses`; renovar = revocar + emitir; estados `valid|expired|revoked|exhausted`). Vínculo empleado↔sucursal en `employee_locations`.
4. Empleado: solo escanea. QR de cliente → +1 sello exacto; QR de premio → canje. Solo en sus sucursales (`staffLocation`: `location_id` opcional; con varias sucursales debe elegir; sin sucursal → 403). Los fragmentos de QR usan el formato `#token=<token>`.
5. QR de cliente: HMAC rotativo (60 s, se acepta unos 2 min). Espera mínima entre sellos por cliente y sucursal configurable (4 h por defecto). Idempotencia + transacción. Referencia de ticket opcional y única si existe.
6. Meta completada → tarjeta a 0 + premio pendiente (varios posibles) con QR de un solo uso; un segundo canje se rechaza.
7. Auditoría de cada intento: actor, instante, sucursal y resultado. Autorización siempre en el servidor.
8. Tiempo real: WebSocket tras el commit; el saldo canónico está en la BD.

## Comandos
- `npm run dev` (Vite en 192.168.33.9:3000; pendiente `0.0.0.0` + `PUBLIC_URL`, D-08)
- `npm run check` (lint + tipos + unit) · `npm run test:db -- --sequence.shuffle` (PostgreSQL temporal en Docker)
- `npm run build` · `npm run generate` (Drizzle) · `npm run db:check` · `npm run test:browser:production`
- No usar `drizzle push`, no apuntar los tests al `.env` real y no migrar remoto sin autorización.

## Git
Remoto SSH `git@github.com:jMarlonDev/loyalty-program.git`. `main` ← `develop` ← `feat/<tema>`. Antes de cada funcionalidad: `git checkout develop && git pull`. Push solo de ramas `feat/*` (`git push -u origin feat/<x>`), sin `--force`, sin merges y sin push a develop/main: el usuario hace los PR y merges en GitHub (`https://github.com/jMarlonDev/loyalty-program/compare/develop...feat/<x>?expand=1`). No usar `gh`. Si el push pide passphrase, parar y darle el comando.

## Subagentes
`.claude/agents/` (model: sonnet): `backend-dev`, `ui-dev`, `test-dev`. Pasarles solo los archivos y reglas concretas.

## Fases y estado
- Base `develop` @ `761e962`: NEXT-001 (teléfono, operadores, ciclos, outbox, WS) local; 517 tests DB verdes al 2026-10-19.
- **D-01 / NEXT-006** (2026-11-27): inscripción por teléfono, tarjeta por dispositivo, cierre, reinscripción, admin de tarjetas y transferencia. Ramas `feat/d01-backend` → `feat/d01-tests` → `feat/d01-frontend`. 537 tests DB (semilla 20261019), 236 UI/servidor y 260 unit backend. Con la semilla 20261127 fallan 3 tests de `next-flow`/`customer-events-adapters` que dependen del orden (pendiente aislarlos). Spec `backend/docs/specs/NEXT-006-inscripcion-cliente.md`; manual en `PRUEBAS.md`.
- **AUTH-LOCAL** (`feat/auth-local`): 552 tests DB, 246 UI/servidor y 261 unit.
- **BRANCH** (`feat/sucursales-invitaciones`): 578 tests DB, 256 UI/servidor y 271 unit.
- **Fase 1 (lógica)** pendiente: sucursales/empleados/invitaciones renovables, cooldown 4 h, ticket opcional, reset a 0 + premios múltiples, tests de integración por regla.
- **Fase 2 (QR/tiempo real)** pendiente: HMAC rotativo, QR de premio en la app, WS.
- **Fase 3 (UI mobile-first)** pendiente: solo con la fase 1 en verde. PWA, botón dev «Agregar sello».
- Entrega: seed + `PRUEBAS.md` (1 admin, 2 empleados de sucursales distintas, 3 clientes: nueva, a 1 sello y con premio pendiente).

## HTTPS local con celular (por completar en D-08)
mkcert: `mkcert -install && mkcert <IP-LAN>` y servir Vite con esos certificados; o túnel `cloudflared tunnel --url http://localhost:3000`. Fijar `APP_ORIGIN`/`PUBLIC_URL` a la URL HTTPS. La cámara del celular exige HTTPS.
