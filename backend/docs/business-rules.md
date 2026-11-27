# Reglas de negocio — fuente de verdad

**Revisión P0 — 2026-10-19:** la petición vigente autoriza reconstrucción local por etapas del [plan LOYALTY-NEXT-001](../../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente). El catálogo vigente siguiente concreta los requisitos NC-001–010 y prevalece sobre el histórico conservado al final. D-01–D-05 están aceptadas; D-01 se simplificó a acceso sin OTP. Especificar una propuesta no la convierte en respuesta del usuario. No se afirma que el código anterior ya implemente estas reglas.

## Reglas vigentes — LOYALTY-NEXT-001

| ID | Regla vigente y dependencias |
| --- | --- |
| BR-001 | Cada restaurante define programas por compras; el cliente acumula sellos en una tarjeta digital y obtiene un premio al alcanzar la meta. |
| BR-002 | El dueño configura su programa, meta/premio, diseño móvil y QR público estable. El panel prioriza ese recorrido. El acceso mínimo de empleados mediante invitación/revocación depende de D-02; no hay catálogo o selección de roles. |
| BR-003 | Propiedad directa del restaurante y vínculo activo de operador sustituyen Owner/Admin/Employee como catálogo configurable. La propiedad no otorga caja automáticamente. No trasladar permisos entre negocios ni convertir Admin heredado en propietario por omisión. |
| BR-004 | El cliente entra por QR del programa y teléfono; sin correo, contraseña o Google obligatorios. Sesión válida recupera/inscribe idempotentemente en ese programa. D-01 aceptada sin OTP: crear/recuperar sesión usa el teléfono normalizado; conocer el número puede suplantar y ese riesgo queda documentado. Alta y visita conceden cero sellos. |
| BR-005 | Solo empleado con cuenta y vínculo activo autoriza una compra de +1 en su restaurante. El cliente no puede otorgarse sellos; registro público, QR y escaneo no conceden autoridad operativa. |
| BR-006 | Retirar cierre del recorrido cotidiano no elimina consentimiento. El mecanismo restringido de soporte requiere propietario directo y decisión/confirmación del titular, conserva historial y no concede cierre al empleado. |
| BR-007 | Empleado vinculado escanea tarjetas/comprobantes, registra compras y confirma entrega de premios en su restaurante. No administra programas, personal, propiedad ni correcciones/cierres por ese vínculo. |
| BR-008 | Dueño/personal conservan cuenta Auth y correo verificado; clientes usan identidad telefónica y sesión propia. Supabase Auth puede seguir prestando autenticación de cuentas, sin contraseña local. D-01 no usa prueba telefónica; no reutilizar cookie cliente como credencial del personal. |
| BR-009 | Una persona puede ser cliente y personal de distintos restaurantes, con identidades y permisos independientes. La asociación verificada entre cuenta personal y cliente permite impedir autoacreditación/autocanje; comparar UUID de tablas diferentes o teléfonos autodeclarados es insuficiente. |
| BR-010 | Alta explícita de negocio establece propietario directo validado, sin otorgarle operación de caja automática. Solo propietario administra su negocio. El vínculo de empleado no concede facultades de propietario ni cambios de propiedad; dueño que también atienda necesita vínculo de operador según D-02. |
| BR-011 | El vínculo de empleado debe tener origen confiable. D-02 aceptada: invitación privada de un uso emitida/revocable por dueño, con correo verificado; el teléfono es contacto, no prueba; sin `role` en payload. No autoasignación por QR público o datos autodeclarados. |
| BR-012 | Programas/tarjetas y personal autorizado respetan ámbito de restaurante y ubicaciones activas existentes. Ocultar gestión de sucursales no borra ubicaciones históricas ni cambia unicidad de ventas. D-05 debe resolver cardinalidad futura sin pérdida de programas. |
| BR-013 | Cada compra concede exactamente un sello y requiere referencia de venta única por sucursal y clave de idempotencia. La referencia prueba no duplicación comercial; la clave cubre reintentos técnicos. Backend fija +1, nunca cantidad arbitraria del navegador. |
| BR-014 | Modelo nuevo: al alcanzar meta genera un premio único y mantiene la tarjeta llena, sin débito/reinicio anticipado. D-03 aceptada: las compras adicionales abren ciclos separados con su propio premio; el canje descuenta solo su ciclo y conserva los demás. |
| BR-015 | Empleado vinculado confirma entrega con comprobante dedicado válido. En ciclos nuevos consume premio/token, debita N y empieza 0/N atómicamente. Premio heredado ya debitado no vuelve a descontar ni reinicia excedentes anteriores. Cliente no autocanjea. |
| BR-016 | Sellos y premios no vencen por tiempo. Finalizar programa impide compras nuevas, conserva consulta y entrega de premios obtenidos. Vencimiento de sesión o comprobante técnico no elimina beneficios. |
| BR-017 | Correcciones se realizan en soporte restringido al propietario directo con motivo y movimientos compensatorios. Rechazar reversión que afecte premio entregado; no borrar historial original ni habilitar al empleado por retirar controles de UI. |
| BR-018 | Meta y descripción del premio se bloquean tras primera inscripción. Después se editan nombre, descripción y diseño; cambiar condiciones exige otro programa hasta una nueva decisión explícita. |
| BR-019 | Personalización conserva logo por URL HTTPS, fondo, texto y mensaje corto; vista móvil y QR imprimible con enlace legible. Edición visual no cambia código público ni beneficios prometidos. |
| BR-020 | Titular confirma cierre sobre versión actual de beneficios desde sesión suficientemente confiable; soporte propietario lo ejecuta como cierre lógico. Si el saldo cambió, obtener consentimiento actualizado. |
| BR-021 | Confirmación presenta beneficios que se perderán. Cierre cancelará premios pendientes/anulará saldo mediante movimientos auditables conservando historial; reinscripción posterior empieza desde cero. Nada de ello ocurre al cerrar sesión o cambiar dispositivo. |
| BR-022 | Cliente telefónico usa UUID interno estable, E.164 validado y unicidad del teléfono. Inscripción abierta única por cliente/programa, tarjeta única por inscripción. No fusionar por coincidencia ni inventar teléfonos; recuperación/cambio/reciclado/compartido documentan el riesgo de acceso por conocimiento del número y no fusionan identidades. |
| BR-023 | QR público, QR de tarjeta, comprobante de premio y sesión tienen propósitos/validadores separados. Tokens opacos aleatorios revocables, sin teléfono legible, transportados por fragmento y cuerpo protegido. Escaneo/GET/vista previa nunca acreditan o canjean; entrada manual conserva mismas validaciones. |
| BR-024 | Sesión cliente opaca en cookie HttpOnly, SameSite=Lax, Secure/host en producción, sin Domain; intención 400 días con vencimiento servidor, hash, revocación y renovación segura. No guardar saldo/teléfono/secretos en cookie o localStorage. Fallos temporales no eliminan sesión; logout revoca dispositivo sin borrar beneficios. |
| BR-025 | PostgreSQL es fuente canónica de identidad, saldo, premios e historial. Caché, cookie y WebSocket no conceden beneficios ni sustituyen contabilidad. Reabrir/reconectar/foco reconcilian versión/snapshot autorizado. |
| BR-026 | Autorización depende de cuenta verificada, propiedad o vínculo activo del restaurante y asociación cliente/personal probada. Revalidar en cada operación y replay; revocación impide nuevos efectos. Cliente y personal ajeno no mutan saldo; impedir autoacreditación y autocanje con identidades separadas. |
| BR-027 | Premio, comprobante y envío tienen estados distintos. Comprobante de uso único/versionado/caducidad técnica se reemite sin borrar premio, invalida anterior y nunca vale para otra tarjeta o ciclo. Entrega válida consume una vez y preserva identidad de tarjeta. |
| BR-028 | Compra/entrega, libro, asignaciones, premio/ciclo, auditoría, idempotencia, versión y outbox se confirman atómicamente. Locks/unicidad PostgreSQL evitan carreras. Notificaciones/proveedores solo después de commit; reintento o fallo no duplica beneficio. |
| BR-029 | WebSocket privado de lectura mediante WSS, Origin y sesión válida; autorización por tarjeta, revocación, límites y limpieza. Eventos mínimos versionados postcommit; duplicados/orden/huecos/reconexión se reconcilian con DB. Multiproceso exige infraestructura compartida; fallback HTTP no sustituye WSS solicitado. |
| BR-030 | Migrar mediante expansión, conversión verificada, cambio de aplicación y retirada. Preservar compras, excedentes, premios ya debitados, consentimientos, usuarios mixtos, IDs de actor y RLS. Reportar conflictos; ninguna fusión, reinicio, DROP o migración remota por inferencia. |
| BR-031 | Mutaciones validan origen/CSRF y payload, limitan abuso y no confían en IDs/permisos del navegador. Datos ajenos se ocultan, logs no registran teléfono completo/tokens, offline permanece pendiente hasta confirmación servidor. Rechazo o rollback no deja efectos comerciales parciales. |
| BR-032 | WhatsApp usa outbox con reintentos/deduplicación y proveedor autenticado. D-04 aceptada: envío al teléfono registrado del titular al alcanzar la meta, con reenvío desde su tarjeta y desde el operador. Aceptado no significa entregado ni canjeado; callback no muta premio. Fallo de envío conserva beneficio y comprobante accesible por sesión confiable según contrato. |

