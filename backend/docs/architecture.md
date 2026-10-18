# Arquitectura y decisiones técnicas

ADR-001 — 2026-10-18 — Aceptado para preparación.

Cliente y servidor en frontend/ y backend/, comunicados por API. Backend como monolito por capas, un despliegue. Node.js 24.18.1, npm 12.1.0, TypeScript ESM estricto. Hono para HTTP, Drizzle ORM/Kit y pg para PostgreSQL, Vitest para pruebas. Biome para análisis estático y formato. Dependencias exactas y lockfile propio del backend; sin npm workspaces en esta etapa.

## Organización al comenzar la implementación

- `src/domain/`: reglas y tipos de negocio sin Hono, Drizzle ni acceso a red.
- `src/application/`: casos de uso y puertos; depende del dominio.
- `src/infrastructure/`: persistencia y adaptadores; implementa puertos.
- `src/presentation/http/`: rutas Hono, validación y traducción de errores; invoca casos de uso.
- `src/main.ts`: composición y servidor cuando se autorice implementar.
- `db/schema.ts`: definición estructural requerida por Drizzle Kit; no es lógica de aplicación.

No crear capas vacías ni servidor de ejemplo en esta etapa. No importar infraestructura desde dominio o casos de uso. La composición inyectará adaptadores. La autorización y consistencia transaccional deben verificarse en casos de uso, no solo en la UI. QR público de inscripción y token de tarjeta son conceptos distintos.

## Datos

`SistemaDeFidelizacion.json` es el modelo estructural aportado por el usuario. `db/schema.ts` es su adaptación ejecutable, verificada por `tests/tooling/schema.test.ts`. `drizzle/` contiene historial SQL y snapshots versionables: nunca editar una migración ya aplicada. Ver `decisions/DB-001.md` y `decisions/DB-002.md` para las correcciones autorizadas. No se añaden defaults, cascadas, índices ni reglas no presentes en el modelo.

El esquema actual no garantiza por sí solo aislamiento entre restaurantes, idempotencia ni permisos. Esas garantías requieren futuras specs y pruebas; la migración inicial no demuestra preparación para producción.
