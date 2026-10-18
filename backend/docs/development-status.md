# Desarrollo por prioridades — 2026-10-18

La solicitud vigente autoriza implementación de todas las fases, delegación, TDD y commits. Este registro refleja el estado comprobado al solicitar el usuario un resumen; no afirma que toda la entrega esté cerrada.

| Prioridad | Elemento | Responsable | Estado comprobado |
| --- | --- | --- | --- |
| P0 | Configuración, HTTP, errores, health/ready y cierre del servidor | foundation + principal | Implementado; tests unitarios y E2E pasan |
| P0 | PostgreSQL aislado, esquema y migraciones | database_harness + principal | Implementado; Rechazo de historial incompatible comprobado |
| P0 | Supabase Auth y perfiles propios | identity + principal | Implementado; proveedor real no validado |
| P1 | Restaurantes, Owner, sucursales, personal e invitaciones | foundation | Implementado; pruebas pasan |
| P1 | Programas, diseño, condiciones fijas, inscripción y tarjetas | identity | Funcionalidad probada; Auditoría completada; pruebas pasan |
| P1 | Compras, premios, entrega y reversión | database_harness | Implementado; pruebas de concurrencia y compensación pasan |
| P1 | Consentimientos y cierre lógico | database_harness | Implementado; pruebas pasan |
| P2 | OpenAPI, límites HTTP, CORS, logs y composición | identity + principal | Implementado; 39 operaciones documentadas |
| P2 | CI, ejemplos de API y validación externa correo/Google | Pendiente | No implementado/configurado |
| Cierre | Documentación final, comprobaciones y commits | principal | Preparación/publicación autorizada; resultado en AGENTS y Git |

## Verificación agregada actual

`npm run test:db`: **210 pruebas correctas en 25 archivos** (6 tooling, 149 unitarias, 50 integración y 5 E2E). Runner Docker probado de principio a fin con PostgreSQL17 y retirada del contenedor. HTTP real y persistencia real; proveedor Supabase sustituido por dobles explícitos.

`npm run check`, `npm run build`, `npm run db:check`, `npm run generate` (sin cambios adicionales) y `git diff --check` satisfactorios. No se ejecutó cobertura porcentual ni proveedor Google real.

Se cerraron los dos fallos de la revisión anterior: auditoría de programas correlacionada con HTTP (cuatro eventos, sin duplicación al reintentar) y migración incremental 0003 que bloquea contabilidad antigua incompatible sin borrar datos. Formato/imports y errores de TypeScript resueltos. Se conservan las specs RED/GREEN y el historial anterior en AGENTS.

Durante la validación se agotó el espacio de disco. Se retiró únicamente la caché descargable npm `_cacache` (aproximadamente 3,7GB), preservando código y node_modules; luego se repitieron satisfactoriamente los checks afectados. Biome excluye dist/coverage. El runner tolera que Docker haya retirado automáticamente un contenedor fallido.

## Git y alcance

Usuario autorizó expresamente crear todos los commits y publicarlos. HEAD inicial `3c3793f chore: file deleted` preservado; el JSON eliminado no se restauró. Referencia estructural: snapshot0000. Migraciones nuevas 0001/0002/0003 probadas solo en PostgreSQL temporal, nunca Supabase del usuario. Sin frontend ni credenciales versionadas; 114 archivos candidatos revisados sin coincidencias con secretos locales. Push HTTPS rechazado por ausencia de credenciales; SSH rechazado por clave pública no aceptada. No se publicó la serie. No fue un rechazo de permisos del sandbox.

Pendientes ajenos a esta publicación: CI, ejemplos completos de consumo, configuración y verificación externa de correo/Google, despliegue y aplicación autorizada de las nuevas migraciones remotas. No se afirma disponibilidad en producción.

## Serie de commits

Serie temática preparada tras resolver los bloqueos. Consultar git log para los identificadores finales.

1. `7849d8c` — `feat(db): extend loyalty schema and restrict direct access` — DB-003/004, schema, migraciones 0001/0002, snapshots, tooling y protección de historial incompatible 0003.
2. `149b912` — `test(backend): add isolated PostgreSQL integration harness` — helper, guardas de destino, migraciones, RLS y upgrade; script test:db.
3. `9abf88c` — `feat(core): add runtime configuration and transactional infrastructure` — configuración, errores, transacciones/idempotencia, cifrado compartido y pruebas; mantener composición final en último commit.
4. `f0cfcd7` — `feat(auth): add verified Supabase identity and customer profiles` — identidad, adaptador, repositorio, rutas y pruebas.
5. `e434d66` — `feat(staff): add restaurants locations and staff invitations` — jerarquía, pertenencia, invitaciones, estados y auditoría.
6. `d3c16bc` — `feat(programs): add enrollment digital cards and QR rotation` — programas, diseño, inscripción, consultas propias, tokens y auditoría completada.
7. `7df518a` — `feat(loyalty): add purchases rewards reversals and confirmed closure` — libro contable, asignaciones, entrega, compensaciones y consentimiento/cierre.
8. `dc32092` — `feat(api): compose routes and add operational safeguards` — composición/servidor, OpenAPI, CORS, límites, logs, scripts build/dev/start y E2E completo.
9. Commit documental de cierre (identificador en `git log -1`): `docs(backend): record implementation status and validation evidence` — specs, README, AGENTS, índice, limitaciones y trazabilidad. Las specs deben acompañar al commit de su módulo cuando se preparen.

CI y ejemplos pendientes deberán añadirse en una entrega comprobada; no incluirlos en la descripción de cambios ya existentes.

Publicación pendiente: ejecutar `git push origin main` desde una sesión autenticada de GitHub. No se solicitaron ni imprimieron secretos.
