# Guía del proyecto

## Contexto y alcance

`loyalty-program` es un sistema de fidelización para restaurantes. Los restaurantes podrán definir programas por compras; los clientes acumularán sellos en una tarjeta digital y obtendrán un premio al completar la meta.

La solicitud vigente del 2026-10-18 autoriza reconstruir el sistema completo con TanStack Start, React y shadcn, frontend móvil y personalización de tarjetas, subagentes, TDD, depuración y preparación de despliegue. Sustituye la reserva anterior del frontend. Conservar todas las reglas de negocio documentadas. Coordinación en docs/migration-harness.md; estado en backend/docs/development-status.md. No confundir autorización general con disponibilidad de credenciales o de un destino remoto.

## Entorno y estructura

- Base local: Node.js 24.18.1 y npm 12.1.0; versiones declaradas en `.nvmrc` y `package.json`.
- `src/`: aplicación fullstack TanStack Start (rutas, UI y sesión servidor). `backend/`: núcleo de negocio, persistencia, contratos y migraciones integrado en el mismo proceso; leer `backend/AGENTS.md` y `backend/docs/index.md`. Un workspace npm y lockfile raíz.
- `README.md`: preparación del entorno, verificaciones y decisiones pendientes.
- TanStack Start integra servidor, UI y API. Última suite backend completa: 409 pruebas y cobertura de líneas 97,33 % (migración). Última aceptación móvil: 132 UI/sesión, 227 backend de unidad/tooling y 10 navegador correctas; no se volvió a medir cobertura. Solo la migración inicial está aplicada a Supabase; 0001/0002/0003 se probaron localmente.
- No versionar credenciales, archivos `.env`, dependencias ni artefactos generados.

## Flujo de trabajo

- Leer este archivo al iniciar cada sesión.
- Respetar los cambios existentes del usuario y limitarse al alcance solicitado.
- Usar Conventional Commits: `<tipo>[ámbito opcional]: <descripción>`.
- Referencia: https://www.conventionalcommits.org/en/v1.0.0/.
- Rama inicial: `main`. Remoto previsto: `https://github.com/jMarlonDev/loyalty-program.git`.
- Validar los cambios con comprobaciones proporcionales; no presentar verificaciones del entorno como pruebas funcionales.

## Cierre obligatorio de cada sesión

Antes de terminar cada sesión, actualizar este `AGENTS.md` con la fecha, cambios realizados, comprobaciones y resultados, limitaciones y próximos pasos. Actualizar también `README.md` si cambian los requisitos o comandos de preparación. No registrar secretos ni afirmar acciones que no se hayan completado.

## Estado de la última sesión — 2026-10-18

- Backend preparado con dependencias exactas y lockfile propio, TypeScript, Biome y Vitest por niveles. Sin cambios en frontend ni código de aplicación.
- Contexto canónico en backend/docs, flujo spec-first/spec-anchored/TDD y tres skills de proyecto; reglas de eliminación confirmadas por el usuario.
- Esquema Drizzle adaptado del JSON original (11 tablas/16 relaciones); correcciones DB-001 y DB-002 autorizadas. Comandos generate/migrate y migración SQL local. .env preservado.
- Verificaciones: análisis estático, tipos, 4 tests de tooling, generación SQL y comprobación de historial satisfactorios. Migración aplicada dos veces en PostgreSQL 17 temporal: 11 tablas, 16 FK y un único registro de migración; contenedor retirado. Instalación limpia y auditoría sin vulnerabilidades. Detalle final y limitaciones en backend/AGENTS.md.
- No se aplicaron migraciones a la BD del usuario, ni se implementaron pruebas funcionales, ni se hizo commit/push.
- Próximo paso: resolver decisiones pendientes de negocio y escribir la primera spec funcional antes de implementar con TDD.

### Solicitud de aplicación en Supabase — 2026-10-18

Aplicación autorizada por el usuario. Check, generate (sin cambios) y db:check satisfactorios. Conexión previa rechazada por autenticación (28P01); sin migración remota ejecutada. Pendiente corregir DATABASE_URL local y reintentar. Detalles en backend/AGENTS.md; sin secretos registrados.

### Aplicación en Supabase completada — 2026-10-18

El usuario corrigió DATABASE_URL local y se resolvió la autenticación. Inventario previo vacío. npm run migrate finalizó correctamente: 11 tablas, 16 FK, 11 PK, 4 restricciones únicas y 13 CHECK; un registro de migración cuyo hash coincide con el SQL local. Check, generate y db:check satisfactorios. Sin lógica de aplicación ni pruebas funcionales; sin commit/push. Detalles y próximos pasos en backend/AGENTS.md.

### Skill de descubrimiento instalada — 2026-10-18

