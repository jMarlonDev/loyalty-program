# MOBILE-001 — Enlaces para dispositivos móviles

Estado: aceptada por solicitud del 2026-10-18. El usuario requiere acceso desde cualquier lugar mediante HTTPS y confirma que todavía no dispone de URL pública ni despliegue.

## Alcance y referencias

BR-004/008/009 y STACK-001. Compartir programas, invitaciones y tarjetas usando el origen canónico configurado. No publicar un servicio sin destino ni credenciales; no modificar Supabase, secretos o migraciones. Mantener el diseño existente.

## Contrato

- `GET /api/public-config`: público, sin credenciales, devuelve `200 {data:{appOrigin:string}}`, exclusivamente el APP_ORIGIN validado. No depende de PostgreSQL, no lee/refleja Host o X-Forwarded-Host y usa Cache-Control no-store. Configuración ausente/inválida devuelve 503 con mensaje fijo sin valores privados.
- Los QR y enlaces compartidos utilizan ese origen; no se deducen de window.location.origin. Un origen localhost/loopback/privado permite pruebas pero se identifica como local y no se promete acceso desde otro dispositivo. Error o carga de configuración no fabrica un enlace alternativo.
- La configuración acepta desarrollo loopback HTTP y orígenes HTTPS canónicos. `env:check --public` exige un origen HTTPS no local para preparación de publicación; no prueba DNS, TLS, OAuth ni conectividad externa.
- Registro/confirmación conserva el destino de inscripción. La tarjeta inscrita tendrá enlace directo local `/cards?card=<uuid>` para volver a ella desde el mismo dispositivo; el acceso a datos sigue dependiendo de identidad y propiedad verificadas por backend.

## Aceptación y trazabilidad

- AC-001 (BR-004): configuración pública expone únicamente origen validado aun sin DB y rechaza origen inválido; tests servidor de handleApi.
- AC-002 (BR-004/011): compartir programa/invitación usa APP_ORIGIN pese al host del navegador; carga/error recuperables y aviso local.
- AC-003 (BR-004/009): confirmación/inscripción dirige a tarjeta propia y la recarga móvil restaura sesión; navegador con DB aislada.
- AC-004: se documentan URL HTTPS, callback de Supabase y límites reales; no se declara publicación completada sin haberla ejecutado.

## Verificación

RED observado: cinco fallos del endpoint antes de implementarlo (503 o mensaje incorrecto). GREEN: cinco tests de servidor, tres de UI y seis de configuración correctos; prueba integrada de inscripción y permalink en navegador. `env:check -- --public` rechaza correctamente APP_ORIGIN localhost del entorno actual. No cambia esquema ni reglas de compras. Evidencia global al cierre en development-status.md.
