# Guía de agentes — backend

## Alcance autorizado

Leer este archivo y `../AGENTS.md` al iniciar cada sesión. La solicitud vigente del 2026-10-18 autoriza reconstruir el sistema fullstack con TanStack Start, frontend responsive y shadcn, delegar tareas a subagentes y aplicar TDD, conservando las reglas de negocio de BACKEND-001. Sustituye la reserva anterior de frontend. `backend/` contiene dominio, casos de uso, persistencia, contratos HTTP y pruebas como workspace de la aplicación raíz; TanStack Start proporciona el servidor. No se han aplicado cambios remotos ni alterado credenciales durante esta migración.

## Contexto mínimo y fuente de verdad

- `docs/index.md`: mapa de contexto; cargar solo referencias pertinentes.
- `docs/business-rules.md`: reglas BR confirmadas y decisiones pendientes. No mantener copias divergentes.
- `docs/architecture.md`: monolito por capas y stack.
- `docs/workflow.md`: spec-first/spec-anchored y TDD obligatorios antes de comportamiento nuevo.
- `docs/specs/`: specs persistentes y plantilla; vincular BR → AC → pruebas.
- `drizzle/meta/0000_snapshot.json`: referencia del modelo original, cuyo JSON fue eliminado anteriormente. `db/schema.ts`: adaptación; excepciones autorizadas en `docs/decisions/DB-001.md` y `docs/decisions/DB-002.md`.

## Herramientas y skills

Node 24.18.1 y npm 12.1.0. Instalar desde la raíz con `npm ci --ignore-scripts --no-audit --no-fund`; ejecutar desde backend: `npm run check`, `npm run generate`, `npm run db:check`. Vitest distingue tooling/unit/integration/e2e; no ocultar suites vacías ni equiparar tooling con tests funcionales.

Skills versionadas (leer la que aplique):

- [loyalty-spec](skills/loyalty-spec/SKILL.md): especificaciones y contratos.
- [loyalty-tdd](skills/loyalty-tdd/SKILL.md): pruebas antes de implementar comportamiento autorizado.
- [loyalty-schema](skills/loyalty-schema/SKILL.md): cambios de modelo y migraciones.

Instalación descubrible mediante `npm run skills:install`; ver README. No sobrescribir skills existentes ni ampliar permisos del agente. Mantener instrucciones y herramientas pequeñas y ligadas a necesidades del proyecto.

## Reglas de trabajo

Preservar cambios del usuario y `.env`; no imprimir secretos. Sin credenciales, node_modules ni resultados temporales en Git. SQL y snapshots de migraciones sí se versionan como historial revisable. No ejecutar migrate contra la BD del usuario sin que la tarea autorice aplicarlo al destino identificado; generate es local. No usar push para omitir revisión de migraciones.

Usar Conventional Commits. No commit ni push salvo instrucción. Respetar capas; no implementar decisiones pendientes de negocio por suposición. Mantener aclaraciones nuevas en el documento canónico y referenciarlas desde specs.

## Cierre obligatorio

Actualizar SIEMPRE este AGENTS.md con fecha, cambios reales, comprobaciones/resultados, limitaciones y próximos pasos. Actualizar `../AGENTS.md` si cambia el estado general y README cuando cambien instalación o comandos. Nunca afirmar pruebas funcionales, migraciones o despliegues no ejecutados.

## Estado de la sesión — 2026-10-18

