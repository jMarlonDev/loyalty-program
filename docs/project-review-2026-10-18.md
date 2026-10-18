# Estado y guía de prueba — 2026-10-18

> Informe histórico anterior a las correcciones de acceso móvil y sesión. Las cifras, configuración y limitaciones describen aquella revisión; consultar el [estado vigente](../backend/docs/development-status.md) para los cambios posteriores.

## Resultado de la migración

El sistema se convirtió en una aplicación fullstack TanStack Start. La interfaz y la API se sirven desde el mismo origen y proceso; el dominio PostgreSQL existente se conserva. La entrega es local: no se ha publicado ni aplicado migraciones remotas en esta sesión.

| Área | Implementación |
| --- | --- |
| Framework | TanStack Start y Router, React SSR; Vite y Nitro para build/servidor Node |
| Datos de UI | TanStack Query; peticiones del mismo origen, paginación e invalidación tras mutaciones |
| Diseño | shadcn/Radix, Tailwind, fuentes locales; adaptación móvil, etiquetas, teclado, foco y estados vacíos/error |
| Acceso | Correo/contraseña, registro, confirmación, recuperación y Google mediante Supabase; PKCE y cookies HttpOnly |
| Organización | Restaurantes, sucursales, roles Owner/Admin/Employee, equipo e invitaciones |
| Programas | Crear/editar, estados y condiciones protegidas; QR público de inscripción |
| Personalización | Nombre, descripción, meta/recompensa según reglas, logo por URL HTTPS, colores y mensaje; vista previa |
| Cliente | Inscripción, tarjetas propias, QR privado renovable, historial, premios, perfil y consentimiento |
| Operación | Una compra/un sello, premio automático al completar meta, entrega, reversión y cierre confirmado |
| Resultados | Lecturas administrativas de clientes, compras y premios; sin cifras de ingresos inventadas |
| Persistencia | Drizzle/pg/PostgreSQL; mismas migraciones 0000–0003, permisos y transacciones |
| Entrega | Lockfile raíz, scripts, Dockerfile, workflow CI y documentación de despliegue |

Se retiraron Hono, su adaptador Node, el servidor anterior, su configuración de compilación, el lockfile backend duplicado y el directorio frontend vacío. `backend/` se conserva porque contiene el núcleo funcional, las migraciones, las specs y las pruebas; forma parte del mismo workspace y proceso.

La migración preserva aislamiento entre restaurantes, jerarquía de roles, idempotencia, condiciones de programas, contabilidad y consentimiento. Las nuevas lecturas exponen información existente para la interfaz. No se cambió el esquema ni se borraron datos del usuario.

## Verificación

La referencia inicial tenía 400 pruebas de backend correctas. Hubo pruebas RED antes de implementar transporte, sesiones, configuración, presentación y lecturas nuevas. La revisión cruzada detectó y corrigió inconsistencias de payload, permisos, límites de cuerpo, parámetros repetidos y la conversión Request de Nitro a Node.

La última suite completa del núcleo pasa **409/409** pruebas: 6 tooling, 221 unitarias, 164 integración y 18 E2E. La retirada de una prueba del antiguo servidor explica que el total no solo crezca. Cobertura del núcleo: **97,33 % líneas**, **95,96 % sentencias**, **90,90 % ramas**, **99,03 % funciones**. Estas cifras no representan cobertura del frontend.

UI/sesiones/composición: **64/64** pruebas (20 UI y 44 servidor). Lint, TypeScript, generación Drizzle sin cambios e historial correctos. Build de cliente/SSR/servidor Node correcto. Instalación limpia `npm ci` correcta (343 paquetes); rutas generadas excluidas de Git y regeneradas automáticamente para tipos. Auditoría npm: cero vulnerabilidades. CI está preparado; no se afirma una ejecución remota de GitHub Actions.

Navegador usa Chromium escritorio y Pixel 7, PostgreSQL 17 temporal y un proveedor Auth externo simulado. Resultado final: **10/10 escenarios de navegador producción correctos** (cinco por viewport, con servidor y BD separados). Evidencia en [sesiones y validación](fullstack-testing.md). Los flujos simulados no acreditan Google, SMTP o correos reales. Axe comprueba las superficies recorridas; no equivale a una certificación completa de accesibilidad.

