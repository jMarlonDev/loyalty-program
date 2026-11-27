# Estado vigente — ejecución del nuevo flujo, 2026-10-19

Nueva petición autoriza reconstrucción P0–P10 con subagentes. P0 en curso: contratos NEXT-001–005 y reglas; D-01–D-05 consultadas y todavía pendientes. P1 avanza en inventario/conversión segura y prueba independiente del transporte Nitro WebSocket. [Harness vigente](../../docs/migration-harness.md) registra responsables, archivos, dependencias y evidencia. No se han cambiado datos remotos ni se declara completo el nuevo recorrido.

Baseline de esta ejecución: `npm run check` correcto (192 UI/servidor, 7 tooling y 221 unidad backend); suite PostgreSQL 17 temporal `npm run test:db -- --sequence.shuffle --sequence.seed=20261019` correcta con **421/421** pruebas backend. Estos resultados verifican la base heredada antes del cambio; no son aceptación LOYALTY-NEXT-001.

# Historial — planificación del nuevo flujo, 2026-10-19

Documentado el [plan LOYALTY-NEXT-001 en AGENTS raíz](../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente): teléfono y cookie persistente, tres QR, empleado sin catálogo de roles, compras autorizadas, premio/canje por WhatsApp, WebSocket privado y simplificación Drizzle con conservación de beneficios. Contiene diez requisitos, cinco decisiones pendientes, once fases P0–P10 y catorce criterios de aceptación. Todas las fases están pendientes; la siguiente sesión de ejecución comienza por P0 y continúa el orden descrito.

Esta sesión solo documenta. No se cambió código funcional, esquema, migraciones, configuración o datos; tampoco se hicieron envíos, commit, push o despliegue. Se conservaron los cambios locales anteriores. Las cifras de pruebas de las secciones siguientes son históricas y no verifican el flujo nuevo. El servidor se había detenido por petición del usuario; no se inició en esta planificación.

# Historial — desarrollo LAN, 2026-10-18

Corregido el acceso por IP privada: APP_ORIGIN local ahora es
http://192.168.33.9:3000 y el servidor Vite fue reiniciado en esa IP con puerto
3000 estricto. HTTP en RFC1918 se acepta únicamente con NODE_ENV=development;
producción conserva el rechazo. Sesión y API mantienen Origin exacto y cookies
HttpOnly/SameSite. Los QR muestran un aviso de misma red; las claves de
idempotencia usan getRandomValues, disponible en HTTP, y conservan reintentos.

Aceptación Chromium real contra Supabase correcta: tres accesos, escritorio y
móvil emulado, restauración al recargar, QR, intento de venta duplicada 409 y
origen distinto 403. Saldo del cliente observado antes/después sin cambio.
Informe privado .cache/lan-acceptance.json; enlaces del manifiesto actualizados
sin cambiar cuentas o contraseñas. No se ejecutaron migraciones ni se cambió
configuración remota de Supabase. Cámara física/HTTPS LAN, Google y callbacks
de correo siguen pendientes de su configuración específica. Check final correcto: lint/tipos, 192 UI/servidor y 228 backend unidad/tooling.
Cierre en AGENTS.md. El historial siguiente conserva cifras previas.

# Estado vigente — separación por roles, 2026-10-18

La solicitud actual limita Employee al QR y registro de compras/sellos. Owner/Admin conserva gestión completa del restaurante, incluidos Admin/Employee; el cliente accede a sus tarjetas con actualización visible cada diez segundos. [ROLE-001](specs/ROLE-001-role-boundaries.md) sustituye permisos históricos de canje/cierre de Employee. Alta de negocio explícita; invitaciones conservan correo verificado y contexto. Cambios locales previos FLOW-001/002 y DB-005 preservados e integrados.

Comprobaciones actuales: `npm run check` correcto con **175 UI/servidor**, **7 tooling y 221 unit backend**; `npm run test:db -- --sequence.shuffle --sequence.seed=20261018` correcto con **418/418 backend**. Build, tipos finales, generate sin cambios y db:check correctos. Después, el navegador detectó actor_role faltante en el detalle de restaurante: corrección con tres regresiones RED/GREEN y suite staff final 21/21; check backend repetido correcto. No se repitió cobertura. Aceptación de producción HTTPS local: **10/10 navegador**, cinco escritorio y cinco móvil; QR decodificados, roles, actualización entre sesiones y cookies Secure/HttpOnly verificados. Axe/desbordamiento y revisión visual de capturas en ambos tamaños completados.

Supabase: inventario previo de solo lectura encontró 0000–0003, 16 tablas, dos usuarios y un restaurante. Tras autorización específica del usuario se aplicó **0004**; historial de cinco migraciones y hash 0004 coincidente, sin columna slug; se conservaron los dos usuarios y el restaurante que existían antes de crear las cuentas de prueba. No se cambiaron credenciales ni se publicaron commits.

`npm run accounts:seed` prepara tres cuentas reales y datos de prueba con preflight y manifiesto privado/reanudable; [guía](../../docs/testing-accounts.md). El usuario configuró SUPABASE_SERVICE_ROLE_KEY y `accounts:seed` creó/verificó las tres identidades reales, pertenencias y tarjeta. Credenciales en .cache/test-accounts.json modo0600 ignorado por Git. Aceptación real Chromium correcta: tres accesos, vistas por rol, permisos/QR y compra Employee con actualización del cliente a 1/5 sin recargar. Servidor temporal loopback3200 detenido. Inventario READ ONLY final: cinco identidades/dos restaurantes totales, exactamente tres cuentas y un negocio nuevos, una sucursal/programa de prueba y una sola compra de aceptación. Cuenta administrativa prevista como propietario (`owner`) con todos los permisos; el rol `admin` exacto se verifica con fixtures y se puede invitar desde Equipo.