- Entorno instalado con versiones exactas y lockfile propio: Hono/adaptador Node, Drizzle ORM/Kit, pg/dotenv, TypeScript/tsx, Vitest/cobertura V8 y Biome. Sin endpoints, servidor ni casos de uso.
- Contexto canónico, arquitectura por capas, flujo spec-first/spec-anchored y TDD, plantilla y spec ENV-001. BR-006 aclarada por usuario: Admin y Employee eliminan tarjetas solo por decisión y confirmación del cliente; sin otros permisos inferidos para Employee.
- Tres skills versionadas en skills/ e instaladas en ../.agents/skills/. Validación de sus SKILL.md satisfactoria. Las copias deben sincronizarse al actualizar originales.
- Adaptación de 11 tablas y 16 relaciones del JSON. Correcciones DB-001 y DB-002 autorizadas; JSON y .env originales preservados. Migración inicial drizzle/0000_initial.sql generada.
- Evidencia RED/GREEN: primera ejecución falló por esquema ausente; posteriormente una prueba real de claves candidatas falló por FK inválida, confirmada por PostgreSQL temporal. Tras DB-002 pasan las cuatro pruebas de tooling. No es evidencia de pruebas funcionales de negocio.
- Comprobaciones satisfactorias: npm ci --ignore-scripts --no-audit --no-fund; npm ls --depth=0; imports Hono/Node/Drizzle; npm run check (Biome, TypeScript y 4 tests); generate y db:check. Las suites unit/integration/e2e vacías fallan explícitamente como se esperaba. Configuración migrate sin DATABASE_URL falla con mensaje claro.
- npm audit: cero vulnerabilidades tras fijar esbuild 0.25.12 transitivo de @esbuild-kit/core-utils. Persisten advertencias de deprecación de dos dependencias transitivas de Drizzle Kit; revisar override al actualizar.
- Migración probada usando npm run migrate contra PostgreSQL 17 temporal en Docker, con URL local explícita: 11 tablas, 16 FK y 1 migración registrada. Segunda ejecución exitosa sin duplicar historial. Nunca se usó la BD del .env del usuario. Contenedor temporal retirado al finalizar.
- README/AGENTS raíz actualizados. git diff --check, revisión de espacios de archivos nuevos y comparación de skills instaladas satisfactorios. Segunda generación sin cambios de esquema. Sin commit/push. Archivos nuevos permanecen sin añadir a Git para revisión; incluir el JSON original al preparar el commit.

## Limitaciones y próximos pasos

Hay servidor, módulos, build y pruebas funcionales. El resultado actual se registra al final de este archivo y en docs/development-status.md; las secciones anteriores conservan historial. La base Supabase del .env fue migrada posteriormente por autorización explícita; ver sección de aplicación a Supabase.

Las decisiones de identidad, canje y confirmación se resolvieron durante la planificación posterior y están en docs/business-rules.md. El plan BACKEND-001 ordena su desarrollo; derivar la primera spec de módulo antes de implementar con RED/GREEN/refactor cuando se autorice. El esquema por sí solo no impone permisos ni consistencia entre restaurantes. Mantener AGENTS actualizado en cada sesión.

## Aplicación a Supabase — 2026-10-18

- Usuario autorizó aplicar las migraciones al proyecto Supabase indicado por backend/.env.
- Ejecutados npm run check (Biome, TypeScript y 4 tests), npm run generate (sin cambios) y npm run db:check, todos satisfactorios.
- Verificación previa de conexión al destino Supabase rechazada con SQLSTATE 28P01 (autenticación fallida). No se ejecutó migrate ni se modificó la base remota.
- Pendiente: actualizar DATABASE_URL local con credenciales vigentes, verificar inventario, ejecutar migrate y comprobar tablas/constraints/historial. No registrar credenciales en documentación ni chat.

- Reintento tras aviso del usuario: volvió a fallar con 28P01. Inspección local sin exponer secretos detectó el marcador literal [YOUR-PASSWORD] en DATABASE_URL. Se solicitó reemplazarlo por la contraseña real y guardar el archivo; no se ejecutaron cambios remotos.

### Resultado final en Supabase — 2026-10-18

- El usuario guardó las credenciales reales en .env; la conexión posterior funcionó. Antes de migrar, public no contenía tablas y no existía historial de Drizzle.
- Ejecutado npm run migrate satisfactoriamente contra Supabase. No se usó push, no se modificó el esquema local ni se regeneró la migración aplicada.
- Verificación remota: 11 tablas, 16 claves foráneas, 11 claves primarias, 4 restricciones únicas y 13 CHECK. Un registro en drizzle.__drizzle_migrations, con hash coincidente con drizzle/0000_initial.sql.
- Check, generate (sin cambios) y db:check satisfactorios; 4 tests de tooling pasan. Sin pruebas funcionales ni código de aplicación añadido.
- Bloqueo de autenticación resuelto. Las credenciales fueron actualizadas por el usuario; no se registraron secretos. README y AGENTS actualizados. Sin commit/push.
- Próximo paso: primera spec funcional y decisiones de identidad, permisos/aislamiento y confirmación de eliminación; la migración no implementa esas reglas.

### Reejecución solicitada — 2026-10-18

