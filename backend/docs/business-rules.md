# Reglas de negocio — fuente de verdad

Estado: reglas confirmadas por el usuario el 2026-10-18. Este documento gobierna el comportamiento; el JSON describe estructura de datos, no permisos. Las specs enlazan estos IDs sin copiarlos como nuevas reglas.

| ID | Regla confirmada |
| --- | --- |
| BR-001 | Cada restaurante define programas por compras; el cliente acumula sellos en una tarjeta digital y obtiene un premio al alcanzar la meta. |
| BR-002 | El administrador crea programas y personaliza la tarjeta; registra personal y asigna roles. |
| BR-003 | Owner es el dueño. Admin puede ser el dueño o un empleado con permisos administrativos dentro del negocio. Employee tiene los permisos limitados descritos aquí. No se asume acceso entre restaurantes. |
| BR-004 | El cliente abre el QR/enlace del programa, se registra manualmente con correo y contraseña o usa Google, y participa en el programa para disponer de su tarjeta. Ambos métodos convergen en la misma inscripción autenticada. El frontend genera y muestra el QR/enlace; el backend valida la inscripción. |
| BR-005 | Admin y Employee autorizados pueden sumar sellos por compras. El cliente no puede otorgarse sellos. Registrarse como empleado no concede permisos automáticamente. |
| BR-006 | Admin y Employee pueden eliminar una tarjeta únicamente si el cliente lo decide y confirma la operación. La autorización por rol no sustituye la confirmación del cliente. Esta aclaración prevalece sobre la descripción inicial más amplia de eliminación de registros. |
| BR-007 | Employee no recibe otros permisos administrativos. No puede crear programas, asignar roles ni eliminar otros registros por inferencia. |

## Decisiones confirmadas durante la planificación — 2026-10-18

Estas decisiones amplían las reglas anteriores. BR-010 precisa la asignación de roles de BR-002; BR-015 autoriza expresamente el canje por Employee sin conceder otros permisos administrativos.

| ID | Regla confirmada |
| --- | --- |
| BR-008 | Supabase Auth administra identidad, sesiones, verificación de correo y recuperación. El acceso manual usa correo y contraseña; Google OAuth es una alternativa de registro e inicio de sesión para los clientes. |
| BR-009 | Una identidad puede ser cliente y personal de varios restaurantes, con permisos independientes en cada negocio. |
| BR-010 | El restaurante se crea por autoservicio y su creador queda como Owner. Owner conserva las operaciones administrativas y gestiona Admin/Employee; Admin incorpora y gestiona únicamente Employee. |
| BR-011 | El personal acepta un enlace de invitación vinculado a correo y rol, autenticándose con ese correo verificado. El restaurante comparte el enlace; no se requiere envío propio de correo de invitación. |
| BR-012 | Los programas y tarjetas funcionan en todas las sucursales activas del restaurante; el personal autorizado opera en todo ese restaurante. |
| BR-013 | Cada compra concede exactamente un sello. Se exige referencia de venta única por sucursal y protección contra reintentos técnicos. |
| BR-014 | Al alcanzar la meta se descuentan los sellos necesarios y se genera automáticamente un premio disponible. La misma tarjeta continúa acumulando y conserva excedentes. |
| BR-015 | Owner, Admin y Employee activos y autorizados pueden registrar la entrega del premio; el cliente no puede autocanjear. La entrega no vuelve a descontar sellos. |
| BR-016 | Sellos y premios no vencen por tiempo. Finalizar el programa impide nuevas compras pero permite entregar premios ya obtenidos. |
| BR-017 | Owner/Admin puede revertir una compra con motivo mediante movimientos compensatorios. Se rechaza la reversión si afecta un premio ya entregado; no se elimina el historial original. |
| BR-018 | Meta y descripción del premio quedan fijas desde la primera inscripción. Después solo se editan nombre, descripción general y diseño; cambiar las condiciones exige otro programa. |
| BR-019 | La personalización inicial comprende logo por URL HTTPS, color de fondo, color de texto y mensaje corto, sin subida de archivos ni editor visual. |
| BR-020 | El titular confirma el cierre desde su cuenta autenticada; Admin/Employee autorizado lo ejecuta como cierre lógico, conservando compras, contabilidad y premios históricos. Owner hereda esta operación administrativa. |
| BR-021 | La confirmación muestra los beneficios que se perderán. Al cerrar se cancelan premios pendientes y se anula el saldo. Una futura inscripción comienza desde cero. |

## Especificación y valores de diseño

El [plan BACKEND-001](specs/BACKEND-001-plan-de-negocio.md) concreta orden, contratos, atomicidad, pruebas y valores por defecto. Las respuestas explícitas del usuario se registran arriba; los valores de diseño del plan se distinguen de esas respuestas. La solicitud vigente del 2026-10-18 autoriza desarrollo por tareas delegadas, TDD y commits. No autoriza cambios remotos en Supabase.

Antes de implementar cada módulo se derivará su spec con contratos completos y trazabilidad BR → AC → pruebas. La configuración OAuth requiere credenciales y URLs del entorno, que no se incluyen en documentación. Cambios futuros de reglas deben actualizar primero este documento y la spec afectada.