## Decisiones pendientes y specs canónicas

| Decisión | Parte pendiente | Spec que gobierna el contrato |
| --- | --- | --- |
| D-01 | Acceso simple por teléfono sin OTP; recuperación y riesgo de suplantación | [NEXT-001](specs/NEXT-001-phone-identity.md) |
| D-02 | Invitación/revocación y vínculo explícito del dueño que atiende | [NEXT-002](specs/NEXT-002-operators.md) |
| D-03 | Compras adicionales con premio pendiente | [NEXT-003](specs/NEXT-003-cycles-redemption.md) |
| D-04 | Destinatario/momento/proveedor de WhatsApp | [NEXT-003](specs/NEXT-003-cycles-redemption.md) |
| D-05 | Programa principal, varios programas y sucursales existentes | [NEXT-002](specs/NEXT-002-operators.md), [NEXT-005](specs/NEXT-005-data-transition.md) |

[NEXT-004](specs/NEXT-004-realtime.md) concreta infraestructura independiente de tiempo real. Cada spec contiene matriz BR → NC/AC del plan → AC propio → archivo/nombre de prueba y evidencia real o pendiente. P0 no se considera completo mientras falten contratos o implementación requeridos; no reemplazar una decisión aceptada por una suposición distinta.

## Catálogo histórico — 2026-10-18

