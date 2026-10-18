# AUTH-002 — Diagnóstico de acceso y retorno de autenticación

Estado: implementada localmente para corrección solicitada por el usuario. Fecha: 2026-10-18.

## Problema y alcance

El usuario informa que no puede crear cuentas ni acceder a sus tarjetas. La configuración externa incompleta requiere pasos operativos; la aplicación debe distinguir fallos recuperables y permitir reintentar un acceso sin dejar al usuario en una respuesta JSON del callback. No se cambia el proveedor de identidad ni se ejecutan migraciones remotas.

## Referencias

BR-004, BR-008, IDENTITY-001 y STACK-001. Códigos del proveedor contrastados con [Supabase Auth](https://supabase.com/docs/guides/auth/debugging/error-codes).

## Contrato

- `POST /api/session`: conserva payloads; errores conocidos de Supabase devuelven códigos públicos estables y mensajes propios. `email_not_confirmed` → 401 `EMAIL_NOT_CONFIRMED`; `signup_disabled` → 503 `SIGNUP_DISABLED`; proveedor email deshabilitado o dirección no autorizada por SMTP → 503 `EMAIL_PROVIDER_ERROR`; contraseña débil → 400 `WEAK_PASSWORD`; límites → 429 `RATE_LIMITED`. Credenciales inválidas mantienen rechazo genérico sin revelar existencia de cuentas.
- `GET /api/session/callback`: errores redirigen con 302 a `/auth?error=<código>&next=<ruta-local>`. Códigos permitidos: `AUTH_CANCELLED`, `AUTH_LINK_EXPIRED`, `AUTH_UNAVAILABLE`. Nunca reproduce el mensaje, descripción o tokens recibidos del proveedor. Limpia cookies PKCE/next; conserva una sesión previa.
- Configuración runtime inválida/ausente: 503 `CONFIGURATION_ERROR` con mensaje fijo orientado a la preparación; errores inesperados siguen siendo 503 `SERVICE_UNAVAILABLE` sin secretos. No se separa la sesión del runtime: la aplicación requiere DB y clave de tarjetas para continuar el flujo.
- Si falla el runtime al abrir `GET /api/session/google`, se devuelve al formulario con 302 y `AUTH_UNAVAILABLE`, conservando únicamente un `next` local validado. No se inicia OAuth ni se crean cookies.

## Criterios de aceptación

- AC-001 — Los códigos conocidos generan una explicación útil sin copiar contenido externo; errores desconocidos y JSON inválido conservan mensaje seguro.
- AC-002 — Callback cancelado, expirado o no disponible devuelve al formulario conservando un destino local y limpiando PKCE; no llama al intercambio ante errores explícitos ni ausencia de datos.
- AC-003 — Una configuración incompleta se distingue de una caída temporal sin divulgar valores privados ni crear cookies de sesión.
- AC-004 — Abrir Google con el runtime sin configurar conserva la navegación del formulario y el destino local.

## Trazabilidad y validación

| Regla / criterio | Nivel | Pruebas | Evidencia |
| --- | --- | --- | --- |
| BR-008 / AC-001 | servidor con doble HTTP | tests/server/supabase-auth.test.ts | RED: ocho casos perdían código/estado; GREEN con catálogo explícito y JSON de proveedor no confiable |
| BR-004, BR-008 / AC-002 | servidor con doble de identidad | tests/server/session.test.ts | RED: seis callbacks devolvían 400/401/503 JSON; GREEN 302 con código estable, next local y limpieza PKCE |
| STACK-001 AC-006 / AC-003 | composición servidor | tests/server/runtime.test.ts | RED: SERVICE_UNAVAILABLE ocultaba preparación incompleta; GREEN CONFIGURATION_ERROR sin valores |
| BR-004, BR-008 / AC-004 | composición servidor | tests/server/runtime.test.ts | RED: dos inicios Google devolvían 503 JSON; GREEN 302 con destino local o /app |

Ejecución posterior: `npx vitest run --project server`, 61/61 en siete archivos; Biome correcto sobre archivos modificados. La prueba de composición sustituye dotenv para no leer credenciales de desarrollo. Comprobación global delegada al cierre principal.

## Preguntas y riesgos

Los dobles no prueban OAuth Google ni SMTP reales. Configuración y migraciones remotas siguen siendo pasos operativos separados; no se afirman cuentas reales creadas ni datos remotos modificados.
