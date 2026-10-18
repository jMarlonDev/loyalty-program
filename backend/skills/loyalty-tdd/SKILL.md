---
name: loyalty-tdd
description: Implementar o corregir comportamiento autorizado del backend loyalty-program con pruebas Vitest primero, por capas y con evidencia RED/GREEN.
---

Ubicar backend/ y leer AGENTS.md, docs/workflow.md y la spec aceptada que gobierna el cambio. Si no hay criterios observables, completar la spec antes del código.

Elegir tests/unit para dominio/casos de uso, tests/integration para PostgreSQL real aislado y tests/e2e para HTTP completo. Escribir una prueba del criterio AC y observar su fallo esperado antes de implementar. Un error de import no prueba autorización ni reglas de negocio. Implementar lo mínimo, verificar respuesta y efecto persistido, luego refactorizar.

No cargar DATABASE_URL de desarrollo en tests. El setup funcional debe exigir TEST_DATABASE_URL aislado y limpiar solo fixtures propios. Cubrir permisos y rechazos pertinentes, usando los IDs BR actuales como referencia. No simular PostgreSQL cuando la propiedad probada depende de transacciones o constraints reales.

Ejecutar la suite afectada y npm run check. No usar passWithNoTests. Registrar evidencia, limitaciones y próximos pasos en AGENTS.md; distinguir tooling de pruebas de producto.
