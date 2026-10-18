# MOBILE-QR-001 — Tarjeta móvil y registro desde QR

Estado: implementada localmente. Fecha: 2026-10-18.

## Problema y alcance

El cliente consulta su tarjeta autenticada desde el móvil. El personal abre su formulario de compra escaneando el QR con la cámara dentro de Operaciones o desde la cámara del dispositivo. La URL pública depende del APP_ORIGIN y despliegue del operador; no se inventa un dominio.

## Referencias

BR-003, BR-004, BR-005, BR-009, BR-012, BR-013; PROGRAMS-001 y LOYALTY-001 mantienen autorización y atomicidad existentes.

## Contrato

El QR contiene `${APP_ORIGIN}/scan#token=<token>&restaurant=<uuid>`. El fragmento se valida y elimina del historial al leerlo. Durante el acceso se conserva únicamente un QR pendiente en sessionStorage por pestaña durante diez minutos; nunca se guarda en localStorage ni se incorpora al parámetro next, solicitudes de autenticación o cookies. Se elimina al resolver o cerrar sesión explícitamente (evento loyalty:logout). Comprobar que un visitante aún no tiene sesión no borra el QR pendiente. Se aceptan códigos opacos antiguos al pegarlos. URLs ajenas, malformadas, sin restaurante válido o con un token inválido se rechazan antes de consultar.

La ruta /scan requiere sesión y pertenencia al restaurante. Reutiliza POST `/api/v1/restaurants/:id/cards/resolve` con `{token}`. Resolver no registra compras: POST purchases conserva sucursal activa, referencia única y confirmación expresa. El cliente no puede otorgarse sellos ni ver datos de otros clientes. No cambian API, esquema ni reglas del backend.

La cámara se solicita por acción explícita y usa ZXing cargado bajo demanda para compatibilidad móvil. Al detectar QR válido se detiene y abre el formulario. Cerrar, desmontar o perder visibilidad detiene la cámara; denegación, ausencia de dispositivo o contexto inseguro muestran alternativa para pegar el código.

## Criterios de aceptación

- AC-001: QR de tarjeta activa abre /scan en origen configurado; titular conserva código opaco para copiar.
- AC-002: Personal autorizado obtiene formulario listo para referencia/sucursal; escanear nunca suma un sello. Códigos inválidos y restaurante ajeno no muestran tarjeta ni generan compra.
- AC-003: Inicio de sesión retoma /scan sin token en URL de servidor; estado temporal caduca y se borra al resolver/cerrar sesión.
- AC-004: Cámara funciona bajo HTTPS y libera recursos; entrada manual continúa disponible ante errores.
- AC-006: abrir otro QR en la misma pestaña de /scan reemplaza la tarjeta y el formulario anterior; borra de nuevo el fragmento.
- AC-005: Un fallo temporal de sesión muestra error recuperable sin enviar al usuario al inicio de sesión.

## Trazabilidad y validación

| Criterio | Nivel | Prueba | Evidencia |
| --- | --- | --- | --- |
| AC-001/003 | UI/unit | card-qr.test | GREEN; aceptación aislada |
| AC-002 | UI | operations.test | Tres fallos RED observados; GREEN tras resolución automática |
| AC-004 | UI | qr-camera.test | GREEN; aceptación aislada |
| AC-005 | UI | workspace.test | GREEN; aceptación aislada |

## Preguntas y riesgos

Se requiere URL HTTPS pública desplegada y callbacks configurados; el código local no publica hosting. Permisos de cámara dependen del navegador/dispositivo y se validarán por separado de las pruebas simuladas.

Integración: RED adicional al borrar QR cuando un visitante carecía de sesión; GREEN separando logout explícito de comprobación de identidad ausente. Prueba scan.test verifica conservación y limpieza. Cámara probada con MediaStream/ZXing simulados; no se afirma prueba de una cámara física.

AC-006: RED al conservar token anterior tras hashchange; GREEN (6 pruebas de scan) con captura del nuevo fragmento y remount del formulario según tarjeta.
