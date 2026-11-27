# MOBILE-001 — Enlaces para dispositivos móviles

Estado: aceptada por solicitud del 2026-10-18. El usuario requiere acceso desde cualquier lugar mediante HTTPS y confirma que todavía no dispone de URL pública ni despliegue.

## Alcance y referencias

BR-004/008/009 y STACK-001. Compartir programas, invitaciones y tarjetas usando el origen canónico configurado. No publicar un servicio sin destino ni credenciales; no modificar Supabase, secretos o migraciones. Mantener el diseño existente.

## Contrato

- `GET /api/public-config`: público, sin credenciales, devuelve `200 {data:{appOrigin:string}}`, exclusivamente el APP_ORIGIN validado. No depende de PostgreSQL, no lee/refleja Host o X-Forwarded-Host y usa Cache-Control no-store. Configuración ausente/inválida devuelve 503 con mensaje fijo sin valores privados.
- Los QR y enlaces compartidos utilizan ese origen; no se deducen de window.location.origin. Un origen localhost/loopback/privado permite pruebas pero se identifica como local y no se promete acceso desde otro dispositivo. Error o carga de configuración no fabrica un enlace alternativo.
- La configuración acepta loopback HTTP y orígenes HTTPS canónicos. Por la solicitud de pruebas en la misma red del 2026-10-18, también acepta HTTP en IPv4 privadas RFC1918 únicamente con NODE_ENV=development. `env:check --public` exige un origen HTTPS no local para preparación de publicación; no prueba DNS, TLS, OAuth ni conectividad externa.
- Registro/confirmación conserva el destino de inscripción. La tarjeta inscrita tendrá enlace directo local `/cards?card=<uuid>` para volver a ella desde el mismo dispositivo; el acceso a datos sigue dependiendo de identidad y propiedad verificadas por backend.

## Aceptación y trazabilidad

- AC-001 (BR-004): configuración pública expone únicamente origen validado aun sin DB y rechaza origen inválido; tests servidor de handleApi.
- AC-002 (BR-004/011): compartir programa/invitación usa APP_ORIGIN pese al host del navegador; carga/error recuperables y aviso local.
- AC-003 (BR-004/009): confirmación/inscripción dirige a tarjeta propia y la recarga móvil restaura sesión; navegador con DB aislada.
- AC-004: se documentan URL HTTPS, callback de Supabase y límites reales; no se declara publicación completada sin haberla ejecutado.

## Verificación

RED observado: cinco fallos del endpoint antes de implementarlo (503 o mensaje incorrecto). GREEN: cinco tests de servidor, tres de UI y seis de configuración correctos; prueba integrada de inscripción y permalink en navegador. `env:check -- --public` rechaza correctamente APP_ORIGIN localhost del entorno actual. No cambia esquema ni reglas de compras. Evidencia global al cierre en development-status.md.

## Desarrollo en red local — 2026-10-18

Diagnóstico reproducido: Vite escucha en 192.168.33.9, APP_ORIGIN conserva
localhost y POST /api/session desde la IP devuelve 403 por origen distinto.
La petición no llega al proveedor Auth. Cambiar solamente --host no cambia el
origen canónico, los QR ni las comprobaciones de sesión.

- AC-005 (BR-004/008): con NODE_ENV=development, un APP_ORIGIN HTTP canónico
  en 10/8, 172.16/12 o 192.168/16 permite acceso y enlaces en esa misma red.
  Producción, entorno ausente/test, IP pública, dominios HTTP y 0.0.0.0 siguen
  rechazados. No se deduce confianza de Host ni X-Forwarded-Host.
- AC-006 (BR-008/009): sesión y mutaciones mantienen Origin exacto. HTTP local
  utiliza cookies HttpOnly/SameSite=Lax sin Secure; HTTPS conserva Secure y
  prefijo __Host-. Otro origen/puerto queda en 403 sin llamar a Auth.
- AC-007 (BR-004/011): UI acepta el origen publicado por servidor y diferencia
  LAN de localhost en el aviso del QR. No promete cámara web en HTTP ni acceso
  desde datos móviles. Se documentan reinicio y mismo origen en ambos equipos.

- AC-008: registrar una operación en HTTP LAN no depende de crypto.randomUUID,
  ausente en contextos inseguros; usa aleatoriedad criptográfica disponible y
  conserva la clave al reintentar una operación ambigua.

Pruebas: runtime-config, public-config (servidor/UI), session, bridge y api UI.
Evidencia RED/GREEN y aceptación del servidor LAN se registran al cierre.

RED observado: seis fallos por rechazo LAN en configuración/endpoint y ausencia
del enlace UI; tres rechazos de dominios que parecen IP añadidos y comprobados
en RED antes de cerrar el rango IPv4 completo. La regresión de operación HTTP
falló con `crypto.randomUUID is not a function`; GREEN posterior con
getRandomValues y conservación de clave en reintento. Comprobación focal inicial:
64 tests configuración/sesión/puente/UI y 5 cliente API correctos.

Aceptación real LAN completada con tres cuentas existentes de Supabase en
Chromium escritorio/móvil emulado: login, cookies HTTP, recarga de sesión, QR
y formulario de compra. Una referencia ya existente devolvió 409 y conservó
el saldo observado; una solicitud desde localhost devolvió 403. No se creó
una compra nueva ni se cambió la configuración remota. La primera aserción
de navegador asumía el saldo histórico 1/5; se corrigió para leer el saldo
actual y verificar que permanece igual, sin modificar datos para pasar el test.
