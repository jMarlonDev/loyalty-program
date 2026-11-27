# NEXT-004 — Actualizaciones privadas mediante WebSocket

Estado: contrato técnico aceptado para implementación local; aceptación de producto pendiente. Fecha: 2026-10-19.

## Problema y alcance

Una compra o entrega confirmada debe actualizar la tarjeta abierta sin recargar. El socket comunica cambios persistidos; la contabilidad sigue en PostgreSQL y las operaciones entran por HTTP autenticado. P1 demuestra el transporte real disponible en Nitro/Node; P6 integra sesiones, outbox, interfaz y dos dispositivos. Una prueba del transporte aislado no completa P6.

## Referencias

[LOYALTY-NEXT-001](../../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente), NC-006/008, AC-07/08/12; BR-024/025/028/029/031 de [reglas](../business-rules.md); [NEXT-001](NEXT-001-phone-identity.md), [NEXT-003](NEXT-003-cycles-redemption.md) y [NEXT-005](NEXT-005-data-transition.md). Sustituye el polling como mecanismo principal de FLOW-002; conserva recuperación HTTP y controles de aislamiento.

## Contrato

### Transporte y autorización

`GET /api/v1/customer/events` con upgrade WebSocket; WSS en producción. El handshake exige `Origin` exactamente igual a un origen configurado, sin comodín, y cookie cliente válida resuelta por el servidor. Origin ausente/inválido: HTTP 403; sesión ausente/vencida/revocada: HTTP 401. No aceptar tokens por query string, fragmento, protocolo o mensajes. El handler Nitro puede ser independiente del router HTTP, manteniendo la misma ruta y servicio de autorización. Una cuenta de personal o un UUID conocido no sustituyen la sesión cliente.

El servidor comprueba propiedad actual, estado de tarjeta e inscripción y vigencia de sesión antes de suscribir y de entregar cada evento. La autorización de acceso a tarjetas ya obtenidas no depende de que el programa siga admitiendo nuevas inscripciones. Revalidar en heartbeat incluso sin eventos: revocación de sesión/cliente cierra la conexión; bloqueo de tarjeta o pérdida de pertenencia retira la suscripción. Las tareas de revocación pueden acelerar el cierre entre procesos; el chequeo persistido sigue siendo obligatorio.

Valores iniciales operativos, configurables y probados: máximo 5 conexiones por sesión, 10 suscripciones por conexión, 20 mensajes entrantes por 10 segundos, JSON de hasta 2 KiB, heartbeat cada 25 segundos y cierre tras 60 segundos sin respuesta. Las conexiones requieren contador compartido cuando existen varias instancias. Limitar también aperturas por IP en el proxy confiable; no usar una cabecera IP arbitraria del cliente. Limpieza de timers, suscripciones y contadores al cerrar. El heartbeat de autenticación no renueva por sí solo la cookie de 400 días.

### Mensajes

Todos los objetos son estrictos: rechazar propiedades adicionales. `card_id`/`event_id`: UUID canónico en minúsculas; `version` y `last_version`: enteros seguros >= 0. El cliente no puede enviar eventos de negocio.

| Dirección | Esquema exacto | Efecto |
| --- | --- | --- |
| Cliente → servidor | `{type:"subscribe",card_id,last_version?}` | Autoriza tarjeta propia e instala suscripción; last_version solo ayuda a reconciliar. |
| Cliente → servidor | `{type:"unsubscribe",card_id}` | Retira la suscripción sin mutación comercial. |
| Cliente → servidor | `{type:"ping"}` | Solicita `{type:"pong"}`; ninguna modificación de saldo o identidad. |
| Servidor → cliente | `{type:"subscribed",card_id,version}` | Confirma registro y versión canónica observada. El cliente obtiene después el snapshot HTTP. |
| Servidor → cliente | `{event_id,card_id,version,type}` | `type`: `purchase.recorded`, `reward.available`, `reward.redeemed` o `card.changed`. Invalida la vista para leer snapshot autorizado. |
| Servidor → cliente | `{type:"error",code}` | Código público `INVALID_INPUT`, `NOT_FOUND` o `RATE_LIMITED`, sin UUID ajeno ni detalles internos. |

