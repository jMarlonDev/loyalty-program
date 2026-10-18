# ACCESS-001 — Acceso y continuidad hacia las tarjetas

Estado: aceptada por solicitud de corrección del 2026-10-18.

## Problema y alcance

La página de acceso ocultaba fallos de sesión inicial y dirigía a cualquier cuenta nueva a crear un restaurante. El registro, acceso Google y confirmación deben conservar el destino elegido y diferenciar cuenta de inscripción. Se conserva Supabase Auth y no se alteran roles, persistencia ni contratos de negocio.

## Referencias

BR-004, BR-008, BR-009, BR-010; IDENTITY-001 y STACK-001.

## Contrato

La pantalla `/auth` permite elegir Mis tarjetas (`/cards`) o Administrar (`/app`) cuando no llega un destino válido explícito. El destino por defecto existente `/app` se conserva. Un `next` de inscripción o invitación tiene prioridad y no se reemplaza. Registro, Google e inicio de sesión utilizan el mismo destino local seguro. Los errores de callback se traducen desde códigos constantes; nunca se refleja `error_description` remoto. Los errores de carga inicial son visibles y recuperables. Una sesión ya preparada ofrece continuar sin volver a iniciar sesión (excepto recuperación/cambio de contraseña).

## Criterios de aceptación

- AC-001 — Seleccionar Mis tarjetas y registrarse envía `/cards` también al servidor para conservarlo al confirmar el correo.
- AC-002 — Un `next=/join/...` válido se conserva en registro y Google; no se ofrece reemplazar el destino de inscripción. Destinos externos se descartan.
- AC-003 — Un callback cancelado, caducado o no disponible muestra explicación segura y permite repetir el acceso; un mensaje remoto arbitrario no se refleja.
- AC-004 — Un fallo de sesión inicial se muestra con reintento; una sesión válida ofrece continuar al destino elegido.

## Trazabilidad y validación

BR-004/008/009 → AC-001–004 → `tests/ui/auth-page.test.tsx`; continuidad HTTP/PKCE → suites de sesión y navegador. RED: cuatro fallos por ausencia de selector, mensaje de callback, error inicial y continuación de sesión; GREEN: cinco pruebas UI correctas. El navegador verifica selección de `/cards` antes del registro, conservación tras confirmar correo y Google con `next=/cards`. Verificación conjunta: 86 pruebas UI/servidor y 10 recorridos de navegador correctos en escritorio/móvil con PostgreSQL temporal y Auth aislado.

## Preguntas y riesgos

Configurar el proveedor y migrar PostgreSQL sigue siendo necesario. Crear cuenta no inscribe automáticamente a un programa; desde su enlace se confirma la inscripción con «Quiero mi tarjeta».
