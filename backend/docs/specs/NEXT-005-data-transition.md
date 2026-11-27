# NEXT-005 — Expansión y conversión conservadora de datos

Estado: expansión técnica 0005 aceptada para implementación/pruebas locales; conversión y retirada pendientes. Fecha: 2026-10-19.

## Problema y alcance

El sistema anterior asocia tarjetas a usuarios de correo, asigna roles al personal y ya debita sellos al crear premios. El modelo nuevo separa cliente telefónico, propietario y operador, y debita premios nuevos al entregarlos. Migrar sin contabilidad explícita causaría pérdida de beneficios o doble débito. P1 prepara estructuras e inventario; P9 solo retira consumidores después de conversión conciliada. No aplicar esta migración a Supabase/datos reales por autorización histórica de 0004.

## Referencias

[LOYALTY-NEXT-001](../../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente), NC-005/006/009/010, AC-13; BR-003/009/012–018/020–025/027–031 de [reglas](../business-rules.md); [NEXT-001](NEXT-001-phone-identity.md), [NEXT-002](NEXT-002-operators.md), [NEXT-003](NEXT-003-cycles-redemption.md), [NEXT-004](NEXT-004-realtime.md). [DB-006](../decisions/DB-006-phone-customer-transition.md) y [DATA-NEXT-001](DATA-NEXT-001-transition-report.md) concretan expansión e informe inicial; no describen un conversor completo.

## Contrato

### Primera migración técnica, independiente de D-01–D-05

Se crea una nueva migración local 0005; no modificar 0000–0004 ni usar `drizzle push`. Generar SQL/snapshot/journal desde esquema, revisar DDL y ejecutar sobre PostgreSQL temporal con fixture 0004. Esta expansión no activa nuevas rutas, no transforma identidades y no borra ni vuelve a acreditar movimientos.

| Cambio aditivo autorizado | Restricción y compatibilidad |
| --- | --- |
| `restaurants.owner_user_id` nullable, FK a users | No backfill automático, sin asumir que Admin es dueño. Null significa ownership directo aún no conciliado; aplicación antigua sigue funcionando mientras nuevas rutas requieren valor validado. |
| `loyalty_cards.version` entero no negativo, not null default 0 | No reescribir movimientos; la nueva aplicación incrementará en la misma transacción de cambios. Código anterior conserva 0 hasta su cambio explícito. |
| `rewards.accounting_mode` texto not null default `legacy_debited` | CHECK valores exactos `legacy_debited` y `debit_on_redemption`. Default mantiene inserts de aplicación anterior; nuevo código debe escribir explícitamente su modo. Marca semántica, no ejecuta débitos adicionales. |
| `card_events_outbox` | Tabla técnica de invalidaciones confirmadas, detallada abajo, RLS habilitado y sin grants públicos de lectura/escritura. No inicia dispatcher por aplicar DDL. |

Antes de marcar premios históricos como `legacy_debited`, comprobar en SQL sus débitos y asignaciones. Available/redeemed: débito neto correspondiente al premio `-stamps_spent`, allocations activas suman meta; cancelled: origen negativo del premio suma `-stamps_spent`, allocations históricas suman meta y activas cero. La cancelación puede haber compensado el débito, por lo que no exigir saldo neto negativo en ese caso. Identificar tipo/causa de movimientos, no cualquier suma global del cliente. Si el inventario detecta inconsistencia, abortar toda 0005 con error genérico/reporte sin teléfono/tokens; no corregir automáticamente una cuenta ni marcar un premio incoherente como debitado.

`card_events_outbox`: `id` UUID (event_id externo), `card_id` FK loyalty_cards, `version` entero > 0, `type` enum mediante CHECK `purchase.recorded|reward.available|reward.redeemed|card.changed`, `occurred_at` y `available_at` timestamptz not null, `attempts` entero >=0 default0, `lease_token` UUID nullable, `lease_until` timestamptz nullable, `published_at` timestamptz nullable. Lease token/plazo son ambos null o ambos no null. UNIQUE `(card_id,version)` garantiza exactamente una invalidación por tarjeta y transacción; al alcanzar meta el tipo es reward.available. Índice de pendientes por disponibilidad/publicación y acceso al card_id según patrón del worker. No payload con teléfono/token/saldo: el cliente obtiene snapshot autorizado. No permitir borrar tarjeta si hay FK de historial incompatible; conservar política no action.

Lectura del outbox usa lease con reclamación atómica y recuperación tras caída. Publicación posterior al commit, marca published_at solo después del intento exitoso. Fallo entre entregar y marcar repite el mismo ID/versión. La tabla no resuelve por sí sola distribución entre procesos: NEXT-004 exige infraestructura compartida real si hay varias instancias.

### Inventario y reporte sin escritura de negocio