Una compra que alcanza meta emite `reward.available` como única invalidación de esa versión. Cada transacción que modifica la tarjeta aumenta su versión una vez y escribe exactamente una invalidación, con UNIQUE(card_id,version) en outbox. La entrega al menos una vez admite eventos duplicados; ni ID, ni versión, ni orden de llegada confieren autorización. No incluir teléfono, saldo editable, token de sesión, token QR o datos del personal en eventos.

Suscripción ajena/inexistente: `NOT_FOUND`, sin confirmar existencia y sin entrega posterior. Mensaje de compra, canje, cantidad o propósito desconocido: `INVALID_INPUT`, sin efectos. Payload sobredimensionado: cierre 1009; infracción reiterada de esquema/límite o pérdida de autorización: cierre 1008; fallo inesperado: 1011 con motivo público genérico. No reflejar payload rechazado en logs.

### Commit, reconexión y reconciliación

Compra/canje inserta outbox y versión junto con contabilidad, auditoría e idempotencia. El publicador solo lee filas confirmadas, usa lease recuperable y marca entrega después del intento; fallo de proceso puede repetir evento, nunca perder una operación ya confirmada. Un rollback no produce evento publicable. No invocar sockets ni proveedores dentro de la transacción comercial.

Para despliegue con varias instancias, el dispatcher distribuye eventos a todas las instancias que tienen suscriptores mediante infraestructura compartida documentada; reclamar cada fila para una sola instancia sin distribución es insuficiente. El prototipo en memoria solo demuestra una instancia. P1 debe registrar capacidades de Nitro y destino, límites y pruebas efectivas en `docs/realtime-runtime.md` antes de elegir transporte compartido de producción.

Contrato técnico local del relay PostgreSQL (`backend/src/infrastructure/card-event-outbox.ts`): `claim` toma lote máximo 100 con `FOR UPDATE SKIP LOCKED`, registra lease UUID/plazo e incrementa intentos en una transacción; `publishClaims` revalida lease vigente y, en otra transacción, ejecuta `pg_notify` del JSON mínimo, marca `published_at` y limpia lease. PostgreSQL entrega NOTIFY solo tras commit: un fallo entre NOTIFY y actualización revierte ambos. Caída entre claim y publicación deja lease recuperable al vencer; dos dispatchers no entregan el mismo claim válido concurrentemente.

Cada instancia usa una conexión PostgreSQL dedicada a LISTEN (sin transaction-pooler), valida JSON estrictamente y distribuye a su gateway autorizado. Error/end del listener cierra sockets mediante `onDisconnect` antes de reconectar, de modo que el cliente vuelve a suscribir/leer snapshot; no se presupone backlog de NOTIFY ni orden global de UUID/secuencia. `stop` elimina LISTEN, conexión y timers. La outbox conserva trabajo no publicado; una desconexión después de marcar publicado se recupera por snapshot. El adapter de leases de conexiones debe ser compartido para imponer límites entre instancias. Se probarán rollback, caída tras claim, reintento, listeners distintos y pérdida/reconexión real; no presentar un emitter local como distribución PostgreSQL.

Secuencia cliente: conectar → recibir `subscribed` → leer `GET /api/v1/customer/cards/:cardId` → reconciliar su versión con notificaciones recibidas mientras la lectura estaba en vuelo. Si una notificación tiene versión mayor que el snapshot, repetir lectura. Evitar que una respuesta HTTP antigua sobrescriba una versión más nueva. Descartar eventos duplicados y anteriores; un hueco de versiones fuerza snapshot. Al reconectar, recuperar foco o volver online consultar el estado canónico aunque no haya eventos retenidos. Reintentos con backoff acotado y jitter; detenerlos al cerrar sesión.

Fallback HTTP: consulta periódica limitada mientras WSS no está disponible, pausa en segundo plano y relectura al recuperar foco. Conservar último saldo confirmado con aviso recuperable; no mostrar un sello optimista ni simular éxito porque se envió un comando. El fallback no se presenta como cumplimiento del requisito WebSocket.

