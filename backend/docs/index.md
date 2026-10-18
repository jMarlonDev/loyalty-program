# Contexto del backend

Leer lo necesario para la tarea, no toda la documentación indiscriminadamente.

1. [Reglas de negocio](business-rules.md): única autoridad de comportamiento y preguntas pendientes.
2. [Arquitectura](architecture.md): capas, stack y límites.
3. [Flujo de trabajo](workflow.md): spec-first/spec-anchored, TDD y niveles de calidad.
4. [Spec del entorno](specs/ENV-001-environment.md): alcance y aceptación de esta etapa.
5. Correcciones del modelo: [CHECK](decisions/DB-001.md) y [relaciones](decisions/DB-002.md), autorizadas por el usuario.
6. [README](../README.md): instalación y comandos operativos.
7. [Plan de negocio BACKEND-001](specs/BACKEND-001-plan-de-negocio.md): fases del backend, registro por QR con correo o Google, contratos previstos y criterios de aceptación. Documentado; no implementado.

Precedencia: instrucciones explícitas vigentes del usuario → reglas confirmadas → specs aceptadas → implementación. Contradicciones se registran y resuelven antes de implementar la parte afectada. El historial de sesión en AGENTS no reemplaza las reglas. Evitar duplicar reglas: enlazar IDs BR/AC y mantener un único documento canónico por tema.