El inventario trabaja con conexión explícita a una copia aislada identificada. Reporta cuentas, pertenencias, programas, tarjetas, movimientos, premios, allocations y estado de migración. Excluye credenciales, tokens, teléfono completo, email completo y documentos de venta; usa IDs y razones estructuradas. El modo informe no inserta/actualiza/elimina entidades ni concede ownership.

La conversión futura debe cubrir restaurante sin dueño/con varios owners, Admin legado sin destino acordado, usuario mixto, cliente sin teléfono, teléfono duplicado/no verificado/compartido, invitación histórica, varias sucursales/programas, inscripción duplicada, premio sin respaldo contable, premio disponible ya debitado/cancelado/entregado, excedentes y cierre/consentimiento vigente. Esta lista es objetivo de conversión; no afirma que el inventario inicial detecte todos los casos.

El informe inicial tiene exactamente el contrato local de DATA-NEXT-001: `{schemaVersion:1,sourceSchema:"0004",mode:"read-only",conversionAllowed:false,counts,memberships,findings}`; sin timestamp variable y con orden determinista. Se conserva camelCase en este CLI existente; snake_case corresponde a los nuevos contratos HTTP. DATA-NEXT-001 enumera hallazgos efectivamente detectados y estructura de memberships/findings. No renombrar ni añadir un `can_convert:true` implícito: el informe inicial nunca autoriza conversión. Un reporte futuro ampliado requerirá versión nueva, fingerprint de fuente y conciliación completa antes de transformar datos. Fuente o conteos cambiados invalidan revisión previa; no mostrar resultados ficticios de datos reales.

### Expansión posterior: identidad, vínculo y ciclos

Estas tablas/columnas no forman parte de la 0005 técnica inicial. Deben obtener spec de DDL y pruebas antes de su migración siguiente, una vez que las decisiones afectadas estén resueltas.

- `customers`: UUID interno, teléfono E.164 normalizado y estado verificado explícitos, timestamps/estado; unicidad de teléfono verificado, no valores inventados para clientes anteriores. Customer sin teléfono verificado no inicia recuperación ni canje.
- `customer_sessions`: hash único, FK cliente, fechas coherentes, revocación y familia/generaciones que permitan renovación segura de NEXT-001. Índices para hash/vencimiento; nunca secretos claros. Desafíos/pruebas: propósito, cuenta personal si corresponde, digest HMAC, caducidad, intentos, consumo; nunca código claro.
- `memberships.customer_id` nullable durante transición y `user_id` preservado; CHECK al menos una identidad y unicidad parcial por customer/programa cuando exista. Tener ambos vínculos requiere reclamación verificada, no una unión por teléfono. Conservar tarjeta, UUID y token.
- Cuenta personal → customer solo con asociación verificada y continuidad resuelta. D-02 confirma nuevo vínculo operador; mantener IDs de restaurant_employees usados como actor histórico. Owner directo requiere mapeo sin conflicto. No backfill Admin→owner.
- Ciclos/premios nuevos llevan modo contable y unicidad premio/ciclo. Comprobantes versionados separan hash/cifrado de estado de premio. Outbox de WhatsApp se añade después de D-04; la tabla de eventos no almacena su secreto o destinatario.
- `roles`, `role_id`, password_hash, datos de localización y consentimientos permanecen hasta que inventario de consumidores, conversión y despliegue compatible permitan retirada explícita. Ocultar sucursales no cambia su unicidad de ventas.

### Conversión repetible y conciliación

Fases: informe de copia 0004 → respaldo/restauración ensayada → expansión → conversión por lotes con mapeo explícito → conciliación → cambio de aplicación → observación → retirada. Cada lote tiene identidad persistida y checkpoints, revalida origen y aplica transacción. Reintentar lote no repite links, premios, débitos o ownership. Un conflicto aborta/omite su entidad con reporte según política explícita; nunca la da por convertida silenciosamente.

Reclamar tarjeta antigua exige acceso autenticado anterior más posesión/continuidad telefónica verificada. Preservar IDs de user/membership/card/purchase/reward y tokens válidos; una persona con varios programas mantiene todos. No fusionar clientes o historiales por igual teléfono/email. Usuarios también operadores conservan cuenta Auth, vínculos e identidad del actor histórico.

Conciliación antes/después por inscripción: número/IDs de compras, suma de ledger, saldo, premios disponibles/canjeados/cancelados, allocations y referencias comerciales. Conciliar además cuentas/vínculos/propietarios y tarjetas por programa. La mera igualdad del saldo global puede ocultar transferencia entre clientes, por lo que es insuficiente. Mantener excedentes separados de premios ya debitados; entregar premio legado no descuenta otra vez ni pone a cero el saldo restante.

