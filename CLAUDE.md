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

## Modelo de datos (25 tablas)
Negocio: `restaurants`, `locations` (sucursales), `loyalty_programs`. Personal: `users`, `restaurant_employees`, `operator_invitations` (`roles`, `invitations` heredadas → retirar en P9). Cliente: `customers` (solo teléfono E.164), `customer_sessions` (hash de cookie), `memberships`, `loyalty_cards`. Contabilidad: `purchases`, `loyalty_ledger_entries`, `loyalty_cycles`, `rewards`, `reward_purchase_allocations`, `reward_vouchers`, `reward_deliveries`. Control: `idempotency_records`, `audit_events`, `card_events_outbox`, `customer_event_leases`, `closure_consents`.

## Reglas de negocio (no negociables)
1. Cliente = solo teléfono (sin contraseña ni otros datos). Cookie opaca de 400 días, rate limit y sin enumeración.
2. Admin/empleado: correo + contraseña local (scrypt) y cookie httpOnly distinta de la del cliente. Roles fijos admin|empleado.
3. Admin: crea sucursales (nombre, dirección, punto físico), empleados manuales (contraseña temporal) o QR de invitación por sucursal y empleado (expiración, límite de usos, renovar = revocar + emitir).
4. Empleado: solo escanea. QR de cliente → +1 sello exacto; QR de premio → canje. Solo en sus sucursales.
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
`main` ← `develop` ← `feat/<tema>`. Commits Conventional pequeños; merge a `develop` al cerrar cada fase con los tests en verde. Sin push sin pedirlo.

## Subagentes
`.claude/agents/` (model: sonnet): `backend-dev`, `ui-dev`, `test-dev`. Pasarles solo los archivos y reglas concretas.

## Fases y estado
- Base `develop` @ `761e962`: NEXT-001 (teléfono, operadores, ciclos, outbox, WS) local; 517 tests DB verdes al 2026-10-19.
- **Fase 1 (lógica)** pendiente: login local staff, sucursales/empleados/invitaciones renovables, cooldown 4 h, ticket opcional, reset a 0 + premios múltiples, tests de integración por regla.
- **Fase 2 (QR/tiempo real)** pendiente: HMAC rotativo, QR de premio en la app, WS.
- **Fase 3 (UI mobile-first)** pendiente: solo con la fase 1 en verde. PWA, botón dev «Agregar sello».
- Entrega: seed + `PRUEBAS.md` (1 admin, 2 empleados de sucursales distintas, 3 clientes: nueva, a 1 sello y con premio pendiente).

## HTTPS local con celular (por completar en D-08)
mkcert: `mkcert -install && mkcert <IP-LAN>` y servir Vite con esos certificados; o túnel `cloudflared tunnel --url http://localhost:3000`. Fijar `APP_ORIGIN`/`PUBLIC_URL` a la URL HTTPS. La cámara del celular exige HTTPS.
