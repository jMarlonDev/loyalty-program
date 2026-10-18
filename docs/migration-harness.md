# Migración fullstack — 2026-10-18

Solicitud vigente: reconstruir con TanStack Start, React y shadcn, frontend móvil, mismas reglas de negocio y tests antes/después. Reemplaza la reserva histórica del frontend. Fuente canónica: `backend/docs/business-rules.md`; especificación `backend/docs/specs/STACK-001-tanstack-start.md`.

## Responsabilidad e integración

| Área | Responsable | Límite de escritura | Contrato de integración |
| --- | --- | --- | --- |
| HTTP sin Hono | backend_migration | backend/src, backend/tests, spec | createApp().fetch(Request), contratos /api/v1 conservados |
| UI y diseño | frontend | src/features, components, styles, tests/ui, PRODUCT, DESIGN | Fetch del mismo origen; datos reales; cookies HttpOnly |
| Sesión y navegador | auth_harness | src/server/session, bridge, supabase-auth; lib/auth; tests/server y browser | /api/session; PKCE; CSRF por APP_ORIGIN |
| Ensamblaje y entrega | principal | configuración, rutas Start, runtime, deploy, docs raíz | Un proceso Node; un lockfile npm; checks agregados |

Los agentes comunican cambios de contrato antes de integrar. Ninguna regla se mueve a la UI: permisos, aislamiento, idempotencia y transacciones permanecen en dominio/aplicación y PostgreSQL. Cualquier ampliación de lectura debe tener spec y prueba, sin cambiar el libro contable.

## Evidencia previa

- `npm run check` en backend: lint y tipos correctos, 6 tooling y 217 unitarias correctas.
- `npm run test:db` con Docker temporal: las 400 pruebas originales correctas. Durante esa ejecución se incorporaron tres nuevas pruebas de transporte: 401 correctas y 2 RED de 403; no se presentan como regresiones del original.
- Los dos RED nuevos comprueban límite de bytes frente a Content-Length menor y aislamiento del limitador por dirección de adaptador.
- Estado previo de Git modificado preservado; no se usa reset ni se descarta la revisión de calidad existente.

## Puertas de entrega

1. Pruebas unitarias de dominio y UI y sesiones.
2. Integración y HTTP con PostgreSQL temporal y limpieza.
3. Tipos, formato, build SSR/cliente y manifiesto de rutas Start.
4. Navegador móvil/escritorio contra Start, QR y formularios conectados.
5. Paquete de despliegue, variables sin secretos, migraciones explícitas y documentación de límites externos.

El despliegue remoto y la validación del proveedor real solo se afirman si se ejecutan. Configuración de Google/SMTP, credenciales y destino real no se inventan.

## Cierre comprobado

409 backend con PostgreSQL temporal y cobertura, 64 UI/servidor y 10 escenarios Chromium producción correctos. Lint/tipos/build/Drizzle correctos. [Informe completo](project-review-2026-10-18.md). Subagentes completaron implementación y auditoría; su disponibilidad se agotó durante la revisión final y el principal cerró integración, aceptación y documentación. No se atribuye validación real al proveedor simulado.
