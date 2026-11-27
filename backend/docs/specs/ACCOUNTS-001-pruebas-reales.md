# ACCOUNTS-001 — Cuentas reales de aceptación

Estado: herramienta implementada para la solicitud del 2026-10-18; ejecutada contra Supabase autorizado; aceptación de navegador real completada.

## Problema y alcance

Preparar tres cuentas de prueba autorizadas en el proyecto Supabase configurado:
administrador propietario (`owner`), empleado y cliente. El propietario tiene
todos los permisos administrativos; `admin` continúa siendo un rol de personal
que se asigna mediante invitación. El comando no cambia esa jerarquía ni aplica
migraciones automáticamente.

## Referencias

BR-003, BR-005, BR-007, STAFF-001, PROGRAMS-001 y ROLE-001. Registro ordinario,
invitaciones, inscripción y autorización conservan los contratos de la aplicación.

## Contrato

`npm run accounts:seed` lee el mismo entorno servidor que la aplicación y exige
además `SUPABASE_SERVICE_ROLE_KEY`, usada exclusivamente por este proceso local.
Antes de crear usuarios verifica los hashes de todas las migraciones locales
contra el historial remoto y la correspondencia del proyecto cuando puede
deducirse de la conexión Supabase.

Supabase Admin crea solamente las tres cuentas nuevas, con correos únicos de
prueba, contraseñas aleatorias y correo preconfirmado. No envía correo, restablece
contraseñas ni modifica usuarios existentes. Perfiles, restaurante, sucursal,
programa de cinco sellos, invitación del empleado e inscripción del cliente se
crean mediante los contratos habituales del backend, con identidad verificada,
transacciones, autorización e idempotencia. No registra compras ni canjes.

El manifiesto `.cache/test-accounts.json` guarda credenciales y progreso con modo
`0600`, fuera de Git. Se escribe antes de crear usuarios; pasos posteriores usan
claves idempotentes estables. Repetir el comando retoma ese manifiesto; un cambio
de proyecto o base se rechaza. Los tokens de sesión permanecen solo en memoria.

## Criterios de aceptación

- AC-001 — Faltan migraciones o difieren sus hashes: se rechaza antes de crear
  usuarios o datos de negocio.
- AC-002 — Se generan tres contraseñas distintas y correos únicos; se guardan
  privadamente antes de cualquier escritura remota.
- AC-003 — Un reintento conserva identidades y datos del manifiesto, sin cambiar
  contraseñas ni apropiarse de una cuenta preexistente ajena a la ejecución.
- AC-004 — Las tres cuentas pueden autenticarse; el propietario y empleado tienen
  sus roles y el cliente dispone de una tarjeta de cinco sellos inicialmente vacía.
- AC-005 — El comando no muestra claves, contraseñas ni tokens en logs; informa la
  ruta local de credenciales. Conserva progreso si una fase falla.

## Trazabilidad y validación

| Criterio | Nivel | Prueba | Evidencia |
| --- | --- | --- | --- |
| AC-001–AC-003, AC-005 | unit/server | `tests/server/test-accounts.test.ts` | RED por aceptar historial incompleto; GREEN 7 pruebas |
| AC-004 | aceptación real | ejecución explícita contra destino autorizado | accounts:seed correcto: tres logins reales, owner/employee verificados y cliente sin personal con tarjeta propia |

Verificación local del 2026-10-18: prueba de estructura inicialmente falló por
módulo ausente (no se cuenta como RED funcional). Después se observó el rechazo
faltante de migraciones incompletas (RED) y se añadió la comprobación de hashes y
fechas. Siete pruebas focales verifican historial, destino, credenciales privadas,
recuperación tras interrupción, rechazo de cuentas ajenas y mensajes seguros.
Biome y tipos correctos. Ejecución con clave deliberadamente vacía devuelve el
error requerido antes de conectar o escribir remotamente. No acredita creación
de cuentas reales; el resultado remoto lo registra la coordinación de la sesión.

## Preguntas y riesgos

La preconfirmación sirve exclusivamente para estas cuentas de prueba y no valida
SMTP ni OAuth Google. El manifiesto contiene contraseñas y debe conservarse
privado. Los usuarios pueden cambiar después su contraseña en el flujo habitual;
el comando no la restablece si deja de coincidir. No se borran datos para repetir
la prueba. El rol `admin` exacto se verifica en la suite de permisos y se puede
crear mediante invitación del propietario desde la interfaz.

Ejecución real: migración 0004 autorizada y aplicada previamente por coordinación.
El usuario configuró la clave administrativa; el comando terminó correctamente
y guardó el manifiesto con permisos 0600, ignorado por Git. No envió correo
ni modificó cuentas preexistentes. Se crearon recursos nuevos para esta prueba.

Aceptación real posterior: tres logins por formulario contra el proveedor real,
vistas por rol, rechazo 403 de crear restaurante por Employee, apertura QR
administrativa y compra del empleado verificados. La tarjeta del cliente se
actualizó a 1/5 sellos sin recargar. Se conserva esa compra de prueba y el informe
privado .cache/real-acceptance.json. Reejecución del seed satisfactoria sin
duplicar recursos. No acredita envío de correo ni Google OAuth real.
