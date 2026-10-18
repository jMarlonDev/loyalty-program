---
name: loyalty-spec
description: Crear o actualizar especificaciones del backend loyalty-program antes de implementar cambios de negocio o contratos HTTP; mantener trazabilidad spec-first y spec-anchored.
---

Ubicar `backend/` desde la raíz Git y leer su AGENTS.md y docs/index.md. Consultar solo las reglas BR y decisiones que afecten la tarea en docs/business-rules.md; no duplicarlas en esta skill.

Crear la spec usando docs/specs/TEMPLATE.md. Distinguir criterios aceptados de preguntas pendientes. Especificar rechazos y efectos que NO deben ocurrir, además del camino exitoso. Para HTTP definir permisos, payloads y códigos antes de handlers Web Request/Response integrados en TanStack Start. Para persistencia describir atomicidad y aislamiento del restaurante.

Registrar matriz BR → AC → pruebas (unit/integration/e2e). Conservar la spec al implementar; cambiarla primero ante nuevas reglas. No resolver canje, autenticación o confirmación de eliminación por intuición: consultar las preguntas canónicas. Limitar la implementación a lo autorizado por la tarea actual.