- Conexión a Supabase comprobada y npm run migrate reejecutado satisfactoriamente por solicitud explícita del usuario; los 4 tests de tooling pasan.
- Inventario antes/después sin cambios: 11 tablas, 16 FK, 11 PK, 4 UNIQUE, 13 CHECK y un solo registro de migración con el mismo hash. No se duplicó la migración ni se modificó código, esquema o credenciales.
- Sin pruebas funcionales nuevas. Próximo paso: resolver decisiones de negocio y preparar la primera spec funcional. Estado general de Supabase permanece completado.

### Instalación de find-skills — 2026-10-18

- Instalada la skill solicitada desde vercel-labs/skills con npx skills add, limitada al repositorio y Codex mediante --agent codex --yes. Ubicación: ../.agents/skills/find-skills/SKILL.md.
- Registro reproducible del origen/hash en ../skills-lock.json. Skills loyalty existentes preservadas; sin dependencias de producto ni configuración global añadidas.
- Verificaciones satisfactorias: instalación exitosa, SKILL.md leído y validado mediante quick_validate.py; listado del CLI para Codex. README actualizado con comandos de instalación, listado y búsqueda.
- Uso: leer find-skills al buscar nuevas capacidades; revisar su pertinencia y contenido antes de instalar resultados. No reemplaza reglas de negocio ni las skills loyalty.
- Sin cambios de aplicación o Supabase; no se ejecutaron tests funcionales por tratarse de instalación/documentación. Próximo paso: usar búsquedas específicas cuando una tarea del backend requiera otra skill.

### Preparación de commit y publicación — 2026-10-18

- Usuario autorizó incluir toda la configuración y subirla a https://github.com/jMarlonDev/loyalty-program.git en main.
- Revisados 42 archivos candidatos: sin coincidencias con la URL o contraseña del .env; .env, node_modules y .agents excluidos. Se incluyen las skills propias versionadas y skills-lock.json para find-skills.
- npm run check (Biome, TypeScript y 4 pruebas de tooling), npm run db:check y git diff --check satisfactorios. Fetch de origin satisfactorio, sin ramas remotas detectadas antes de publicar.
- Commit preparado: chore(backend): configure development environment and agent workflows. Consultar git log y origin/main para identificar el commit y comprobar su publicación; este registro no anticipa el resultado del push.
- Sin nuevas funcionalidades ni cambios en Supabase. Próximo paso: primera spec funcional y decisiones pendientes de negocio.

### Resultado de publicación — 2026-10-18

- Commit local de configuración creado (identificador vigente en git log -1). Push HTTPS falló por ausencia de credenciales; autenticación SSH existente rechazada con Permission denied (publickey).
- No se publicó el commit ni se modificó el remoto. Pendiente autenticar GitHub en el equipo y repetir git push -u origin main. Solicitud enviada al usuario; no se pidieron secretos por chat.
- Comprobaciones de configuración ya satisfactorias; sin cambios adicionales de aplicación o base de datos.

### Revisión de comandos iniciales de Git — 2026-10-18

- Confirmados main, origin correcto y commit 3c1b95b existente. No se reinicializó Git ni se creó un commit first commit redundante.
- Reintentado git push -u origin main; volvió a fallar porque no hay credenciales HTTPS disponibles en esta sesión. No hubo publicación remota.
- Sin cambios de configuración o aplicación. Este registro queda como cambio documental local; próximo paso: autenticar GitHub en la terminal y publicar el commit existente.

### Plan de negocio y preparación de publicación — 2026-10-18

- Usuario autorizó guardar el plan completo, acceder al directorio padre, crear commit y publicar en origin/main. Fetch satisfactorio: al iniciar, main y origin/main coincidían en b1d0000; la publicación anterior del usuario está reflejada en el remoto.
- Guardado docs/specs/BACKEND-001-plan-de-negocio.md: fases, contratos previstos, Google OAuth y registro manual desde QR, 16 criterios de aceptación y matriz de futuras pruebas. Estado documental, sin implementación ni evidencia RED/GREEN funcional.
- Actualizadas reglas canónicas (BR-004 y BR-008 a BR-021), índice y README; los valores de diseño del plan se distinguen de las respuestas explícitas del usuario. Cambios previos de AGENTS preservados.
- Comprobaciones satisfactorias: npm run check (Biome, TypeScript y 4 tests de tooling); enlaces locales, espacios, 21 BR y 16 AC; git diff --check. No se ejecutaron pruebas funcionales porque no existe implementación nueva.
- Sin cambios de aplicación, dependencias, esquema, migraciones, credenciales o Supabase. Google aún no está configurado. Próximo paso: derivar la primera spec de módulo y desarrollar con TDD cuando se autorice.
- Commit documental preparado para publicación; este registro no anticipa su resultado. Consultar git log y origin/main para el identificador publicado; el informe de cierre confirmará el resultado real del push.

