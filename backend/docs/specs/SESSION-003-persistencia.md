# SESSION-003 — Continuidad de sesión en móviles

Estado: implementada localmente por solicitud del usuario, 2026-10-18.

## Problema y alcance

Mantener acceso entre visitas y al regresar de suspensión del móvil. Un fallo de red o del perfil no equivale a logout. BR-004 y BR-008; permisos BR-005 permanecen en el servidor.

## Contrato

Se conservan rutas y JSON de sesión. Logout que elimina cookies pero falla al revocar proveedor añade `X-Session-Cleared: 1`, para distinguirlo de fallos anteriores al handler. Cookie refresh HttpOnly con duración renovable de 400 días; access conserva la expiración del proveedor. Renovación automática cada cuatro minutos con página visible y al volver a foco/conexión. Una respuesta 401 se reintenta una vez renovando cookies. Fallos temporales del refresh conservan estado y se presentan como error recuperable, no como 401 definitivo. Logout elimina estado tras respuesta del servidor; fallo de transporte permite reintentar sin fingir cierre. Exclusión de renovación/logout con Web Locks cuando disponible; single-flight por pestaña y comunicación de cierre sin tokens mediante BroadcastChannel. No se almacenan tokens en JavaScript/localStorage. No se configura ni modifica Supabase remoto.

## Criterios de aceptación

- AC-001: al abrir con access caducado y refresh válido, restaura usuario sin formulario; cookie refresh sobrevive cierre del navegador.
- AC-002: error de red/proveedor/perfil conserva identidad ya validada; fallo inicial permite reintentar; solo refresh 401 definitivo invalida sesión.
- AC-003: regresar al foco, recuperar conexión y temporizador visible renuevan automáticamente, sin llamadas concurrentes duplicadas ni bucles.
- AC-006: en el primer acceso, crear/consultar el perfil antes de habilitar consultas de tarjetas; si falla, conservar identidad validada con error recuperable. Logout elimina también el QR pendiente aunque /scan no esté montado.
- AC-005: una identidad validada muestra continuar en /auth, sin formularios de login/registro; recuperación y cambio de contraseña siguen disponibles. Un fallo inicial muestra reintento sin sugerir cierre.
- AC-004: logout exitoso limpia usuario/caché y comunica cierre a otras pestañas; una lectura anterior no restaura usuario tras cierre; fallo de transporte no afirma logout.

## Trazabilidad y validación

| Regla / criterio | Nivel | Pruebas | Evidencia |
| --- | --- | --- | --- |
| BR-008 / AC-001 | servidor | session.test.ts | RED: cookie 30 días; GREEN: 400 días renovables |
| BR-004, BR-008 / AC-002–004 | UI/HTTP aislado | auth-provider.test.tsx, auth-fetch.test.ts | RED: siete casos de UI y refresh 503 fallaban; GREEN: identidad conservada, renovación y logout coherentes |

## Riesgos y límites

Supabase puede revocar sesiones por seguridad o límites configurados; el usuario puede borrar cookies y el navegador limitar persistencia. No es promesa de sesión infinita. [Documentación oficial](https://supabase.com/docs/guides/auth/sessions): duración por defecto indefinida y rotación de refresh; mantener detección de reutilización. Pruebas aisladas no acreditan OAuth real.

Evidencia adicional: RED en 503 previo al handler confundido con cookies eliminadas y ausencia de confirmación servidor; GREEN con cabecera explícita. Comando focal: `npx vitest run tests/ui/auth-provider.test.tsx tests/server/auth-fetch.test.ts tests/server/session.test.ts`, 41 pruebas correctas. Verificación global al cierre principal.

Integración principal: RED en formulario de login mostrado con sesión, consulta de tarjetas anterior al alta del perfil y QR pendiente no eliminado fuera de /scan. GREEN con continuación autenticada, perfil resuelto antes de habilitar consultas y limpieza central en logout. El fallo real de navegador «No existe el perfil» motivó la regresión de orden; el fallo de perfil sigue conservando identidad validada.