Lo siguiente se conserva para interpretar código, migraciones y evidencia anteriores. No prevalece sobre las reglas vigentes ni autoriza mantener canje prohibido al empleado o reinicio automático nuevo. Reglas compatibles de aislamiento, referencia única, integridad e historial siguen vigentes por el catálogo superior.

| ID | Regla confirmada |
| --- | --- |
| BR-001 | Cada restaurante define programas por compras; el cliente acumula sellos en una tarjeta digital y obtiene un premio al alcanzar la meta. |
| BR-002 | El administrador crea programas y personaliza la tarjeta; registra personal y asigna roles. |
| BR-003 | Owner es el dueño. Admin puede ser el dueño o un empleado con permisos administrativos dentro del negocio. Employee tiene los permisos limitados descritos aquí. No se asume acceso entre restaurantes. |
| BR-004 | El cliente abre el QR/enlace del programa, se registra manualmente con correo y contraseña o usa Google, y participa en el programa para disponer de su tarjeta. Ambos métodos convergen en la misma inscripción autenticada. El frontend genera y muestra el QR/enlace; el backend valida la inscripción. |
| BR-005 | Admin y Employee autorizados pueden sumar sellos por compras. El cliente no puede otorgarse sellos. Registrarse como empleado no concede permisos automáticamente. |
| BR-006 | Owner y Admin pueden eliminar una tarjeta únicamente si el cliente lo decide y confirma la operación. La autorización por rol no sustituye la confirmación del cliente. Esta aclaración prevalece sobre la descripción inicial más amplia de eliminación de registros. |
| BR-007 | Employee solo resuelve el QR privado y suma sellos por compras dentro de su restaurante. No crea restaurantes, sucursales o programas, no gestiona personal, no canjea premios ni ejecuta cierres de tarjetas. Las consultas mínimas de restaurante/sucursales para operar y sus propios derechos como cliente se conservan. |