### Resultado del intento de publicación del plan — 2026-10-18

- Commit documental creado. Push HTTPS rechazado por ausencia de credenciales en esta sesión: could not read Username for https://github.com. gh no está instalado y Git no tiene credential.helper configurado; no se imprimieron secretos.
- Comprobación SSH no interactiva también rechazada con Permission denied (publickey). No se cambió el remoto ni la configuración de autenticación. El rechazo fue de GitHub/autenticación, no de la revisión automática de permisos.
- Se incorpora este resultado al mismo commit local antes de publicarlo; consultar git log -1 para el identificador final. Pendiente git push -u origin main desde la terminal donde el usuario ya pudo autenticarse. Plan y documentación quedan guardados; origin/main aún no contiene este commit.


### Desarrollo delegado y resumen solicitado — 2026-10-18

- Usuario autorizó todas las fases de BACKEND-001, subagentes, TDD, documentación y commits; posteriormente solicitó resumen completo y commits propuestos. Tres subagentes implementaron base/STAFF, identidad/programas y harness/esquema/fidelización; el agente principal compuso HTTP, E2E, transacciones, configuración, límites y RLS.
- Código local: servidor Hono, Supabase Auth verificado, perfiles, restaurantes/sucursales/personal/invitaciones, programas/inscripción/tarjetas/QR cifrado, compras/sellos/premios/reversión, consentimiento y cierre lógico. OpenAPI describe 39 operaciones. Frontend reservado.
- Esquema ampliado a 16 tablas, migraciones nuevas 0001 y 0002, RLS sin políticas cliente y revocación de acceso directo. Se conserva 0000. PostgreSQL 17 temporal exclusivo para tests, sin aplicar cambios a Supabase ni tocar .env.
- Verificación global final: npm test con TEST_DATABASE_URL aislada: 210 pruebas, 208 pasan y 2 fallan (auditoría de programas y rechazo de contabilidad histórica incompatible). Cinco E2E pasan, incluido ciclo completo por HTTP real. Dobles de identidad no demuestran Google/correo reales.
- npm run check falla en Biome (siete diagnósticos de formato/imports); typecheck falla por cinco argumentos extra en la prueba de auditoría cuyo repositorio está incompleto. db:check y git diff --check satisfactorios. No se ejecutó cobertura. Specs conservan RED/GREEN por módulo; el resultado agregado actual prevalece sobre cifras previas.
- Revisión de subagentes interrumpida por límite de uso. Auditoría de programas, protección de datos históricos, CI, ejemplos API y validación externa Google/correo pendientes. No presentar el plan completo ni producción como terminados.
- HEAD observado 3c3793f (chore: file deleted), commit externo que elimina el JSON original; se preservó. Tooling usa snapshot0000 si no existe JSON. No se creó commit ni push de este desarrollo. Agrupación propuesta y límites en docs/development-status.md.
- README e índice actualizados con comandos/configuración reales y estado pendiente. Próximo paso: completar los dos ciclos RED pendientes, formato/tipos, comprobación global/build y preparar commits revisables por módulo; aplicar migraciones remotas solo con autorización específica.

- Comprobación adicional al preparar el resumen: `npm run build` satisfactorio (excluye tests); no contradice el fallo de typecheck en pruebas. Contenedor temporal `loyalty-test-harness-20261018` detenido al terminar las comprobaciones. AGENTS/README del directorio padre actualizados; git diff --check satisfactorio.


### Corrección final y publicación autorizada — 2026-10-18