Impeccable tiene PRODUCT/DESIGN y configuración `hook.enabled=true`. El comando no encontró un proveedor local para instalar el disparador automático; se ejecutó el detector manual. Produjo dos avisos estéticos sobre Fraunces, elegida para la referencia editorial, sin hallazgos mecánicos en ese escaneo.

## Lo que falta para producción real

1. Completar el entorno. `npm run env:check` detecta actualmente APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y CARD_TOKEN_ENCRYPTION_KEY ausentes. No imprime secretos ni prueba conectividad. DATABASE_URL existe en la configuración heredada.
2. Configurar Supabase Auth: sitio y callback, SMTP/confirmación y Google OAuth. Validar con una cuenta y bandeja de prueba reales. El último informe externo encontró Google deshabilitado; no se reconfiguró aquí.
3. Revisar y aplicar las migraciones pendientes al destino real. El último inventario remoto solo tenía 0000; 0001–0003 se han probado localmente. Consultar [validación externa](../backend/docs/external-validation.md) antes de publicar.
4. Elegir hosting/dominio, cargar secretos, configurar HTTPS, ejecutar el job de migración y comprobar `/ready` y los flujos reales. No existe un despliegue remoto verificado de esta entrega.
5. Validar carga, backups/restauración y operación del host. El limitador es local por proceso; una instalación con varias réplicas debe revisar el límite en el proxy. Nitro 3 está fijado a una beta y sus actualizaciones requieren repetir aceptación.

No están implementadas Apple/Google Wallet, subida de archivos de imagen ni lectura QR mediante cámara dentro del navegador. El logo usa una URL HTTPS; el QR personal puede pegarse o entrar desde un lector. Las referencias visuales no se convierten en promesas de estas integraciones.

## Probar sin cuentas ni servicios remotos

Desde la raíz, con Node 24.18.1/npm 12.1.0 y Docker:

```sh
nvm install
nvm use
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:db
npx playwright install chromium
npm run build
npm run test:browser:production
```

El runner levanta y retira PostgreSQL temporal; sus datos y usuarios son sintéticos. Usa los puertos 3100/3101 para aplicación y Auth de pruebas. No utiliza la base de datos del `.env`. Las capturas/trazas quedan en `test-results/`. Para desarrollo del navegador existe `npm run test:browser:db`, que usa Vite en lugar del artefacto compilado.

## Probar manualmente con servicios reales

1. Crear `.env` desde `.env.example` solo si no existe, sin sobrescribir `backend/.env`. Completar las variables; para local usar `APP_ORIGIN=http://localhost:3000`. El entorno del proceso prevalece.
2. Generar una clave privada de cifrado una sola vez y guardarla en CARD_TOKEN_ENCRYPTION_KEY:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

3. En Supabase permitir `http://localhost:3000/api/session/callback`; en producción usar el dominio HTTPS. Confirmación y recuperación PKCE deben completarse en el mismo navegador.
4. Ejecutar `npm run env:check`, revisar el destino DATABASE_URL y aplicar `npm run migrate` cuando ese destino sea el que se desea modificar.
5. Ejecutar `npm run dev` y abrir `http://localhost:3000`. La portada se puede ver antes de configurar los servicios; las operaciones autenticadas los necesitan.
6. Crear cuenta y confirmar correo. En `/app`, crear restaurante, sucursal y programa con meta 2 para una comprobación corta; personalizarlo y compartir el QR.
7. En otro perfil de navegador, abrir `/join/<código>`, entrar como cliente e inscribirse. Abrir `/cards` y obtener su QR privado.
8. Volver al restaurante, abrir Registrar, introducir ese código y registrar dos compras con referencias distintas. Comprobar el premio disponible y confirmar su entrega.
9. Revisar resultados y tarjeta del cliente. Probar invitaciones/permisos, reversión de una compra permitida y cierre con consentimiento explícito.

## Probar el build y desplegar

```sh
npm run build
npm start
```

`/health` comprueba proceso y `/ready` comprueba configuración/conexión. Un `/health` correcto no basta para publicar. Los comandos Docker y el job de migración están en [despliegue](deployment.md). El build Node se valida localmente; una imagen Docker/hosting remoto debe verificarse en su destino. No se ejecutó Docker build en esta sesión.

Los cambios permanecen locales, sin commit/push, y se conservaron los cambios previos del usuario. [AGENTS.md](../AGENTS.md), README y docs registran la transición y la evidencia; los apartados antiguos conservan historial.