### Observabilidad y aceptación

Registrar tiempos de commit/evento/lectura/render con IDs opacos de correlación sin teléfonos o tokens. Objetivo de aceptación: p95 <= 2 s de commit a saldo visible, dos contextos de navegador conectados y entorno controlado. Registrar muestra, número de operaciones, plataforma y condiciones; no prometer ese tiempo offline. Medición de RTT del socket no equivale a latencia de producto. Sesiones de operador no suscriben tarjetas de clientes mediante este endpoint; una necesidad operativa futura requiere contrato independiente.

## Criterios de aceptación

- AC-001 — Un handshake con cookie válida y Origin permitido obtiene conexión real; cookie ausente/revocada y Origin ajeno/ausente son rechazados antes de suscribir.
- AC-002 — Una conexión recibe eventos exclusivamente de tarjetas propias autorizadas; adivinar UUID, añadir un payload de saldo o suscribir después de revocación no entrega datos ni muta contabilidad.
- AC-003 — Una compra/canje confirmados generan invalidación después del commit; rollback, escaneo o registro de conexión no generan éxito comercial.
- AC-004 — Duplicación, entrega tardía, hueco de versión y respuesta HTTP antigua conservan la versión visible más nueva; suscribir y reconciliar cubre una compra entre lectura inicial y conexión.
- AC-005 — Reconexión, foco y fallback recuperan PostgreSQL sin repetir la compra. Revocar sesión o bloquear tarjeta retira el acceso incluso sin nuevas compras.
- AC-006 — Límites de mensajes/conexiones, heartbeat, payload máximo y limpieza se verifican con reloj controlado y sockets reales; no quedan recursos tras desconectar.
- AC-007 — Dos contextos observan sello y reinicio de ciclo sin recargar; la medición registra p95 y condiciones. Una prueba de emisor o adapter simulado no satisface este criterio.
- AC-008 — Si el despliegue usa varias instancias, compra y suscripción en instancias diferentes se encuentran mediante infraestructura compartida, incluida revocación; reinicio del dispatcher recupera outbox pendiente.

## Trazabilidad y validación

Los archivos y nombres son objetivos de implementación; evidencia pendiente hasta registrar ejecución real.

| BR → NC → aceptación del plan | Criterio | Nivel / archivo / nombre previsto | Evidencia RED/GREEN |
| --- | --- | --- | --- |
| BR-024/025/029 → NC-006/008 → AC-08 | AC-001/002 | integración `backend/tests/integration/customer-events.test.ts`: `rejects invalid origin and session before upgrade`, `isolates card subscriptions` | Pendiente |
| BR-028/029 → NC-008 → AC-07 | AC-003 | integración `backend/tests/integration/customer-events.test.ts`: `publishes only committed card versions` | Pendiente |
| BR-025/029 → NC-006/008 → AC-08 | AC-004/005 | UI `tests/ui/customer-events.test.tsx`: `reconciles subscribe snapshot race`, `ignores stale snapshots and events` | Pendiente |
| BR-024/029 → NC-008 → AC-08 | AC-005/006 | integración `backend/tests/integration/customer-events.test.ts`: `revocation closes idle sockets`, `enforces bounds and cleans connections` | Pendiente |
| BR-014/015/029 → NC-008/009 → AC-07/12 | AC-007 | navegador `tests/browser/customer-flow.spec.ts`: `purchase and redemption update the connected card` | Pendiente |
| BR-028/029 → NC-008 → AC-07/08 | AC-008 | integración `backend/tests/integration/customer-events-multiprocess.test.ts`: `delivers across two workers and restart` | Condicional al destino; pendiente |

## Preguntas y riesgos

D-01 condiciona la emisión real de sesiones y D-03/04 el negocio que produce ciertos eventos; no bloquean pruebas del transporte con autorizador local inyectado. El hosting real, proxy WSS e infraestructura compartida aún requieren verificación. Nunca presentar ese doble local como verificación de teléfono, WhatsApp, despliegue o ciclo de producto terminado.
