# CORE-001 — Base HTTP y configuración

Estado: implementada; composición global verificada localmente. Fecha: 2026-10-18.

## Problema y alcance

Implementar la fase 0 de BACKEND-001: configuración validada antes de escuchar,
servidor Hono componible, respuestas operativas y errores uniformes. Sin cambios de
esquema, conexiones remotas durante pruebas ni nuevas reglas de negocio.

## Referencias

- [BACKEND-001](BACKEND-001-plan-de-negocio.md), fase 0 y contrato de errores.
- [Arquitectura](../architecture.md) y [flujo TDD](../workflow.md).
- Las BR de negocio no se modifican; esta base hace posible su implementación posterior.

## Contrato

`loadConfig(env)` valida `DATABASE_URL` PostgreSQL, `PORT` entero entre 1 y 65535
(3000 por defecto), `SUPABASE_URL` HTTPS sin ruta, consulta ni credenciales
(HTTP solo para desarrollo local) y
`SUPABASE_PUBLISHABLE_KEY` (fallback `SUPABASE_ANON_KEY`). Errores nombran la
variable sin imprimir su valor. Los tests proporcionan su propio entorno.
La composición funcional añade `CARD_TOKEN_ENCRYPTION_KEY` de 64 dígitos
hexadecimales para cifrar tokens y `CORS_ORIGINS` opcional con orígenes explícitos
separados por coma, sin comodines ni rutas.

Extensión para fases 3–4: `CARD_TOKEN_ENCRYPTION_KEY` obligatorio, 64 caracteres hexadecimales (32 bytes), usado para cifrar tokens recuperables de tarjeta e invitación. Supabase exige HTTPS salvo host local explícito; URL sin ruta, búsqueda ni fragmento. `CORS_ORIGINS` opcional contiene orígenes explícitos separados por coma, sin comodín.

`createBaseApp({ checkDatabase })` devuelve Hono ampliable por composición. No abre
conexiones, escucha sockets ni carga `.env` al importarse. Todas las respuestas
incluyen `X-Request-Id`; se acepta un identificador entrante de 1–64 caracteres
alfanuméricos, guion o guion bajo y se genera UUID si falta o es inválido.

Endpoints públicos sin autenticación, sin datos de negocio:

- `GET /health`: 200 `{ data: { status: "ok" } }`; no consulta BD.
- `GET /ready`: comprueba la dependencia inyectada. 200
  `{ data: { status: "ready" } }` o 503 con `SERVICE_UNAVAILABLE` y mensaje genérico.
- Ruta desconocida: 404 con `NOT_FOUND`.

Formato de error: `{ error: { code, message, request_id } }`. Un `AppError`
controlado conserva código, mensaje público y estado. Excepciones inesperadas
producen 500 `INTERNAL_ERROR`, sin stack, credenciales ni mensaje original. La
correlación funciona también en respuestas de error. Sin efectos persistidos.

El ejecutable carga configuración, compone adaptadores y aplicación y escucha.
SIGINT/SIGTERM dejan de aceptar conexiones y cierran el pool una sola vez; el
cierre dispone de un límite de tiempo para evitar un proceso colgado.

## Criterios de aceptación

- AC-001 — Configuración válida produce puerto y URLs; valores ausentes o inválidos
  fallan antes de abrir el servidor sin exponer secretos.
- AC-002 — Health responde sin dependencia; ready refleja disponibilidad sin
  exponer la excepción de BD.
- AC-003 — Peticiones reciben correlación segura y uniforme, incluyendo errores.
- AC-004 — Error conocido mantiene contrato; error desconocido no filtra detalles;
  rutas inexistentes responden JSON 404.
- AC-005 — Build ESM ejecutable y composición importable sin efectos de arranque.

## Trazabilidad y validación

| Criterio | Nivel | Archivo/prueba | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| AC-001 | unit | `tests/unit/config.test.ts` | RED: 15 fallos de comportamiento; GREEN: 15 tests |
| AC-002–AC-004 | unit, Hono en memoria con puertos dobles | `tests/unit/http-base.test.ts` | RED: 10 fallos (404, correlación ausente, errores sin JSON); GREEN: 10 tests |
| AC-005 | unit del cierre | `tests/unit/http-base.test.ts` | RED: esperaba cerrar servidor una vez, recibió cero; GREEN: un test verifica orden y repetición |
| AC-005 | compilación/smoke operativo | `tsconfig.build.json`, `src/main.ts` | Build y composición con todos los módulos verificados |

Comando RED/GREEN de base:
`npx vitest run --project unit tests/unit/config.test.ts tests/unit/http-base.test.ts`.
Resultado inicial: 25 fallos por expectativas, sin imports ausentes. Después de
implementar: 25 correctos. Segundo ciclo: prueba del cierre falla por cero llamadas
al servidor; tras implementar pasan las 26 pruebas. Biome comprueba los siete
archivos TypeScript/JSON de la entrega sin errores. Son pruebas de configuración,
contrato HTTP en memoria y ciclo de cierre; no son pruebas del proveedor ni de BD.

## Preguntas y riesgos

Las pruebas HTTP en memoria no demuestran integración PostgreSQL ni Supabase.
Readiness exige un check acotado por el adaptador de BD. La configuración de OAuth,
TLS del despliegue y exposición pública del servidor se documentan por entorno;
esta fase no despliega el servicio ni migra una base remota.
