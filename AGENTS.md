# Guía del proyecto

## Contexto y alcance

`loyalty-program` es un sistema de fidelización para restaurantes. Los restaurantes podrán definir programas por compras; los clientes acumularán sellos en una tarjeta digital y obtendrán un premio al completar la meta.

La solicitud vigente del 2026-10-18 autoriza desarrollar todas las fases del backend con subagentes, TDD, documentación y commits. La implementación está en revisión final; consultar backend/docs/development-status.md. Frontend continúa reservado y cambios remotos de Supabase requieren autorización específica.

## Entorno y estructura

- Base local: Node.js 24.18.1 y npm 12.1.0; versiones declaradas en `.nvmrc` y `package.json`.
- `frontend/`: reservado. `backend/`: implementación funcional en revisión; leer `backend/AGENTS.md` y `backend/docs/index.md`.
- `README.md`: preparación del entorno, verificaciones y decisiones pendientes.
- Backend tiene servidor, API y pruebas funcionales. Última verificación: 210/210 pruebas correctas, checks y build satisfactorios. Solo la migración inicial está aplicada a Supabase; 0001/0002/0003 se probaron localmente.
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

- Cerrados fallos de auditoría y contabilidad histórica, tipos y formato. 210/210 pruebas pasan con PostgreSQL17 temporal; check/build/db:check/generate sin cambios/diff --check satisfactorios. Caché descargable npm retirada para resolver disco lleno; código y dependencias instaladas preservados.
- Ocho commits funcionales creados (7849d8c a dc32092), más cierre documental identificable en git log. Usuario autorizó commit y push; HTTPS rechazó ausencia de credenciales y SSH rechazó la clave pública. No hubo publicación ni cambios de autenticación; no fue rechazo de permisos del entorno.
- Pendiente git push origin main desde sesión GitHub autenticada. Sin cambios remotos Supabase/frontend/credenciales. CI, ejemplos, Google real y despliegue pendientes; detalle en backend/docs/development-status.md y backend/AGENTS.md.
