# Revisión de cambios y serie de commits — 2026-10-18

Revisión del árbol pendiente frente a `749ceaa`, por instrucción expresa del usuario de crear todos los commits y publicarlos en `origin/main`. Los 167 archivos iniciales se revisaron por contenido/diff; este informe añade el archivo 168. Se conservaron los cambios acumulados de migración, calidad, acceso y móvil.

## Agrupación

1. `fix(db): discard connections after failed transaction rollback` — 4 archivos previos.
2. `feat(app): migrate loyalty platform to TanStack Start with mobile QR and persistent sessions` — 143 archivos previos.
3. `ci(deploy): prepare fullstack checks and HTTPS deployment` — 6 archivos previos.
4. `docs: record architecture validation and file-by-file delivery review` — 14 archivos previos más este informe.

La aplicación, sus dependencias, el transporte y las pruebas se integran juntos porque todavía no existían en HEAD; separarlos por capas dejaría importaciones incompletas. El arreglo de transacciones es independiente. No se inventa una secuencia de parches de autenticación/móvil sobre archivos que nunca estuvieron versionados.

## Comprobaciones y límites

- Fetch satisfactorio: HEAD y origin/main coincidían al comenzar. La identidad de autor existente se conserva.
- Comparación de candidatos con secretos del entorno, sin imprimir valores: ninguna coincidencia. Sin claves privadas ni patrones de tokens GitHub en candidatos. `.env`, dependencias, bundles, cachés y capturas permanecen ignorados.
- Lockfile raíz revisado: registros de descarga en registry.npmjs.org, workspace único; lockfile backend y servidor anterior retirados deliberadamente.
- No se cambió código funcional durante esta preparación. Se usa evidencia de la tarea inmediatamente anterior: 132 UI/servidor, 227 backend de unidad/tooling y 10 recorridos de producción correctos; build/tipos/análisis correctos. No se presentan como nuevas ejecuciones.
- Se aclararon cifras históricas y comandos de instalación en la documentación; no se reescribió evidencia histórica. La revisión backend completa/cobertura anterior fue 409 y 97,33 % de líneas.
- No se aplicaron migraciones remotas, configuró Supabase ni publicó hosting. Google/SMTP reales, cámara física y URL HTTPS siguen pendientes. Publicar Git no despliega esta aplicación.
- Resultado de publicación: cuatro commits creados y un quinto cierre documental. HTTPS falló por ausencia de credenciales y SSH por clave pública rechazada; el remoto continúa en 749ceaa. No hubo publicación. AGENTS y estado de desarrollo registran el resultado.

## Inventario por archivo

