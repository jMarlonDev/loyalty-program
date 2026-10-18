# loyalty-program

Sistema de fidelización para restaurantes: programas por compras, tarjetas digitales con sellos, premios y operaciones auditadas.

## Stack y estructura

Aplicación fullstack **TanStack Start + React**, TanStack Router/Query, componentes **shadcn/ui**, Tailwind CSS y diseño móvil guiado por Impeccable. Un servidor Node sirve la interfaz SSR y los contratos HTTP. PostgreSQL, Drizzle y Supabase Auth conservan las reglas de negocio existentes.

- `src/routes`: páginas y rutas servidor Start.
- `src/features`, `src/components`: interfaces de restaurante y cliente, editor de tarjetas y QR.
- `src/server`: sesión HttpOnly, PKCE, puente API y composición.
- `backend/src`: dominio, casos de uso, persistencia y contratos Web Request/Response.
- `backend/db`, `backend/drizzle`: esquema e historial SQL preservado.
- `tests`: UI, sesiones y navegador; `backend/tests`: dominio, PostgreSQL y HTTP.
- `PRODUCT.md`, `DESIGN.md`: contexto y sistema visual; `docs/migration-harness.md`: integración y evidencia.

## Preparar y ejecutar

Node **24.18.1**, npm **12.1.0**; `.nvmrc` y manifests fijan las versiones. Instalar una sola vez desde la raíz:

```sh
nvm install
nvm use
npm ci --ignore-scripts --no-audit --no-fund
npm run env:check
npm run dev
```

Abrir `http://localhost:3000`. Copiar `.env.example` a `.env` **solo si no existe**, completar las variables e indicar `APP_ORIGIN=http://localhost:3000`. El `.env` anterior de backend se conserva como fallback; variables del host prevalecen. La portada y la demostración son accesibles sin configuración externa; las operaciones reales requieren PostgreSQL migrado y Auth configurado.

Si no puedes crear cuentas o ver tarjetas, sigue [la configuración paso a paso de Supabase y Google](docs/supabase-setup.md): entorno, URLs de retorno, Email/SMTP, Google Cloud, migraciones y recorrido de inscripción. Google utiliza Supabase Auth; no necesita un segundo sistema de sesiones. Crear una cuenta no crea tarjetas hasta inscribirse en un programa.

## Móvil, QR y continuidad de sesión

Los QR compartidos usan `APP_ORIGIN`. Con localhost aparece un aviso porque el enlace no funciona fuera del computador. Para abrirlo desde cualquier lugar necesitas desplegar el servidor con HTTPS: [pasos de publicación y configuración](docs/deployment.md#acceso-desde-celulares-fuera-de-la-red-local).

El cliente abre su tarjeta directamente en `/cards?card=...`. El empleado puede escanear desde Operaciones o abrir el QR con la cámara del teléfono; `/scan` conserva la tarjeta durante el acceso y abre el formulario tras validar permisos. Confirmar una compra sigue siendo necesario para sumar un sello. La sesión se renueva automáticamente; los fallos temporales ofrecen reintento sin fingir cierre.

`npm run env:check -- --public` valida el origen para despliegue; no verifica conexión, DNS ni OAuth. La URL pública todavía no existe en este entorno.

## Verificar

```sh
npm run build
npm run check
npm run test:db
npx playwright install chromium
npm run test:browser:db
npm run test:browser:production  # requiere build previo
npm run db:check
npm run generate
```

`check` incluye formato, tipos y tests de UI/sesión/tooling/unidad. `test:db` ejecuta las suites con PostgreSQL17 temporal. `test:browser:db` levanta DB temporal, proveedor Auth exclusivo de tests y aplicación Start; necesita Docker y Chromium. Ambos retiran sus recursos. El proveedor simulado de tests no sustituye validar Google y correo reales. No se usa la BD del `.env` en pruebas.

## Desplegar

```sh
npm run build
npm run migrate  # modifica DATABASE_URL: revisar destino e historial antes
npm start
```

`npm start` ejecuta `.output/server/index.mjs`; Dockerfile incluye build, job de migración explícito y runner no privilegiado. [Guía de despliegue](docs/deployment.md): variables, Docker, Supabase Auth, salud, verificación y límites. La aplicación no migra la base automáticamente al arrancar.

## Negocio y coordinación

[Contexto canónico](backend/docs/index.md), [reglas de negocio](backend/docs/business-rules.md), [estado y evidencia](backend/docs/development-status.md), [coordinación de migración](docs/migration-harness.md). Leer `AGENTS.md` antes de modificar. El cambio de framework conserva permisos, aislamiento, condiciones fijas, idempotencia y contabilidad. No se ofrecen integraciones Apple/Google Wallet no implementadas.

El lockfile raíz es la única autoridad de instalación. Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). No versionar secretos, dependencias o artefactos generados.

Análisis completo de entrega, limitaciones y recorrido manual: [estado y guía de prueba](docs/project-review-2026-10-18.md).