## Decisiones confirmadas durante la planificación — 2026-10-18

Estas decisiones amplían las reglas anteriores. La solicitud vigente de separación por roles del mismo día sustituye la autorización anterior de canje/cierre por Employee y amplía la administración de personal por Admin (ROLE-001).

| ID | Regla confirmada |
| --- | --- |
| BR-008 | Supabase Auth administra identidad, sesiones, verificación de correo y recuperación. El acceso manual usa correo y contraseña; Google OAuth es una alternativa de registro e inicio de sesión para los clientes. |
| BR-009 | Una identidad puede ser cliente y personal de varios restaurantes, con permisos independientes en cada negocio. |
| BR-010 | El restaurante se crea por autoservicio y su creador queda como Owner. Owner y Admin conservan todas las operaciones administrativas, incluidos estado del negocio e incorporación/gestión de Admin y Employee. La pertenencia Owner no se modifica ni se asigna por gestión ordinaria. Una identidad con pertenencias activas exclusivamente Employee no puede crear restaurantes; una identidad sin pertenencias activas o con al menos una Owner/Admin conserva autoservicio, sin ampliar permisos en otros negocios. |
| BR-011 | El personal acepta un enlace de invitación vinculado a correo y rol, autenticándose con ese correo verificado. El restaurante comparte el enlace; no se requiere envío propio de correo de invitación. |
| BR-012 | Los programas y tarjetas funcionan en todas las sucursales activas del restaurante; el personal autorizado opera en todo ese restaurante. |
| BR-013 | Cada compra concede exactamente un sello. Se exige referencia de venta única por sucursal y protección contra reintentos técnicos. |
| BR-014 | Al alcanzar la meta se descuentan los sellos necesarios y se genera automáticamente un premio disponible. La misma tarjeta continúa acumulando y conserva excedentes. |
| BR-015 | Owner y Admin activos y autorizados pueden registrar la entrega del premio; el cliente no puede autocanjear. La entrega no vuelve a descontar sellos. |
| BR-016 | Sellos y premios no vencen por tiempo. Finalizar el programa impide nuevas compras pero permite entregar premios ya obtenidos. |
| BR-017 | Owner/Admin puede revertir una compra con motivo mediante movimientos compensatorios. Se rechaza la reversión si afecta un premio ya entregado; no se elimina el historial original. |
| BR-018 | Meta y descripción del premio quedan fijas desde la primera inscripción. Después solo se editan nombre, descripción general y diseño; cambiar las condiciones exige otro programa. |
| BR-019 | La personalización inicial comprende logo por URL HTTPS, color de fondo, color de texto y mensaje corto, sin subida de archivos ni editor visual. |
| BR-020 | El titular confirma el cierre desde su cuenta autenticada; Owner/Admin autorizado lo ejecuta como cierre lógico, conservando compras, contabilidad y premios históricos. |
| BR-021 | La confirmación muestra los beneficios que se perderán. Al cerrar se cancelan premios pendientes y se anula el saldo. Una futura inscripción comienza desde cero. |

## Especificación y valores de diseño

El [plan BACKEND-001](specs/BACKEND-001-plan-de-negocio.md) concreta el sistema anterior. Para la siguiente implementación usar primero LOYALTY-NEXT-001 y su orden P0–P10. Las autorizaciones históricas de desarrollo/publicación no amplían la tarea documental actual ni autorizan nuevas migraciones remotas.

Antes de implementar cada módulo se derivará su spec con contratos completos y trazabilidad BR → AC → pruebas. La configuración OAuth requiere credenciales y URLs del entorno, que no se incluyen en documentación. Cambios futuros de reglas deben actualizar primero este documento y la spec afectada.