| Archivo | Commit | Cambio revisado |
| --- | --- | --- |
| `.dockerignore` | 3 | Excluye secretos, dependencias locales y artefactos del contexto Docker. |
| `.env.example` | 3 | Plantilla raíz completa; conexión DB comentada para conservar fallback válido; origen local y guía HTTPS. |
| `.github/workflows/ci.yml` | 3 | Pipeline de instalación, build, análisis, migraciones locales y pruebas aisladas de DB/navegador. |
| `.gitignore` | 2 | Excluye bundles Nitro/Start, rutas generadas, resultados de navegador y cachés locales. |
| `.impeccable/config.json` | 2 | Configuración del hook y límites de hallazgos; no implica hook disponible/ejecutado. |
| `.impeccable/design.json` | 2 | Tokens de identidad, fuentes, espaciado/radios/touch target y relación con estilos/superficies. |
| `.impeccable/surfaces/landing.md` | 2 | Objetivo persuasivo de inicio, tarjeta ejemplo y límites de promesas; última referencia cromática quedó obsoleta. |
| `.impeccable/surfaces/workspace.md` | 2 | Objetivo operativo, permisos y campos autorizados, estados y composición móvil. |
| `AGENTS.md` | 4 | Actualiza alcance autorizado fullstack/workspace y conserva cierre de auditoría, validación externa, migración, diseño/acceso y sesión/QR móvil. Registra pruebas, límites remotos y próximos pasos. |
| `DESIGN.md` | 2 | Sistema tinta/lima y DM Sans, pantallas/controles móviles, estados y almacenamiento QR privado transitorio separado de tokens Auth. |
| `Dockerfile` | 3 | Build Node, job explícito de migración y runtime Nitro sin privilegios con healthcheck. |
| `PRODUCT.md` | 2 | Producto, usuarios, capacidades y límites, marca Lealtad general sin café; reglas restaurante conservadas; necesidad publicación HTTPS y móvil. |
| `README.md` | 4 | Sustituye entrada backend aislado por estructura TanStack Start, instalación única, comandos raíz, QR público, tarjetas directas, sesiones, despliegue y enlaces de configuración. |
| `backend/AGENTS.md` | 4 | Cambia alcance backend a biblioteca fullstack y añade evidencia por fases: calidad, validación remota READ ONLY, transporte nativo, lecturas administrativas, integración, Auth y móvil. |
| `backend/README.md` | 4 | Instalar workspace desde raíz, retirar servidor Hono separado, explicar migraciones con fallback env y calidad ampliada; enlaza migración fullstack. |
| `backend/biome.json` | 2 | Integra configuración del workspace y esquema Biome del node_modules raíz. |
| `backend/docs/architecture.md` | 4 | ADR-002 sustituye transporte Hono por Request/Response+Start; delimita cliente/servidor/dominio, sesiones HttpOnly, permisos y dos lecturas administrativas. |
| `backend/docs/business-rules.md` | 4 | Elimina afirmación obsoleta «No hay endpoints implementados aún» de BR-004; ninguna regla de negocio cambia. |
| `backend/docs/development-status.md` | 4 | Antecede al historial el estado móvil vigente, distingue 132 UI de 409 backend históricos y registra 10 escenarios navegador/limitaciones reales. |
| `backend/docs/external-validation.md` | 4 | Inventario histórico Supabase READ ONLY: 0000, 11 tablas vacías, Google entonces deshabilitado; falta configuración/URL/cuenta para comprobación externa completa. Sin secretos. |
| `backend/docs/index.md` | 4 | Añade índices de calidad, validación externa, fullstack, despliegue, diseño, Auth y móvil/sesión. |
| `backend/docs/specs/ACCESS-001-recorrido-cliente.md` | 2 | Nueva spec destino tarjetas/administrar, conservar next en alta/Google y recuperar errores sesión. |
| `backend/docs/specs/AUTH-002-auth-recovery.md` | 2 | Nueva spec mensajes seguros Auth, callback/PKCE y configuración Google incompleta. |
| `backend/docs/specs/IDENTITY-001-perfiles.md` | 2 | Trazabilidad de fixtures, estados, concurrencia y timeout con evidencia histórica RED/GREEN. |
| `backend/docs/specs/LOYALTY-001-operaciones.md` | 2 | UUID equivalentes, atomicidad de auditoría y pruebas ampliadas con evidencia focal. |
| `backend/docs/specs/MOBILE-001-public-origin.md` | 2 | Nueva spec APP_ORIGIN público seguro sinDB, enlaces canónicos, aviso localhost/permalink y necesidad de despliegue. |
| `backend/docs/specs/MOBILE-QR-001-mobile-scan.md` | 2 | Nueva spec QR privado fragmento, pendiente por pestaña10min, resolución autorizada sin compra, cámara/segundo QR. |
| `backend/docs/specs/OPS-001-operacion.md` | 2 | Revisión límites bytes, seguridad/errores, todas rutas privadas y HTTP sin efectos, cobertura mínima90%. |
| `backend/docs/specs/PROGRAMS-001-programas-tarjetas.md` | 2 | UUID/cursor canónico, paginación independiente y rollback de inscripción/auditoría. |
| `backend/docs/specs/SESSION-003-persistencia.md` | 2 | Nueva spec refresh400d/renovación, fallos transitorios, logout entre pestañas, perfil antes de tarjetas, límites reales. |
| `backend/docs/specs/STACK-001-tanstack-start.md` | 2 | Nuevo contrato migración Web/Start y dos lecturas; datos visuales/rol/directorio/QR, trazabilidad y límites externos. |
| `backend/docs/specs/STAFF-001-restaurants-staff.md` | 2 | Evidencia rechazos tenant/destinatario, cifrado, rollback e independencia temporal. |
| `backend/docs/specs/TESTDB-001-postgresql-aislado.md` | 2 | Actualiza16tablas y nuevos AC grafo/constraints/RLS; 84escenarios y limpieza comprobada. |
| `backend/docs/specs/TX-001-transacciones.md` | 1 | Contrato de conservar error y descartar conexión tras rollback fallido, evidencia13unit/5integración. |
| `backend/docs/testing-quality.md` | 4 | Informe histórico auditoría 210→400, fixtures SQL16 tablas, cobertura y regresiones UUID/rollback/aislamiento/initdb; no certifica proveedor real. |
| `backend/docs/workflow.md` | 4 | Documenta suite de integración/E2E, cobertura mínima y PostgreSQL temporal en el proceso spec-first/TDD; sin alterar mandato de permisos. |
| `backend/drizzle.migrate.config.ts` | 2 | Carga entorno raíz y conserva backend/.env como fallback sin sobrescribir host. |
| `backend/package-lock.json` | 2 | Elimina lockfile independiente; la instalación queda fijada en el lockfile raíz. |
| `backend/package.json` | 2 | Retira Hono/servidor separado y scripts de arranque/build; mantiene núcleo como workspace. |
| `backend/scripts/test-db.mjs` | 2 | Espera disponibilidad TCP; añade ejecución de navegador con DB aislada y bundle de producción. |
| `backend/skills/loyalty-spec/SKILL.md` | 2 | Actualiza el anclaje HTTP de Hono a Web Request/Response dentro de Start. |
| `backend/src/application/programs.ts` | 2 | Contrato de repositorio y servicio para resultados y clientes paginados; validación de UUID/página existente. |
| `backend/src/domain/loyalty.ts` | 2 | UUID a minúsculas en ruta/cuerpo sin mutar el objeto de entrada; preserva equivalencia de comandos. |
| `backend/src/domain/programs.ts` | 2 | UUID/cursor canónico a minúsculas. |
| `backend/src/infrastructure/programs-repository.ts` | 2 | Campos visuales actuales del programa en tarjetas; resultados/inscripciones con permisos administrativos; resolución de QR añade cliente y premios disponibles. |
| `backend/src/infrastructure/staff-repository.ts` | 2 | Listado restaurantes incluye rol del actor; directorio Owner/Admin incorpora nombre/correo del personal. |
| `backend/src/infrastructure/transactions.ts` | 1 | Si falla rollback conserva error original/traducción segura y destruye conexión mediante release(error). |
| `backend/src/main.ts` | 2 | Eliminado servidor/adaptador Hono y cierre propio, sustituido por runtime Start/Nitro raíz. |
| `backend/src/presentation/http/base-app.ts` | 2 | Boundary Web Request/Response, correlación, errores seguros y HEAD; health/readiness preservados. |
| `backend/src/presentation/http/identity.ts` | 2 | Montaje NativeRoutes en lugar de Hono; comportamiento identidad preservado. |
| `backend/src/presentation/http/loyalty.ts` | 2 | NativeRoutes en lugar de Hono/AppEnv; contratos de operaciones preservados. |
| `backend/src/presentation/http/native-routes.ts` | 2 | Nuevo catálogo de rutas/contexto, parámetros decodificados, query/body, dispatch HEAD/GET y rechazo 404. |
| `backend/src/presentation/http/openapi.ts` | 2 | Schemas de resultados, cliente inscrito, tarjeta con diseño, tarjeta resuelta, rol del actor y directorio; dos nuevos GET administrativos. |
| `backend/src/presentation/http/operations.ts` | 2 | Reemplaza middleware Hono por boundary nativo: seguridad/CORS/logs/no-store/rate limit por conexión confiable, lectura real de cuerpo limitada a16KiB. |
| `backend/src/presentation/http/programs.ts` | 2 | NativeRoutes y dos GET protegidos results/customers. |
| `backend/src/presentation/http/staff-routes.ts` | 2 | NativeRoutes/HttpContext manteniendo permisos y mutaciones. |
| `backend/tests/e2e/card-lifecycle.test.ts` | 2 | Helper sockets nativos; amplía ciclo con paginación, detalle propio/ajeno, rotación QR/replay/token anterior, movimientos, revocación de consentimiento. |
| `backend/tests/e2e/http-rejections.test.ts` | 2 | Nuevo HTTP real sobre DB aislada: JSON truncado, tipo incorrecto, arrays, exceso de cuerpo; snapshots comprueban cero efectos en todas las tablas. |
| `backend/tests/e2e/identity.test.ts` | 2 | Helper nativo; fixtures por sujeto/caso; crea precondiciones propias y comprueba conservación de datos tras rechazo. |
| `backend/tests/helpers/http-server.ts` | 2 | Servidor node:http exclusivo de tests, adaptador Web Request/Response y dirección de socket confiable. |
| `backend/tests/integration/identity.test.ts` | 2 | Fixtures independientes; perfiles concurrentes, mismos correos/sujetos distintos, campos nulos, ausentes, suspensión/cierre y contención PostgreSQL observada. |
| `backend/tests/integration/loyalty.test.ts` | 2 | UUID equivalente/replay, ocho reintentos simultáneos, matriz de estados bloqueados, rollback de compra/cierre fallando auditoría y vencimiento exacto. |
| `backend/tests/integration/programs.test.ts` | 2 | Agregados/paginación/permisos del nuevo API, QR con premios, diseño vigente; fortalece fixtures/paginación/rollback de inscripción. Mezcla auditoría previa y lecturas nuevas. |
| `backend/tests/integration/schema-integrity.test.ts` | 2 | Nuevo grafo SQL16tablas, FK31, CHECK16, PK/nulabilidad, unicidad/índices parciales, membresías cruzadas, RLS con rol ordinario y comprobación de eliminación DB temporal. |
| `backend/tests/integration/staff.test.ts` | 2 | Roles/directorio nuevos; reloj por caso, rollback aceptación, rechazos multi-tenant/destinatario, cifrado y replay de invitación. Mezcla auditoría y lecturas nuevas. |
| `backend/tests/integration/transactions.test.ts` | 1 | Actor por caso; rollback no consume clave, reintento, separación por actor y conflicto entre operaciones. |
| `backend/tests/unit/http-access.test.ts` | 2 | Nuevo recorrido dinámico de todas las rutas privadas, 401 antes de proveedor/DB. |
| `backend/tests/unit/http-base.test.ts` | 2 | Retira test del helper de cierre eliminado; health/readiness/errores siguen cubiertos. |
| `backend/tests/unit/identity-provider.test.ts` | 2 | Datos nulos/array/NUL/fecha inválida y timeout real por AbortSignal, mensajes sin detalles privados. |
| `backend/tests/unit/loyalty.test.ts` | 2 | Regresión de UUID canónicos sin mutación y límites/valores inválidos independientes para referencia/meta/motivo. |
| `backend/tests/unit/native-http.test.ts` | 2 | Nuevo params/query/body/HEAD, separación rate-limit por IP confiable y cuerpo real aunque Content-Length mienta. |
| `backend/tests/unit/operations.test.ts` | 2 | HttpContext nativo; bordes16KiB UTF-8, CORS/correlación/cache/logs en errores, log sink fallido y429. |
| `backend/tests/unit/programs.test.ts` | 2 | Regresión UUID/cursor equivalentes en mayúsculas. |
| `backend/tests/unit/transactions.test.ts` | 1 | Dobles de transporte prueban fallo rollback, conservación error, unicidad segura y conexión sana. |
| `backend/tsconfig.build.json` | 2 | Retira build separado del servidor backend, sustituido por compilación fullstack. |
| `backend/vitest.config.ts` | 2 | Añade reporte JSON de cobertura y umbral global mínimo del 90 %. |
| `biome.json` | 2 | Análisis y formato raíz, con exclusión de código generado y lockfile. |
| `components.json` | 2 | Configura shadcn, alias, estilos y conjunto de iconos. |
| `docs/deployment.md` | 3 | Artefacto Nitro, variables, migración explícita, Docker, salud, HTTPS público, callbacks, cámara y sesiones Supabase. Claramente informa que no existe hosting remoto actual. |
| `docs/fullstack-testing.md` | 4 | Contrato sesión/PKCE y evidencia RED/GREEN; harness navegador real con proveedor simulado y DB efímera; resultados históricos y aceptación móvil132/10 actual. |
| `docs/migration-harness.md` | 4 | Coordinación de responsabilidades/agentes, contratos de integración, baseline y cierre migración; distingue evidencia local y remota. |
| `docs/project-review-2026-10-18.md` | 4 | Informe histórico cierre migración: stack/capacidades, retirada de Hono, pruebas409/64/10, preparación y guía manual. Necesita aviso histórico porque otras mejoras se realizaron posteriormente el mismo día. |
| `docs/supabase-setup.md` | 3 | Guía completa Supabase/Google/SMTP/PKCE y variables; distingue callback Google→Supabase de Supabase→app, cuenta de inscripción, migraciones y diagnóstico. |
| `frontend/.gitkeep` | 2 | Retira directorio frontend vacío, sustituido por aplicación src/ raíz. |
| `package-lock.json` | 2 | Fija árbol completo de dependencias del workspace; descargas únicamente de registry.npmjs.org. |
| `package.json` | 2 | Unifica workspace, versiones exactas, comandos fullstack y dependencias React/Start/ZXing/pruebas. |
| `scripts/browser-tests.mjs` | 2 | Aísla servidor/BD/ventana de límites por viewport sin relajar protección de producción. |
| `scripts/env-check.ts` | 2 | Valida variables sin imprimir valores; --public rechaza origen local, sin afirmar conectividad. |
| `scripts/generate-routes.mjs` | 2 | Genera árbol de rutas antes de TypeScript para instalaciones limpias. |
| `src/components/common.tsx` | 2 | Marca, campos accesibles, carga, errores con reintento, estados vacíos, paginación y títulos comunes. |
| `src/components/loyalty-card.tsx` | 2 | Tarjeta personalizable con saldo/sellos, logo con fallback, QR auténtico y utilidades de compartir/copiar. |
| `src/components/public-share-qr.tsx` | 2 | QR compartible basado en origen canónico; aviso localhost y reintento de configuración. |
| `src/components/qr-camera.tsx` | 2 | Lector ZXing bajo demanda, cámara posterior, errores de permisos/HTTPS, cierre de recursos y lectura única. |
| `src/components/ui/button.tsx` | 2 | Botón con variantes y composición Radix Slot. |
| `src/components/ui/dialog.tsx` | 2 | Modal Radix con título, descripción y cierre accesibles. |
| `src/components/ui/input.tsx` | 2 | Input común con estilo centralizado. |
| `src/features/auth-page.tsx` | 2 | Registro, login, Google, recuperación, destino de retorno seguro, callback con errores y continuación de sesión existente. |
| `src/features/customer.tsx` | 2 | Mis tarjetas, permalink, perfil, detalle con QR privado canónico, movimientos/premios, consentimiento y cierre de tarjeta. |
| `src/features/enrollment.tsx` | 2 | Inscripción al programa y enlace a la tarjeta creada; aceptación de invitaciones con sesión verificada. |
| `src/features/forms.ts` | 2 | Payloads de programa/compra, retorno local seguro y cálculo de contraste. |
| `src/features/landing.tsx` | 2 | Presentación de fidelización con accesos reales, muestra identificada y estilo sin café. |
| `src/features/management.tsx` | 2 | Restaurante, sedes, equipo, invitaciones y configuración administrativa. |
| `src/features/operations.tsx` | 2 | Resolución QR manual/cámara/enlace, compra de un sello, canje, reversión y cierre con consentimiento; no compra automática al leer QR. |
| `src/features/programs.tsx` | 2 | Listado/edición/estado de programas, personalización y enlace público; protege condiciones tras inscripción. |
| `src/features/results.tsx` | 2 | Resultados agregados, clientes paginados y detalle; QR público según estado del programa. |
| `src/features/scan.tsx` | 2 | Entrada privada por fragmento, limpieza URL y continuidad de login; consulta autorización del restaurante antes del formulario. |
| `src/features/workspace.tsx` | 2 | Shell y navegación por restaurante/rol; estados de carga/acceso y manejo de fallos temporales de sesión. |
| `src/lib/api.ts` | 2 | Cliente API, errores estructurados, React Query, paginación acumulativa y claves idempotentes reutilizadas ante errores ambiguos. |
| `src/lib/auth.tsx` | 2 | Proveedor de identidad, creación inicial de perfil antes de consultas, refresh único/serializado, renovación visible y sincronización de logout. |
| `src/lib/card-qr.ts` | 2 | Construcción y validación estricta del QR privado, compatibilidad con token anterior y almacenamiento temporal por pestaña. |
| `src/lib/public-config.tsx` | 2 | Consulta pública del origen con validación, caché corta y reintento explícito. |
| `src/lib/public-origin.ts` | 2 | Validación APP_ORIGIN (HTTPS o loopback de desarrollo) y detección sintáctica de origen privado/local. |
| `src/lib/types.ts` | 2 | Tipos frontend de entidades/colecciones y vista de cierre. |
| `src/lib/utils.ts` | 2 | Clases combinadas, fechas y etiquetas de estado españolas. |
| `src/router.tsx` | 2 | Router TanStack con QueryClient por instancia y restauración de scroll. |
| `src/routes/__root.tsx` | 2 | Documento español, providers, metadata, salto accesible y superficies de error/404. |
| `src/routes/api.public-config.ts` | 2 | GET público para origen canónico. |
| `src/routes/api.session.$.ts` | 2 | Métodos de rutas servidor de callback/Google delegados al runtime. |
| `src/routes/api.session.ts` | 2 | Endpoint de sesión delegado al runtime. |
| `src/routes/api.v1.$.ts` | 2 | Pasarela de todos los métodos API a negocio en el proceso Start. |
| `src/routes/app.tsx` | 2 | Ruta del espacio administrativo. |
| `src/routes/auth.tsx` | 2 | Ruta de autenticación. |
| `src/routes/cards.tsx` | 2 | Ruta de tarjetas del cliente. |
| `src/routes/health.ts` | 2 | Ruta de liveness. |
| `src/routes/index.tsx` | 2 | Ruta de presentación inicial. |
| `src/routes/invite.$token.tsx` | 2 | Ruta parametrizada de invitación. |
| `src/routes/join.$code.tsx` | 2 | Ruta parametrizada de inscripción pública. |
| `src/routes/openapi[.]json.ts` | 2 | Publicación del contrato OpenAPI. |
| `src/routes/ready.ts` | 2 | Ruta de readiness. |
| `src/routes/scan.tsx` | 2 | Ruta de lectura privada de tarjetas. |
| `src/server/bridge.ts` | 2 | Cookie a Bearer, protección de mutación cross-origin, transporte Web compatible Nitro e identidad no cacheable. |
| `src/server/config.ts` | 2 | Composición de configuración backend y origen validado. |
| `src/server/nitro-close.ts` | 2 | Cierre del pool con lifecycle Nitro. |
| `src/server/public-config.ts` | 2 | Respuesta pública limitada a appOrigin, sin DB/secretos y con error seguro. |
| `src/server/runtime.ts` | 2 | Composición única DB/API/Supabase/Session, precedencia dotenv y fallos seguros; salud/origen sin depender de DB. |
| `src/server/session.ts` | 2 | Cookies HttpOnly/Secure, refresh renovable 400 días, acciones sesión y OAuth/Email PKCE con retorno limitado al sitio. |
| `src/server/supabase-auth.ts` | 2 | Adaptador de API Supabase Auth, grants/PKCE y errores públicos acotados. |
| `src/start-env.d.ts` | 2 | Ampliación de tipos Start para rutas servidor antes del primer build. |
| `src/styles.css` | 2 | Sistema visual tinta/lima y DM Sans, componentes y adaptación móvil, foco y reduced-motion. |
| `tests/browser/fullstack.spec.ts` | 2 | Cinco recorridos productivos por viewport: acceso, inscripción/tarjeta, Google/refresh/reintento, programas/QR/compras/canje y confirmación/recuperación. Incluye Axe/capturas. |
| `tests/browser/playwright.config.ts` | 2 | Chromium escritorio/Pixel 7, ejecución serial, servidor aislado, trazas ante fallo. |
| `tests/browser/server.ts` | 2 | Harness con PostgreSQL temporal y proveedor Auth simulado; levanta aplicación y limpia procesos/DB. |
| `tests/server/auth-fetch.test.ts` | 2 | Refresh único, retry limitado, preservación de payload idempotente y errores temporales. |
| `tests/server/bridge.test.ts` | 2 | Traducción cookie/Bearer, rechazo CSRF y respuestas de identidad no cacheables. |
| `tests/server/public-config.test.ts` | 2 | Origen canónico sin DB/Host, salida limitada y fallos seguros. |
| `tests/server/review.test.ts` | 2 | Revocación con access vencido y semántica de parámetros repetidos. |
| `tests/server/runtime-config.test.ts` | 2 | Requisito APP_ORIGIN, rechazo de orígenes inseguros y aceptación HTTPS/loopback. |
| `tests/server/runtime.test.ts` | 2 | Transporte Start/Nitro, cabeceras/cuerpo/IP, salud y errores de configuración. |
| `tests/server/session.test.ts` | 2 | CSRF, cookies, registro/login/logout/refresh, PKCE, validación de cuerpo y errores seguros. |
| `tests/server/supabase-auth.test.ts` | 2 | Contrato del adaptador Supabase, grants, URLs PKCE y errores de proveedor normalizados. |
| `tests/setup.ts` | 2 | Matchers DOM y limpieza React tras cada prueba. |
| `tests/ui/api.test.tsx` | 2 | Errores API, JSON/idempotencia y paginación acumulativa. |
| `tests/ui/auth-page.test.tsx` | 2 | Destino de tarjetas/inscripción, callbacks seguros, reintento y continuación de identidad existente. |
| `tests/ui/auth-provider.test.tsx` | 2 | Persistencia temporal, renovación/foco, fallos transitorios, logout y coordinación de operaciones pendientes. |
| `tests/ui/business-ui.test.ts` | 2 | Una compra/un sello, condiciones bloqueadas, retornos seguros y contraste. |
| `tests/ui/card-qr.test.ts` | 2 | Fragmento privado, validación de origen/token/duplicados y TTL/borrado del QR. |
| `tests/ui/closure.test.tsx` | 2 | Consentimiento vinculado a la vista previa de cierre. |
| `tests/ui/components.test.tsx` | 2 | Tarjeta/QR, metas grandes, fallback de logo, modal accesible y CTA reales. |
| `tests/ui/customer-mobile.test.tsx` | 2 | Permalink recuperado al recargar, origen público y error temporal sin falso logout. |
| `tests/ui/operations.test.tsx` | 2 | QR abre formulario sin compra automática, enlace pegado y rechazo de código inválido. |
| `tests/ui/public-config.test.tsx` | 2 | Origen compartible canónico, aviso local y reintento sin inventar enlaces. |
| `tests/ui/qr-camera.test.tsx` | 2 | Lectura única, permisos y liberación de cámara incluso tras desmontaje temprano; cámara simulada. |
| `tests/ui/scan.test.tsx` | 2 | Fragmento limpio, QR retomado tras login, acceso autorizado, fallos temporales y segundo QR en la misma pestaña. |
| `tests/ui/workspace.test.tsx` | 2 | Visibilidad por roles, condiciones inmutables de programa inscrito y prohibición de reactivación tras finalizar. |
| `tsconfig.json` | 2 | Configura TypeScript estricto para React, rutas, servidor y pruebas en el workspace. |
| `vite.config.ts` | 2 | Integra Tailwind, Start, React y Nitro Node con cierre del pool. |
| `vitest.config.ts` | 2 | Separa pruebas UI jsdom y servidor Node, sin cargar credenciales de desarrollo. |
| `docs/commit-review-2026-10-18.md` | 4 | Inventario, agrupación, evidencias y límites de esta publicación. |

## Commits creados y publicación pendiente

| Commit | Contenido |
| --- | --- |
| a37075d | Rollback y descarte seguro de conexión |
| e278208 | Aplicación fullstack, sesiones, móvil/QR y pruebas |
| 56139be | CI, Docker, entorno y guías de despliegue |
| 069906c | Arquitectura, informes e inventario por archivo |
| Cierre (`git log -1`) | Resultado real de los intentos de publicación; documentación únicamente |

GitHub no aceptó autenticación HTTPS/SSH. `git ls-remote origin refs/heads/main` siguió devolviendo `749ceaac0ce2d864c79f2aa6f801debcaf517e80`. Los commits permanecen locales; después de autenticar GitHub, publicar con `git push origin main`. No se solicitaron ni registraron tokens del usuario.