Instalada find-skills de vercel-labs/skills para Codex en .agents/skills/find-skills; origen/hash en skills-lock.json. Validación SKILL.md y listado satisfactorios. Las skills loyalty se conservan, sin cambios de aplicación, dependencias de producto o Supabase. Comandos y alcance documentados en backend/README.md. Próximo paso: descubrir skills específicas según las necesidades de desarrollo.

### Commit de configuración autorizado — 2026-10-18

Usuario solicitó commit y push a origin (https://github.com/jMarlonDev/loyalty-program.git), rama main. Backend verificado con análisis estático, tipos, cuatro pruebas de tooling e historial Drizzle. Archivos candidatos revisados sin credenciales del .env; secretos y dependencias excluidos. Commit preparado con Conventional Commits; consultar git log y origin/main para el resultado de publicación. Detalle en backend/AGENTS.md. Próximo paso: primera spec funcional, sin ampliar el alcance de implementación.

### Publicación pendiente por autenticación — 2026-10-18

Commit local creado; consultar git log -1. Push HTTPS rechazado por falta de credenciales y SSH por clave pública no aceptada. No se publicó en origin. Pendiente autenticación de GitHub en el equipo y reintentar git push -u origin main; configuración verificada y sin secretos versionados.


### Plan de negocio documentado — 2026-10-18

- Usuario autorizó guardar el plan, actualizar documentación, crear commit y publicar en main, incluido acceso al directorio padre.
- Plan completo en backend/docs/specs/BACKEND-001-plan-de-negocio.md: registro por QR con correo/contraseña o Google OAuth mediante Supabase Auth, fases de negocio, contratos previstos y aceptación. Reglas canónicas e índice actualizados; no hay implementación funcional.
- Fetch de origin satisfactorio: main y origin/main coincidían en b1d0000 antes de este commit. La publicación anterior fue completada por el usuario; las incidencias previas de autenticación se conservan como historial.
- Verificaciones: npm run check satisfactorio (Biome, TypeScript y 4 tests de tooling), enlaces documentales, 21 BR y 16 AC, y git diff --check. Sin pruebas funcionales, cambios de esquema, configuración Google o modificaciones de Supabase.
- Próximo paso: primera spec de módulo y TDD cuando se autorice implementar. La publicación del nuevo commit se verificará mediante Git y se informará al cierre; no se anticipa aquí su resultado.

### Publicación del plan pendiente de autenticación — 2026-10-18

- Plan y documentación guardados en un commit local; consultar git log -1 para el identificador final.
- Push HTTPS rechazado por falta de credenciales en esta sesión; comprobación SSH rechazada por clave pública no aceptada. Sin cambios en remoto o autenticación, sin secretos expuestos.
- Pendiente publicar con git push -u origin main desde la terminal autenticada del usuario. Este resultado se incluye en el mismo commit documental; las verificaciones del plan permanecen satisfactorias.


### Desarrollo delegado y resumen — 2026-10-18

Implementados módulos de identidad, restaurantes/personal, programas/tarjetas y fidelización, con servidor, OpenAPI y tests. Verificación global: 208 de 210 pruebas pasan, cinco E2E correctos; quedan auditoría de programas y rechazo de contabilidad histórica incompatible, además de formato/tipos. Sin nuevos commits ni push; propuestas en backend/docs/development-status.md. Sin cambios remotos en Supabase/frontend/credenciales. La revisión de subagentes se interrumpió por límite de uso; CI, ejemplos y Google real siguen pendientes. Detalles/evidencia y próximos pasos en backend/AGENTS.md.


### Verificación completada y commits autorizados — 2026-10-18

- Cerrados fallos de auditoría y contabilidad histórica, tipos y formato. 210/210 pruebas pasan con PostgreSQL 17 temporal; check/build/db:check/generate sin cambios/diff --check satisfactorios. Caché descargable npm retirada para resolver disco lleno; código y dependencias instaladas preservados.
- Ocho commits funcionales creados (7849d8c a dc32092), más cierre documental identificable en git log. Usuario autorizó commit y push; HTTPS rechazó ausencia de credenciales y SSH rechazó la clave pública. No hubo publicación ni cambios de autenticación; no fue rechazo de permisos del entorno.
- Pendiente git push origin main desde sesión GitHub autenticada. Sin cambios remotos Supabase/frontend/credenciales. CI, ejemplos, Google real y despliegue pendientes; detalle en backend/docs/development-status.md y backend/AGENTS.md.


### Auditoría de calidad y datos de prueba — 2026-10-18

- Añadidas 190 pruebas y reforzadas las existentes: 400/400 correctas (6 tooling, 217 unit, 159 integración, 18 E2E), con PostgreSQL 17 temporal y orden aleatorio. Se insertaron datos SQL en las 16 tablas y se comprobaron 31 FK, 16 CHECK, unicidad, RLS, rollback y eliminación de la base exclusiva. Inventario Docker final sin contenedores de pruebas.
- Corregidos UUID equivalentes rechazados, conexión devuelta al pool tras fallar rollback, fixtures dependientes del orden y espera prematura de initdb. Evidencia RED/GREEN en specs y backend/docs/testing-quality.md.
- Cobertura global: 94,36 % líneas, 92,78 % sentencias, 90,47 % ramas, 95,54 % funciones; umbral mínimo 90 %. Check, build, db:check, generate sin cambios y diff --check satisfactorios.
- Sin cambios de frontend, credenciales, esquema ni Supabase; sin commit/push en esta revisión. Pendientes proveedor real, CI, carga y validación operativa de despliegue; detalles y límites en el informe de calidad.


### Validación externa solicitada — 2026-10-18

- Supabase comprobado mediante consultas READ ONLY: 11 tablas vacías, 16 FK, 13 CHECK y una migración aplicada con hash coincidente con 0000; sin usuarios Auth. Migraciones 0001–0003 pendientes, sin cambios remotos realizados.
- Google Auth responde 400 indicando proveedor no habilitado. Health/settings sin clave pública responden 401; correo real no validado. Faltan SUPABASE_URL, clave pública y CARD_TOKEN_ENCRYPTION_KEY en configuración local.
- Build correcto; npm start falla por configuración. Sin URL del backend desplegado ni cuenta/bandeja de prueba disponibles; solicitadas al usuario. Pendiente completar configuración y flujos externos; migraciones remotas requieren autorización específica.
- Informe en backend/docs/external-validation.md. Sin código, credenciales, frontend, migraciones, usuarios ni correos modificados; sin commit/push. Las 400 pruebas previas no se repitieron en esta comprobación externa.

### Migración fullstack en curso — 2026-10-18

- Lectura del contexto y preservación de cambios previos. Subagentes separados para HTTP, frontend y sesión/pruebas; ensamblaje y despliegue por principal.
- Baseline: 400 pruebas originales correctas en PostgreSQL 17 temporal; 6 tooling y 217 unit correctas en check. Tres pruebas nuevas de transporte se incorporaron durante la suite (401 correctas y 2 RED de 403).
- TanStack Start en raíz, scripts unificados, retiro de Hono y servidor separado, dependencias exactas. Impeccable hooks activados en configuración; no había manifiesto de proveedor local, detector manual previsto.
- Configuración de origen: cinco aserciones RED antes de validar APP_ORIGIN; seis pruebas GREEN después. La preparación aún requiere checks finales y navegador, no se afirma entrega terminada aquí.
- Sin modificaciones remotas, secretos ni publicación. Próximo paso: integrar las superficies y ejecutar aceptación completa y artefacto de producción.

### Cierre de migración fullstack — 2026-10-18

- TanStack Start/React/Router/Query con shadcn/Radix/Tailwind; aplicación y API en un proceso Nitro/Node. Personalización móvil, QR público/privado, administración, cliente, compras, premios, reversión y consentimiento. Dominio, esquema y migraciones preservados; 41 contratos HTTP (39 previos y dos lecturas administrativas).
- Retirados Hono/adaptador, servidor y helper de cierre antiguos, build backend, lockfile duplicado y frontend vacío. Workspace/lockfile raíz; generación de rutas antes de tipos, scripts de entorno y pruebas, CI y Dockerfile. No se descartaron cambios previos.
- Verificación final: 409/409 backend en PostgreSQL 17 temporal y orden aleatorio (6 tooling, 221 unit, 164 integración, 18 E2E); cobertura líneas 97,33 %, sentencias 95,96 %, ramas 90,90 %, funciones 99,03 %. UI/sesión/composición 64/64 (20 UI + 44 servidor). Navegador producción 10/10 (5 escritorio + 5 móvil), con Axe en superficies recorridas y fixtures externos de Auth; DBs/contenedores temporales retirados. Check, tipos, build, db:check, generate sin cambios y diff --check correctos. No atribuir cobertura backend al frontend.
- RED/GREEN y revisión cruzada corrigieron transporte Request Nitro, headers/IP/cuerpo/consultas, logout con acceso caducado, consentimiento y permisos UI. El harness reinicia servidor/BD por viewport para evitar mezclar tráfico de dos suites bajo el límite real 120/min; no se desactiva el control de producción.
- Impeccable PRODUCT/DESIGN y hook.enabled configurados. El launcher no encontró proveedor local para instalar disparador automático; detector manual ejecutado (dos avisos estéticos Fraunces acorde referencias). No se afirma hook automático operativo.
- Entorno real pendiente: APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CARD_TOKEN_ENCRYPTION_KEY ausentes; env:check lo reporta sin secretos. Supabase remoto no modificado; inventario anterior solo 0000, migraciones 0001–0003 requieren paso de release. Google/SMTP reales, hosting/TLS/carga/backups pendientes. Sin Wallet, subida de imágenes ni escáner de cámara integrado. Dockerfile preparado, imagen no construida en esta sesión.
- Informe completo y comandos en docs/project-review-2026-10-18.md y docs/deployment.md. Sin commit/push. Próximos pasos: completar entorno, validar proveedor real, migrar el destino elegido y desplegar/comprobar ready.

- Instalación limpia final desde la raíz: `npm ci --ignore-scripts --no-audit --no-fund` correcta (343 paquetes). Se regenera `src/routeTree.gen.ts` antes de tipos y se excluye de Git; ampliación de tipos Start explícita para checks antes del primer build. Docker final sin contenedores de pruebas.
- Tras la instalación limpia, `npm run check` volvió a pasar completo (lint, tipos, 64 UI/servidor, 6 tooling y 221 unit), `npm ls --depth=0` y auditoría sin vulnerabilidades correctos; `git diff --check` limpio.

### Corrección de acceso y diseño general — 2026-10-18

- Solicitud: corregir creación de cuentas/consulta de tarjetas, explicar configuración Supabase/Google y eliminar temática de café. Cambios previos preservados; dos subagentes para UI y servidor. Sin commit/push ni cambios de `.env`, credenciales, esquema o Supabase remoto.
- Diagnóstico actual `npm run env:check`: faltan APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y CARD_TOKEN_ENCRYPTION_KEY; sin ellas el runtime no inicia operaciones. Inventario remoto no repetido: 0000 aplicada/Google deshabilitado son datos de la revisión anterior, no una nueva comprobación.
- Errores Auth específicos y seguros, retorno desde callback fallido y desde Google con configuración incompleta; selector de destino Mis tarjetas/Administrar conservado durante confirmación de correo, errores iniciales visibles y continuación de sesión existente. Specs AUTH-002 y ACCESS-001 con RED/GREEN. No se cambia Supabase Auth ni reglas de inscripción: crear cuenta no crea tarjeta sin unirse al programa.
- UI azul tinta/lima y DM Sans, iconos de sellos/tarjetas y ejemplo Club Vuelta; eliminadas referencias a café en UI/fixtures frontend. Navegación Programas/Operaciones/Mis tarjetas. PRODUCT/DESIGN actualizados. Launcher Impeccable no disponible por ausencia de engine/cache; se leyó contexto y guía directamente, sin afirmar ejecución del detector automático.
- Verificación: `npm run check` correcto (86 UI/servidor: 25 UI + 61 servidor; 6 tooling + 221 unit backend); build correcto; 10/10 navegador de producción (5 escritorio + 5 móvil), PostgreSQL17 temporal, Auth simulado y Axe en superficies recorridas. Inspección de capturas desktop/móvil. Docker final sin contenedores loyalty-test. Enlaces documentales y `git diff --check` correctos. No se repitió suite backend completa de integración/cobertura ni se acredita OAuth/SMTP real.
- Guía completa en docs/supabase-setup.md y enlace desde README/despliegue: dos callbacks, Google Cloud, Email/SMTP, variables, migraciones y recorrido de uso. Pendiente operador: completar entorno, configurar proveedor real, revisar/aplicar pendientes 0001–0003 al destino elegido y validar cuentas reales. No se aplicaron migraciones remotas.

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

### Resultado de publicación — 2026-10-18

- Creados los commits `a37075d` (rollback/pool), `e278208` (aplicación fullstack, móvil, sesión y pruebas), `56139be` (CI/despliegue) y `069906c` (documentación e inventario). El cierre documental de este resultado se añade como quinto commit; identificarlo con `git log -1`.
- Push HTTPS rechazado por ausencia de credenciales de usuario; intento SSH rechazado por clave pública no aceptada. GitHub CLI no está instalado, no hay helper de credenciales ni tokens GitHub disponibles en el entorno. No se cambió autenticación, claves ni URL de origin. No fue rechazo de permisos del entorno: ambos intentos se ejecutaron.
- `git ls-remote origin refs/heads/main` confirmó `749ceaac0ce2d864c79f2aa6f801debcaf517e80`: los nuevos commits NO están publicados. La rama local conserva el trabajo y la serie completa queda pendiente de `git push origin main` desde una sesión autenticada.
- Revisión de 167 archivos iniciales más informe, sin secretos/artefactos incluidos; diff sin errores. Pruebas funcionales de la tarea anterior conservadas y citadas, sin nuevas ejecuciones innecesarias ni cambios funcionales. Sin cambios de Supabase, esquema o despliegue. Próximo paso requerido: autenticar GitHub en el equipo y publicar main; disponer de permisos de archivos no sustituye la autenticación del remoto.
