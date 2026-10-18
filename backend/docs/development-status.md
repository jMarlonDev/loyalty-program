# Estado actual: aplicación fullstack TanStack Start — 2026-10-18

Implementadas las correcciones de acceso móvil, tarjeta con permalink, escaneo con cámara y sesión persistente. El origen compartido procede de APP_ORIGIN; el entorno actual sigue local. El usuario confirmó que todavía no tiene URL pública: falta publicar el servidor con HTTPS. Detalles en [MOBILE-001](specs/MOBILE-001-public-origin.md), [MOBILE-QR-001](specs/MOBILE-QR-001-mobile-scan.md), [SESSION-003](specs/SESSION-003-persistencia.md) y [guía de despliegue](../../docs/deployment.md).

Verificación local de esta sesión: check con 131 pruebas UI/servidor, 6 tooling y 221 unit backend; regresión adicional de segundo QR comprobada 6/6 y suite UI/servidor final 132/132; tipos y build finales correctos. La aceptación final de navegador pasó 10/10; detalle al cierre abajo. No se repitió cobertura ni toda la suite backend de integración. La revisión original de migración había completado 409 pruebas backend con cobertura 97,33 % líneas; esa cifra no incluye el frontend.

Pendientes externos: URL HTTPS/hosting, conexión y migraciones remotas según destino, validación Google/SMTP reales y cámara física. `env:check -- --public` falla correctamente porque APP_ORIGIN es local; no acredita disponibilidad remota. Sin cambios de .env, Supabase, esquema, commit o push. [Guía Supabase/Google](../../docs/supabase-setup.md). Lo siguiente conserva historial y cifras previas.

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

Revisión de calidad actual: **400/400 pruebas en 28 archivos** (6 tooling, 217 unitarias, 159 integración y 18 E2E), con PostgreSQL 17 temporal, orden aleatorio y limpieza verificada. Se añadieron 190 pruebas y se reforzaron casos existentes. Informe completo: [calidad y pruebas](testing-quality.md).

Cobertura V8: 94,36 % líneas, 92,78 % sentencias, 90,47 % ramas y 95,54 % funciones. Umbral global mínimo del 90 % configurado en las cuatro métricas. Corregidos UUID equivalentes, descarte de conexión tras fallo de rollback, fixtures dependientes del orden y readiness TCP del runner.

`npm run check`, `npm run build`, `npm run db:check`, `npm run generate` (sin cambios) y `git diff --check` satisfactorios. Fixtures SQL en 16 tablas, 31 FK y 16 CHECK; bases/contenedores temporales eliminados. Sin cambios remotos; Google real y despliegue siguen pendientes. Las secciones siguientes conservan el historial previo.

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


## Validación externa solicitada — 2026-10-18

Supabase consultado en READ ONLY: 11 tablas vacías, 16 FK, 13 CHECK y solo 0000 aplicada con hash correcto; Auth sin usuarios. Google devuelve 400 indicando proveedor no habilitado. Faltan SUPABASE_URL, clave pública y CARD_TOKEN_ENCRYPTION_KEY en entorno local; build pasa, npm start falla por configuración. Falta URL del despliegue para comprobarlo. Sin migraciones, cuentas ni correos creados. Detalle y requisitos en [validación externa](external-validation.md); estos resultados no sustituyen la suite local previa.

## Aceptación final móvil — 2026-10-18

- Suite UI/servidor final: **132/132**, 21 archivos. Check previo completo: lint/tipos, 131 pruebas UI/servidor, 6 tooling y 221 unit backend; tras añadir regresión de cambio de QR, Biome, tipos, build y suite UI/servidor volvieron a pasar.
- **10/10 navegador de producción**, cinco escritorio y cinco Pixel 7, con PostgreSQL17 temporal y Auth simulado. Comprueba inscripción → enlace directo de tarjeta → recarga, restauración sin access cookie, error de sesión recuperable, apertura QR sin sesión → login → formulario, compra explícita y canje, registro/confirmación y recuperación de contraseña. Axe sin infracciones en las superficies evaluadas; capturas del formulario inspeccionadas en ambos tamaños.
- El primer recorrido detectó consulta de tarjetas antes de crear el perfil; corregido y cubierto con RED/GREEN. Un fallo posterior fue una carrera de navegación del test tras logout; se espera la llegada a inicio antes de continuar. No se relajaron límites/permisos de producción.
- `env:check -- --public` rechaza localhost como corresponde; enlaces documentales y diff --check correctos. No se afirma OAuth/SMTP reales, cámara física ni publicación HTTPS. El usuario no tiene URL pública; pasos operativos en docs/deployment.md.

Limpieza final verificada: Docker sin contenedores loyalty-test activos. Sin cambios remotos ni publicación.
