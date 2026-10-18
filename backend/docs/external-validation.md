# Validación externa — 2026-10-18

> Informe histórico anterior a las correcciones de acceso móvil y sesión. Las cifras, configuración y limitaciones describen aquella revisión; consultar el [estado vigente](development-status.md) para los cambios posteriores.

Resultado: Supabase consultado sin modificaciones; se detectaron impedimentos reales para validar Google, correo y despliegue de extremo a extremo. La suite local previa de 400 pruebas no sustituye estas comprobaciones externas.

## Supabase: evidencia de solo lectura

Conexión al destino de `DATABASE_URL` existente. Todas las consultas SQL se ejecutaron con `default_transaction_read_only=on` y `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`; `SHOW transaction_read_only` confirmó `on`. Cierre mediante ROLLBACK. No se ejecutaron migraciones ni DDL/DML.

| Comprobación | Resultado |
| --- | --- |
| Tablas de negocio en public | 11 |
| Claves foráneas / primarias | 16 / 11 |
| UNIQUE / CHECK | 4 / 13 |
| Filas en tablas de negocio | 0 en cada una de las 11 tablas |
| Historial Drizzle | 1 registro; hash coincide con `0000_initial.sql` |
| RLS | Habilitado en las 11 tablas observadas |
| Usuarios de Supabase Auth | 0; correos confirmados 0; proveedor principal Google 0 |
| Migraciones pendientes | `0001_functional_backend`, `0002_private_business_tables`, `0003_legacy_accounting_guard` |

El inventario estructural y la migración aplicada coinciden con el estado inicial documentado. Esta sesión no modificó Supabase. Sin una instantánea anterior completa no se afirma equivalencia histórica de cada configuración externa. El backend actual requiere las migraciones pendientes; no se aplicaron porque la solicitud fue de validación, no de modificación del destino remoto.

## Google y correo reales

El origen HTTPS de Auth se dedujo de la referencia del proyecto en la conexión PostgreSQL, sin guardar ni imprimir credenciales. Las peticiones HTTP no siguieron redirecciones.

- `GET /auth/v1/authorize?provider=google`: HTTP 400, `validation_failed`; respuesta indica que el proveedor no está habilitado. No hubo redirección a Google ni inicio de sesión.
- `GET /auth/v1/health` y `GET /auth/v1/settings` sin clave pública: HTTP 401. Esto demuestra que esas consultas requieren credenciales de API; no demuestra una caída de Auth ni la configuración de correo.
- No existe `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` ni alternativa `SUPABASE_ANON_KEY` en la configuración local efectiva revisada.
- Sin cuenta de prueba, bandeja accesible ni sesión real. No se enviaron correos, se crearon usuarios ni se intentaron contraseñas.

Para verificar Google se necesita habilitar/configurar el proveedor y sus URI de retorno, además de completar el flujo interactivo con una cuenta de prueba. Referencia: [Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google) y [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

Para verificar correo se necesita conocer la configuración efectiva de envío y disponer de una bandeja de prueba: comprobar recepción, confirmación, sesión verificada y recuperación. La configuración SMTP no pudo inspeccionarse y no se declara válida. Referencia: [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Despliegue

- `npm run build`: satisfactorio.
- `npm start` con la configuración disponible: salida 1, mensaje seguro `Server startup failed; verify configuration`.
- Validación directa de configuración: `Missing configuration: SUPABASE_URL`.
- También faltan clave pública de Supabase y `CARD_TOKEN_ENCRYPTION_KEY`. No se generó ni reemplazó ninguna clave existente.
- No se proporcionó URL del backend desplegado. No se comprobó un servidor externo, TLS, CORS de producción ni `/health`/`/ready` remotos.

No se considera el backend desplegado ni listo para producción. La compilación es correcta, pero el arranque local con configuración real está bloqueado y el esquema remoto aún es anterior al código actual.

## Información necesaria para continuar

1. URL del backend desplegado y entorno que se debe comprobar.
2. Configurar localmente `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY`) y una `CARD_TOKEN_ENCRYPTION_KEY` válida y estable; no compartir secretos en el chat.
3. Google habilitado y configuración de correo/retorno preparada, con cuenta y bandeja de prueba accesibles para el flujo real.
4. Autorización específica para aplicar migraciones pendientes al destino remoto antes de validar operaciones funcionales allí; no sustituirlo por pruebas que escriban contra el esquema incompleto.

Tras disponer de ello: verificar configuración de Auth, completar correo/Google, comprobar identidad en `/auth/v1/user`, validar endpoints remotos y registrar los datos de prueba creados para su limpieza acordada. Hasta entonces esos criterios permanecen pendientes, con causas identificadas.
