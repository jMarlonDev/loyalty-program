# Configurar Supabase, Google y las tarjetas

Guía para esta aplicación, revisada el 2026-10-18. Los nombres de secciones del dashboard pueden variar; las opciones y URLs indicadas son las necesarias para el código actual.

## Diagnóstico inicial (histórico)

Estado al cierre del 2026-10-18: configuración local válida, Supabase con migraciones 0000–0004 y tres cuentas de prueba reales verificadas por navegador. El cliente vio una compra del empleado como 1/5 sellos sin recargar. El origen local se cambió después a la IP LAN para desarrollo; no hay publicación HTTPS. Google/SMTP reales no se comprobaron en esta sesión. El informe vigente está en backend/docs/development-status.md.

## 1. Mantener Supabase Auth

Recomendación para este repositorio: **Google OAuth mediante Supabase Auth**. Google identifica al usuario; Supabase administra la identidad y sesión común para Google y correo. La aplicación guarda los tokens en cookies HttpOnly del servidor y enlaza el perfil local por el identificador verificado.

Google directo sin Supabase Auth es posible, pero supondría reemplazar la verificación de identidad, sesiones, recuperación y vinculación de cuentas ya implementadas. No arregla la configuración pendiente de este sistema. No se ha realizado ese cambio.

## 2. Obtener datos del proyecto

En el dashboard Supabase, abre el proyecto correcto:

- En **Connect** o **Project Settings → API/Data API**, copia la URL del proyecto: `https://<project-ref>.supabase.co`.
- En **Project Settings → API Keys**, copia la **publishable key**. La clave heredada `anon` también es compatible. No necesitas `service_role` ni una secret key para este flujo.
- En **Connect**, obtén la conexión PostgreSQL. Para este servidor Node persistente usa conexión directa si hay IPv6 disponible o **Session pooler** si necesitas IPv4; copia la cadena exacta y sustituye la contraseña. Codifica caracteres especiales de la contraseña en la URL. Conserva la configuración TLS indicada por Supabase; no desactives la verificación de certificados para resolver errores.

