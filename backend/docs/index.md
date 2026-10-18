# Contexto del backend

Leer lo necesario para la tarea, no toda la documentación indiscriminadamente.

1. [Reglas de negocio](business-rules.md): única autoridad de comportamiento y preguntas pendientes.
2. [Arquitectura](architecture.md): capas, stack y límites.
3. [Flujo de trabajo](workflow.md): spec-first/spec-anchored, TDD y niveles de calidad.
4. [Spec del entorno](specs/ENV-001-environment.md): alcance y aceptación de esta etapa.
5. Correcciones del modelo: [CHECK](decisions/DB-001.md) y [relaciones](decisions/DB-002.md), autorizadas por el usuario.
6. [README](../README.md): instalación y comandos operativos.
7. [Plan de negocio BACKEND-001](specs/BACKEND-001-plan-de-negocio.md): fases del backend, registro por QR con correo o Google, contratos previstos y criterios de aceptación. Implementación local verificada; consultar estado actual.

Precedencia: instrucciones explícitas vigentes del usuario → reglas confirmadas → specs aceptadas → implementación. Contradicciones se registran y resuelven antes de implementar la parte afectada. El historial de sesión en AGENTS no reemplaza las reglas. Evitar duplicar reglas: enlazar IDs BR/AC y mantener un único documento canónico por tema.

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
