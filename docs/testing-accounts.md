# Tres cuentas reales para probar los roles

`npm run accounts:seed` prepara cuentas reales de Supabase y datos de negocio en
el destino configurado. Requiere la autorización para crear esos datos y que las
migraciones estén aplicadas. El comando **no aplica migraciones**.

1. Configura el entorno servidor según [Supabase](supabase-setup.md).
2. Añade `SUPABASE_SERVICE_ROLE_KEY` solo a `.env` o `backend/.env`, fuera de Git.
   Esta clave administrativa se usa exclusivamente desde el comando local. No se
   agrega al navegador, a `VITE_*` ni al código de la aplicación.
3. Ejecuta `npm run accounts:seed` desde la raíz.
4. Abre `.cache/test-accounts.json` localmente para consultar los tres correos,
   contraseñas, roles y enlaces. El archivo tiene permisos `0600` y está ignorado
   por Git. No compartas su contenido en incidencias ni commits.

Cada ejecución inicial crea correos únicos `loyalty-…@example.com` y contraseñas
aleatorias diferentes. Estas cuentas de prueba tienen correo preconfirmado; no
se envían mensajes. Supabase admite esta operación administrativa sin mandar
confirmación, según su [documentación de createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
Esto no valida SMTP ni Google OAuth.

| Cuenta | Rol efectivo | Uso |
| --- | --- | --- |
| Administrador propietario | `owner` | Gestionar todo el restaurante y crear personal |
| Empleado | `employee` | Escanear tarjeta y registrar compra/sello |
| Cliente | Sin pertenencia de personal | Abrir su tarjeta y ver sellos/premios |

El administrador de estas tres cuentas es el propietario del restaurante; tiene
todos los permisos. El rol de personal `admin` también puede crearse desde
**Equipo → Invitar persona**, seleccionando Administrador; el invitado crea su cuenta,
confirma su correo e inicia sesión con el mismo correo para aceptar el enlace.
No se crea un cuarto propietario oculto. Los permisos del rol `admin` exacto se
comprueban además en las suites de backend y navegador.

Se prepara un restaurante, una sucursal, un programa de cinco sellos y una tarjeta
vacía para el cliente. No se registran compras automáticamente. Usa dos perfiles
de navegador distintos: cliente en `/cards` y empleado en `/app` → Operaciones. Muestra el QR
del cliente, escanéalo desde el empleado, selecciona sucursal, escribe una
referencia de venta nueva y registra el sello. La tarjeta del cliente debe
actualizarse. El administrador conserva gestión de programas y personal.

Para usar teléfonos, configura una URL HTTPS alcanzable como `APP_ORIGIN` y abre
esa URL en ambos dispositivos. El QR usa ese origen. `localhost` solo sirve para
el equipo que ejecuta la aplicación; consulta [despliegue](deployment.md).

## Reintentos y creación desde la interfaz

El manifiesto se guarda **antes** de crear usuarios. Si falla un paso, vuelve a
ejecutar el mismo comando: conserva contraseñas e identidades y usa claves
idempotentes para los datos de negocio. Una marca administrativa de la ejecución
impide reutilizar una cuenta ajena que coincida por correo. El comando no
restablece contraseñas ni modifica usuarios existentes. Un cambio de destino se
rechaza para impedir mezclar datos de dos proyectos. Conserva el manifiesto para
continuar; no lo borres para reintentar.

Si un cierre forzado deja `.cache/test-accounts.json.lock`, comprueba que el PID
guardado ya no está ejecutando este comando antes de retirar **solo ese archivo
de bloqueo**. Conserva `.cache/test-accounts.json` con credenciales y progreso.

Las cuentas habituales se crean desde **Crear cuenta** y confirman su correo:
cliente puede incorporarse mediante el enlace público del programa; propietario
crea su restaurante desde el recorrido de negocio; propietario/administrador
invita nuevos empleados o administradores. Las invitaciones requieren el mismo
correo verificado. Los roles no se eligen libremente al registrarse.

La clave administrativa puede retirarse del entorno al terminar. La aplicación
utiliza la clave pública y la sesión del usuario para las operaciones normales.
El comando nunca imprime contraseñas, claves del proyecto ni tokens de sesión.

## Resultado comprobado — 2026-10-18

Las tres cuentas reales están creadas y el comando se reejecutó sin duplicados.
Se probaron sus accesos y vistas en Chromium contra Supabase. La aceptación
registró una compra con el empleado y el cliente vio automáticamente **1 de 5
sellos**; esa compra se conserva. El manifiesto local contiene las credenciales
vigentes. La aplicación sigue con origen local; no hay una URL pública nueva.
