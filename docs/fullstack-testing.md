# Sesiones y validación fullstack

## Contrato antes de implementación — 2026-10-18

BR-004/BR-008 conservan Supabase como autoridad. El servidor Start media las sesiones del navegador mediante cookies HttpOnly, SameSite=Lax, Secure bajo HTTPS. Los tokens nunca se devuelven como JSON ni se guardan en almacenamiento JavaScript. El backend sigue verificando identidad y permisos en cada operación.

- AUTH-01: POST `/api/session` con action login/signup/refresh/logout/recover; exige Origin igual a APP_ORIGIN y JSON. Login/signup reciben email/password y signup full_name. Signup sin sesión informa confirmationRequired. GET devuelve únicamente user público (id/email/full_name) o 401.
- AUTH-02: cookies de acceso/renovación se rotan en login y refresh y se eliminan al cerrar sesión. Un proveedor no disponible devuelve 503 sin revelar detalles.
- AUTH-03: Google usa PKCE y callback `/api/session/callback`; verifier HttpOnly con caducidad de diez minutos y navegación de retorno exclusivamente local. Recuperación de contraseña utiliza correo de Supabase y callback PKCE.
- AUTH-04: el puente Request/Response inyecta Bearer desde cookie; las mutaciones con cookie requieren origen exacto. Clientes HTTP con Bearer explícito conservan el contrato previo.
- AUTH-05: el harness ejecuta Start real, pantallas móviles/escritorio y API con PostgreSQL aislado. Dobles del proveedor solo en infraestructura de pruebas, nunca rutas de producción.

Las pruebas server se escriben antes del comportamiento y se ejecutan RED/GREEN. Las pruebas de navegador no validan Google/correo externos; esas comprobaciones necesitan configuración real del proveedor.

## Evidencia del adaptador de sesión

- Primer RED: `vitest run --config /tmp/loyalty-auth-vitest.config.mjs` produjo 12 fallos observables (501 frente a los estados esperados), seguido por 12/12 GREEN. El puente tuvo cuatro fallos antes de implementar inyección Bearer y protección de origen, seguido por 16/16 GREEN agregados.
- Segundo RED: signup no conservaba verifier para confirmación y login rechazaba contraseñas históricas de menos de ocho caracteres. Ambas regresiones quedaron GREEN: registro usa PKCE; el mínimo de ocho caracteres aplica a nuevas contraseñas, sin impedir acceso de usuarios existentes.
- `npm test -- --project server`: 38/38 correctas (32 sesión/puente/proveedor/cliente y 6 configuración runtime), al 2026-10-18. Incluye límites de bytes UTF-8, origen ausente, retorno externo manipulado, credenciales inválidas, fallo del proveedor y renovación sin duplicar clave de idempotencia.
- `tsc --noEmit`: correcto tras composición del frontend; Biome aplicado a los archivos propios. No se presenta cobertura global nueva: la cifra histórica del backend no incluye estos archivos.

El adaptador Supabase REST sigue [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow) y el [contrato oficial Auth](https://github.com/supabase/auth/blob/master/openapi.yaml). Los flujos de Google/confirmación/recuperación deben regresar a `APP_ORIGIN/api/session/callback`, permitida en Supabase. La confirmación y recuperación necesitan el mismo navegador y verifier vigente (diez minutos); si expira, iniciar el flujo nuevamente. Tokens de usuario permanecen en cookies y no aparecen en el JSON, almacenamiento JavaScript ni logs de negocio.

## Harness de navegador

`npm run test:browser:db` inicia PostgreSQL 17 efímero, migra una base aislada `loyalty_test_*`, arranca un proveedor Auth simulado en loopback y Vite/Start real en el puerto 3100, ejecuta Chromium escritorio/Pixel 7 y elimina la base/contenedor. Requiere Docker y `npx playwright install chromium`. La configuración de desarrollo no se usa como destino de pruebas.

No se agregan rutas ni bypass de identidad en producción: la simulación se encuentra exclusivamente en `tests/browser/server.ts`; el backend sigue verificando tokens mediante su adaptador HTTP habitual. PKCE simulado comprueba el hash de verifier y consume el código. Los tests recorren acceso, inscripción, consulta de tarjetas, QR, permisos de cliente y formularios de restaurante/sucursal/programa, personalización, compras y entrega. Axe evalúa WCAG A/AA en landing, acceso y panel, complementado por comprobaciones de desbordamiento y capturas por viewport. Capturas y trazas se guardan en `test-results`, sin versionarse.

Los primeros intentos del harness detectaron un cwd incorrecto en el runner (corregido), SSR mientras faltaba el CSS (resuelto al terminar frontend) y la descarga de Chromium aún pendiente. Son incidencias de preparación y no evidencia RED de reglas de negocio. Estas incidencias iniciales se resolvieron; los resultados completos y la aceptación móvil posterior figuran abajo.

## Resultado final — 2026-10-18

**64/64 UI/sesión/composición**: 20 UI y 44 servidor. **10/10 navegador producción**, ejecutados como 5 escritorio y 5 móvil en servidores y bases separados. Los dos viewports compartiendo IP habían activado el límite 120/min; se aisló el harness sin alterar ni deshabilitar la política. Axe no encontró violaciones en landing, acceso y panel recorridos. Verifica registro/confirmación, recuperación y nueva contraseña, Google PKCE simulado, QR/inscripción/tarjeta, permisos, formularios de restaurante/sucursal/programa, personalización, compra y entrega con persistencia real.

Corregidos con evidencia RED/GREEN: copia de Request de srvx incompatible con campos privados Undici (normalización explícita), correlación/HEAD salud, metadatos IP, logout con cookie de acceso caducada y parámetros repetidos consistentes. En navegador se corrigió etiqueta del selector móvil; el locator de QR compartido y premio se ajustó al control accesible realmente implementado.

Ejecutar `npm run build` y `npm run test:browser:production`; usa `.output/server/index.mjs`. `npm run test:browser:db` ejecuta Vite. Cada viewport limpia su BD; runner retira PostgreSQL. La configuración y fixtures de tests jamás se habilitan dentro del código de producción. Google/correo reales siguen pendientes.

## Aceptación final móvil — 2026-10-18

- Suite UI/servidor final: **132/132**, 21 archivos. Check previo completo: lint/tipos, 131 pruebas UI/servidor, 6 tooling y 221 unit backend; tras añadir regresión de cambio de QR, Biome, tipos, build y suite UI/servidor volvieron a pasar.
- **10/10 navegador de producción**, cinco escritorio y cinco Pixel 7, con PostgreSQL17 temporal y Auth simulado. Comprueba inscripción → enlace directo de tarjeta → recarga, restauración sin access cookie, error de sesión recuperable, apertura QR sin sesión → login → formulario, compra explícita y canje, registro/confirmación y recuperación de contraseña. Axe sin infracciones en las superficies evaluadas; capturas del formulario inspeccionadas en ambos tamaños.
- El primer recorrido detectó consulta de tarjetas antes de crear el perfil; corregido y cubierto con RED/GREEN. Un fallo posterior fue una carrera de navegación del test tras logout; se espera la llegada a inicio antes de continuar. No se relajaron límites/permisos de producción.
- `env:check -- --public` rechaza localhost como corresponde; enlaces documentales y diff --check correctos. No se afirma OAuth/SMTP reales, cámara física ni publicación HTTPS. El usuario no tiene URL pública; pasos operativos en docs/deployment.md.
