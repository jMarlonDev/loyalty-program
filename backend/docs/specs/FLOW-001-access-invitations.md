# FLOW-001 — Acceso por contexto e invitaciones recuperables

Estado: implementada y verificada en UI. Fecha: 2026-10-18.

## Problema y alcance

Un enlace de invitación abierto en el navegador del dueño conserva su sesión. La pantalla actual solo permite aceptar con esa identidad, y el acceso oculta sus formularios sin ofrecer cambiar de cuenta. Esto impide registrarse con el correo invitado y confunde el acceso al negocio con un rol administrativo global.

Se conserva la identidad de Supabase y los permisos por restaurante. El registro ordinario conduce al espacio de creación de negocio; crear el restaurante concede Owner. El QR de programa conduce al registro/inscripción de cliente, y la invitación al registro/aceptación de personal. Una misma identidad puede cumplir varios papeles. El formulario de restaurante adopta el contrato sin `slug` de la migración de esta sesión.

## Referencias

BR-002, BR-003, BR-004, BR-005, BR-007, BR-008, BR-009, BR-010 y BR-011 de [reglas de negocio](../business-rules.md). [ACCESS-001](ACCESS-001-recorrido-cliente.md) y [SESSION-003](SESSION-003-persistencia.md).

## Contrato

- `POST /api/session` con `action: logout` cierra la sesión real antes de permitir otra identidad. No se edita el correo de la sesión. El cambio de cuenta conserva la ruta de invitación/programa y el destino `next`; ante fallo de transporte se permite reintentar y no se afirma cierre completado.
- Registro/login/Google conservan un `next` local seguro. El contexto invitación explica el correo verificado, el contexto programa explica la tarjeta y el contexto negocio explica el alta del restaurante.
- `POST /api/v1/invitations/accept` conserva `{token}` y la autorización BR-011. No se autoacepta ni se concede personal por registrarse. Un 403 explica revisar cuenta/correo verificado; un 404/409 permite solicitar otra invitación sin revelar identidad ajena.
- `POST /api/v1/restaurants/:id/invitations` conserva `{email,role}`. El correo se introduce explícitamente para la persona invitada; la UI evita una invitación al propio correo y explica que Owner/Admin ya pueden registrar compras. La API sigue siendo autoridad de permisos.
- `POST /api/v1/public/programs/:code/enrollments` sigue siendo explícito e idempotente: abre la tarjeta activa existente o crea la primera. No concede personal ni sellos. La respuesta enlaza `/cards?card=<uuid>`.
- `POST /api/v1/restaurants` envía `{name,email?,phone?}`, sin identificador único manual. El UUID interno se conserva.

## Criterios de aceptación

- AC-001 — Con una sesión previa en acceso, programa o invitación se muestra el correo y se puede usar otra cuenta; el logout real conserva destino/token. Si falla, se muestra error y no se modifica la identidad visualmente.
- AC-002 — Una invitación sin sesión ofrece acceso y creación de cuenta directos hacia el mismo token; registrarse no autoacepta ni añade permisos.
- AC-003 — La pantalla de acceso presenta instrucciones de cliente, personal o negocio según `next`, sin ofrecer cambiar el destino de un QR/invitación. El acceso ordinario conserva la creación del negocio.
- AC-004 — El formulario de equipo permite escribir un correo diferente; rechaza el correo propio normalizado antes de enviar y conserva campos ante error. Crear otra invitación retira la anterior de la vista para evitar compartir el QR equivocado.
- AC-005 — Aceptar invitación conserva la mutación existente y permite recuperación frente a 403 o invitación caducada/revocada. El permiso mostrado tras aceptación procede del servidor.
- AC-006 — Desde el QR del programa, una cuenta identificada puede obtener/abrir su tarjeta y la respuesta enlaza su ID específico sin conceder sellos ni privilegios.
- AC-007 — El formulario de restaurante no contiene identificador único ni envía `slug`. El espacio muestra el correo/rol real y aclara que una cuenta sin restaurantes debe crearlo para ser Owner, o aceptar su invitación si es personal.

## Trazabilidad y validación

| Reglas | Criterio | Nivel / archivo | Evidencia |
| --- | --- | --- | --- |
| BR-008, BR-009, BR-011 | AC-001, AC-002, AC-003 | UI `tests/ui/auth-page.test.tsx`, `tests/ui/enrollment.test.tsx` | RED: botón cambiar cuenta/contextos ausentes. GREEN: logout real, error recuperable, registro y destino conservados. |
| BR-002, BR-003, BR-005, BR-011 | AC-004, AC-005 | UI `tests/ui/management.test.tsx`, `tests/ui/enrollment.test.tsx` | RED: invitación propia enviada y errores genéricos. GREEN: correo ajeno explícito, QR correcto, recuperación 403/409. |
| BR-004 | AC-006 | UI `tests/ui/enrollment.test.tsx` | RED: no se explicaba apertura de tarjeta existente. GREEN: acción explícita y enlace con ID; contrato idempotente conservado. |
| BR-007, BR-010 | AC-007 | UI `tests/ui/management.test.tsx`, `tests/ui/workspace.test.tsx` | RED: campo slug todavía obligatorio. GREEN: payload sin slug; regresión de Owner y Employee correcta. |

Primera ejecución: 11 fallos esperados y 7 pruebas correctas. Verificación de las cuatro suites afectadas: 23/23 correctas con `vitest run tests/ui/auth-page.test.tsx tests/ui/enrollment.test.tsx tests/ui/management.test.tsx tests/ui/workspace.test.tsx --maxWorkers=1`. Tipos raíz (`tsc --noEmit`) correctos. La primera ejecución GREEN paralela sufrió timeout de arranque de tres workers y se repitió con un worker; no se atribuyó ese fallo al producto. Los checks globales y navegador corresponden al cierre coordinado de la sesión.

## Preguntas y riesgos

No se redefine la verificación de correo ni se permite aceptar la invitación con otra identidad. Google/SMTP reales y disponibilidad HTTPS dependen de configuración externa. Los errores de conectividad móvil y refresco de sellos se abordan en el trabajo coordinado de QR, sin ampliar esta spec.