No asignar una nueva meta a una tarjeta histórica ni reescribir condiciones bloqueadas. Si D-05 elige un programa principal, conservar programas previos y su capacidad de entregar beneficios. Invitaciones antiguas se revocan/reemiten con decisión explícita y auditoría; no convertir sus roles por omisión.

### Retirada y restauración

No retirar columnas/tablas/endpoints antes de un inventario con cero consumidores activos, reportes sin conflictos bloqueantes, conciliación por entidad y release compatible. Los tests heredados de autorización se reemplazan solo donde cambia una regla, enlazando el nuevo AC; conservar aislamiento, rollback, duplicidad, RLS y seguridad de tokens. Un endpoint legado activo no puede seguir permitiendo Admin/Owner operar caja si el flujo nuevo exige vínculo separado.

Migración remota/destructiva exige destino identificado, inventario actual, respaldo restaurable, reporte de conversión y autorización vigente de ese destino. La entrega local produce SQL y runbook revisables. Primero preferir rollback de aplicación compatible con expansión aditiva; no hacer DROP compensatorio sobre datos nuevos. Ensayar restauración en otra base temporal y comparar por entidad. No afirmar rollback probado porque existe un archivo de instrucciones.

RLS permanece en tablas nuevas y existentes. Anonymous/authenticated de Supabase no obtienen lectura general de customers, sesiones, desafíos o outbox. Credenciales servidor nunca llegan al navegador; el cliente telefónico usa APIs autorizadas, no acceso SQL anónimo. Index/constraints/FK se verifican en PostgreSQL real temporal, no únicamente por parseo de SQL.

## Criterios de aceptación

- AC-001 — Upgrade 0004→0005 agrega únicamente ownership nullable, versión, modo contable y outbox; segunda generación no produce deriva. Fixtures inconsistentes abortan, sin modificar contabilidad ni historial previo.
- AC-002 — Informe es repetible y no escribe negocio; detecta cada conflicto mínimo sin PII/secreto. Admin legado nunca se convierte en owner automáticamente.
- AC-003 — RLS, FK, modo contable, versión, tipo/lease y unicidad del outbox rechazan valores inválidos; lease recuperable no pierde eventos confirmados ni publica rollback.
- AC-004 — Una conversión autorizada preserva por entidad compras, saldos, premios, excedentes, identidad mixta y tarjetas múltiples; reintentar no duplica. Premio ya debitado se entrega sin segundo débito.
- AC-005 — Cliente sin teléfono/prueba, coincidencia o conflicto no se fusiona ni pierde acceso histórico; ninguna retirada ocurre antes de resolver esos consumidores.
- AC-006 — Backup/restore se ensaya en base aislada y concilia por entidad. Pruebas nunca usan `.env` real ni aplican SQL remoto.
- AC-007 — P9 demuestra ausencia de rutas/UI/columnas activas de roles y dependencia huérfana solo después de conversión; regresiones de seguridad siguen probadas bajo nuevas autoridades.

## Trazabilidad y validación

| BR → NC → aceptación del plan | Criterio | Nivel / archivo / nombre previsto | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| BR-025/027/028/030 → NC-010 → AC-13 | AC-001 | integración `backend/tests/integration/next-schema-upgrade.test.ts`: `upgrades 0004 without changing historical benefits`, `aborts inconsistent reward accounting` | Pendiente |
| BR-003/022/030 → NC-010 → AC-13 | AC-002/005 | DATA-NEXT-001, unit/integración de inventario: `reports unresolved identity and ownership without mutation` | Agente persistencia registra evidencia exacta |
| BR-028/029/030 → NC-008/010 → AC-08/13 | AC-003 | integración `backend/tests/integration/next-schema.test.ts`: `enforces private outbox constraints and leases` | Pendiente |
| BR-014/015/016/025/030 → NC-006/009/010 → AC-13 | AC-004 | integración `backend/tests/integration/next-schema-upgrade.test.ts`: `preserves mixed customers and legacy debits on repeated conversion` | Conversión pendiente D-01–05 |
| BR-030/031 → NC-010 → AC-13 | AC-006 | integración `backend/tests/integration/next-schema-restore.test.ts`: `restores and reconciles the isolated backup` | Pendiente |
| BR-003/007/026/030 → NC-003/010 → AC-05/13 | AC-007 | inventario de consumidores + regresiones HTTP/SQL/navegador según NEXT-002/003 | P9 pendiente |

## Preguntas y riesgos

D-01–05 condicionan conversión y simplificación funcional; no bloquean la 0005 técnica descrita. No se han inventariado datos remotos en esta spec. Debe distinguirse expansión verificada, conversor en seco, conversión local y migración real; ninguno implica el siguiente. Una aplicación antigua escribiendo después de convertir datos nuevos exige política explícita de compatibilidad, por lo que retirar columnas o revertir aplicación no puede improvisarse.
