# Guía del proyecto

## Contexto y alcance

`loyalty-program` es un sistema de fidelización para restaurantes. Los restaurantes podrán definir programas por compras; los clientes acumularán sellos en una tarjeta digital y obtendrán un premio al completar la meta.

La solicitud vigente del **2026-10-19** autoriza reconstruir el producto siguiendo P0–P10: tarjetas por teléfono, operación por QR, personal sin catálogo de roles, canje autorizado y actualización por WebSocket, con subagentes, harness y pruebas. Sustituye la limitación documental de la petición anterior. El plan completo está en [Plan vigente: fidelización centrada en el cliente](#plan-vigente-fidelizacion-centrada-en-el-cliente); leerlo antes del historial. Las decisiones D-01–D-05 están aceptadas y D-01 se simplificó a acceso sin OTP; leer la tabla antes de implementar el negocio afectado. Las instrucciones del 2026-10-18 describen el sistema anterior; conservar sus reglas únicamente donde el nuevo plan no las sustituya. TanStack Start, React, shadcn, Drizzle/PostgreSQL y el trabajo existente se mantienen como base. Coordinación en docs/migration-harness.md; estado en backend/docs/development-status.md. No confundir preparación local con disponibilidad de credenciales o autorización de un destino remoto.

## Entorno y estructura

- Base local: Node.js 24.18.1 y npm 12.1.0; versiones declaradas en `.nvmrc` y `package.json`.
- `src/`: aplicación fullstack TanStack Start (rutas, UI y sesión servidor). `backend/`: núcleo de negocio, persistencia, contratos y migraciones integrado en el mismo proceso; leer `backend/AGENTS.md` y `backend/docs/index.md`. Un workspace npm y lockfile raíz.
- `README.md`: preparación del entorno, verificaciones y decisiones pendientes.
- TanStack Start integra servidor, UI y API. Evidencia histórica del sistema anterior: 418 pruebas backend; último check registrado con 192 UI/servidor y 228 backend unidad/tooling. La cobertura de líneas 97,33 % corresponde a la migración inicial; no se volvió a medir. Supabase tenía 0000–0004 aplicadas en la verificación del 2026-10-18; no se consultó en esta planificación. Estos resultados no verifican el nuevo flujo LOYALTY-NEXT-001.
- No versionar credenciales, archivos `.env`, dependencias ni artefactos generados.

## Flujo de trabajo

- Leer este archivo al iniciar cada sesión.
- Respetar los cambios existentes del usuario y limitarse al alcance solicitado.
- Usar Conventional Commits: `<tipo>[ámbito opcional]: <descripción>`.
- Referencia: https://www.conventionalcommits.org/en/v1.0.0/.
- Rama inicial: `main`. Remoto previsto: `https://github.com/jMarlonDev/loyalty-program.git`.
- Validar los cambios con comprobaciones proporcionales; no presentar verificaciones del entorno como pruebas funcionales.

## Cierre obligatorio de cada sesión

Antes de terminar cada sesión, actualizar este `AGENTS.md` con la fecha, cambios realizados, comprobaciones y resultados, limitaciones y próximos pasos. Actualizar también `README.md` si cambian los requisitos o comandos de preparación. No registrar secretos ni afirmar acciones que no se hayan completado.

<a id="plan-vigente-fidelizacion-centrada-en-el-cliente"></a>

## Plan vigente: fidelización centrada en el cliente

**ID: LOYALTY-NEXT-001. Fecha: 2026-10-19. Estado: ejecución autorizada; P0 alineado e implementación local P1–P8 en curso.** Este bloque se aplica a todo el repositorio. Contiene requisitos explícitos, propuestas de seguridad y decisiones aceptadas diferenciadas; no afirma que todo el código ya funcione así. La nueva petición autoriza ejecutar P0–P10, conservando avances y registrando evidencia. No repetir la planificación completa ni implementar un punto no acordado como si estuviera confirmado. Estado comprobado por fase en `docs/migration-harness.md`.

### Problema, alcance y precedencia

El cliente debe recibir y recuperar su tarjeta con su teléfono, mostrar su QR en cada compra y ver los sellos sin recargar. El empleado acredita una compra real o entrega un premio. El dueño configura el programa y la tarjeta que verán sus clientes. Eliminar formularios, pantallas y propiedades innecesarios sin eliminar aislamiento entre restaurantes, autorización, trazabilidad ni beneficios existentes.

Este plan sustituye el alta de clientes por correo/Google, la jerarquía configurable Owner/Admin/Employee, la prohibición de canje para empleados y el reinicio automático al alcanzar la meta. Mientras se migra, el código y las specs anteriores describen el comportamiento heredado. [business-rules.md](backend/docs/business-rules.md) referencia esta transición; P0 debe actualizar allí las reglas BR y las specs afectadas antes del código. El historial que sigue al plan conserva hechos de sesiones anteriores y no anula este cambio.

Referencias de partida: [BACKEND-001](backend/docs/specs/BACKEND-001-plan-de-negocio.md), [ROLE-001](backend/docs/specs/ROLE-001-role-boundaries.md), [LOYALTY-001](backend/docs/specs/LOYALTY-001-operaciones.md), [PROGRAMS-001](backend/docs/specs/PROGRAMS-001-programas-tarjetas.md), [SESSION-003](backend/docs/specs/SESSION-003-persistencia.md), [FLOW-001](backend/docs/specs/FLOW-001-access-invitations.md) y [FLOW-002](backend/docs/specs/FLOW-002-qr-live-cards.md). Mantener spec-first, spec-anchored y TDD con las skills del proyecto. Aplicar Impeccable al implementar la interfaz, sin convertir esta planificación en un rediseño ahora.

### Requisitos explícitos del nuevo flujo

| ID | Requisito solicitado y resultado esperado |
| --- | --- |
| NC-001 | Cliente como centro del sistema: alta por teléfono, tarjeta móvil, QR visible, saldo y premio comprensibles. Sin correo, contraseña ni Google obligatorios para el cliente. |
| NC-002 | Dueño: crear su programa, definir meta/premio y personalizar su tarjeta; obtener el QR oficial imprimible del restaurante. Reducir el panel a ese recorrido. |
| NC-003 | Empleado: registrarse con correo y teléfono; escanear tarjetas, sumar sellos por compras y canjear premios. Eliminar selección/asignación de roles y el catálogo de permisos configurable. |
| NC-004 | QR público estable en el restaurante: abre el programa correcto; solicita el teléfono en el primer acceso y después recupera la tarjeta existente, sin duplicarla. |
| NC-005 | Cada tarjeta tiene un identificador estable asociado internamente al teléfono. El QR de la tarjeta permite al personal localizarla rápidamente. |
| NC-006 | Persistencia prolongada: recordar el dispositivo alrededor de un año o más; conservar tarjeta, saldo e historial en PostgreSQL entre visitas separadas por meses. |
| NC-007 | Cada compra válida concede un sello con autorización del empleado. El cliente, el QR público y el simple escaneo no pueden generar beneficios por sí solos. |
| NC-008 | El cliente ve el nuevo saldo en tiempo real mediante WebSocket, también al entregar el premio y comenzar el siguiente ciclo. |
| NC-009 | Al completar la meta se muestra el premio disponible. El flujo incorpora un QR de canje por WhatsApp, validación por el empleado y reinicio a cero al entregar el premio del ciclo completo. |
| NC-010 | Simplificar esquema Drizzle, migraciones, contratos y pantallas, eliminando lo que ya no sirve al flujo; conservar integridad, seguridad y datos existentes. |

### Decisiones de diseño aceptadas

El usuario respondió D-01–D-05 el 2026-10-19 y después pidió eliminar el OTP para dejar el acceso simple por teléfono. Estas respuestas sustituyen las propuestas anteriores y obligan a las specs derivadas; el código afectado debe cumplirlas antes de declarar la fase terminada.

| ID | Decisión aceptada | Consecuencia obligatoria |
| --- | --- | --- |
| D-01 | Acceso simple por teléfono, sin código OTP. El usuario prefiere el flujo directo para esta etapa. | Crear o recuperar la sesión con el teléfono normalizado, sin proveedor SMS. Asumir el riesgo de suplantación por conocimiento del número y no presentarlo como identidad fuerte. Si más adelante se exige prueba de posesión, añadirla como evolución explícita. |
| D-02 | Invitación privada de un solo uso con enlace/código y correo autenticado; sin OTP telefónico. | El correo de la cuenta debe coincidir con la invitación y el enlace/código se consume una vez. El teléfono se guarda como dato de contacto, no como prueba. Sin invitación aceptada no se opera caja; el dueño que atienda también necesita vínculo de operador explícito. |
| D-03 | Permitir compras adicionales en ciclos separados mientras hay un premio pendiente. | Cada meta crea un premio de su ciclo; las compras posteriores abren otro ciclo sin reiniciar ni perder el anterior. El canje descuenta solo los sellos del ciclo del premio y conserva los demás ciclos. |
| D-04 | Enviar el comprobante al teléfono registrado del cliente al completar la meta, con reenvío desde su tarjeta y desde el operador. | El destinatario siempre es el titular de la tarjeta; el operador no puede redirigirlo a su propio teléfono. Estados de envío separados de premio/canje y conservados ante fallo. |
| D-05 | Mantener un programa activo principal por restaurante en la interfaz, conservando programas históricos sin unicidad destructiva. | La UI prioriza el principal; PostgreSQL conserva todos los programas, tarjetas y premios. No imponer una restricción única irreversible. |

Propuestas técnicas que no cambian las operaciones solicitadas: token opaco en cookie/QR, base de datos como fuente de saldo, WebSocket privado de lectura y transacciones idempotentes. El dueño mantiene autenticación de cuenta para proteger su configuración; el personal puede reutilizar Supabase Auth con correo verificado y teléfono, sin autenticación local de contraseñas. Seleccionar proveedor de verificación y WhatsApp al preparar la integración; no asumir que están disponibles o configurados. Trabajar con adaptadores y dobles locales mientras falten credenciales.

### Flujo objetivo, en orden de uso

1. **Dueño prepara el programa.** Accede a su cuenta, registra el mínimo del restaurante en el mismo asistente, define meta y premio, personaliza logo/colores/texto y comprueba vista móvil. Publica el programa y descarga/imprime su QR público con nombre y enlace legible. Conservar el enlace al cambiar el diseño. Meta y premio mantienen el bloqueo histórico tras la primera inscripción hasta que se apruebe otra regla. El panel habitual muestra «Mi programa», vista previa y «QR del restaurante»; el acceso de empleados queda como configuración mínima pendiente de D-02.
2. **Empleado se incorpora.** Usa la invitación privada del negocio, registra correo y teléfono, verifica su acceso y queda vinculado al restaurante; no elige rol. Su pantalla principal es el escáner, con resultado de tarjeta y acción de compra o canje. Registrarse sin invitación no permite operar. El propietario no gana automáticamente operaciones de caja; si también atiende, debe tener vínculo de operador conforme a la spec aprobada.
3. **Cliente escanea el QR físico.** El servidor reconoce el programa público. Si existe sesión válida, abre o crea idempotentemente su inscripción en ese programa. Si no existe, pide teléfono con país, lo normaliza y aplica D-01. No muestra información de otra persona al escribir un número. La primera tarjeta comienza en 0/N y no recibe sello por registrarse.
4. **Cliente vuelve meses después.** Abre el enlace guardado o escanea el QR del restaurante; la cookie válida recupera su identidad y el servidor devuelve la misma tarjeta con su saldo real. Si desapareció la cookie, recupera por verificación del teléfono sin perder sellos ni crear otra tarjeta. En otro programa recibe otra tarjeta, aislada de la anterior. Un cambio de navegador o dispositivo exige recuperación segura, no una cookie compartida entre teléfonos.
5. **Compra y sello.** Cliente muestra el QR de su tarjeta. El empleado lo escanea; el servidor valida sesión, vínculo activo, restaurante, tarjeta y programa. La pantalla muestra tarjeta, teléfono enmascarado, saldo y campo de referencia de venta. El empleado confirma «Registrar compra · +1 sello». Solo una respuesta confirmada por el servidor muestra éxito; el cliente recibe el cambio por WebSocket tras el commit. Escaneos repetidos, refrescar, abrir el enlace o tocar dos veces no generan sellos adicionales.
6. **Meta alcanzada.** El servidor registra un único premio disponible para ese ciclo y deja la tarjeta llena, sin reiniciarla. Crea un comprobante de canje distinto del QR de tarjeta y una tarea de envío según D-04. Un envío fallido no elimina el premio. La interfaz indica «Premio disponible» y estado del envío, sin confundir «enviado» con «entregado» o «canjeado». Aplicar la decisión D-03 a las compras siguientes.
7. **Entrega del premio.** Cliente presenta el QR de canje recibido por WhatsApp. El empleado escanea, revisa premio/tarjeta y confirma la entrega. El servidor comprueba token vigente, premio disponible, vínculo activo y restaurante; consume el comprobante y el premio, registra el débito de N sellos del ciclo y deja 0/N en una sola transacción. El cliente ve el reinicio por WebSocket. El QR consumido solo sirve como constancia histórica; una foto o reenvío no permite un segundo canje. No canjear por abrir un enlace de WhatsApp: sus vistas previas tampoco producen efectos.
8. **Siguiente ciclo.** Se conservan identidad, inscripción y QR de tarjeta; se empieza de nuevo sin registro ni nueva captura del teléfono. El nuevo premio tendrá otro comprobante. Un reenvío o una reemisión del premio anterior no puede afectar el ciclo nuevo.

### Identidad, cookie y persistencia profesional

- **Teléfono como identificador de negocio, UUID como clave interna.** Normalizar a E.164 con validación de país/número; no usar el texto recibido como PK ni como secreto. El modelo nuevo separa cliente por teléfono de la cuenta autenticada del dueño/empleado. Definir unicidad de teléfono y de inscripción abierta `(customer_id, program_id)`, con tarjeta única por inscripción. Un cliente puede tener varias tarjetas; no guardar una sola tarjeta global que sustituya a las demás.
- **Cookie de sesión opaca.** Propuesta HTTPS: `__Host-loyalty_customer=<token aleatorio>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=34560000` (400 días), sin `Domain`. Crear en el servidor, usar al menos 256 bits aleatorios y guardar solo su hash para validación en `customer_sessions`, junto con cliente, vencimiento y revocación. Ni teléfono, ni saldo, ni QR de canje deben estar en texto plano en la cookie. La asociación sesión → cliente → tarjetas en PostgreSQL satisface la identificación persistente.
- **Duración y recuperación.** Renovación controlada al usar una sesión válida, con vencimiento servidor coherente, rotación segura y manejo de pestañas concurrentes; no revivir sesiones revocadas. Una caída temporal del servidor no debe borrar la cookie. Logout/«Olvidar este dispositivo» sí revoca la sesión y la elimina. El navegador puede borrar o limitar cookies antes del plazo; 400 días es una intención, no una garantía de permanencia. Chrome limita la expiración solicitada a 400 días ([documentación oficial](https://developer.chrome.com/blog/cookie-max-age-expires)).
- **Seguridad web.** Aplicar los atributos de cookie y prefijo de host según [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie). Comprobar Origin/CSRF en mutaciones, limitar intentos de alta/recuperación y no registrar tokens ni teléfonos completos. No guardar credenciales en localStorage. Mantener sesiones de cliente y personal separadas; la cookie de cliente nunca autoriza caja. En HTTP de desarrollo usar configuración y nombre sin prefijo seguro exclusivos de ese entorno, conservando producción HTTPS estricta.
- **Saldo canónico.** Consultar PostgreSQL al abrir/reconectar; calcular desde movimientos o usar una proyección verificada en la misma transacción. La cookie identifica, no contiene la contabilidad. Una caché visual o WebSocket no puede sustituir al saldo persistido ni conceder beneficios. No borrar tarjeta, compras o premios porque venza una sesión o pase un año.
- **Recuperación y cambios de teléfono.** D-01 acepta el riesgo de acceso con solo el número. Definir cambio de número, teléfono reciclado, números compartidos y cuenta antigua sin teléfono; no fusionar clientes por coincidencia sin evidencia adicional de titularidad. El número no cambia por escanear otro QR. Un cambio verificado conserva IDs, saldo e historial y permite revocar sesiones previas.

### Tres QR con finalidades distintas

| QR | Contenido y acceso | Efecto permitido |
| --- | --- | --- |
| Restaurante/programa | URL HTTPS pública estable con `public_code`; descargable para impresión. No contiene privilegios de personal. | Ver el programa e iniciar inscripción. Cero sellos por visita. |
| Tarjeta del cliente | Token aleatorio revocable que resuelve tarjeta, programa y teléfono internamente; conservar el mecanismo de hash/cifrado existente donde corresponda. No incluir teléfono legible ni número secuencial como credencial. | Personal vinculado consulta el mínimo para la compra. No abre la sesión del cliente, concede sellos o canjea por sí solo. |
| Premio/comprobante | Token distinto, ligado a `reward_id`, tarjeta, restaurante y versión; validación por hash y estado persistido. Un solo consumo, con caducidad técnica/reemisión si corresponde. | Personal vinculado valida y confirma entrega. No permite sumar sellos ni acceder a otras tarjetas. |

Mantener propósito y validadores separados: no aceptar token de tarjeta en endpoint de canje, ni token de premio como sesión. Evitar secretos en logs, analítica y URL de consulta; conservar la estrategia de fragmento para transportar el token al escáner y enviarlo después en cuerpo protegido. Reemisión invalida el comprobante anterior sin cancelar el beneficio; vencimiento del comprobante no significa vencimiento del premio. Ofrecer lectura manual del código como alternativa accesible a la cámara, con las mismas validaciones.

### Autorización y defensa frente a sellos o canjes falsos

Eliminar `roles` y `role_id` no elimina la necesidad de comprobar quién es propietario y quién pertenece al restaurante. Propiedad directa del negocio y vínculo de empleado activo reemplazan la jerarquía; no sustituirla por otro catálogo de roles configurable. El dueño modifica solo su programa; el empleado vinculado escanea, acredita compras y canjea solo en su negocio; el cliente consulta sus tarjetas y solicita recuperación/comprobante, sin mutaciones de saldo.

Una compra exige referencia del ticket/venta, única en su ámbito comercial. Conservar al inicio la unicidad por sucursal existente; si se elimina la dimensión sucursal, definir y migrar la nueva clave sin colisiones. No generar una referencia nueva en cada escaneo como supuesto comprobante de venta. La clave de idempotencia protege reintentos técnicos y la referencia de venta protege la duplicación comercial: ambas son necesarias.

Compras, asignación al ciclo, premio al completar meta, movimientos, auditoría y evento de salida se escriben atómicamente. Bloquear/serializar la tarjeta o ciclo, aplicar unicidad en PostgreSQL y revalidar permisos también en reintentos. Mismo idempotency key + mismo payload devuelve el resultado anterior; misma clave + otro payload produce conflicto. Dos empleados concurrentes no pueden duplicar una venta, crear dos premios del mismo ciclo ni canjear dos veces. No admitir cantidades arbitrarias: el backend fija +1.

Conservar la protección contra autoacreditación/autocanje del personal; al separar identidades, comparar la asociación verificada entre cuenta de personal y cliente, no únicamente UUID de tablas diferentes. No equiparar un teléfono autodeclarado con una identidad verificada. Registrar actor, compra, tarjeta, restaurante, referencia, instante, resultado y motivo de correcciones; enmascarar datos personales. Definir límites de frecuencia y alertas de operaciones anómalas sin un tope arbitrario que rechace compras legítimas. Un empleado deshonesto puede inventar referencias sin integración de caja: la auditoría permite detectar abuso, pero no prueba por sí sola que hubo pago. Una integración POS verificable sería una mejora posterior, no una capacidad existente.

Si no hay conexión, mostrar pendiente/no confirmado y reintentar con la misma identidad de operación; no confirmar sellos o entregas offline. Las correcciones conservan movimientos compensatorios y rechazo cuando afectan a un premio ya entregado; retirar su botón del recorrido diario no autoriza borrar historial ni conceder esta operación al empleado. Definir el mecanismo restringido de soporte en P0, preservando el consentimiento de cierre y derechos acumulados.

### Canje, WhatsApp y estados persistidos

- **Ciclo nuevo propuesto:** `collecting` con 0…N-1 → `reward_available` con N → `redeemed` con registro de entrega y nuevo ciclo en 0. D-03 decide compras adicionales. El débito ocurre al entregar, a diferencia del modelo heredado que ya consumía sellos al generar el premio. No descontar dos veces durante la migración.
- **Premio:** disponible, canjeado o cancelado justificadamente. **Comprobante:** activo, consumido, revocado o vencido técnicamente. **Envío:** pendiente, aceptado por proveedor, entregado o fallido según evidencia. Separar estos estados; una confirmación de WhatsApp jamás canjea el premio.
- **Envío fiable:** insertar una tarea en outbox junto al premio; worker con reintentos limitados, deduplicación y estado del proveedor. No llamar al proveedor dentro de la transacción de compra. Validar autenticidad de callbacks cuando existan. Un timeout ambiguo puede duplicar el mensaje, pero siempre apunta al mismo premio y nunca genera otro beneficio. Limitar reenvíos; si se rota un token, las tareas antiguas no pueden volver a activarlo.
- **Canje seguro:** la transacción consume token/premio y modifica contabilidad antes de emitir éxito. El escaneo muestra datos mínimos para confirmación. Reintento de la misma entrega devuelve resultado previo; otra operación sobre premio consumido se rechaza sin descontar nada. Para reemisión/recuperación sensible, exigir posesión verificada o una sesión cliente suficientemente confiable según spec; la foto del QR de tarjeta no basta.
- **Proveedor:** elegir integración oficial de WhatsApp o proveedor compatible tras revisar su documentación vigente, credenciales, remitente, requisitos de plantillas/consentimiento y costes. El teléfono de contacto no es consentimiento de marketing. Un enlace manual de compartir no demuestra envío automático ni entrega; si se usa como alternativa, documentar su alcance. No enviar mensajes reales en esta sesión.
- **Indisponibilidad:** el premio se conserva aunque falle WhatsApp. Diseñar comprobante accesible desde sesión cliente autenticada como alternativa y reenvío sin nuevo premio; si el producto exige exclusivamente WhatsApp, bloquear solo entrega hasta recuperar el canal, nunca perder saldo. No dar por validado el envío real con un proveedor simulado.

### Tiempo real mediante WebSocket

El transporte lleva notificaciones de operaciones ya persistidas. Las compras y canjes siguen entrando por endpoints autenticados y transaccionales. Evento mínimo propuesto: `{event_id, card_id, version, type}`; el cliente obtiene después el estado autorizado o recibe una proyección mínima. No incluir teléfono ni tokens en eventos.

Usar WSS en producción, handshake con sesión válida, Origin permitido y autorización de cada suscripción: el cliente solo suscribe sus tarjetas; el personal, únicamente operaciones autorizadas en su restaurante. Un canal con UUID conocido no es privado por sí solo. Revocar suscripciones al cerrar sesión, bloquear tarjeta o retirar vínculo. Aplicar límites de mensajes/conexiones, heartbeat y limpieza; referencia técnica: [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

Publicar desde outbox después del commit, con entrega al menos una vez, deduplicación por evento y versión monotónica por tarjeta. Reconexión, pestaña reactivada o hueco de versiones fuerzan lectura del estado actual; un evento atrasado no reduce el saldo visible. Suscribir y reconciliar snapshot/version para no perder una compra entre la primera lectura y la conexión. Conservar fallback HTTP para recuperar el estado si WSS cae, sin presentarlo como sustituto del requisito de WebSocket.

En P1 validar el soporte real del adaptador Nitro/hosting instalado. Preferencia inicial: mismo backend Node con canal privado y outbox; si el destino exige Supabase Realtime u otro servicio, documentar la decisión, autorización de canales y despliegue antes de adoptarlo. Un emisor en memoria no sirve para varios procesos. Probar entrega entre instancias con infraestructura compartida si se despliega más de una. Objetivo de aceptación propuesto: p95 ≤ 2 s desde commit hasta actualización visible con dos dispositivos conectados en entorno controlado; registrar latencia y condiciones, sin prometer ese tiempo con el teléfono desconectado.

### Inventario y plan de simplificación Drizzle

Base revisada: [backend/db/schema.ts](backend/db/schema.ts), 16 tablas locales. Historial documentado: migraciones 0000–0004 aplicadas previamente en Supabase; no se consultó el remoto en esta sesión. El modelo original se referencia desde `backend/drizzle/meta/0000_snapshot.json`; no recrear un JSON eliminado ni reescribir migraciones aplicadas.

| Elemento actual | Destino propuesto | Condición para retirar o transformar |
| --- | --- | --- |
| `users` | Cuentas del dueño/personal conservan vínculo Auth; clientes se modelan por teléfono en entidad propia, sin email/nombre/contraseña obligatorios. | Revisar `password_hash`, `full_name`, usos y FK; retirar contraseña local si no tiene uso. No eliminar cuentas que además son personal ni inventar teléfonos para clientes antiguos. |
| `roles`, `restaurant_employees.role_id` | Quitar catálogo/roles; `restaurants.owner_user_id` o relación de propiedad equivalente y vínculo simple empleado/restaurante. | Mapear owners, resolver admins heredados sin escalarlos automáticamente a dueños y preservar IDs de empleado usados en compras/premios. Ningún DROP antes de migrar referencias. |
| `invitations.role_id`, `invited_by` | Invitación privada de operador, sin rol; emisor propietario verificable. | Adaptar FK del emisor y decidir revocar/reemitir invitaciones antiguas; nunca convertir una invitación admin en propiedad por omisión. |
| `restaurants`, `locations` | Reducir campos obligatorios a lo necesario para crear el programa; ocultar gestión de sucursales del flujo inicial. | `location_id` participa en ventas, canjes y unicidad: conservar representación interna y registros históricos hasta una migración explícita. No borrar direcciones/contactos de producción sin inventario y respaldo. |
| `loyalty_programs` | Conservar meta, premio, diseño, estado, bloqueo de condiciones y `public_code` estable. | D-05 antes de unicidad del programa activo. Evitar campos de administración sin uso; preservar condiciones prometidas. |
| `memberships`, `loyalty_cards` | Relacionar inscripción con cliente telefónico, mantener UUID/token de tarjeta y añadir versión/ciclo según spec. | Unicidad de inscripción activa y FK consistentes; una recuperación devuelve la misma tarjeta. Las tablas no son redundantes solo por simplificar la interfaz. |
| Nuevas `customers`, `customer_sessions` | Identidad telefónica y sesiones revocables. | Definir índices, hashes, caducidades y retención antes del DDL. La cookie de 400 días identifica la sesión, no prueba titularidad. |
| `purchases`, `loyalty_ledger_entries` | Conservar compras y libro contable; +1 por compra y débito al canje para ciclos nuevos. | No sustituir por un contador editable en cookie. Mantener referencia única, compensaciones, actor y trazabilidad. |
| `rewards`, `reward_purchase_allocations` | Conservar premios y compras que los originan; relacionar ciclo/comprobante/entrega. | Diferenciar premios heredados ya debitados de premios nuevos; impedir doble consumo y pérdida de excedentes. |
| Nuevos comprobantes y outbox | Tokens de canje, tareas WhatsApp y eventos privados de actualización. | Unicidad por premio/versión y ciclo, consumo atómico, reintentos y limpieza de tareas sin borrar contabilidad. |
| `idempotency_records`, `audit_events` | Conservar y adaptar actores al modelo nuevo. | Son controles de seguridad, no atributos innecesarios; revisar FK y alcance de claves en la transición. |
| `closure_consents` | Retirar cierre del panel cotidiano; conservar consentimientos/histórico y definir soporte seguro. | No borrar tabla ni conceder eliminación unilateral al empleado por desaparecer la pantalla. |

Migración en expansión → conversión verificada → cambio de aplicación → retirada. Primero añadir estructuras compatibles; después copiar/mapear datos con reporte de conflictos y reconciliar saldos; finalmente retirar columnas y endpoints viejos cuando no queden consumidores. Mantener RLS y credenciales servidor fuera del navegador, también para nuevos clientes sin usuario Supabase. Clientes anónimos de Supabase no obtienen SELECT/UPDATE generales.

La conversión debe contemplar teléfonos ausentes/duplicados/no verificados, usuarios mixtos, varios owners, admins antiguos, varias tarjetas/programas, premios disponibles ya debitados y excedentes. No fusionar ni reiniciar automáticamente. Preparar ruta de reclamación de tarjetas antiguas usando acceso autenticado previo más teléfono verificado; conservar compatibilidad temporal necesaria sin ofrecer correo/Google a clientes nuevos. Resolver conflictos manualmente con evidencia antes de retirar las relaciones antiguas.

### Contratos que deben concretarse antes del código

Los nombres siguientes son **propuestas de contrato**, no endpoints existentes. P0 determina rutas definitivas compatibles con el router/OpenAPI actual y usa [TEMPLATE.md](backend/docs/specs/TEMPLATE.md) para schemas completos. Nunca aceptar `customer_id`, `employee_id`, saldo o cantidad como prueba de autorización proporcionada por el navegador.

| Operación propuesta | Entrada y autorización | Resultado/efectos |
| --- | --- | --- |
| `GET /api/public/programs/:publicCode` | Pública, limitada; código del programa. | 200 con diseño/meta/premio público; 404 si no existe; sin teléfonos ni tarjetas. |
| `POST /api/customer/session` | Teléfono/país normalizados; Origin y límites. D-01 sin OTP. | 201 con cookie de sesión y cliente existente o nuevo. No enumerar si el teléfono ya existía. |
| `POST /api/customer/enrollments` | Sesión cliente verificada, programa e idempotencia. | 201 nueva inscripción o 200 existente, tarjeta 0/N solo al crear. Rechazo si programa no admite inscripción. |
| `GET /api/customer/cards` y `/:cardId` | Sesión cliente, pertenencia comprobada servidor. | 200 con tarjetas propias, versión, saldo y premio; 404 para recurso ajeno. |
| `DELETE /api/customer/session` | Sesión/dispositivo actual y protección CSRF. | 204, revoca y borra cookie; no borra tarjeta ni saldo. |
| `POST /api/operator/scans` | Sesión personal, vínculo activo y token de tarjeta/premio con propósito explícito. | 200 con vista mínima y acciones permitidas; cero mutación contable. |
| `POST /api/operator/purchases` | Vínculo activo, tarjeta resuelta, referencia de venta, contexto comercial e idempotency key. | 201 con compra, saldo y versión; +1 fijo. Repetición idéntica retorna resultado previo sin otra compra. |
| `POST /api/customer/rewards/:id/resend` | Titular verificado, estado disponible, límites e idempotencia. | 202 tarea de envío/reenvío, sin otro premio y sin debitar. El operador solo solicita el envío al contacto ya verificado mediante contrato separado. |
| `POST /api/operator/redemptions` | Vínculo activo, token de premio, confirmación e idempotency key. | 201 constancia de entrega y nueva versión; canje/débito/ciclo/outbox atómicos. |
| Publicación, diseño e invitación/revocación | Propietario autenticado del restaurante. | Reutilizar contratos existentes que encajen; quitar rol del payload y retirar privilegios administrativos antiguos. |
| Canal WebSocket privado | Sesión y autorización por tarjeta; solo suscripción/recepción. | Eventos postcommit; rechazo de canales ajenos y cierre al perder autorización. |

Errores comunes a especificar: 400 entrada inválida; 401 sesión ausente/vencida; 403 operación no permitida; 404 recurso inexistente o ajeno sin filtrarlo; 409 venta duplicada, clave reutilizada con otro payload, premio consumido o estado incompatible; 429 límite; 503 dependencia indispensable no disponible. Definir error de código inválido/vencido sin revelar existencia del teléfono. Un fallo antes del commit no deja compra, débito, premio ni mensaje de éxito; fallo del canal de notificación después del commit se recupera sin repetir la operación comercial.

### Orden de ejecución para la siguiente sesión

Todas las fases comienzan **pendientes**. Marcar completada solo con evidencia; primero prueba RED del comportamiento, implementación GREEN y refactor. Especificar antes de probar y no eliminar pruebas heredadas solo para que la suite pase: reemplazar explícitamente las que cambian de regla y conservar regresiones de seguridad.

| Fase | Trabajo en orden | Condición de salida |
| --- | --- | --- |
| P0 — Alinear reglas y contratos | Leer este plan, Git y docs; preservar cambios existentes. Resolver D-01–D-05 con preguntas concretas para las partes afectadas. Actualizar BR-002–005, BR-007–011, BR-014–015 y las BR-006/017/020–021 afectadas por soporte; conservar las restantes salvo decisión explícita. Derivar specs de identidad, operadores, ciclo/canje, tiempo real y conversión usando plantilla. Actualizar OpenAPI antes de handlers. | Matriz BR → NC/AC → pruebas y decisiones aceptadas/pendientes, contratos completos y alcance sin contradicciones. |
| P1 — Base técnica y migración aditiva | Inventariar consumidores/campos y datos de una copia aislada; decisión DB de evolución, Drizzle/snapshots, nuevos modelos, sesiones y outbox. Probar factibilidad WebSocket en Nitro/destino, concurrencia y política de conexión. Preparar conversor repetible y reporte de conflictos. | Migraciones locales en PostgreSQL temporal, rollback/restore ensayado, FK/índices/RLS correctos; ninguna pérdida ni intervención remota. |
| P2 — Dueño, programa y QR oficial | Reducir asistente/panel, personalización móvil, publicación y descarga/impresión de QR; preservar código público y condiciones históricas. Sustituir propiedad por vínculo directo validado. | Dueño configura su negocio y obtiene QR físico decodificable; otro usuario no puede modificarlo. |
| P3 — Empleado sin roles | Correo/teléfono y autenticación; invitación/vínculo/revocación acordados; escáner principal. Quitar catálogo, selectores y autorizaciones por nombre de rol; validar pertenencia en API. | Un empleado vinculado opera solo en su restaurante; registro público no habilita caja; revocación inmediata. |
| P4 — Cliente por teléfono y cookie | Alta directa por teléfono, inscripción idempotente, tarjeta en 0, sesión larga, volver meses después, recuperación y migración de identidad antigua. | Mismo teléfono/programa recupera misma tarjeta; cookies seguras/revocables; se documenta el riesgo de suplantación por conocer el número. |
| P5 — Compra y sello autorizado | Resolver QR, confirmar venta, +1, referencia única, idempotencia, transacción/ciclo y auditoría. Preparar evento postcommit. | Reintentos/concurrencia/QR repetido no duplican; cliente y personal ajeno no mutan saldo. |
| P6 — WebSocket visible | Conectar tarjeta móvil a canal privado, eventos versionados, reconciliación, reconexión y fallback; instrumentar latencia. | Dos sesiones/dispositivos ven el sello sin recargar; desconexión/reinicio no pierden estado; aislamiento comprobado. |
| P7 — Premio y comprobante WhatsApp | Meta llena sin reinicio anticipado, premio único, token dedicado y outbox; adapter de envío, reintentos y reemisión. Aplicar D-03/D-04 confirmadas. | Premio no se duplica ni se pierde por fallo de envío; destinatario correcto y token anterior invalidado al reemitir. |
| P8 — Canje y siguiente ciclo | Escanear comprobante, confirmar entrega, consumir premio/token, debitar una sola vez, reiniciar ciclo y notificar. Manejar premios heredados sin doble descuento. | Un canje válido deja 0/N en ciclo nuevo; segundo intento no entrega ni descuenta; tarjeta/cookie siguen funcionando. |
| P9 — Retirar lo innecesario | Tras conversión conciliada, retirar roles/columnas sin uso, rutas/UI/validadores viejos y dependencias realmente huérfanas. Mantener historial, contabilidad y controles. Actualizar PRODUCT/DESIGN/README y guías. | Búsqueda de consumidores sin referencias activas obsoletas; esquema mínimo seguro; upgrade desde 0004 conserva beneficios y cuentas necesarias. |
| P10 — Aceptación y preparación de release | Recorrido móvil completo, matriz de fallos, pruebas y build; ensayo de migración con backup/restore, reporte y despliegue HTTPS con WSS configurado. Validación externa solo con destino y canales autorizados. | Evidencia separada de pruebas locales/simuladas y reales; plan de reversión operativo y limitaciones declaradas. |

### Criterios de aceptación y trazabilidad inicial

Esta matriz describe pruebas **por escribir/actualizar**, no pruebas ejecutadas. P0 enlazará cada fila con las BR actualizadas y el archivo/nombre exacto de prueba; registrar RED/GREEN en la spec correspondiente.

| AC | Requisitos | Escenario y ausencia de efectos indebidos | Nivel previsto |
| --- | --- | --- | --- |
| AC-01 | NC-002/004 | Publicar/personalizar y decodificar QR impreso abre el programa correcto; cambio visual mantiene enlace; QR público no suma sellos ni habilita empleados. | Integración + navegador |
| AC-02 | NC-001/004/005 | Alta por teléfono según D-01 crea una tarjeta 0/N; repetir petición/escaneo/número normalizado no duplica inscripción. | Unit + SQL + navegador |
| AC-03 | NC-005/006 | Tras meses simulados y recarga, cookie válida recupera ID/saldo; cookie alterada, vencida o borrada no da acceso y recuperación verificada conserva saldo. | Servidor + navegador con reloj controlado |
| AC-04 | NC-001/005/006 | Teléfono ajeno, código incorrecto/reutilizado, fuerza bruta, cambio de dispositivo y número reciclado no permiten apropiarse de tarjetas; cierre de dispositivo no borra beneficios. | Unit + integración + E2E |
| AC-05 | NC-003/007 | Empleado con vínculo suma y canjea; registro libre, vínculo revocado, cliente y empleado de otro negocio reciben rechazo sin movimientos. Sin selector de rol. | API + SQL + navegador |
| AC-06 | NC-005/007 | Escaneo solo lee; compra confirmada aporta exactamente +1; misma venta/clave, doble clic y dos empleados concurrentes dejan una compra y un movimiento. Autooperación se rechaza incluso con identidades separadas. | Unit + concurrencia SQL + E2E |
| AC-07 | NC-008 | Cliente conectado recibe cambio por WSS sin recargar, con objetivo de latencia medido; evento previo al commit o de transacción fallida nunca muestra éxito. | Integración + dos contextos navegador |
| AC-08 | NC-006/008 | Evento duplicado/fuera de orden, hueco de versión, reinicio y desconexión no corrompen saldo; recuperar foco reconcilia con DB; canal ajeno y sesión revocada son rechazados. | Integración WebSocket + navegador |
| AC-09 | NC-007/009 | N compras válidas generan un premio por ciclo; tarjeta permanece N/N hasta entrega. Compra adicional se trata según D-03, sin pérdidas silenciosas. | Dominio + SQL |
| AC-10 | NC-009 | WhatsApp apunta al titular según D-04, fallo/reintento no duplica premio, reemisión revoca QR anterior, callback de entrega no canjea. | Adapter + integración; prueba real separada |
| AC-11 | NC-009 | QR de tarjeta no canjea; premio ajeno, token inválido/vencido/consumido y vista previa de enlace no mutan saldo. Un comprobante válido confirmado entrega una vez y deja 0/N. | Unit + SQL + E2E |
| AC-12 | NC-006/008/009 | Dos canjes simultáneos o reintento tras timeout generan una entrega; cliente ve reinicio y conserva tarjeta/cookie; próxima compra empieza 1/N. | Concurrencia SQL + navegador |
| AC-13 | NC-010 | Upgrade desde copia 0004 conserva compras/saldos/premios y usuarios mixtos; no doble débito heredado; conflictos de identidad se reportan, no se fusionan. Restauración ensayada. | Migración + conciliación SQL |
| AC-14 | NC-001/002/003 | Recorrido completo móvil y escritorio accesible: dueño → QR físico → empleado vinculado → cliente → compra → premio → canje → regreso meses después. Cámara real y WhatsApp real se reportan solo si se probaron. | E2E navegador + aceptación física |

Validación futura desde raíz: `npm run check`, `npm run build`, `npm run db:check`, `npm run generate` (segunda generación sin deriva tras generar lo esperado), `npm run test:db -- --sequence.shuffle --sequence.seed=20261019` y `npm run test:browser:production`; ampliar harness para WSS y nuevo flujo. `npm run test:db -- --coverage` solo si se va a informar cobertura nueva. Probar migraciones sobre base temporal aislada, nunca apuntar tests al `.env` real. `git diff --check` y revisión de secretos/documentación al cerrar. Los comandos existentes se revisaron en package.json; no se ejecutaron como verificación funcional de este plan.

### Límites de despliegue y cierre de ejecución

La siguiente implementación puede preparar código, SQL, pruebas y artefactos localmente. Aplicar migraciones destructivas/remotas requiere identificar destino, inventario actual, respaldo restaurable, reporte de conversión y autorización vigente para ese destino. La autorización anterior de 0004 no autoriza por sí sola eliminar tablas o transformar clientes reales con este nuevo plan. No usar `drizzle push` ni reescribir 0000–0004. Probar recuperación desde backup en entorno aislado y preferir rollback de aplicación compatible antes de cualquier DROP irreversible.

Pendientes externos: proveedor de verificación telefónica, cuenta/remitente WhatsApp, configuración y consentimiento de envío, dominio HTTPS estable, soporte WSS/proxy, credenciales y dispositivos físicos. Su ausencia bloquea aceptación real de esos puntos, no el trabajo local independiente. No modificar `.env`, enviar WhatsApp, crear usuarios reales, migrar Supabase, publicar commits o desplegar como consecuencia de esta tarea documental.

Al terminar cada fase, registrar archivos/specs, decisiones, pruebas reales, tareas pendientes y cambios de esquema en este archivo y `backend/docs/development-status.md`; mantener `backend/AGENTS.md` enlazado a este plan. La entrega final debe demostrar el recorrido completo y los rechazos de fraude, además de indicar qué servicios externos se verificaron realmente.

## Estado de la última sesión — 2026-10-18

- Backend preparado con dependencias exactas y lockfile propio, TypeScript, Biome y Vitest por niveles. Sin cambios en frontend ni código de aplicación.
- Contexto canónico en backend/docs, flujo spec-first/spec-anchored/TDD y tres skills de proyecto; reglas de eliminación confirmadas por el usuario.
- Esquema Drizzle adaptado del JSON original (11 tablas/16 relaciones); correcciones DB-001 y DB-002 autorizadas. Comandos generate/migrate y migración SQL local. .env preservado.
- Verificaciones: análisis estático, tipos, 4 tests de tooling, generación SQL y comprobación de historial satisfactorios. Migración aplicada dos veces en PostgreSQL 17 temporal: 11 tablas, 16 FK y un único registro de migración; contenedor retirado. Instalación limpia y auditoría sin vulnerabilidades. Detalle final y limitaciones en backend/AGENTS.md.
- No se aplicaron migraciones a la BD del usuario, ni se implementaron pruebas funcionales, ni se hizo commit/push.
- Próximo paso: resolver decisiones pendientes de negocio y escribir la primera spec funcional antes de implementar con TDD.

### Solicitud de aplicación en Supabase — 2026-10-18

Aplicación autorizada por el usuario. Check, generate (sin cambios) y db:check satisfactorios. Conexión previa rechazada por autenticación (28P01); sin migración remota ejecutada. Pendiente corregir DATABASE_URL local y reintentar. Detalles en backend/AGENTS.md; sin secretos registrados.

### Aplicación en Supabase completada — 2026-10-18

El usuario corrigió DATABASE_URL local y se resolvió la autenticación. Inventario previo vacío. npm run migrate finalizó correctamente: 11 tablas, 16 FK, 11 PK, 4 restricciones únicas y 13 CHECK; un registro de migración cuyo hash coincide con el SQL local. Check, generate y db:check satisfactorios. Sin lógica de aplicación ni pruebas funcionales; sin commit/push. Detalles y próximos pasos en backend/AGENTS.md.

### Skill de descubrimiento instalada — 2026-10-18

Instalada find-skills de vercel-labs/skills para Codex en .agents/skills/find-skills; origen/hash en skills-lock.json. Validación SKILL.md y listado satisfactorios. Las skills loyalty se conservan, sin cambios de aplicación, dependencias de producto o Supabase. Comandos y alcance documentados en backend/README.md. Próximo paso: descubrir skills específicas según las necesidades de desarrollo.

### Commit de configuración autorizado — 2026-10-18

Usuario solicitó commit y push a origin (https://github.com/jMarlonDev/loyalty-program.git), rama main. Backend verificado con análisis estático, tipos, cuatro pruebas de tooling e historial Drizzle. Archivos candidatos revisados sin credenciales del .env; secretos y dependencias excluidos. Commit preparado con Conventional Commits; consultar git log y origin/main para el resultado de publicación. Detalle en backend/AGENTS.md. Próximo paso: primera spec funcional, sin ampliar el alcance de implementación.

### Publicación pendiente por autenticación — 2026-10-18

Commit local creado; consultar git log -1. Push HTTPS rechazado por falta de credenciales y SSH por clave pública no aceptada. No se publicó en origin. Pendiente autenticación de GitHub en el equipo y reintentar git push -u origin main; configuración verificada y sin secretos versionados.


### Plan de negocio documentado — 2026-10-18

- Usuario autorizó guardar el plan, actualizar documentación, crear commit y publicar en main, incluido acceso al directorio padre.
- Plan completo en backend/docs/specs/BACKEND-001-plan-de-negocio.md: registro por QR con correo/contraseña o Google OAuth mediante Supabase Auth, fases de negocio, contratos previstos y aceptación. Reglas canónicas e índice actualizados; no hay implementación funcional.
- Fetch de origin satisfactorio: main y origin/main coincidían en b1d0000 antes de este commit. La publicación anterior fue completada por el usuario; las incidencias previas de autenticación se conservan como historial.
- Verificaciones: npm run check satisfactorio (Biome, TypeScript y 4 tests de tooling), enlaces documentales, 21 BR y 16 AC, y git diff --check. Sin pruebas funcionales, cambios de esquema, configuración Google o modificaciones de Supabase.
- Próximo paso: primera spec de módulo y TDD cuando se autorice implementar. La publicación del nuevo commit se verificará mediante Git y se informará al cierre; no se anticipa aquí su resultado.

### Publicación del plan pendiente de autenticación — 2026-10-18

- Plan y documentación guardados en un commit local; consultar git log -1 para el identificador final.
- Push HTTPS rechazado por falta de credenciales en esta sesión; comprobación SSH rechazada por clave pública no aceptada. Sin cambios en remoto o autenticación, sin secretos expuestos.
- Pendiente publicar con git push -u origin main desde la terminal autenticada del usuario. Este resultado se incluye en el mismo commit documental; las verificaciones del plan permanecen satisfactorias.


### Desarrollo delegado y resumen — 2026-10-18

Implementados módulos de identidad, restaurantes/personal, programas/tarjetas y fidelización, con servidor, OpenAPI y tests. Verificación global: 208 de 210 pruebas pasan, cinco E2E correctos; quedan auditoría de programas y rechazo de contabilidad histórica incompatible, además de formato/tipos. Sin nuevos commits ni push; propuestas en backend/docs/development-status.md. Sin cambios remotos en Supabase/frontend/credenciales. La revisión de subagentes se interrumpió por límite de uso; CI, ejemplos y Google real siguen pendientes. Detalles/evidencia y próximos pasos en backend/AGENTS.md.


### Verificación completada y commits autorizados — 2026-10-18

- Cerrados fallos de auditoría y contabilidad histórica, tipos y formato. 210/210 pruebas pasan con PostgreSQL 17 temporal; check/build/db:check/generate sin cambios/diff --check satisfactorios. Caché descargable npm retirada para resolver disco lleno; código y dependencias instaladas preservados.
- Ocho commits funcionales creados (7849d8c a dc32092), más cierre documental identificable en git log. Usuario autorizó commit y push; HTTPS rechazó ausencia de credenciales y SSH rechazó la clave pública. No hubo publicación ni cambios de autenticación; no fue rechazo de permisos del entorno.
- Pendiente git push origin main desde sesión GitHub autenticada. Sin cambios remotos Supabase/frontend/credenciales. CI, ejemplos, Google real y despliegue pendientes; detalle en backend/docs/development-status.md y backend/AGENTS.md.


### Auditoría de calidad y datos de prueba — 2026-10-18

- Añadidas 190 pruebas y reforzadas las existentes: 400/400 correctas (6 tooling, 217 unit, 159 integración, 18 E2E), con PostgreSQL 17 temporal y orden aleatorio. Se insertaron datos SQL en las 16 tablas y se comprobaron 31 FK, 16 CHECK, unicidad, RLS, rollback y eliminación de la base exclusiva. Inventario Docker final sin contenedores de pruebas.
- Corregidos UUID equivalentes rechazados, conexión devuelta al pool tras fallar rollback, fixtures dependientes del orden y espera prematura de initdb. Evidencia RED/GREEN en specs y backend/docs/testing-quality.md.
- Cobertura global: 94,36 % líneas, 92,78 % sentencias, 90,47 % ramas, 95,54 % funciones; umbral mínimo 90 %. Check, build, db:check, generate sin cambios y diff --check satisfactorios.
- Sin cambios de frontend, credenciales, esquema ni Supabase; sin commit/push en esta revisión. Pendientes proveedor real, CI, carga y validación operativa de despliegue; detalles y límites en el informe de calidad.


### Validación externa solicitada — 2026-10-18

- Supabase comprobado mediante consultas READ ONLY: 11 tablas vacías, 16 FK, 13 CHECK y una migración aplicada con hash coincidente con 0000; sin usuarios Auth. Migraciones 0001–0003 pendientes, sin cambios remotos realizados.
- Google Auth responde 400 indicando proveedor no habilitado. Health/settings sin clave pública responden 401; correo real no validado. Faltan SUPABASE_URL, clave pública y CARD_TOKEN_ENCRYPTION_KEY en configuración local.
- Build correcto; npm start falla por configuración. Sin URL del backend desplegado ni cuenta/bandeja de prueba disponibles; solicitadas al usuario. Pendiente completar configuración y flujos externos; migraciones remotas requieren autorización específica.
- Informe en backend/docs/external-validation.md. Sin código, credenciales, frontend, migraciones, usuarios ni correos modificados; sin commit/push. Las 400 pruebas previas no se repitieron en esta comprobación externa.

### Migración fullstack en curso — 2026-10-18

- Lectura del contexto y preservación de cambios previos. Subagentes separados para HTTP, frontend y sesión/pruebas; ensamblaje y despliegue por principal.
- Baseline: 400 pruebas originales correctas en PostgreSQL 17 temporal; 6 tooling y 217 unit correctas en check. Tres pruebas nuevas de transporte se incorporaron durante la suite (401 correctas y 2 RED de 403).
- TanStack Start en raíz, scripts unificados, retiro de Hono y servidor separado, dependencias exactas. Impeccable hooks activados en configuración; no había manifiesto de proveedor local, detector manual previsto.
- Configuración de origen: cinco aserciones RED antes de validar APP_ORIGIN; seis pruebas GREEN después. La preparación aún requiere checks finales y navegador, no se afirma entrega terminada aquí.
- Sin modificaciones remotas, secretos ni publicación. Próximo paso: integrar las superficies y ejecutar aceptación completa y artefacto de producción.

### Cierre de migración fullstack — 2026-10-18

- TanStack Start/React/Router/Query con shadcn/Radix/Tailwind; aplicación y API en un proceso Nitro/Node. Personalización móvil, QR público/privado, administración, cliente, compras, premios, reversión y consentimiento. Dominio, esquema y migraciones preservados; 41 contratos HTTP (39 previos y dos lecturas administrativas).
- Retirados Hono/adaptador, servidor y helper de cierre antiguos, build backend, lockfile duplicado y frontend vacío. Workspace/lockfile raíz; generación de rutas antes de tipos, scripts de entorno y pruebas, CI y Dockerfile. No se descartaron cambios previos.
- Verificación final: 409/409 backend en PostgreSQL 17 temporal y orden aleatorio (6 tooling, 221 unit, 164 integración, 18 E2E); cobertura líneas 97,33 %, sentencias 95,96 %, ramas 90,90 %, funciones 99,03 %. UI/sesión/composición 64/64 (20 UI + 44 servidor). Navegador producción 10/10 (5 escritorio + 5 móvil), con Axe en superficies recorridas y fixtures externos de Auth; DBs/contenedores temporales retirados. Check, tipos, build, db:check, generate sin cambios y diff --check correctos. No atribuir cobertura backend al frontend.
- RED/GREEN y revisión cruzada corrigieron transporte Request Nitro, headers/IP/cuerpo/consultas, logout con acceso caducado, consentimiento y permisos UI. El harness reinicia servidor/BD por viewport para evitar mezclar tráfico de dos suites bajo el límite real 120/min; no se desactiva el control de producción.
- Impeccable PRODUCT/DESIGN y hook.enabled configurados. El launcher no encontró proveedor local para instalar disparador automático; detector manual ejecutado (dos avisos estéticos Fraunces acorde referencias). No se afirma hook automático operativo.
- Entorno real pendiente: APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CARD_TOKEN_ENCRYPTION_KEY ausentes; env:check lo reporta sin secretos. Supabase remoto no modificado; inventario anterior solo 0000, migraciones 0001–0003 requieren paso de release. Google/SMTP reales, hosting/TLS/carga/backups pendientes. Sin Wallet, subida de imágenes ni escáner de cámara integrado. Dockerfile preparado, imagen no construida en esta sesión.
- Informe completo y comandos en docs/project-review-2026-10-18.md y docs/deployment.md. Sin commit/push. Próximos pasos: completar entorno, validar proveedor real, migrar el destino elegido y desplegar/comprobar ready.

- Instalación limpia final desde la raíz: `npm ci --ignore-scripts --no-audit --no-fund` correcta (343 paquetes). Se regenera `src/routeTree.gen.ts` antes de tipos y se excluye de Git; ampliación de tipos Start explícita para checks antes del primer build. Docker final sin contenedores de pruebas.
- Tras la instalación limpia, `npm run check` volvió a pasar completo (lint, tipos, 64 UI/servidor, 6 tooling y 221 unit), `npm ls --depth=0` y auditoría sin vulnerabilidades correctos; `git diff --check` limpio.

### Corrección de acceso y diseño general — 2026-10-18

- Solicitud: corregir creación de cuentas/consulta de tarjetas, explicar configuración Supabase/Google y eliminar temática de café. Cambios previos preservados; dos subagentes para UI y servidor. Sin commit/push ni cambios de `.env`, credenciales, esquema o Supabase remoto.
- Diagnóstico actual `npm run env:check`: faltan APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y CARD_TOKEN_ENCRYPTION_KEY; sin ellas el runtime no inicia operaciones. Inventario remoto no repetido: 0000 aplicada/Google deshabilitado son datos de la revisión anterior, no una nueva comprobación.
- Errores Auth específicos y seguros, retorno desde callback fallido y desde Google con configuración incompleta; selector de destino Mis tarjetas/Administrar conservado durante confirmación de correo, errores iniciales visibles y continuación de sesión existente. Specs AUTH-002 y ACCESS-001 con RED/GREEN. No se cambia Supabase Auth ni reglas de inscripción: crear cuenta no crea tarjeta sin unirse al programa.
- UI azul tinta/lima y DM Sans, iconos de sellos/tarjetas y ejemplo Club Vuelta; eliminadas referencias a café en UI/fixtures frontend. Navegación Programas/Operaciones/Mis tarjetas. PRODUCT/DESIGN actualizados. Launcher Impeccable no disponible por ausencia de engine/cache; se leyó contexto y guía directamente, sin afirmar ejecución del detector automático.
- Verificación: `npm run check` correcto (86 UI/servidor: 25 UI + 61 servidor; 6 tooling + 221 unit backend); build correcto; 10/10 navegador de producción (5 escritorio + 5 móvil), PostgreSQL17 temporal, Auth simulado y Axe en superficies recorridas. Inspección de capturas desktop/móvil. Docker final sin contenedores loyalty-test. Enlaces documentales y `git diff --check` correctos. No se repitió suite backend completa de integración/cobertura ni se acredita OAuth/SMTP real.
- Guía completa en docs/supabase-setup.md y enlace desde README/despliegue: dos callbacks, Google Cloud, Email/SMTP, variables, migraciones y recorrido de uso. Pendiente operador: completar entorno, configurar proveedor real, revisar/aplicar pendientes 0001–0003 al destino elegido y validar cuentas reales. No se aplicaron migraciones remotas.

### Acceso móvil, escaneo y sesión persistente — 2026-10-18

- Usuario requiere acceso desde cualquier lugar con HTTPS, pero confirma que todavía no tiene URL pública ni despliegue. Se preparó el código y la guía de publicación; no se afirma disponibilidad remota. Cambios previos preservados, sin commit/push, cambios de `.env`, credenciales, esquema ni Supabase.
- Origen canónico por GET /api/public-config sin secretos ni dependencia DB; programas, invitaciones y tarjetas usan APP_ORIGIN, con aviso para localhost. `env:check -- --public` rechaza correctamente el origen local actual. Plantilla raíz `.env.example` añadida con todas las variables, sin conexión local ficticia activa que sustituya el fallback válido.
- Tarjeta con permalink /cards?card=uuid y entrada /scan desde QR privado en fragmento. Personal autorizado recibe formulario sin agregar sellos automáticamente; cámara ZXing 0.2.1 bajo demanda y alternativa manual. QR pendiente por pestaña TTL10min, eliminado tras resolver/logout; reinicia formulario al abrir otro QR en la misma pestaña. Autorización/compra idempotente del backend conservadas.
- Refresh HttpOnly renovable de 400 días, renovación al recuperar foco/conexión y cada cuatro minutos visible; serializa refresh/logout y sincroniza cierre entre pestañas. Fallos temporales conservan identidad; sesión revocada sí requiere acceso. Primer perfil se crea antes de habilitar consultas de tarjetas, evitando la carrera observada en navegador. /auth con usuario muestra continuar; recuperaciones siguen disponibles.
- Specs MOBILE-001, MOBILE-QR-001 y SESSION-003 con evidencia RED/GREEN. Check pasó con 131 UI/servidor y 227 backend (6 tooling + 221 unit); regresión final de segundo QR 6/6 aislada y suite UI/servidor final completa 132/132 correctas. Tipos/build finales y navegador registrados en development-status.md. Cámara con permisos/recursos simulados; pendiente validación física y Google/SMTP reales. No se repitió cobertura ni toda la suite backend de integración.
- README, guía de despliegue/Supabase, PRODUCT/DESIGN y estado actualizados. Impeccable consultado manualmente; launcher indisponible por caché, sin afirmar detector automático. Próximo paso: elegir hosting Node/Docker HTTPS, cargar variables, configurar callback, revisar/aplicar migraciones pendientes al destino y validar desde datos móviles. No se ejecutaron esos pasos remotos.

- Aceptación final: 132/132 UI/servidor y 10/10 navegador producción (5 escritorio + 5 móvil), tipos/build correctos; Axe y capturas revisadas. Registro, recuperación, continuidad QR tras login, compra/canje y reintento de sesión correctos con proveedor simulado. `git diff --check` y enlaces documentales correctos.

Limpieza final verificada: Docker sin contenedores loyalty-test activos. Sin cambios remotos ni publicación.

### Revisión y publicación Git autorizadas — 2026-10-18

- Usuario autorizó crear todos los commits y subirlos al repositorio. Revisados 167 archivos pendientes por contenido/diff; inventario individual y agrupación en docs/commit-review-2026-10-18.md (archivo adicional). Fetch de origin satisfactorio y main coincidía con origin/main antes de preparar commits.
- Sin código funcional nuevo: se aclaran referencias históricas de pruebas, instalación desde raíz y estado de integración. Validación funcional procede de la tarea inmediatamente anterior: 132 UI/servidor, 227 backend unidad/tooling y 10 navegador producción; no se repitió innecesariamente. Diff sin errores y revisión de secretos sin coincidencias.
- Cuatro commits previstos: rollback/pool; aplicación fullstack con pruebas/specs; CI/despliegue; documentación/inventario. Secretos, dependencias y artefactos excluidos. Push pendiente de ejecutar; su resultado se añadirá tras comprobar el remoto, sin anticiparlo. No se modifica Supabase ni se despliega hosting.

### Resultado de publicación — 2026-10-18

- Creados los commits `a37075d` (rollback/pool), `e278208` (aplicación fullstack, móvil, sesión y pruebas), `56139be` (CI/despliegue) y `069906c` (documentación e inventario). El cierre documental de este resultado se añade como quinto commit; identificarlo con `git log -1`.
- Push HTTPS rechazado por ausencia de credenciales de usuario; intento SSH rechazado por clave pública no aceptada. GitHub CLI no está instalado, no hay helper de credenciales ni tokens GitHub disponibles en el entorno. No se cambió autenticación, claves ni URL de origin. No fue rechazo de permisos del entorno: ambos intentos se ejecutaron.
- `git ls-remote origin refs/heads/main` confirmó `749ceaac0ce2d864c79f2aa6f801debcaf517e80`: los nuevos commits NO están publicados. La rama local conserva el trabajo y la serie completa queda pendiente de `git push origin main` desde una sesión autenticada.
- Revisión de 167 archivos iniciales más informe, sin secretos/artefactos incluidos; diff sin errores. Pruebas funcionales de la tarea anterior conservadas y citadas, sin nuevas ejecuciones innecesarias ni cambios funcionales. Sin cambios de Supabase, esquema o despliegue. Próximo paso requerido: autenticar GitHub en el equipo y publicar main; disponer de permisos de archivos no sustituye la autenticación del remoto.

### Push del usuario verificado y diagnóstico de aplicación — 2026-10-18

- El usuario informó haber ejecutado `git push origin main`. Verificación remota de solo lectura: origin/main apunta a `6ba2cfdd88229a820fe669b4f01ee7fdcc29d3cd`, igual que HEAD; diferencia 0/0. La publicación anterior ya está completada por el usuario, y el bloqueo registrado arriba queda como historial.
- El servidor local en puerto 3000 ejecuta esta copia del proyecto. GET /api/public-config y GET /scan respondieron 200; se reconocieron el origen público y la pantalla nueva de escaneo, sin consultar cuentas ni tarjetas privadas. Las rutas nuevas sí están presentes en el servidor local; falta identificar qué cambio concreto no observa el usuario y desde dónde lo consulta.
- El workflow GitHub solo verifica código; no contiene un job de despliegue. Push no reinicia procesos ni publica hosting. No se reinició servidor, cambió código funcional, ejecutó migraciones ni afirmó una causa de caché/compilación sin evidencia. Documentación actualizada localmente para reflejar la publicación confirmada.

### Separación de roles y cuentas reales verificadas — 2026-10-18

- Employee solo escanea y registra compras/sellos. Owner/Admin gestiona todo su negocio, incluidos Admin/Employee; se conserva protección del propietario y aislamiento entre restaurantes. Cliente ve sus tarjetas, con actualización cada diez segundos mientras están visibles, al recuperar foco/conexión y manualmente. Alta de negocio explícita; QR e invitaciones conservan destino. Cambios previos FLOW-001/002 y DB-005 preservados.
- Reglas y ROLE-001 actualizadas antes de implementar con RED/GREEN. Restricciones Employee aplicadas también en API y replays: sin crear restaurantes, gestionar sucursales/programas, canjear o cerrar tarjetas. Corregido actor_role ausente en GET restaurante singular que impedía reconocer al administrador al abrir un QR; contrato OpenAPI y tres regresiones SQL añadidos.
- Check correcto: 175 UI/servidor, 7 tooling y 221 unit backend. Suite backend completa PostgreSQL17 con orden aleatorio: 418/418; después de la corrección de actor_role, staff 21/21 y check backend repetido correctos. Build final, tipos, generate sin cambios, db:check y nueve pruebas específicas de migración correctos. No se volvió a medir cobertura.
- Navegador de producción por HTTPS local: 10/10, cinco escritorio y cinco móvil, con PostgreSQL/Auth aislados, QR decodificados desde sus píxeles, permisos del rol admin exacto, actualización de sellos entre sesiones y cookies Secure/HttpOnly. Axe y desbordamiento comprobados en superficies recorridas; capturas de tarjetas, operaciones y administración revisadas en ambos tamaños. Cada escenario reinicia servidor/BD sin relajar límites de producción.
- Usuario autorizó aplicar 0004 al Supabase configurado: migrate correcto, cinco migraciones con hash 0004 coincidente y slug retirado. Las dos identidades y el restaurante anteriores se conservaron; no se alteraron sus credenciales.
- Tras configurar el usuario SUPABASE_SERVICE_ROLE_KEY, accounts:seed creó tres cuentas reales: administrador propietario (owner), employee y cliente, más restaurante/sucursal/programa de cinco sellos y tarjeta. Datos de negocio creados por API normal. Manifiesto privado/reanudable .cache/test-accounts.json modo0600 ignorado por Git; siete pruebas del comando correctas. Segunda ejecución sin duplicados ni cambio de contraseñas.
- Aceptación real Chromium completada con producción temporal en loopback3200: tres accesos, vistas por rol, Employee 403 al crear restaurante, QR con controles administrativos para Owner y compra Employee. Cliente actualizado a 1/5 sellos sin recargar; esa compra se conserva. Informe privado .cache/real-acceptance.json. Inventario final READ ONLY: cinco identidades y dos restaurantes totales, una sucursal/programa de prueba y exactamente una compra de aceptación. Servidor temporal detenido; servidor del usuario en 3000 intacto.
- Túnel público rechazado por revisión automática ante posible exposición de datos reales; binario temporal retirado. HTTPS validado en loopback con certificados efímeros. No se acredita hosting público, OAuth/SMTP real ni cámara física. Impeccable consultado directamente por launcher sin motor/caché; no se afirma detector automático.
- README, guías de cuentas/Supabase/despliegue, specs, índice y estado actualizados. Sin commit/push. Próximo paso externo: disponer de URL HTTPS desplegada, configurar APP_ORIGIN/callback y comprobar cámara desde teléfonos; la creación habitual de Admin/Employee se realiza por invitación de Equipo y el cliente por inscripción al programa.
- Cierre del harness reforzado para señales y conexiones abiertas: escenario HTTPS móvil repetido 1/1 correcto tras el ajuste, Biome y tipos correctos. Certificados de intentos anteriores retirados; inventario final sin directorios TLS ni contenedores loyalty-test. Revisión de 75 archivos candidatos sin coincidencias con secretos locales; enlaces documentales y diff --check correctos.

### Acceso de desarrollo desde la red local — 2026-10-18

- Diagnóstico real: Vite escuchaba en 192.168.33.9 pero APP_ORIGIN seguía en localhost. localhost rechazaba conexión y POST /api/session por LAN devolvía 403 de origen. Se preservó la IP elegida por el usuario y se añadió --strictPort; APP_ORIGIN local cambiado a http://192.168.33.9:3000, conservando las demás variables y credenciales. Proceso Vite de este proyecto reiniciado y dejado activo para pruebas.
- MOBILE-001 ampliada antes de implementar. IPv4 privadas RFC1918 por HTTP solo en NODE_ENV=development; producción, IP pública, dominios que parecen IP y orígenes diferentes siguen rechazados. UI y QR reconocen LAN. Cookies HttpOnly/SameSite y comprobación de Origin conservadas. Idempotencia usa getRandomValues para funcionar en HTTP sin randomUUID ni perder reintentos.
- RED: seis fallos de origen/UI, tres casos de dominios con prefijo de IP y un fallo de operación sin randomUUID. GREEN focal: 64 configuración/sesión/puente/UI y cinco API. npm run check final correcto: lint, tipos, 192 UI/servidor, siete tooling y 221 unit backend. env:check correcto; --public rechaza el HTTP LAN como corresponde. No se repitieron build de producción, suite SQL completa ni cobertura, ajenos a este ajuste de desarrollo.
- Chromium contra Supabase real por LAN: tres accesos, escritorio/móvil emulado, cookies, recarga, QR, referencia de venta existente rechazada con 409 y origen ajeno con 403. Saldo observado 2/5 se conservó; no se creó una compra. Se corrigió una aserción que suponía el saldo histórico 1/5, sin modificar datos. Informe privado .cache/lan-acceptance.json; enlaces del manifiesto actualizados, contraseñas intactas.
- README, .env.example, guía Supabase, spec y estado actualizados. Sin migraciones, cambios de configuración remota, commit ni push. Pendiente comprobar teléfono físico/red del usuario; cámara dentro de la web requiere HTTPS confiable. Confirmación/recuperación/Google por LAN requieren añadir el callback exacto en Supabase; no se afirmó ese ajuste remoto. Abrir http://192.168.33.9:3000 en ambos dispositivos y reiniciar Vite ante cambios de host/origen.

### Servidor de desarrollo detenido — 2026-10-18

A solicitud del usuario se detuvo mediante SIGTERM la instancia Vite de este proyecto que el agente había iniciado en 192.168.33.9:3000. Verificación con ss: puerto 3000 sin escucha. Sin cambios de aplicación, configuración o Supabase; no correspondía ejecutar pruebas funcionales. El servidor queda apagado hasta que el usuario ejecute npm run dev.

### Inventario temporal de estilos — 2026-10-19

- Revisados estilos CSS, componentes y colores explícitos de la aplicación; creado `.cache/development/paleta-colores-tipografia.md`, temporal y excluido de Git por la regla existente `.cache/`.
- Inventario: 37 valores de color (incluidas transparencias, QR y programa de prueba), 173 declaraciones de color y 200 declaraciones tipográficas, con selectores, propiedades, referencias y condiciones responsive. Documentados DM Sans Variable, herencia, colores configurables y discrepancia existente entre theme-color y fondo de aplicación.
- Verificación estática mediante parser PostCSS, revisión de valores del QR y Fontsource instalados, exclusión Git confirmada y `git diff --check` correcto. No se ejecutaron pruebas funcionales por tratarse de documentación; sin cambios de estilos, dependencias, configuración ni datos remotos. Cambios previos preservados.
- Impeccable consultado; launcher sin motor local disponible, contexto leído directamente. Próximo paso opcional: usar el inventario para una futura modificación de paleta y actualizarlo cuando cambie el código.

### Plan de fidelización por teléfono y QR documentado — 2026-10-19

- Solicitud limitada a documentar. Añadido LOYALTY-NEXT-001 al inicio de este AGENTS como contexto vigente de todo el proyecto: diez requisitos, cinco decisiones pendientes, once fases P0–P10 y catorce criterios de aceptación. Incluye alta/recuperación por teléfono, cookie opaca de 400 días, tres QR, vínculo seguro de empleados sin catálogo de roles, compra única, premio/canje, WhatsApp, WebSocket privado y migración Drizzle sin pérdida de beneficios.
- Revisados esquema local de 16 tablas, reglas y módulos de compras/QR; identificadas diferencias con roles, identidad y débito automático anteriores. Actualizados los avisos de precedencia en backend/AGENTS, reglas, índice y estado, manteniendo el historial y los cambios previos. Las decisiones D-01–D-05 se distinguen de los requisitos explícitos; no se inventaron respuestas del usuario.
- Comprobaciones documentales: IDs y fases completos/únicos, enlaces locales y ancla válidos, comandos existentes contrastados y `git diff --check` correcto. Comparación de hashes antes/después: únicamente cinco archivos Markdown modificados por esta tarea. Referencias técnicas oficiales de cookie/WebSocket incluidas en el plan.
- No se ejecutaron pruebas funcionales ni se cambió aplicación, esquema, migraciones, dependencias, `.env` o datos remotos; sin envíos, commit/push o despliegue. README no cambió porque no se modificaron requisitos o comandos de preparación. No se atribuyen las pruebas anteriores al flujo nuevo.
- Próximo paso: en la siguiente sesión de implementación, empezar por P0, resolver las decisiones de negocio afectadas y seguir P1–P10 con specs y TDD. Verificación telefónica/WhatsApp reales y hosting HTTPS/WSS requieren proveedor, configuración y destino; no impiden avanzar en trabajo local independiente.

### Alineación NEXT-001 y ciclo separado — 2026-10-19

- D-01–D-05 quedaron registradas en AGENTS, specs NEXT-001–003 y reglas BR. El usuario pidió después eliminar el OTP: D-01 queda como acceso simple por teléfono normalizado, con el riesgo de suplantación documentado. El intento de señalización OTP (tabla `phone_challenges`, migración 0007) se retiró antes de aplicarse; `npm run generate` no detecta deriva.
- Correcciones locales en `backend/src/infrastructure/next-repository.ts`: mutaciones con `Origin` obligatorio; el dueño necesita vínculo de operador explícito; D-03 abre un ciclo separado si hay premio pendiente; el canje usa el ciclo del premio, debita solo ese ciclo y conserva ciclos posteriores; el saldo se calcula del libro; los premios se listan por membresía; la reemisión de comprobante incrementa `version`; referencia de venta duplicada responde 409; la sesión cliente ya no reutiliza cuentas existentes por coincidencia de teléfono.
- Verificación de la sesión: `npm run check` correcto (225 UI/servidor, 10 tooling, 256 unit backend); `npm run test:db -- --sequence.shuffle --sequence.seed=20261019` correcto (517/517, 37 archivos, PostgreSQL 17 temporal); `npm run build`, `npm run db:check` y `npm run generate` (sin cambios) correctos. La espera del contenedor de pruebas se amplió por lentitud del host.
- Pruebas adaptadas sin eliminar regresiones: `next-flow` cubre ciclo separado, saldo remanente y dueño sin vínculo; `http-access` exige Origin; la UI tolera `cycle` nulo. No se ejecutó navegador, WSS real, WhatsApp real ni migración remota en esta sesión.
- Próximo paso: P7 (outbox de entrega/reenvío desde la tarjeta) y P9/P10 con conciliación, navegador y preparación de release.
