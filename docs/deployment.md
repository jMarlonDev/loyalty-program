# Desplegar el monolito TanStack Start

## Artefacto y entorno

Node 24.18.1 y npm 12.1.0. Un proceso sirve React SSR, assets y API. Vite/TanStack Start produce el bundle y Nitro el servidor Node en `.output/server/index.mjs`. Versiones exactas en `package-lock.json`. Nitro 3 es una versión beta fijada; cualquier actualización debe repetir build y smoke de producción.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run check
npm run test:db
npx playwright install chromium
npm run test:browser:production
npm run env:check
npm start
```

`test:db` y `test:browser:db` necesitan Docker, levantan PostgreSQL17 temporal en loopback y lo retiran. No usan `DATABASE_URL` real. El harness del navegador usa un proveedor Auth local exclusivo de pruebas; la aplicación siempre usa el adaptador real Supabase.

## Configuración

Para configurar el proyecto desde cero, seguir [Supabase y Google paso a paso](supabase-setup.md), incluida la diferencia entre el callback Google→Supabase y Supabase→aplicación.

Copiar `.env.example` a `.env` solo si no existe. Las variables del host prevalecen. Como transición, el servidor puede leer `backend/.env` existente sin sobrescribirlo; el nuevo punto de configuración es la raíz. Nada con credenciales lleva prefijo `VITE_`.

| Variable | Uso |
| --- | --- |
| DATABASE_URL | PostgreSQL con migraciones 0000–0003; conexión solo servidor |
| APP_ORIGIN | Origen público exacto, HTTPS en producción; sin barra final ni path |
| SUPABASE_URL | URL del proyecto Auth |
| SUPABASE_PUBLISHABLE_KEY | Clave pública/anon para verificar y autenticar usuarios |
| CARD_TOKEN_ENCRYPTION_KEY | 32 bytes hex; mantenerla estable para tokens ya emitidos |
| PORT / HOST | Puerto del host y escucha; 3000 / 0.0.0.0 por defecto |
| CORS_ORIGINS | Consumidores externos explícitos; vacío para UI del mismo origen |

Supabase Auth debe permitir `${APP_ORIGIN}/api/session/callback` como redirect. Configurar URL del sitio, correo/SMTP y Google OAuth en el proveedor. El registro y recuperación usan PKCE; deben abrirse en el mismo navegador que inició el flujo. La clave service-role no es necesaria. Las cookies de producción son Secure/HttpOnly/SameSite=Lax; HTTPS es obligatorio.

## Migraciones y publicación

Revisar el destino de `DATABASE_URL`, respaldos e historial antes del release. Las migraciones son un paso explícito y único del despliegue:

```sh
npm run db:check
npm run migrate
npm start
```

`migrate` lee el entorno del host o `.env`; `generate` es local y no aplica cambios. No ejecutar migraciones en cada arranque ni usar schema push. La migración 0003 rechaza contabilidad histórica incompatible sin borrar datos. Si falla, conservar el servicio anterior y revisar el estado con el operador.

Docker:

```sh
docker build --target migration -t loyalty-migrate .
docker run --rm --env-file .env loyalty-migrate
docker build -t loyalty-program .
docker run --rm --env-file .env -p 3000:3000 loyalty-program
```

El runner final no contiene secretos ni herramientas de migración. Detrás de un proxy mantener APP_ORIGIN igual al origen que ve el navegador; no confiar en headers de proxy enviados por el cliente para autorización.

## Verificación y operación

- `GET /health`: proceso vivo, sin exigir conexión DB.
- `GET /ready`: configuración y consulta PostgreSQL; un 503 impide publicar tráfico.
- `GET /openapi.json`: contrato API.
- Comprobar registro y confirmación por correo, acceso Google, inscripción QR, compra y canje en una cuenta autorizada del entorno real.
- Configurar TLS, backups, logs sin tokens y monitoreo de disponibilidad. El cierre Nitro libera el pool PostgreSQL.

La configuración por sí sola no demuestra despliegue remoto. El resultado local, los límites y la evidencia se registran en `docs/migration-harness.md` y `backend/docs/development-status.md`.

Referencias oficiales: [hosting TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [shadcn para TanStack Start](https://ui.shadcn.com/docs/installation/tanstack).

## Acceso desde celulares fuera de la red local

El usuario confirmó que todavía no tiene dominio ni aplicación desplegada. `localhost` apunta al propio dispositivo: un QR local no abre el servidor del computador desde el teléfono. Supabase aloja Auth y PostgreSQL, pero no publica este servidor TanStack Start.

1. Crea un servicio para Node o Docker con HTTPS y una URL estable. Usa el Dockerfile de este repositorio o build `npm ci --ignore-scripts --no-audit --no-fund && npm run build` y arranque `npm start`. No sirve un hosting exclusivo de archivos estáticos.
2. Obtén la URL HTTPS asignada al servicio y configura allí `APP_ORIGIN` con ese origen exacto, sin barra final. Introduce las demás variables de `.env.example` en el gestor de secretos del hosting; `DATABASE_URL` debe apuntar al PostgreSQL real, no a localhost. Mantén `HOST=0.0.0.0` y el `PORT` que requiera el proveedor.
3. En Supabase → Authentication → URL Configuration, configura Site URL con el origen público y añade `https://TU-DOMINIO/api/session/callback` en Redirect URLs. En Google conserva como redirect el callback de Supabase `https://PROJECT-REF.supabase.co/auth/v1/callback`; añade el origen público en los orígenes autorizados del cliente web cuando corresponda.
4. Revisa y aplica las migraciones pendientes como paso de release descrito arriba. Publica/reinicia el servicio con las variables definitivas.
5. Ejecuta `npm run env:check -- --public` **en el entorno del hosting**. Comprueba `/health`, `/ready` y `/api/public-config`. El último solo devuelve el origen público; no expone credenciales ni exige conexión DB. El check valida formato y rechaza orígenes locales; no prueba DNS, certificados, disponibilidad, PostgreSQL ni Google.
6. Entra por la URL pública y vuelve a obtener los QR de inscripción/invitación/tarjeta. Los enlaces localhost ya enviados o impresos no se convierten automáticamente en públicos.
7. Prueba con datos móviles: inscripción → **Ver mi tarjeta** → recarga del enlace `/cards?card=...`; en el dispositivo del empleado abre **Operaciones → Escanear con cámara**, acepta permiso y escanea el QR del cliente. También puedes usar la cámara del teléfono para abrir `/scan`. Tras verificar permisos se abre el formulario: el sello se agrega únicamente al confirmar sucursal y referencia de venta.

La cámara requiere contexto seguro y permisos del dispositivo. El QR privado usa fragmento URL, que se retira al leerlo; el QR pendiente se conserva por pestaña hasta diez minutos durante el login y se borra al resolver o cerrar sesión. No contiene tokens de autenticación.

## Sesiones entre visitas

La aplicación conserva el refresh en una cookie HttpOnly de 400 días renovables; renueva con la página visible y al volver a foco/conexión. Un fallo temporal muestra reintento y conserva la identidad ya verificada. El cierre explícito se sincroniza entre pestañas.

En Supabase → Authentication → Sessions, para la continuidad solicitada deja sin límite **Time-box user sessions** e **Inactivity timeout**, y desactiva **Single session per user** si deseas usar varios dispositivos. Estas opciones dependen del plan; por defecto Supabase mantiene sesiones sin límite temporal. Conserva la expiración normal del access token y la protección de reutilización de refresh. Una revocación real, un cambio de seguridad o borrar cookies sí puede exigir acceso nuevamente. [Sesiones oficiales de Supabase](https://supabase.com/docs/guides/auth/sessions).
