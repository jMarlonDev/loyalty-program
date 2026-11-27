# WebSocket privado: factibilidad y contrato de ejecución

Fecha: 2026-10-19. Fases P1/P6 de [LOYALTY-NEXT-001](../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente). Este informe distingue la prueba de transporte de la integración con tarjetas, contabilidad y sesiones reales.

## Runtime instalado

| Componente | Versión inspeccionada | Evidencia local |
| --- | --- | --- |
| Node / npm | 24.18.1 / 12.1.0 | `node -v`, `npm -v` |
| Nitro | 3.0.260903-beta | `node_modules/nitro/package.json` |
| Vite | 8.3.4 | lockfile raíz |
| srvx | 1.0.6 | lockfile raíz |
| CrossWS | 0.4.15 | dependencia transitiva de Nitro instalada |

Nitro ya integra el upgrade en `node-server` y en el servidor Vite de desarrollo. El ajuste requerido es `features: { websocket: true }`; `experimental.websocket` está deprecado en los tipos instalados. `defineWebSocketHandler` se importa desde `nitro`. No se necesita sustituir TanStack Start ni añadir otro servidor HTTP para activar el transporte. La configuración actual de la aplicación no activa todavía esta opción.

Evidencia de código instalado: `node_modules/nitro/dist/presets/node/runtime/node-server.mjs`, `node_modules/nitro/dist/_build/vite.dev.mjs`, `node_modules/nitro/dist/runtime/internal/app.mjs` y `node_modules/nitro/dist/docs/0.docs/15.websocket.md`. La [documentación oficial de Nitro](https://nitro.build/docs/websocket) confirma la opción y el hook `upgrade`; el [adaptador Node de CrossWS](https://crossws.h3.dev/adapters/node) conecta el upgrade de HTTP con WebSocket. Consultados el 2026-10-19.

## Contrato y límites de la prueba P1

La especificación funcional se registra en NEXT-004 antes de implementar. El spike local usa `/api/v1/customer/events`, con cookie opaca de prueba, Origin exacto y autorización de tarjeta mediante un adaptador aislado. Sus identidades y eventos son fixtures: no concede sellos, no entrega premios y no demuestra persistencia PostgreSQL ni integración con la sesión real.

1. Rechazar handshake sin sesión o con Origin ajeno; no aceptar token por query ni por protocolo.
2. Permitir suscripción únicamente tras comprobar sesión vigente y pertenencia de tarjeta; revelar el mismo resultado genérico para tarjeta inexistente y ajena.
3. Recibir invalidaciones de una fuente de eventos del servidor. Nunca aceptar operaciones de compra, canje, saldo o publicación desde mensajes del cliente.
4. Revalidar antes de entregar eventos y cerrar conexiones al revocar la sesión. Limitar mensajes, suscripciones, tamaño y conexiones; limpiar recursos al cerrar.
5. Comprobar el transporte con dos contextos Chromium independientes en desarrollo y con el bundle Node de producción. Registrar resultado, sin equipararlo con dos dispositivos físicos o WSS en un destino publicado.

## Integración prevista en un solo backend Node

La ruta Nitro debe registrarse explícitamente antes del catch-all de TanStack Start. El hook `upgrade` comprueba Origin contra `APP_ORIGIN` y valida la cookie de cliente en servidor; una cookie del personal nunca sustituye esa sesión. El gateway conserva identificadores internos de sesión/cliente, no el token de cookie, y consulta pertenencia para cada suscripción y publicación. No enviar teléfono, token ni saldo en el canal.

Cada operación HTTP registra la compra/canje, versión monotónica de tarjeta y evento outbox en la misma transacción. Un rollback no produce notificación. Cada instancia con sockets necesita consumir el stream completo correspondiente a sus clientes; repartir eventos con un único `FOR UPDATE SKIP LOCKED` entre servidores WebSocket perdería la difusión a las otras instancias.

Propuesta de despliegue: outbox duradero PostgreSQL, entrega al menos una vez, un consumidor por instancia y publicación local solo después de consultar el evento confirmado. `LISTEN/NOTIFY` puede despertar consumidores con un identificador de evento, pero no reemplaza la tabla ni la recuperación periódica. Usar conexión dedicada directa o compatible con sesiones para `LISTEN`; no asumir compatibilidad del pooler remoto. PostgreSQL entrega `NOTIFY` después del commit y recomienda una tabla para el contenido estructurado ([documentación oficial](https://www.postgresql.org/docs/17/sql-notify.html)).

Un cursor de secuencia autoincremental no representa por sí solo el orden de commit: dos transacciones pueden confirmar en orden inverso. La implementación debe elegir despacho ordenado confirmado o recuperación con deduplicación que no omita el evento tardío. No avanzar un cursor sobre filas todavía no confirmadas. Retener outbox según una ventana de recuperación documentada, manteniendo siempre la tarjeta y el libro contable.

El cliente suscribe primero y luego reconcilia el snapshot autorizado con su versión; acumula invalidaciones mientras llega la lectura. Duplicados o versiones antiguas no retroceden la tarjeta. Huecos, reconexión, recuperación de foco y vuelta de red solicitan estado actual. HTTP recupera estado durante una caída de WSS; no se presenta como cumplimiento del requisito WebSocket.

## Aceptación pendiente de integración P6

Probar WSS con certificado confiable o TLS local controlado, compra y canje reales sobre PostgreSQL aislado, dos sesiones en dos procesos, reinicio del consumidor, evento postcommit, rollback silencioso, revocación, canales ajenos, desconexión, duplicados y versiones desordenadas. Medir p95 desde commit a tarjeta visible con al menos 20 operaciones en condiciones registradas; objetivo del plan ≤ 2 s. No declarar ese objetivo verificado con un eco de transporte.

El hosting aún no está elegido ni consultado. El destino debe mantener upgrades y conexiones persistentes, proxy WSS, timeouts/heartbeat compatibles, cierre gradual y afinidad no necesaria si cada instancia recibe eventos compartidos. Un mapa de peers en memoria solo sirve para enviar a conexiones del proceso actual.

## Comandos y resultados

Inspección local completada. Prueba de transporte y comandos reproducibles se registrarán al ejecutarse. No se han cambiado servicios remotos ni credenciales.
