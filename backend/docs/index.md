# Contexto del backend

Leer lo necesario para la tarea, no toda la documentación indiscriminadamente.

**Inicio vigente — 2026-10-19:** leer el [plan LOYALTY-NEXT-001 del AGENTS raíz](../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente): nuevo flujo por teléfono/QR, empleados sin catálogo de roles, canje, WhatsApp, WebSocket y migración. Ejecución P0–P10 autorizada; P0 e infraestructura independiente en curso, con D-01–D-05 pendientes. El [harness](../../docs/migration-harness.md) conserva responsables, dependencias y evidencia. Las specs históricas describen la implementación anterior hasta su sustitución explícita.

1. [Reglas de negocio](business-rules.md): catálogo BR anterior y precedencia del nuevo plan; actualizar BR y specs en P0 antes del código.
2. [Arquitectura](architecture.md): capas, stack y límites.
3. [Flujo de trabajo](workflow.md): spec-first/spec-anchored, TDD y niveles de calidad.
4. [Spec del entorno](specs/ENV-001-environment.md): alcance y aceptación de esta etapa.
5. Correcciones del modelo: [CHECK](decisions/DB-001.md) y [relaciones](decisions/DB-002.md), autorizadas por el usuario.
6. [README](../README.md): instalación y comandos operativos.
7. [Plan de negocio BACKEND-001](specs/BACKEND-001-plan-de-negocio.md): fases del backend, registro por QR con correo o Google, contratos previstos y criterios de aceptación. Implementación local verificada; consultar estado actual.

Precedencia: instrucciones explícitas vigentes del usuario → requisitos confirmados del plan vigente y reglas compatibles → specs aceptadas → implementación. Contradicciones y propuestas pendientes se resuelven antes de implementar la parte afectada. LOYALTY-NEXT-001 es un plan solicitado expresamente en AGENTS, distinto de su historial de sesiones. Evitar duplicar reglas: enlazar IDs BR/NC/AC y mantener un único documento canónico por tema.

8. [Estado de desarrollo y commits](development-status.md): verificación global, módulos y pendientes.

9. [Calidad y pruebas](testing-quality.md): auditoría, regresiones, cobertura medida, datos SQL y limpieza.

10. [Validación externa](external-validation.md): inventario remoto de solo lectura, Google deshabilitado, configuración y despliegue pendientes.

## Aplicación fullstack

- [STACK-001: TanStack Start](specs/STACK-001-tanstack-start.md).
- [Coordinación y evidencia](../../docs/migration-harness.md).
- [Sesiones y navegador](../../docs/fullstack-testing.md).
- [Despliegue](../../docs/deployment.md).
- [Producto](../../PRODUCT.md) y [diseño](../../DESIGN.md).
- [Configurar Supabase y Google](../../docs/supabase-setup.md): entorno, SMTP, callbacks e inscripción.
- [AUTH-002: recuperación de errores de acceso](specs/AUTH-002-auth-recovery.md).
- [ACCESS-001: continuidad hacia tarjetas](specs/ACCESS-001-recorrido-cliente.md).

- [MOBILE-001: origen público](specs/MOBILE-001-public-origin.md).
- [MOBILE-QR-001: tarjeta móvil y escaneo](specs/MOBILE-QR-001-mobile-scan.md).
- [SESSION-003: continuidad de sesión](specs/SESSION-003-persistencia.md).
- [DB-005: retirar el identificador manual de restaurante](decisions/DB-005.md),
  implementado en [STAFF-001 AC-008](specs/STAFF-001-restaurants-staff.md).

- [ROLE-001: límites por rol](specs/ROLE-001-role-boundaries.md).
- [FLOW-001: acceso e invitaciones](specs/FLOW-001-access-invitations.md).
- [FLOW-002: QR y actualización de tarjetas](specs/FLOW-002-qr-live-cards.md).
- [ACCOUNTS-001: preparación de cuentas reales](specs/ACCOUNTS-001-pruebas-reales.md) y [guía operativa](../../docs/testing-accounts.md).
