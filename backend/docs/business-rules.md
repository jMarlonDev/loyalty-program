# Reglas de negocio — fuente de verdad

Estado: reglas confirmadas por el usuario el 2026-10-18. Este documento gobierna el comportamiento; el JSON describe estructura de datos, no permisos. Las specs enlazan estos IDs sin copiarlos como nuevas reglas.

| ID | Regla confirmada |
| --- | --- |
| BR-001 | Cada restaurante define programas por compras; el cliente acumula sellos en una tarjeta digital y obtiene un premio al alcanzar la meta. |
| BR-002 | El administrador crea programas y personaliza la tarjeta; registra personal y asigna roles. |
| BR-003 | Owner es el dueño. Admin puede ser el dueño o un empleado con permisos administrativos dentro del negocio. Employee tiene los permisos limitados descritos aquí. No se asume acceso entre restaurantes. |
| BR-004 | El cliente se registra y participa en un programa para disponer de su tarjeta. El backend expondrá una API de registro; el frontend genera y muestra el QR/enlace de acceso. No hay endpoints implementados aún. |
| BR-005 | Admin y Employee autorizados pueden sumar sellos por compras. El cliente no puede otorgarse sellos. Registrarse como empleado no concede permisos automáticamente. |
| BR-006 | Admin y Employee pueden eliminar una tarjeta únicamente si el cliente lo decide y confirma la operación. La autorización por rol no sustituye la confirmación del cliente. Esta aclaración prevalece sobre la descripción inicial más amplia de eliminación de registros. |
| BR-007 | Employee no recibe otros permisos administrativos. No puede crear programas, asignar roles ni eliminar otros registros por inferencia. |

## Decisiones pendientes antes de implementar la funcionalidad afectada

- Autenticación de clientes/personal, verificación de identidad, invitaciones y alta inicial de Owner.
- Forma de capturar, vincular y verificar la confirmación del cliente para BR-006; borrado lógico/físico y conservación de compras/contabilidad.
- Cantidad de sellos por compra, comprobante, duplicados, correcciones, concurrencia e idempotencia.
- Canje: quién lo ejecuta, cuándo se descuentan sellos, renovación de tarjeta, expiración, cancelación y excedentes.
- Campos de personalización: el JSON no los define todavía.
- Multipertenencia, sucursales, restricciones de unicidad de membresía y personal, aislamiento consistente de entidades del mismo restaurante.
- Contrato HTTP: rutas, payloads, errores, paginación, versionado y enlace público para el QR.

No resolver estos puntos añadiendo comportamiento silenciosamente. Una spec puede avanzar en partes independientes y marcar las decisiones que bloquean sus criterios de aceptación.
