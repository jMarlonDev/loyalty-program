# Spec-first, spec-anchored y TDD

1. Leer `AGENTS.md`, `docs/index.md`, las reglas BR afectadas y la spec relevante. Revisar Git y preservar cambios ajenos.
2. Antes del código, crear/actualizar `docs/specs/<ID>-<nombre>.md` con la plantilla. Identificar reglas, contratos, escenarios y decisiones pendientes. Una spec aprobada permanece como ancla durante toda la vida del comportamiento; no se descarta al implementar.
3. Escribir primero la prueba del comportamiento y ejecutar solo esa prueba. Registrar RED por la expectativa que falla; un import ausente puede demostrar estructura faltante, pero no demuestra una regla de negocio.
4. Implementar el mínimo para GREEN; refactorizar sin cambiar el contrato. Volver a ejecutar las pruebas afectadas y las comprobaciones estáticas.
5. Mantener trazabilidad BR → spec/criterio AC → nombre de prueba → implementación. Cambiar primero la spec si cambia un requisito. No inventar decisiones de negocio para pasar tests.
6. Cerrar con evidencia: comandos, resultado RED/GREEN, limitaciones y próximos pasos en `AGENTS.md`. Actualizar README al cambiar preparación. Commits Conventional Commits; no commit/push automático.

## Niveles de prueba

| Nivel | Alcance | Comando |
| --- | --- | --- |
| tooling | Configuración y fidelidad del esquema, sin conexión a BD | `npm run test:tooling` |
| unit | Dominio/casos de uso, dobles de puertos, sin red | `npm run test:unit` |
| integration | Adaptadores con PostgreSQL aislado, migraciones y transacciones reales | `npm run test:integration` |
| e2e | API por HTTP y BD aislada: registro, permisos, sellos y eliminación confirmada | `npm run test:e2e` |

Las tres suites funcionales están configuradas y vacías. Sus comandos deben fallar si no encuentran pruebas: no usar `passWithNoTests` ni presentar tooling como cobertura funcional. `npm run check` valida únicamente preparación. `npm run test:coverage` mide código futuro de `src/`; no hay porcentaje funcional que reportar ahora.

Pruebas futuras de integración/E2E usarán exclusivamente `TEST_DATABASE_URL`, con setup que falle si falta o coincide con una BD no aislada; no cargar `.env` de desarrollo automáticamente en Vitest. Migrar fixtures controlados y limpiar solo recursos creados por la suite. Definir umbrales de cobertura al implementar, con prioridad a riesgos y escenarios, sin rellenar métricas.

## Casos mínimos derivados para próximas specs

- BR-005: cliente y personal sin rol no suman sellos; Admin/Employee autorizado sí; rechazo de operaciones sobre otro restaurante.
- BR-006: ambos roles pueden eliminar con confirmación válida del cliente; sin confirmación se rechaza y no cambia persistencia.
- BR-007: Employee no crea programas ni asigna roles ni elimina otros registros.
- Integración: FK, CHECK y unicidad; atomicidad al registrar compra y saldo.
- E2E: respuestas HTTP y efectos persistidos; decisiones de canje/confirmación deben estar resueltas antes de automatizarlas.