Fuentes: [claves API](https://supabase.com/docs/guides/getting-started/api-keys), [conexión PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 3. Completar el entorno local

Edita `.env` en la raíz. Si no existe, usa `.env.example` como plantilla. Si `DATABASE_URL` ya está en `backend/.env`, puedes conservarla allí: es el fallback existente. No reemplaces una conexión válida por el ejemplo local de la plantilla.

```dotenv
APP_ORIGIN=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key-del-mismo-proyecto>
CARD_TOKEN_ENCRYPTION_KEY=<64-caracteres-hexadecimales>
```

Genera la clave de tarjetas una sola vez en tu terminal y guarda el resultado en `.env`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Mantén esa clave estable y respaldada: cifra códigos privados de tarjetas ya emitidas. No es una clave que se obtenga en Supabase. No copies secretos a Git o al chat. Las variables del proceso prevalecen sobre `.env`; después se lee `backend/.env` para completar valores ausentes.

Ejecuta `npm run env:check`: debe terminar correctamente antes de probar las operaciones. Este comando valida configuración, no conexión ni OAuth real.

## 4. Configurar URLs en Supabase

Abre **Authentication → URL Configuration**:

- **Site URL**, durante desarrollo: `http://localhost:3000`.
- **Redirect URLs**: añade exactamente `http://localhost:3000/api/session/callback`.
- Para producción: Site URL debe ser `https://tu-dominio.com` y añade `https://tu-dominio.com/api/session/callback`. En ese servidor establece `APP_ORIGIN=https://tu-dominio.com`.

Abre siempre el mismo origen configurado: `localhost` y `127.0.0.1` son distintos. No pongas `/app`, rutas ni barra final dentro de `APP_ORIGIN`. La aplicación rechaza operaciones con un origen diferente para proteger la sesión.

Fuente: [redirecciones de Supabase Auth](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Habilitar registro por correo

En **Authentication → Sign In / Providers** (o Providers), habilita **Allow new users to sign up** y el proveedor **Email**. Mantén **Confirm email** activo para cuentas reales. Revisa que la política de contraseñas sea compatible con el formulario (mínimo 8 caracteres; si configuras requisitos adicionales, el usuario también debe cumplirlos).

El alta puede crear el usuario en Auth sin iniciar sesión inmediatamente: hay que confirmar el correo. Eso es esperado. Las tablas de negocio y el perfil se crean/consultan después del acceso verificado.

Fuente: [configuración general de Auth](https://supabase.com/docs/guides/auth/general-configuration).

## 6. Configurar el envío de correos

En **Authentication → Email / SMTP Settings**, configura SMTP propio: servidor, puerto, usuario, contraseña, remitente y nombre. Verifica el dominio/remitente en tu proveedor de correo y aplica sus registros DNS. Las credenciales SMTP se guardan en Supabase, no en el frontend.

El SMTP predeterminado de Supabase solo envía a miembros autorizados del equipo del proyecto y tiene un límite reducido (la documentación consultada indica 2 mensajes por hora). Por eso el registro con correos de clientes puede fallar aunque las URLs sean correctas. Para clientes reales necesitas SMTP propio.

En plantillas de **Confirm signup** y **Reset password**, conserva el enlace `{{ .ConfirmationURL }}` del flujo estándar. No lo sustituyas por la portada ni por un `/auth/confirm` de otro tutorial: esta aplicación usa `/api/session/callback` con PKCE. Abre el enlace en el mismo navegador donde comenzaste y dentro de 10 minutos, que es la duración de la cookie de verificación de la aplicación. No habilites CAPTCHA hasta integrar su widget/token en la aplicación; actualmente no lo envía.

Fuentes: [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [plantillas](https://supabase.com/docs/guides/auth/auth-email-templates).

## 7. Crear el cliente OAuth en Google

En Google Cloud selecciona o crea un proyecto y abre **Google Auth Platform**:

1. **Branding**: completa nombre de aplicación, correo de soporte y contacto. Para publicar, proporciona los dominios y páginas que Google solicite.
2. **Audience**: selecciona el público correspondiente; para clientes generales, External. Mientras esté en Testing, añade las cuentas que usarás como usuarios de prueba.
3. **Data Access**: utiliza únicamente `openid`, `userinfo.email` y `userinfo.profile` para este inicio de sesión.
4. **Clients → Create client → Web application**.
5. **Authorized JavaScript origins**: `http://localhost:3000` en desarrollo y el origen HTTPS de producción cuando exista.
6. **Authorized redirect URIs**: pega la URL de callback que muestra Supabase en su proveedor Google, normalmente `https://<project-ref>.supabase.co/auth/v1/callback`. Este callback sigue siendo el del proyecto alojado aunque la aplicación corra en localhost.
7. Guarda el **Client ID** y **Client Secret** para introducirlos en Supabase.

Fuente: [Google con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 8. Habilitar Google en Supabase

En **Authentication → Sign In / Providers → Google**, activa el proveedor, pega Client ID y Client Secret y guarda. Conserva las comprobaciones de seguridad predeterminadas. No pongas el secreto Google en React ni en variables `VITE_`.

Las dos URLs tienen funciones diferentes:

| Configuración | URL de desarrollo con Supabase alojado |
| --- | --- |
| Google → Authorized redirect URIs | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Supabase → Redirect URLs | `http://localhost:3000/api/session/callback` |
| Aplicación → APP_ORIGIN / Supabase → Site URL local | `http://localhost:3000` |

La primera devuelve Google a Supabase; la segunda devuelve Supabase a la aplicación, donde se crea la cookie de sesión. Fuente: [configuración oficial de Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 9. Completar las tablas de negocio

Auth por sí solo no permite listar tarjetas: PostgreSQL debe tener las migraciones **0000–0004**. En el SQL Editor puedes inspeccionar sin cambios:

```sql
select id, hash, created_at
from drizzle.__drizzle_migrations
order by created_at;
```

Si hay migraciones pendientes, revisa el destino de `DATABASE_URL`, las migraciones del repositorio y el respaldo del proyecto. Desde la raíz, ejecuta:

```sh
npm run db:check
npm run migrate
```

`db:check` comprueba el historial local; **`migrate` modifica la base configurada** y aplica las pendientes. No ejecutes SQL copiado de tutoriales ni `schema push`. La migración 0003 rechaza contabilidad histórica incompatible; ante ese error hay que revisar los datos, no borrar historial. En el proyecto de esta sesión, 0000–0003 ya estaban aplicadas y 0004 se aplicó tras autorización expresa; su hash quedó verificado. Para cualquier otro destino revisa su propio historial.

## 10. Arrancar y probar las operaciones

```sh
npm run env:check
npm run dev
```

Reinicia el proceso después de editar `.env`. Abre `http://localhost:3000` y comprueba `/ready` (consulta de disponibilidad PostgreSQL; no demuestra que todas las migraciones o Google estén bien).

1. **Cuenta**: registra un correo real, confirma desde ese navegador e inicia sesión. Repite el acceso con Google. Comprueba el usuario en Authentication → Users; no asignes roles usando metadatos editables de Auth.
2. **Administración**: entra a Administrar, crea el restaurante, una sucursal activa y un programa. Personaliza la tarjeta y abre su enlace público `/join/...`.
3. **Cliente**: con otra cuenta, abre ese enlace, inicia sesión o regístrate, pulsa **Quiero mi tarjeta** y luego **Ver mi tarjeta**. Crear una cuenta no inscribe automáticamente en todos los programas.
4. **Consulta**: Mis tarjetas muestra las inscripciones de esa cuenta, su saldo, premios e historial. Una lista vacía es normal antes de inscribirse.
5. **Operaciones**: desde el restaurante, pega el código privado mostrado por la tarjeta del cliente, selecciona sucursal y registra una compra con referencia única. Al completar la meta, entrega el premio desde Operaciones. El cliente no puede darse sellos ni entregar premios por sí mismo.

## Diagnóstico rápido

| Síntoma | Revisar |
| --- | --- |
| Servicio aún no configurado | `npm run env:check`, variables del proceso y reinicio |
| `redirect_uri_mismatch` de Google | Callback de **Supabase** registrado en Google |
| Proveedor Google no habilitado | Interruptor Google, ID y secreto del mismo cliente |
| Google bloquea una cuenta de prueba | Audience, test users y estado de publicación |
| Vuelve a otra página/host | Site URL, Redirect URLs y APP_ORIGIN exactos |
| Correo no confirmado/no llega correo | SMTP, remitente, spam y Auth logs |
| Demasiados intentos | Esperar el límite de Auth; revisar rate limits/logs |
| Enlace expirado | Mismo navegador, iniciar un flujo nuevo y abrir antes de 10 minutos |
| Origen no permitido | No mezclar localhost, 127.0.0.1, puertos o HTTP/HTTPS |
| Acceso correcto pero error de perfil/tarjetas | Conexión PostgreSQL y migraciones 0000–0004 |
| Mis tarjetas vacío | Cuenta correcta e inscripción explícita en el enlace del programa |

Las pruebas automáticas usan un proveedor aislado y PostgreSQL temporal; no certifican Google, SMTP ni el despliegue real. La guía deja esos pasos concretos para el propietario del proyecto.

## Acceso público y sesión persistente

Para pasar de localhost al móvil desde cualquier lugar, seguir [despliegue HTTPS y ajustes de sesión](deployment.md#acceso-desde-celulares-fuera-de-la-red-local). Todavía no hay URL pública proporcionada. Un `env:check` satisfactorio solo demuestra formato de variables, no conexión DB ni OAuth real.

## Cuentas de prueba reales

[Guía de cuentas y creación desde la interfaz](testing-accounts.md). El comando
`npm run accounts:seed` necesita una clave administrativa local, a diferencia
del acceso normal de la aplicación. En Settings → API Keys, la pestaña Legacy
anon, service_role API keys contiene service_role: guardarla como
SUPABASE_SERVICE_ROLE_KEY en .env, nunca en una variable VITE_ ni en el chat.
Consulta la [referencia oficial de claves](https://supabase.com/docs/guides/getting-started/api-keys).
El manifiesto privado .cache/test-accounts.json contiene las credenciales de
las cuentas creadas; no versionarlo.

## Pruebas en la misma red WiFi

Para la IP actual del computador, configura `APP_ORIGIN=http://192.168.33.9:3000`
y ejecuta `npm run dev` (escucha en esa IP y mantiene puerto 3000 estricto).
Reinicia Vite después de cambiar host u origen. Abre esa misma URL en el
computador y en el celular. La sesión anterior de localhost no se comparte con
la IP. Esta excepción HTTP acepta solamente IPv4 privadas y desarrollo.

El inicio de sesión con correo/contraseña ya confirmados no depende del callback.
Para registro con confirmación, recuperación y retorno de Google, añade
`http://192.168.33.9:3000/api/session/callback` en **Authentication → URL
Configuration → Redirect URLs**. Puedes usar la IP como Site URL del proyecto
exclusivo de desarrollo. Conserva las URLs de producción si el proyecto también
las necesita. La aplicación no cambia esta configuración remota automáticamente.
El callback de Google Cloud hacia Supabase no cambia por usar otra IP local.

Si la portada no carga, comprueba la IP actual, misma WiFi, aislamiento de
clientes del router y permiso de entrada al puerto 3000 en el firewall. Si la
portada carga pero el login devuelve 403 de origen, comprueba que
`/api/public-config` devuelve exactamente la URL abierta. No desactives CSRF,
CORS ni allowedHosts como solución.

En HTTP LAN, el navegador no permite cámara web; pega el código de la tarjeta
en Operaciones o prepara HTTPS confiable en ambos dispositivos. El botón de
copiar puede ofrecer selección manual si el portapapeles seguro no está disponible.
Esto no publica la aplicación en Internet. Referencias: [Vite server.host](https://vite.dev/config/server-options.html#server-host)
y [requisitos de cámara del navegador](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security).
