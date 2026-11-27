# DB-006 — Transición compatible a clientes por teléfono

Fecha: 2026-10-19. Estado: inventario y preparación local autorizados; diseño de expansión sujeto a los contratos P0 y a D-01–D-05. Ninguna conversión de datos reales ni retirada autorizada por esta decisión.

## Base y consumidores revisados

La base local es `schema.ts` y las migraciones 0000–0004, con dieciséis tablas. `0000_snapshot.json` conserva el modelo original; no se recrea el JSON eliminado ni se reescribe SQL aplicado. Este inventario procede del repositorio, no de Supabase.

| Datos | Consumidores y dependencia que debe preservarse |
| --- | --- |
| `users`, `memberships.user_id` | `profile-repository.ts`, `programs-repository.ts`, `loyalty-repository.ts`: cliente y cuenta de personal comparten UUID. `users.phone` admite nulos y no tiene prueba de posesión. No autoriza recuperar una tarjeta. |
| `roles`, `restaurant_employees.role_id` | `staff-access.ts`, `staff-repository.ts`, contratos HTTP y UI: los permisos heredados consultan el catálogo. Eliminarlo antes de cambiar consumidores rompería autorización. |
| `invitations.role_id`, `invited_by` | Invitación heredada ligada al rol y al empleado emisor. Conservar para auditoría; no convertir invitaciones de administrador en propiedad. |
| `locations`, `purchases.location_id` | Unicidad comercial `(location_id, sale_reference)`; canjes y auditoría conservan ubicación. Ocultar sucursales no cambia el ámbito de una venta. |
| `memberships`, `loyalty_cards` | Inscripción abierta única por usuario/programa, tarjeta única por inscripción, token hash único y copia cifrada. Mantener IDs y QR existentes. |
| `rewards`, `loyalty_ledger_entries`, `reward_purchase_allocations` | El repositorio descuenta N al generar el premio heredado. Asignaciones activas únicas por compra y FK compuestas impiden mezclar membresías. Un premio disponible puede coexistir con excedentes y otros premios. |
| `closure_consents`, `idempotency_records`, `audit_events` | Actor actualmente ligado a `users`; no convertir cliente telefónico en cuenta de personal para satisfacer una FK. Mantener consentimiento e historial. |

Todas las tablas tienen RLS habilitado, sin políticas de cliente; DB-004 mantiene acceso reservado al servidor. Las FK usan NO ACTION. Los UUID y fechas nuevos se proporcionan explícitamente; no inventar datos para filas históricas.

## Propuesta de expansión

Esta tabla define la dirección del modelo, no declara el DDL implementado. La spec del módulo fija el contrato final antes de generar 0005 o posteriores. Los campos opcionales permiten coexistencia mientras se reclama y concilia cada identidad.

| Tabla/cambio | Campos e integridad propuestos | Condición |
| --- | --- | --- |
| `customers` nueva | UUID PK, teléfono E.164 verificado único, `phone_verified_at`, estado y fechas; sin correo/contraseña obligatorios. Teléfono no es secreto ni PK. | D-01 define la prueba; un regex de formato no prueba validez ni posesión. |
| `customer_sessions` nueva | UUID PK, `customer_id` FK, `token_hash` único, emisión/uso/vencimiento/revocación; índice por cliente y vencimiento. Secretos de 256 bits, nunca texto del token. Vencimiento posterior a emisión. | Política de renovación/rotación definida en spec de sesión; no borrar tarjetas al expirar. |
| Desafíos de verificación | UUID, propósito, destino protegido, hash/HMAC del código, vencimiento, intentos, consumo y controles de reenvío. | D-01/proveedor; separar caducidad del desafío de los 400 días de sesión. |
| Asociación cuenta-cliente | Relación única con `user_id`, `customer_id`, instante y evidencia de verificación; preserva cuentas mixtas y control de autooperación. | Nunca poblarla por coincidencia de teléfono autodeclarado. |
| `restaurants.owner_user_id` | FK nullable durante expansión; conservar propietario histórico solo tras comprobar unicidad/elegibilidad. | Cero o varios owners produce conflicto; admin no implica dueño. |
| Vínculo de operador | Conservar `restaurant_employees.id` utilizado por compras/canjes; añadir autorización explícita separada del rol heredado. | D-02; dueño no recibe caja automáticamente. Retirar rol solo tras conversión y cambio de consumidores. |
| `memberships.customer_id` | FK nullable y `user_id` nullable durante coexistencia; CHECK al menos una identidad; índice único parcial `(customer_id, program_id)` donde no esté cerrada y cliente no sea nulo. | Una reclamación exige sesión heredada y teléfono verificado; no fusionar membresías al detectar duplicados. |
| `loyalty_cards.version` | Entero monotónico no negativo inicial 0; aumenta junto con operación y outbox. | No usar el saldo como versión; publicación posterior al commit. |
| Ciclos | UUID, membresía, ordinal y estado; unicidad membresía/ordinal; meta congelada y fechas. Asociaciones consistentes a compras/premio. | D-03; no asignar arbitrariamente excedentes o premios heredados a un ciclo nuevo. |
| `rewards.accounting_mode` | Distinguir `legacy_debited` de `debit_on_redemption`. Marca heredada solo tras reconciliación demostrable; premio nuevo exige modo explícito. | Canje heredado nunca descuenta de nuevo. Un valor por defecto no sustituye reconciliación. |
| Comprobantes de premio | UUID, premio/membresía, versión, hash único, token cifrado para reenvío, emisión/vencimiento, consumo/revocación; único comprobante activo por premio. | Expiración técnica no cancela beneficio; FK compuesta premio/membresía y propósito separado de QR de tarjeta. |
| Outbox | UUID, evento/tarea, agregado y versión, payload mínimo, estado, disponibilidad, intentos y lease; unicidad de evento/tarea lógica; índices para recuperar pendientes. | WebSocket sin teléfono ni token; envío WhatsApp referencia a datos protegidos, nunca token legible en logs. D-04 antes de destinatario real. |