- Usuario autorizó todos los commits y push al repositorio, sin confirmaciones adicionales. Fetch satisfactorio; main y origin/main partían de 3c3793f. Se conservó la eliminación externa del JSON.
- Completados auditoría de programas con request_id HTTP, rechazo de estados array y migración nueva 0003 para contabilidad histórica incompatible. No se reescribió 0000/0001/0002. Pruebas RED anteriores ahora GREEN; se resolvieron tipos y formato.
- `npm run test:db` pasó de principio a fin: 210 pruebas en 25 archivos (6 tooling,149 unit,50 integration,5 e2e), PostgreSQL 17 real temporal y contenedor retirado. Check, build, db:check, generate sin cambios y diff --check satisfactorios.
- Incidencia de disco lleno resuelta retirando solo caché descargable npm _cacache, aproximadamente 3,7GB; código, credenciales y node_modules preservados. Biome excluye artefactos dist/coverage. Script temporal tolera contenedor ya eliminado por Docker.
- Revisión de 114 candidatos sin coincidencias con secretos locales; .env, dist y node_modules excluidos de Git. Sin migraciones remotas, cambios de frontend ni credenciales. CI, ejemplos completos y Google/correo real siguen pendientes; no se presenta producción como terminada.
- Serie de commits Conventional Commits preparada por módulos; identificadores y resultado de publicación se verifican mediante Git al cierre. Specs, workflow, arquitectura, plan, índice y README actualizados con evidencia vigente.


### Resultado de commits y publicación — 2026-10-18

- Creados commits funcionales 7849d8c (DB),149b912 (harness),9abf88c (core),f0cfcd7 (identidad),e434d66 (personal),d3c16bc (programas),7df518a (fidelización),dc32092 (API). Commit documental de cierre: consultar git log -1 para su hash final.
- Push a origin/main rechazado: HTTPS no tiene credenciales disponibles (`could not read Username`); alternativa SSH rechazada (`Permission denied (publickey)`). gh no está instalado. No se cambió remoto ni se registraron secretos. Es un bloqueo de autenticación GitHub, no de permisos del directorio ni de revisión automática.
- Pendiente publicar la serie desde una sesión autenticada: git push origin main. Código verificado con 210/210 pruebas, build y checks; sin aplicación de migraciones remotas. La documentación y todos los cambios se incluyen en los commits locales autorizados.


### Auditoría y refuerzo de pruebas — 2026-10-18

- Solicitud vigente: analizar el backend contra especificaciones, mejorar pruebas, crear datos relacionados en BD y retirarlos tras verificar. Revisión delegada conforme al alcance existente; frontend reservado y Supabase intacto.
- Añadidas 190 pruebas, fixtures independientes y aserciones de persistencia/rollback. Grafo SQL en 16 tablas, 31 FK, 16 CHECK, índices parciales, RLS y limpieza comprobada en pg_database. Casos de permisos, concurrencia, identidad, personal, programas, fidelización y HTTP.
- RED/GREEN: UUID mayúsculos provocaban 404; normalizados. Dos tests demostraron pérdida del error original al fallar rollback; ahora conserva error y descarta conexión. E2E identidad aislado daba 404 por dependencia de otro test; corregidas precondiciones. Carrera de initdb observada; runner espera pg_isready por TCP.
- Validación final: 400/400 pruebas en 28 archivos (6 tooling, 217 unit, 159 integration, 18 e2e), orden aleatorio seed 20261018 con PostgreSQL 17 temporal. Cobertura: líneas 94,36 %, sentencias 92,78 %, ramas 90,47 %, funciones 95,54 %. Umbral global 90 % configurado sin excluir src. Check/build/db:check/generate sin cambios/diff --check satisfactorios.
- Datos de prueba creados y eliminados; inventario final sin contenedores loyalty-test-*. Sin cambios de esquema/migraciones, .env, frontend ni Supabase. Sin commit/push en esta revisión. README, specs, estado y docs/testing-quality.md actualizados; artefactos de cobertura ignorados por Git.
- Límites: Google/correo reales, CI, carga y despliegue pendientes; main.ts conserva cobertura operativa limitada, documentada. Próximos pasos: configurar validación externa y CI, y planificar migraciones remotas solo con autorización específica.


### Validación de Supabase, Auth y despliegue — 2026-10-18