No hay hosting público nuevo. El túnel público fue rechazado por revisión automática por posible exposición de datos reales; se usa HTTPS local con Auth/DB aislados y se retiró el binario temporal. No se acredita cámara física, OAuth/SMTP real ni URL accesible desde datos móviles. Las secciones siguientes son historial, no el estado actual.

# Estado actual: aplicación fullstack TanStack Start — 2026-10-18

Implementadas las correcciones de acceso móvil, tarjeta con permalink, escaneo con cámara y sesión persistente. El origen compartido procede de APP_ORIGIN; el entorno actual sigue local. El usuario confirmó que todavía no tiene URL pública: falta publicar el servidor con HTTPS. Detalles en [MOBILE-001](specs/MOBILE-001-public-origin.md), [MOBILE-QR-001](specs/MOBILE-QR-001-mobile-scan.md), [SESSION-003](specs/SESSION-003-persistencia.md) y [guía de despliegue](../../docs/deployment.md).

Verificación local de esta sesión: check con 131 pruebas UI/servidor, 6 tooling y 221 unit backend; regresión adicional de segundo QR comprobada 6/6 y suite UI/servidor final 132/132; tipos y build finales correctos. La aceptación final de navegador pasó 10/10; detalle al cierre abajo. No se repitió cobertura ni toda la suite backend de integración. La revisión original de migración había completado 409 pruebas backend con cobertura 97,33 % líneas; esa cifra no incluye el frontend.

Pendientes externos: URL HTTPS/hosting, conexión y migraciones remotas según destino, validación Google/SMTP reales y cámara física. `env:check -- --public` falla correctamente porque APP_ORIGIN es local; no acredita disponibilidad remota. Sin cambios de .env, Supabase ni esquema. Commits locales preparados; publicación bloqueada por autenticación GitHub (resultado al cierre). [Guía Supabase/Google](../../docs/supabase-setup.md). Lo siguiente conserva historial y cifras previas.

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

### Resultado de publicación — 2026-10-18

- Creados los commits `a37075d` (rollback/pool), `e278208` (aplicación fullstack, móvil, sesión y pruebas), `56139be` (CI/despliegue) y `069906c` (documentación e inventario). El cierre documental de este resultado se añade como quinto commit; identificarlo con `git log -1`.
- Push HTTPS rechazado por ausencia de credenciales de usuario; intento SSH rechazado por clave pública no aceptada. GitHub CLI no está instalado, no hay helper de credenciales ni tokens GitHub disponibles en el entorno. No se cambió autenticación, claves ni URL de origin. No fue rechazo de permisos del entorno: ambos intentos se ejecutaron.
- `git ls-remote origin refs/heads/main` confirmó `749ceaac0ce2d864c79f2aa6f801debcaf517e80`: los nuevos commits NO están publicados. La rama local conserva el trabajo y la serie completa queda pendiente de `git push origin main` desde una sesión autenticada.
- Revisión de 167 archivos iniciales más informe, sin secretos/artefactos incluidos; diff sin errores. Pruebas funcionales de la tarea anterior conservadas y citadas, sin nuevas ejecuciones innecesarias ni cambios funcionales. Sin cambios de Supabase, esquema o despliegue. Próximo paso requerido: autenticar GitHub en el equipo y publicar main; disponer de permisos de archivos no sustituye la autenticación del remoto.

## Alineación NEXT-001 y ciclo separado — 2026-10-19

- Decisiones D-01–D-05 registradas en AGENTS/specs/BR. El usuario pidió después eliminar el OTP: el acceso cliente queda con teléfono normalizado y queda documentado el riesgo de suplantación. No se creó ni conservó la tabla `phone_challenges`; la migración 0007 generada para ese intento se eliminó antes de aplicarse y `npm run generate` confirma que no hay deriva.
- Correcciones de negocio en `next-repository.ts`: mutaciones exigen `Origin` exacto; el dueño ya no obtiene vínculo de operador automático; D-03 abre un ciclo `collecting` separado cuando hay premio pendiente; el canje bloquea el ciclo del premio, debita solo ese ciclo y conserva los posteriores; `balance` se calcula del libro; las recompensas se listan por membresía; la reemisión de comprobante incrementa `version`; la referencia de venta duplicada responde 409; la sesión cliente crea usuario sombra propio sin reutilizar cuentas existentes por coincidencia de teléfono.
- Pruebas adaptadas: `next-flow` (4 casos) cubre compra adicional con premio pendiente, canje con saldo restante y dueño sin vínculo; `http-access` exige Origin; la UI tolera `cycle` nulo. No se eliminaron regresiones de seguridad.
- Verificación: `npm run check` (225 UI/servidor, 10 tooling, 256 unit backend), `npm run test:db -- --sequence.shuffle --sequence.seed=20261019` (517/517 en 37 archivos, PostgreSQL 17 temporal), `npm run build`, `npm run db:check` y `npm run generate` sin cambios. `backend/scripts/test-db.mjs` amplió la espera de arranque por lentitud del host.
- Límites: no se ejecutó navegador ni WSS real en esta sesión; no hay proveedor WhatsApp ni migración remota. El flujo P7 (outbox/entrega/reintentos) y P9 (retirada de roles/rutas antiguas) siguen pendientes.
