# Arquitectura y decisiones técnicas

ADR-002 — 2026-10-18 — Migración fullstack autorizada; sustituye el transporte y despliegue de ADR-001 conservando dominio, persistencia y contratos.

Una aplicación **TanStack Start** integra React SSR, TanStack Router, TanStack Query y rutas servidor en un proceso Node. Vite compila cliente/servidor y Nitro emite `.output/server/index.mjs`. Node 24.18.1/npm 12.1.0, TypeScript estricto, shadcn/Radix y Tailwind. Un workspace npm y un lockfile raíz; Hono y su servidor retirados.

## Límites

- `src/routes/`: páginas y handlers Start; catch-all `/api/v1/$` preserva los contratos HTTP del backend.
- `src/features/`, `src/components/`: UI móvil; no deciden permisos ni contabilidad.
- `src/lib/`: consumo HTTP del mismo origen, Query y sesión pública; ningún secreto del servidor.
- `src/server/`: cookies HttpOnly, PKCE, CSRF por APP_ORIGIN, adaptador Supabase y composición/pool. El puente normaliza Request del adaptador Nitro sin depender de campos privados de Undici.
- `backend/src/domain/`: reglas puras; sin framework, DB ni red.
- `backend/src/application/`: casos de uso/puertos y autorización.
- `backend/src/infrastructure/`: PostgreSQL y adaptadores existentes.
- `backend/src/presentation/http/`: catálogo de contratos Web Request/Response, validación, errores, correlación, límites y CORS; Start posee el servidor.
- `backend/db/schema.ts`, `backend/drizzle/`: esquema e historial preservados.

La composición inyecta dependencias. El cliente nunca accede directamente a las tablas. La API sigue verificando identidad Supabase y autorización en cada operación; los consumidores con Bearer explícito permanecen compatibles. UI usa cookies con protección de origen y no persiste tokens en localStorage. Se limpia la caché Query al cambiar de identidad.

El QR público de inscripción y el token privado de tarjeta son distintos. La personalización no cambia condiciones de programas, reglas de compras, asignación de sellos, recompensas ni consentimiento. Dos consultas administrativas nuevas exponen resultados/clientes existentes, sin inventar ingresos ni cambiar el libro contable.

## Datos y operación

Las migraciones 0000–0003 no se reescriben. El JSON original eliminado por el usuario permanece representado por el snapshot 0000 y decisiones DB-001 a DB-004. La autorización e idempotencia viven en casos de uso y transacciones, no solo constraints.

Tests de dominio, integración PostgreSQL, HTTP, UI y navegador usan destinos locales aislados. La composición de producción y la del harness recorren el mismo adaptador Supabase; solo el servidor externo de Auth se simula durante tests. Migraciones de release son explícitas; el arranque no modifica esquema. Nitro cierra el pool mediante su hook close.

Ver [STACK-001](specs/STACK-001-tanstack-start.md), [coordinación](../../docs/migration-harness.md) y [despliegue](../../docs/deployment.md).