Los nuevos actores de cliente requieren persistencia de idempotencia/auditoría con FK verificables (tablas propias o columnas con CHECK de exactamente un actor). No utilizar UUID de `customers` en FK de `users`. Mantener los índices existentes y RLS sin políticas públicas; revocar grants `anon`/`authenticated` en tablas nuevas cuando esos roles existan. No introducir unicidad de programa activo por restaurante hasta D-05.

## Expansión técnica 0005 aceptada

La coordinación autoriza esta parte independiente de D-01–D-05, bajo [NEXT-005](../specs/NEXT-005-data-transition.md). No se añaden todavía clientes, desafíos, ciclos ni nuevas autorizaciones:

- `restaurants.owner_user_id`: UUID nullable, FK NO ACTION a users; ningún backfill ni consumidor de permisos nuevo.
- `loyalty_cards.version`: entero obligatorio con default 0 y CHECK no negativo. No deriva saldo de la versión.
- `rewards.accounting_mode`: obligatorio, valores `legacy_debited` y `debit_on_redemption`. Default `legacy_debited` exclusivamente para mantener la aplicación heredada durante coexistencia; el flujo nuevo deberá escribir explícitamente su modo. Antes de añadir el marcador, un guard rechaza premios disponibles/canjeados cuyo débito neto no sea -N, cuyo origen negativo no sea -N o cuyas asignaciones totales/activas difieran de N. Los cancelados exigen origen negativo -N, N asignaciones totales y cero activas; no exige débito neto cero porque el cierre consentido conserva el débito y la reversión lo compensa. No escribe ni reconstruye movimientos.
- `card_events_outbox`: `id` UUID PK, `card_id` FK NO ACTION, `version` entero > 0, `type` entre `purchase.recorded`, `reward.available`, `reward.redeemed`, `card.changed`; `occurred_at`/`available_at` explícitos, `attempts` >= 0 default 0, `lease_token` UUID y `lease_until` juntos nulos o presentes, `published_at` nullable. UNIQUE `(card_id,version)` fija una invalidación por transacción. Índice parcial `(available_at,lease_until)` sobre no publicados. No payload, teléfono o secretos; el evento público se construye con id/tarjeta/versión/tipo. RLS habilitado sin políticas y permisos públicos/anon/authenticated revocados.

El historial anterior permanece intacto. El guard es conservador y puede bloquear una copia inconsistente; el informe 0004 identifica los casos antes del intento y no los repara. Una marca de modo por sí sola no implementa el canje nuevo, el incremento de versión o el worker. La aplicación heredada sigue creando premios debitados y no publica eventos hasta su adaptación transaccional.

## Informe previo y conciliación

[DATA-NEXT-001](../specs/DATA-NEXT-001-transition-report.md) gobierna una herramienta de inventario de solo lectura contra una copia PostgreSQL local explícita. Produce conteos, balances por UUID y conflictos sin nombres, teléfonos, correos, tokens ni URLs. Clasifica campos ausentes/no canónicos, coincidencias exactas de teléfonos canónicos, identidad sin posesión demostrable, cuentas mixtas, propietarios ambiguos, administradores heredados y programas múltiples. También detecta contabilidad incompleta, saldo negativo, premios disponibles ya debitados y excedentes que deben conservarse.

El informe no es un conversor y un informe sin conflictos no autoriza migrar producción. No verifica teléfonos contra un proveedor ni reconstruye historia ausente. Detecta únicamente duplicados ya canónicos; números en formatos distintos requieren revisión posterior con validación de país. Las membresías cerradas también conservan historial.

Conversión futura: snapshot verificable → expansión → mapa explícito de propietarios y reclamaciones → conciliación de compras/movimientos/premios → cambio de aplicación → retirada. Cada ejecución debe ser repetible y devolver conflictos; nunca adivinar identidad, referencias de venta, asignaciones o consentimiento. Guardar comparaciones por membresía de saldo, compras, premios por estado y asignaciones activas. Un error revierte todo el lote afectado.

## Ensayo local y límites

Para validar la migración futura: restaurar una copia sintética 0004, conservar reporte previo, aplicar expansión dos veces, comparar invariantes y probar FK/índices/RLS; ejecutar operaciones nuevas y restaurar el respaldo en otra base temporal. El rollback preferido es aplicación compatible con columnas añadidas; no borrar información nueva como supuesto rollback. El informe se prueba ahora en PostgreSQL aislado y no acredita el ensayo de backup/restore ni una migración que todavía no existe.

No se leen `.env` ni destinos remotos. No se modifican usuarios Auth, datos de Supabase o mensajes reales. La retirada de `roles`, columnas y rutas queda condicionada a P9, consumidores migrados y conciliación completa.