- Usuario solicitó validar los pendientes externos. Preservados cambios previos; conexión Supabase con transacción READ ONLY y ROLLBACK, sin DDL/DML. Inventario: 11 tablas, 16 FK, 11 PK, 4 UNIQUE, 13 CHECK, 0 filas en tablas de negocio, 1 migración cuyo hash coincide con 0000. RLS activo en 11 tablas; auth.users sin registros. 0001/0002/0003 siguen pendientes.
- Prueba HTTP real de autorización Google: 400 validation_failed, proveedor no habilitado. Health/settings de Auth sin clave pública: 401. No prueba fallo de servicio ni correo. No se crearon usuarios ni enviaron mensajes.
- Configuración local efectiva: solo DATABASE_URL de los valores requeridos está disponible; faltan SUPABASE_URL, clave pública (incluida alternativa ANON) y CARD_TOKEN_ENCRYPTION_KEY. npm run build satisfactorio; npm start sale 1. loadConfig identifica SUPABASE_URL ausente.
- URL del backend desplegado y disponibilidad de cuenta/bandeja de prueba solicitadas al usuario; no se proporcionaron durante las comprobaciones. Google/correo end-to-end y despliegue remoto no validados. Sin cambios de .env, esquema, migraciones, frontend ni remoto; sin commit/push. No se repitieron las 400 pruebas porque esta sesión no modificó código.
- docs/external-validation.md, índice y estado actualizados. Siguiente paso: aportar configuración/URL y cuenta de prueba, habilitar Google y preparar correo; migrar Supabase requiere autorización específica antes de pruebas funcionales remotas. No se afirma que todo el estado remoto sea históricamente idéntico sin una instantánea completa previa.


### Migración del transporte a TanStack Start y lecturas UI — 2026-10-18

- La solicitud vigente autoriza frontend y stack fullstack, manteniendo negocio. Spec previa `docs/specs/STACK-001-tanstack-start.md` y subagentes coordinados; backend queda librería de servidor dentro del workspace raíz.
- Retirados imports Hono y adaptador Node de src/tests. HTTP usa Request/Response nativos con catálogo pequeño de rutas, errores seguros, correlación, CORS, no-store, headers de seguridad, límite de 16 KiB medido realmente y rate limiting por conexión confiable. Sin proxy headers confiados implícitamente; fallback compartido si el runtime no aporta dirección. Los E2E usan sockets node:http reales en helper exclusivo de pruebas.
- Preservadas 39 operaciones y reglas/transacciones existentes; añadidas dos lecturas Owner/Admin para resultados reales y clientes paginados (41 operaciones documentadas). Métricas sin importes financieros: usuarios históricos distintos, tarjetas activas, compras no revertidas, premios disponibles/entregados. Saldo viene del libro. Employee y otros tenants conservan rechazos.
- Lecturas de tarjetas incluyen diseño/meta/premio/código del programa vigente; listado restaurantes devuelve actor_role servidor. Resolución QR permite al personal autorizado identificar cliente y seleccionar premios disponibles, sin exponer hashes, cifrado ni datos extra de perfil.
- RED/GREEN observado para IPs independientes, Content-Length falso, campos de tarjeta/rol, rutas resultados/clientes y datos de mostrador. `npm run check --workspace backend` correcto (Biome/tipos/6 tooling/222 unit). Suite completa PostgreSQL 17 temporal con seed20261018: 409/409 en 29 archivos (6 tooling,222 unit,163 integración,18 E2E). Cobertura líneas97,34 %, sentencias95,90 %, ramas90,90 %, funciones99,04 %; umbral90 satisfecho.
- Fixtures nuevas corregidas para usar estado disabled válido y cliente independiente de paginación previa. Sin esquema/migraciones, .env, Supabase, commit ni push modificados en esta tarea. Datos/BD de prueba temporales limpiados por runner; integración UI/build/despliegue de Start son responsabilidad del cierre raíz. No se afirma validación de Google/correo reales ni despliegue remoto.

- Ampliación posterior AC-009: la lista administrativa de personal añade nombre y correo del perfil para identificar personas en la UI. RED observado por campos ausentes; GREEN posterior 14/14 pruebas de integración de staff con PostgreSQL temporal, incluyendo Owner/Admin permitido y Employee/ajeno rechazados. Check posterior también correcto (6 tooling+222 unit). La medición completa de 409 y cobertura indicada arriba precede a esta prueba adicional; el total actual de casos es 410 y su ejecución global se registra en el cierre raíz. OpenAPI distingue EmployeeDirectory de respuestas de mutación sin campos nuevos.
- Revisión de contratos UI comunicada al agente frontend: accepted:true requerido para consentimiento, referencia de venta limitada a100, navegación Employee sin programas administrativos, programa finalizado sin reactivación y reinicio de selecciones al cambiar QR. Agente frontend confirmó correcciones y prueba RED/GREEN del consentimiento; no se presentan aquí como pruebas ejecutadas por el agente backend.

