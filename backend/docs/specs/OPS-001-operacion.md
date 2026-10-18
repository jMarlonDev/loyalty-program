# OPS-001 — Operación verificable

Estado: aceptada para implementación el 2026-10-18.

## Alcance y contrato

Fase 8 de [BACKEND-001](BACKEND-001-plan-de-negocio.md). La API expone OpenAPI versionado y build. Pipeline CI y ejemplos completos permanecen pendientes; el runner local usa PostgreSQL temporal. Sin despliegue ni cambios en Supabase. El cliente completa correo/Google mediante Supabase, guarda el código público e inscribe después de crear perfil; no se implementa frontend.

Rutas `/api/*`: límite de cuerpo 16 KiB (`413 BODY_TOO_LARGE`), máximo 120 solicitudes por minuto por dirección de conexión (`429 RATE_LIMITED`, `Retry-After`). Ventana en memoria por proceso, máximo 5000 entradas; cuando se llena se rechazan nuevas direcciones hasta vencer la ventana. No confiar en X-Forwarded-For. Un despliegue detrás de proxy necesita límite adicional en ese proxy. CORS solo para orígenes configurados, métodos GET/POST/PATCH/DELETE/OPTIONS, sin cookies y encabezados Authorization, Content-Type, Idempotency-Key y X-Request-Id. Respuestas privadas no se cachean.

Logs JSON incluyen exclusivamente request_id, método, estado y duración. Nunca URL completa, query, cuerpo, Authorization, tokens o excepciones originales. `/health` y `/ready` mantienen el contrato CORE-001. Señales cierran servidor/pool y disponen de plazo máximo.

## Criterios y pruebas

- AC-001 — Origen permitido recibe CORS; otros no; preflight admite claves de reintento.
- AC-002 — Cuerpo excesivo se rechaza antes de ejecutar el caso de uso.
- AC-003 — Límite rechaza exceso, informa reintento y vuelve a permitir tras vencer; encabezados de proxy no evaden el contador.
- AC-004 — Logs y errores no contienen tokens, cuerpo, query ni secretos; la respuesta conserva correlación.
- AC-005 — OpenAPI enumera las rutas realmente montadas y sus contratos; ejemplos y comandos reproducibles; CI ejecuta tooling/unit/integration/e2e/build/db:check.

Pruebas unit HTTP `tests/unit/operations.test.ts`, verificación de rutas OpenAPI y E2E funcional de ciclo completo; PostgreSQL real aislado y proveedor Auth doble. RED/GREEN: cuatro pruebas de protección HTTP fallaron antes de implementar y pasan; cinco pruebas OpenAPI verifican las 39 operaciones montadas, parámetros, seguridad y schemas. La ejecución remota del pipeline y Google real requieren entorno externo y no se afirman con pruebas locales.

## Revisión de calidad — 2026-10-18

Se añaden límites exactos en bytes UTF-8, preservación de cuerpo, CORS/correlación/no-cache en errores, logs de 429 y tolerancia al fallo del destino de logs. `http-access.test.ts` recorre las 35 operaciones privadas realmente montadas y verifica 401 antes de consultar identidad o BD. `http-rejections.test.ts` prueba HTTP real con JSON inválido, tipo de contenido incorrecto y arrays en los cuatro módulos, más cuerpo excesivo, comparando el estado completo de las 16 tablas antes/después. El ciclo E2E incorpora consultas paginadas, movimientos, rotación/replay de QR, invalidación del token anterior y revocación de consentimiento. Proveedor Auth sigue sustituido por doble explícito.

Cobertura global mínima del 90 % en líneas, sentencias, funciones y ramas, sin excluir archivos de `src/`. Evidencia agregada y límites en [calidad](../testing-quality.md). El workflow CI se preparó posteriormente en `.github/workflows/ci.yml`; su ejecución remota sigue sin verificarse. Estos resultados corresponden a ejecución local.
