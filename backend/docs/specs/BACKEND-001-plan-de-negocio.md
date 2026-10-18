# BACKEND-001 — Plan del backend con registro por QR, correo y Google

Estado: aceptada para planificación y publicación documental; no implementada. Fecha: 2026-10-18.

## Problema y alcance

Desarrollar en una etapa posterior la primera versión funcional del backend de fidelización con Hono, Drizzle/PostgreSQL y Vitest. Hoy existen esquema y herramientas; no hay servidor, endpoints ni pruebas funcionales. Este documento guarda el plan acordado y sus valores de diseño; no constituye evidencia de implementación ni autorización para migrar Supabase.

El QR del programa permitirá al cliente registrarse manualmente con correo y contraseña o continuar con su cuenta de Google. Ambos métodos usarán Supabase Auth y conducirán al mismo flujo de inscripción, membresía y tarjeta.

La implementación futura seguirá especificación → prueba RED → implementación GREEN → refactorización. Cada fase tendrá una spec persistente por módulo, con contratos completos, rechazos, efectos transaccionales y trazabilidad. Frontend continúa reservado; aquí se documenta el contrato que deberá consumir.

## Referencias

- [Reglas canónicas BR-001 a BR-021](../business-rules.md): decisiones de negocio, identidad, roles, sucursales, sellos, premios, diseño y cierre. No mantener un catálogo paralelo de reglas en este plan.
- [Arquitectura](../architecture.md): monolito por capas, dominio sin Hono/Drizzle/red y autorización en casos de uso.
- [Flujo spec-first y TDD](../workflow.md) y [plantilla](TEMPLATE.md).
- [DB-001](../decisions/DB-001.md) y [DB-002](../decisions/DB-002.md): excepciones iniciales del modelo.
- Supabase: [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [vinculación de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking), [redirecciones](https://supabase.com/docs/guides/auth/redirect-urls), [validación de tokens](https://supabase.com/docs/reference/javascript/auth-getclaims) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Referencias consultadas el 2026-10-18; comprobar compatibilidad al implementar.

## Contrato

### Autenticación e inscripción desde el QR

1. El QR abre `/join/:publicCode` en el futuro cliente web.
2. Se consultan restaurante, programa, meta, premio y diseño mediante la API pública.
3. El cliente elige registro manual, Google o inicio de sesión de una cuenta existente.
4. La autenticación conserva el código del programa. Si ya hay sesión válida, se continúa sin exigir otro registro.
5. Con sesión válida y correo verificado se crea o recupera el perfil local, vinculado al `sub` de Supabase.
6. Se ejecuta la inscripción autenticada. Antes de escribir, el backend vuelve a comprobar que restaurante y programa permiten participar.
7. Membresía y tarjeta se crean en una transacción; si la persona ya participa, se devuelven las existentes.

Abrir el QR o completar la autenticación no concede sellos ni permisos de personal. El programa debe mostrarse al cliente antes de solicitar su inscripción; su código es contexto público, no una credencial.

**Registro manual:** nombre, correo y contraseña; teléfono opcional. Supabase administra credenciales, verificación, sesiones y recuperación. No se guardan contraseñas en las tablas de negocio. Membresía y tarjeta se crean después de verificar el correo. Se conserva el destino durante la confirmación; si no se recupera la sesión, se permite iniciar sesión y retomar el flujo. Una cuenta existente continúa por acceso o recuperación, sin crear otro perfil ni revelar públicamente si un correo está registrado.

**Google OAuth:** configurar cliente web, pantalla de consentimiento y proveedor Google en Supabase. Usar el SDK con redirección OAuth y PKCE, solicitando únicamente `openid`, correo y perfil. Registrar en Google el callback de Supabase y permitir explícitamente en Supabase los callbacks de la aplicación. El secreto se mantiene en la configuración protegida del proveedor.

El futuro cliente web implementará `/auth/callback`, intercambiará el código con el SDK y retomará el programa. Solo se permiten destinos internos construidos a partir del código validado, nunca URLs externas arbitrarias. Google aporta el nombre para completar el perfil; si falta se solicita. No se exige contraseña a una cuenta Google. El backend recibe un token de Supabase, no necesita tokens de Google ni acceso a sus otros servicios.

La cancelación, un código inválido/reutilizado o la pérdida del verificador PKCE permiten reintentar conservando el programa y no crean membresía ni tarjeta. El intercambio PKCE requiere el contexto del navegador donde empezó. La autenticación externa puede haber creado una cuenta en Supabase aunque falle la inscripción local; el reintento debe reutilizarla, sin prometer una transacción distribuida con el proveedor.

**Identidad única:** usar exclusivamente el `sub` verificado para vincular el perfil local. Delegar a Supabase la vinculación de identidades de correo y Google; no fusionar usuarios por un correo aportado en el cuerpo de la petición. Probar que el mismo correo verificado conserva tarjetas y roles al cambiar de método. Correos diferentes representan cuentas distintas en esta versión. Una persona que empezó con Google puede añadir contraseña desde su cuenta autenticada mediante Supabase, sin crear otro usuario. El proveedor no concede permisos administrativos.

### Fases de implementación y dependencias

| Fase | Entregables |
| --- | --- |
| 0 — Base técnica y especificaciones | Specs por módulo; composición, servidor Hono, configuración validada, errores, transacciones y PostgreSQL aislado de prueba. Puertos de identidad, persistencia, reloj e identificadores. Comandos de desarrollo/build/start y dependencias exactas. |
| 1 — Identidad y acceso | Supabase con correo y Google; registro idempotente del perfil; consulta/edición de nombre y teléfono; validación de sesión, estado y pertenencia. Contratos de callback y continuidad desde QR. |
| 2 — Restaurantes y personal | Alta de restaurante con Owner en una transacción; sucursales, invitaciones y aceptación; roles, suspensión, desactivación y reactivación. |
| 3 — Programas | Creación, consulta, edición, diseño, código público y estados; inmovilización de meta/premio tras la primera inscripción. |
| 4 — Membresías y tarjetas | Inscripción común, consultas propias, QR privado, rotación del token y reinscripción tras cierre. |
| 5 — Compras y sellos | Referencia de venta, acreditación de un sello, libro contable, idempotencia y concurrencia. |
| 6 — Premios y correcciones | Generación automática, asignación de compras a premios, entrega y reversión compensatoria. |
| 7 — Cierre confirmado | Vista previa, consentimiento autenticado, revocación y cierre lógico transaccional. |
| 8 — Integración operativa | OpenAPI, ejemplos, CI, logs, disponibilidad, cierre ordenado del servidor, límites, CORS y documentación. |

Se ejecutan en ese orden. Cada fase entrega especificación, pruebas y código por capas; no se crean capas vacías como sustituto de funcionalidad. Cambiar correo y credenciales pertenece a Supabase, no a la edición local del perfil.

### Permisos y estados

- Resolver permisos en los casos de uso consultando identidad, estado y pertenencia; no aceptar roles del cuerpo ni de metadatos editables por el usuario.
- Owner/Admin administra datos del restaurante, sucursales y programas. Solo Owner gestiona admins y suspende/reactiva el restaurante. Admin no modifica al Owner ni a otros Admin.
- Mantener una relación de personal por usuario/restaurante, con historial. Verificar permisos actuales del emisor al aceptar invitaciones. Proteger al Owner frente a degradación o desactivación mediante gestión ordinaria de personal.
- Los estados suspendido/desactivado bloquean las operaciones correspondientes. Restaurante suspendido bloquea fidelización; Owner conserva acceso para administrarlo y reactivarlo.
- Programa `active` permite inscripción y compras; `paused` y `ended` las rechazan pero permiten entregar premios existentes. Pausar es reversible; finalizar es definitivo. La primera inscripción fija meta/premio incluso si luego se cierran todas las membresías.
- Permitir varios programas por restaurante y participación en varios programas. Una persona/programa tiene una sola membresía no cerrada; repetir inscripción devuelve la existente.
- Personal con identidad de cliente no acredita compras ni entrega premios a su propia membresía. El QR privado nunca sustituye permisos o consentimiento.
- Conservar empleados y sucursales utilizados en el historial. La API pública solo expone los datos necesarios del programa, nunca participantes, saldos o personal.

### Tarjetas, compras y atomicidad

- Separar código público del programa y token privado de tarjeta. El token opaco se guarda como hash para búsqueda y copia cifrada para que el titular vuelva a mostrarlo; rotarlo invalida el anterior.
- El titular consulta tarjetas, saldo, movimientos y premios propios; el personal resuelve tarjetas solo dentro de su restaurante. Una reinscripción tras cierre crea membresía y tarjeta nuevas, separadas del historial previo.
- Validar restaurante, sucursal, empleado, programa, membresía y tarjeta antes de operar; todas sus relaciones deben ser compatibles.
- Compra válida crea compra y movimiento `+1` en una transacción. La referencia de venta es única por sucursal, incluso tras revertir la venta.
- El saldo deriva de movimientos inmutables; no existe edición directa. Registrar actor, fecha, motivo cuando corresponda y correlación, excluyendo credenciales y tokens.
- Serializar operaciones de una membresía y proteger cambios concurrentes de estados/permisos. Autorización, comprobaciones y efectos deben ser consistentes en la transacción.
- Exigir `Idempotency-Key` en comandos transaccionales. Mismo contenido devuelve el resultado original; misma clave con contenido distinto genera conflicto. Volver a comprobar acceso antes de devolver un resultado persistido.

### Premios, entrega y reversión

- Al alcanzar la meta, crear premio disponible y débito de su coste en la transacción de compra. Mantener excedentes en la tarjeta.
- Vincular explícitamente los sellos consumidos a sus compras por antigüedad, conservando descripción y coste históricos del premio.
- Entregar una sola vez y registrar empleado, sucursal y fecha; no crear un segundo débito.
- Una reversión conserva compra y movimientos originales, registra motivo y crea compensaciones.
- Si la compra financió un premio disponible: cancelarlo, liberar asignaciones, compensar el descuento, retirar el sello y recalcular premios con compras válidas restantes.
- Rechazar toda la reversión si afecta un premio entregado o una membresía cerrada. No dejar efectos parciales.
- La cancelación de premios se limita a reversión y cierre, sin cancelación administrativa arbitraria.

### Cierre confirmado

- Mostrar al cliente saldo y premios que perderá. Consentimiento vinculado a titular, tarjeta, versión de beneficios y caducidad.
- Owner/Admin/Employee autorizado ejecuta el cierre; el cliente puede revocar el consentimiento antes de consumirse.
- Rechazar consentimientos ajenos, caducados, revocados, usados o desactualizados.
- Consumir consentimiento, cancelar premios pendientes, llevar saldo a cero mediante movimientos, cerrar membresía/tarjeta e invalidar QR en una transacción.
- Conservar compras, contabilidad, premios y evidencia. El cierre no borra identidad ni membresías de otros programas.

### Interfaces HTTP previstas

Prefijo `/api/v1`; JSON, UUID y fechas ISO 8601 en UTC. Hono acepta el mismo token de Supabase independientemente del método de acceso.

| Grupo | Interfaces |
| --- | --- |
| Perfil | `POST /profiles`, `GET/PATCH /me` |
| Restaurantes | `POST/GET /restaurants`, `GET/PATCH /restaurants/:id` |
| Sucursales | Consulta, creación y actualización bajo `/restaurants/:id/locations` |
| Personal | Consulta y actualización bajo `/restaurants/:id/employees` |
| Invitaciones | Creación, consulta y revocación por restaurante; `POST /invitations/accept` |
| Programas | Creación, consulta y actualización bajo `/restaurants/:id/programs` |
| Acceso público | `GET /public/programs/:code` |
| Inscripción común | `POST /public/programs/:code/enrollments`, autenticada por correo o Google |
| Tarjetas propias | `/me/cards`, detalle, movimientos, premios y consulta/rotación de QR |
| Operación | Resolución de tarjeta, compras, reversión y entrega bajo `/restaurants/:id` |
| Consentimiento | Vista previa, creación y revocación bajo `/me/cards/:id/closure-consents` |
| Cierre | `POST /restaurants/:id/cards/:cardId/close` |

`/join/:publicCode` y `/auth/callback` son contratos del futuro frontend, no endpoints de negocio de Hono. No se implementa una segunda autenticación Google directamente en Hono.

Entradas mínimas: compra `{ card_id, location_id, sale_reference }`; canje con premio en ruta y `{ location_id }`; reversión con compra en ruta y `{ reason }`; consentimiento con tarjeta, versión y aceptación explícita; cierre con identificador de consentimiento; invitación con correo y rol. Empleado, usuario, sellos, identificadores y fechas se determinan en el servidor según el contexto.

Respuestas `{ data }`; listas `{ data, next_cursor }`; errores `{ error: { code, message, request_id } }`. Códigos: `201` creación, `200` éxito/reutilización, `400` entrada inválida, `401` autenticación, `403` permisos, `404` recurso inexistente o ajeno, `409` conflicto y `429` límites. Las specs de módulo fijarán rutas de acción, esquemas completos y códigos de error antes del código, respetando estas interfaces.

### Evolución del esquema y operación

- Conservar las 11 tablas como base y ampliar para invitaciones, diseño, consentimiento, idempotencia, auditoría, reversión, cierre y asignaciones de compras a premios. Añadir sucursal de entrega y metadatos históricos.
- Añadir unicidad de roles, personal por restaurante, membresía no cerrada y referencia de venta por sucursal. Usar referencias compuestas cuando correspondan para impedir asociaciones entre restaurantes o membresías incompatibles.
- Distinguir movimientos de acreditación, consumo, compensación y cierre. La identidad local es independiente del proveedor; Google no requiere otra tabla de clientes.
- Registrar decisiones de evolución del modelo y actualizar pruebas de correspondencia sin perder la verificación del esquema original. No editar `0000_initial.sql` ni snapshots aplicados.
- Generar migraciones incrementales revisables. Detectar datos incompatibles antes de imponer restricciones; bloquear e informar sin eliminar datos automáticamente.
- Toda aplicación remota requiere autorización sobre el destino; esta tarea solo documenta el plan.
- Configurar permisos SQL/RLS para evitar acceso directo de clientes a tablas de negocio a través de la Data API; las operaciones pasan por Hono.
- Incorporar OpenAPI, ejemplos, CI, logs sin secretos, CORS explícito, límites en rutas públicas/resolución de tokens, disponibilidad y cierre ordenado del servidor.

## Criterios de aceptación

Los siguientes criterios son objetivos futuros; ninguno tiene evidencia RED/GREEN todavía.

- AC-001 — Dado un QR válido, cuando el cliente completa registro manual y verifica su correo, entonces obtiene perfil y una sola membresía/tarjeta del programa seleccionado.
- AC-002 — Dado ese QR, cuando el cliente continúa con Google y completa su perfil, entonces obtiene el mismo resultado sin exigir contraseña.
- AC-003 — Dada una cuenta existente vinculada por Supabase, cuando cambia entre correo y Google, entonces conserva identidad, tarjetas y roles sin duplicación. Añadir contraseña desde Google no crea otro usuario.
- AC-004 — Dado OAuth cancelado, código inválido/reutilizado, verificador ausente o destino no permitido, cuando falla autenticación, entonces no se crea membresía/tarjeta y se puede retomar el programa. No se promete deshacer una cuenta ya creada por el proveedor.
- AC-005 — Dado un programa que se pausa/finaliza durante autenticación, cuando se intenta inscribir, entonces se rechaza sin crear membresía/tarjeta. Identidad sin correo verificado o suspendida tampoco opera.
- AC-006 — Dado personal sin permisos, suspendido o de otro restaurante, cuando modifica recursos, entonces se rechaza sin cambios. Employee no administra programas ni roles; una identidad no acredita ni canjea para sí misma.
- AC-007 — Dada creación de restaurante/invitación, cuando concluye, entonces Owner y pertenencias respetan jerarquía, correo verificado y unicidad; aceptar dos veces no duplica personal.
- AC-008 — Dada primera inscripción, cuando se cambia meta/premio, entonces se rechaza; nombre, descripción y diseño válidos siguen siendo editables.
- AC-009 — Dada una venta nueva, cuando se acredita, entonces genera exactamente un sello. Repetir referencia o reintento no duplica efectos; cambiar contenido bajo la misma clave produce conflicto.
- AC-010 — Dadas compras que completan la meta, cuando se confirman, entonces se crea premio con débito y asignaciones una sola vez; saldo equivale al libro y nunca es negativo.
- AC-011 — Dado premio disponible, cuando personal autorizado lo entrega, entonces se registra una sola entrega sin segundo débito; solicitudes concurrentes no duplican canje.
- AC-012 — Dada reversión autorizada, cuando no afecta premio entregado, entonces compensa y recalcula sin borrar historial; si afecta uno entregado o membresía cerrada, se rechaza íntegramente.
- AC-013 — Dado consentimiento vigente del titular sobre beneficios actuales, cuando personal autorizado cierra, entonces cancela pendientes, anula saldo e invalida tarjeta/QR atómicamente. Consentimientos inválidos o desactualizados no producen efectos.
- AC-014 — Dada tarjeta cerrada, cuando el cliente se reinscribe, entonces comienza desde cero sin alterar el historial ni otras membresías.
- AC-015 — Dadas peticiones simultáneas de inscripción, compra, canje, reversión y cierre, entonces se mantienen unicidad, autorización, consistencia y ausencia de efectos parciales.
- AC-016 — Dadas migraciones nuevas, cuando se prueban desde cero y sobre la migración inicial en PostgreSQL aislado, entonces ambas rutas conservan integridad sin reescribir historial aplicado.

## Trazabilidad y validación

Los archivos son destinos propuestos para futuras pruebas; hoy no existen. Evidencia RED/GREEN pendiente en todos los casos. Las specs de módulo ampliarán esta matriz sin sustituir estos criterios.

| Reglas | Criterios | Nivel y archivo/prueba prevista |
| --- | --- | --- |
| BR-004, BR-008, BR-009 | AC-001 a AC-005 | unit `tests/unit/identity.test.ts`; e2e `tests/e2e/qr-enrollment.test.ts`: correo, Google, identidad compartida y fallos |
| BR-002, BR-003, BR-005, BR-007, BR-009 a BR-012 | AC-006, AC-007 | unit `tests/unit/authorization.test.ts`; integration `tests/integration/staff.test.ts`; e2e `tests/e2e/permissions.test.ts` |
| BR-001, BR-018, BR-019 | AC-008 | unit `tests/unit/programs.test.ts`; integration `tests/integration/programs.test.ts` |
| BR-005, BR-012 a BR-016 | AC-009 a AC-011 | unit `tests/unit/rewards.test.ts`; integration `tests/integration/purchases.test.ts`, `tests/integration/redemptions.test.ts` |
| BR-017 | AC-012 | unit `tests/unit/reversals.test.ts`; integration `tests/integration/reversals.test.ts` |
| BR-006, BR-020, BR-021 | AC-013, AC-014 | unit `tests/unit/card-closure.test.ts`; integration `tests/integration/card-closure.test.ts`; e2e `tests/e2e/card-lifecycle.test.ts` |
| BR-009, BR-013 a BR-015, BR-017, BR-020, BR-021 | AC-015 | integration `tests/integration/concurrency.test.ts`: duplicados, meta, doble canje, canje/reversión y cierre/compra |
| Modelo y decisiones DB | AC-016 | tooling existente actualizado; integration `tests/integration/migrations.test.ts` |

Integración/E2E exige `TEST_DATABASE_URL` aislado y no carga `.env` de desarrollo. Probar PostgreSQL real cuando la propiedad depende de transacciones/constraints. La verificación real de correo/Google se hará con un cliente de prueba y Supabase de prueba; los dobles de CI no se presentan como evidencia del proveedor.

Criterio de salida de cada fase: checks estáticos, tipos y suites aplicables satisfactorios; contratos documentados; rechazos sin efectos; evidencia RED/GREEN por comportamiento. No equiparar tooling con pruebas funcionales ni ocultar suites vacías. CI final ejecutará tooling y todas las suites funcionales, además de revisión de migraciones.

## Preguntas, valores de diseño y límites

Las decisiones de producto confirmadas están en BR-001 a BR-021. Se conservan estos valores por defecto del plan para especificar la implementación futura:

- Un Owner por restaurante; transferencia de propiedad fuera de v1.
- Invitaciones de siete días; consentimientos de quince minutos y un uso. Identificadores/fechas generados por servidor.
- Paginación por cursor: 20 elementos por defecto, máximo 100.
- Referencia de venta de hasta 100 caracteres, sin espacios exteriores y sensible a mayúsculas; no se reutiliza tras reversión.
- Mensaje de tarjeta de hasta 160 caracteres, colores hexadecimales y logo HTTPS. Solo se almacena la URL, sin descargarla desde backend.
- Sin ajustes manuales de saldo, caducidad, subida de archivos, envío propio de invitaciones por correo, fusión de cuentas de correos diferentes, administración global de plataforma ni analítica avanzada.
- Configurar Google requiere cliente OAuth, secreto y URLs del entorno; se documenta su provisión sin incluir valores secretos. La pantalla de consentimiento y disponibilidad del proveedor deben verificarse antes de habilitarlo al público.
- Frontend reservado: documentar integración y validar con cliente de prueba, sin implementar pantallas de producto en esta etapa.
- Pendiente derivar specs detalladas por módulo y obtener autorización de implementación. No se modifican esquema, aplicación ni Supabase al guardar este plan.
- Mantener README/AGENTS con avances reales, preservando cambios del usuario. Publicar este documento no significa que sus funcionalidades estén implementadas.