### Cierre de migración fullstack — 2026-10-18

- TanStack Start/React/Router/Query con shadcn/Radix/Tailwind; aplicación y API en un proceso Nitro/Node. Personalización móvil, QR público/privado, administración, cliente, compras, premios, reversión y consentimiento. Dominio, esquema y migraciones preservados; 41 contratos HTTP (39 previos y dos lecturas administrativas).
- Retirados Hono/adaptador, servidor y helper de cierre antiguos, build backend, lockfile duplicado y frontend vacío. Workspace/lockfile raíz; generación de rutas antes de tipos, scripts de entorno y pruebas, CI y Dockerfile. No se descartaron cambios previos.
- Verificación final: 409/409 backend en PostgreSQL 17 temporal y orden aleatorio (6 tooling, 221 unit, 164 integración, 18 E2E); cobertura líneas 97,33 %, sentencias 95,96 %, ramas 90,90 %, funciones 99,03 %. UI/sesión/composición 64/64 (20 UI + 44 servidor). Navegador producción 10/10 (5 escritorio + 5 móvil), con Axe en superficies recorridas y fixtures externos de Auth; DBs/contenedores temporales retirados. Check, tipos, build, db:check, generate sin cambios y diff --check correctos. No atribuir cobertura backend al frontend.
- RED/GREEN y revisión cruzada corrigieron transporte Request Nitro, headers/IP/cuerpo/consultas, logout con acceso caducado, consentimiento y permisos UI. El harness reinicia servidor/BD por viewport para evitar mezclar tráfico de dos suites bajo el límite real 120/min; no se desactiva el control de producción.
- Impeccable PRODUCT/DESIGN y hook.enabled configurados. El launcher no encontró proveedor local para instalar disparador automático; detector manual ejecutado (dos avisos estéticos Fraunces acorde referencias). No se afirma hook automático operativo.
- Entorno real pendiente: APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CARD_TOKEN_ENCRYPTION_KEY ausentes; env:check lo reporta sin secretos. Supabase remoto no modificado; inventario anterior solo 0000, migraciones 0001–0003 requieren paso de release. Google/SMTP reales, hosting/TLS/carga/backups pendientes. Sin Wallet, subida de imágenes ni escáner de cámara integrado. Dockerfile preparado, imagen no construida en esta sesión.
- Informe completo y comandos en ../docs/project-review-2026-10-18.md y ../docs/deployment.md. Sin commit/push. Próximos pasos: completar entorno, validar proveedor real, migrar el destino elegido y desplegar/comprobar ready.

- Instalación limpia final desde la raíz: `npm ci --ignore-scripts --no-audit --no-fund` correcta (343 paquetes). Se regenera `src/routeTree.gen.ts` antes de tipos y se excluye de Git; ampliación de tipos Start explícita para checks antes del primer build. Docker final sin contenedores de pruebas.
- Tras la instalación limpia, `npm run check` volvió a pasar completo (lint, tipos, 64 UI/servidor, 6 tooling y 221 unit), `npm ls --depth=0` y auditoría sin vulnerabilidades correctos; `git diff --check` limpio.

### Acceso, configuración y continuidad de tarjetas — 2026-10-18

- Sin cambios del dominio/esquema/migraciones; se corrigió la capa fullstack de acceso. AUTH-002 documenta mensajes seguros del proveedor y retornos de callback/Google; ACCESS-001 documenta destino de cliente/gestión, errores visibles y continuidad de sesión. Evidencia RED/GREEN registrada en ambas specs.
- Comprobación local detecta cuatro variables ausentes: APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CARD_TOKEN_ENCRYPTION_KEY. Guía operativa en ../docs/supabase-setup.md; conserva Supabase Auth y diferencia registro de inscripción. No se volvió a consultar/modificar Supabase ni `.env`.
- `npm run check` y build correctos: 86 UI/servidor, 6 tooling y 221 unit; navegador producción 10/10 con PostgreSQL17 temporal y proveedor aislado, incluidos creación de cuenta, confirmación/recuperación, Google, inscripción, consulta QR, compras y premios. Contenedores temporales retirados. No se repitieron integración backend completa/cobertura ni se verificó proveedor real. Diff/enlaces documentales correctos.
- Refactor visual neutral sin café en frontend; reglas/permisos permanecen. Sin commit/push. Próximo paso: operador completa variables, habilita Google/SMTP y revisa/aplica migraciones pendientes al destino correcto antes de validar cuentas reales.

