# Guía de agentes — backend

## Alcance autorizado

Leer este archivo y `../AGENTS.md` al iniciar cada sesión. La petición del 2026-10-18 autoriza configurar backend, instalar dependencias y preparar esquema/migraciones y herramientas. No autoriza implementar servidor, endpoints ni reglas de aplicación todavía. Frontend fuera de alcance.

## Contexto mínimo y fuente de verdad

- `docs/index.md`: mapa de contexto; cargar solo referencias pertinentes.
- `docs/business-rules.md`: reglas BR confirmadas y decisiones pendientes. No mantener copias divergentes.
- `docs/architecture.md`: monolito por capas y stack.
- `docs/workflow.md`: spec-first/spec-anchored y TDD obligatorios antes de comportamiento nuevo.
- `docs/specs/`: specs persistentes y plantilla; vincular BR → AC → pruebas.
- `SistemaDeFidelizacion.json`: modelo estructural original. `db/schema.ts`: adaptación; excepciones autorizadas en `docs/decisions/DB-001.md` y `docs/decisions/DB-002.md`.

## Herramientas y skills

Node 24.18.1 y npm 12.1.0. Ejecutar desde backend. `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check`, `npm run generate`, `npm run db:check`. Vitest distingue tooling/unit/integration/e2e; no ocultar suites vacías ni equiparar tooling con tests funcionales.

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

No hay funcionalidades, autenticación, servidor, build de aplicación ni pruebas funcionales unitarias/integración/E2E. La validación de migración es una comprobación de infraestructura, no un flujo E2E del producto. La base Supabase del .env fue migrada posteriormente por autorización explícita; ver sección de aplicación a Supabase.

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