### Acceso móvil, escaneo y sesión persistente — 2026-10-18

- Usuario requiere acceso desde cualquier lugar con HTTPS, pero confirma que todavía no tiene URL pública ni despliegue. Se preparó el código y la guía de publicación; no se afirma disponibilidad remota. Cambios previos preservados, sin commit/push, cambios de `.env`, credenciales, esquema ni Supabase.
- Origen canónico por GET /api/public-config sin secretos ni dependencia DB; programas, invitaciones y tarjetas usan APP_ORIGIN, con aviso para localhost. `env:check -- --public` rechaza correctamente el origen local actual. Plantilla raíz `.env.example` añadida con todas las variables, sin conexión local ficticia activa que sustituya el fallback válido.
- Tarjeta con permalink /cards?card=uuid y entrada /scan desde QR privado en fragmento. Personal autorizado recibe formulario sin agregar sellos automáticamente; cámara ZXing 0.2.1 bajo demanda y alternativa manual. QR pendiente por pestaña TTL10min, eliminado tras resolver/logout; reinicia formulario al abrir otro QR en la misma pestaña. Autorización/compra idempotente del backend conservadas.
- Refresh HttpOnly renovable de 400 días, renovación al recuperar foco/conexión y cada cuatro minutos visible; serializa refresh/logout y sincroniza cierre entre pestañas. Fallos temporales conservan identidad; sesión revocada sí requiere acceso. Primer perfil se crea antes de habilitar consultas de tarjetas, evitando la carrera observada en navegador. /auth con usuario muestra continuar; recuperaciones siguen disponibles.
- Specs MOBILE-001, MOBILE-QR-001 y SESSION-003 con evidencia RED/GREEN. Check pasó con 131 UI/servidor y 227 backend (6 tooling + 221 unit); regresión final de segundo QR 6/6 aislada y suite UI/servidor final completa 132/132 correctas. Tipos/build finales y navegador registrados en development-status.md. Cámara con permisos/recursos simulados; pendiente validación física y Google/SMTP reales. No se repitió cobertura ni toda la suite backend de integración.
- README, guía de despliegue/Supabase, PRODUCT/DESIGN y estado actualizados. Impeccable consultado manualmente; launcher indisponible por caché, sin afirmar detector automático. Próximo paso: elegir hosting Node/Docker HTTPS, cargar variables, configurar callback, revisar/aplicar migraciones pendientes al destino y validar desde datos móviles. No se ejecutaron esos pasos remotos.

- Aceptación final: 132/132 UI/servidor y 10/10 navegador producción (5 escritorio + 5 móvil), tipos/build correctos; Axe y capturas revisadas. Registro, recuperación, continuidad QR tras login, compra/canje y reintento de sesión correctos con proveedor simulado. `git diff --check` y enlaces documentales correctos.

Limpieza final verificada: Docker sin contenedores loyalty-test activos. Sin cambios remotos ni publicación.

### Revisión y publicación Git autorizadas — 2026-10-18

- Usuario autorizó crear todos los commits y subirlos al repositorio. Revisados 167 archivos pendientes por contenido/diff; inventario individual y agrupación en docs/commit-review-2026-10-18.md (archivo adicional). Fetch de origin satisfactorio y main coincidía con origin/main antes de preparar commits.
- Sin código funcional nuevo: se aclaran referencias históricas de pruebas, instalación desde raíz y estado de integración. Validación funcional procede de la tarea inmediatamente anterior: 132 UI/servidor, 227 backend unidad/tooling y 10 navegador producción; no se repitió innecesariamente. Diff sin errores y revisión de secretos sin coincidencias.
- Cuatro commits previstos: rollback/pool; aplicación fullstack con pruebas/specs; CI/despliegue; documentación/inventario. Secretos, dependencias y artefactos excluidos. Push pendiente de ejecutar; su resultado se añadirá tras comprobar el remoto, sin anticiparlo. No se modifica Supabase ni se despliega hosting.
