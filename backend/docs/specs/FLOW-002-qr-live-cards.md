# FLOW-002 — QR operables y tarjetas actualizadas

Estado: implementado y verificado en UI, navegador HTTPS local y flujo de cuentas reales. Fecha: 2026-10-18.

## Problema y alcance

El QR público inscribe al cliente; el QR privado identifica su tarjeta ante personal autorizado. La tarjeta abierta debe reflejar compras, premios y movimientos registrados desde otro dispositivo. El origen configurado actualmente es localhost: publicar HTTPS necesita un destino real y no se puede deducir de un QR.

## Referencias

BR-004, BR-005, BR-009, BR-012–BR-016; MOBILE-001, MOBILE-QR-001, FLOW-001 y LOYALTY-001. Se conservan autorización, aislamiento y transacciones del backend.

## Contrato

Sin endpoints nuevos. Consultas de tarjetas visibles se refrescan cada diez segundos, al recuperar foco y conexión; se pausan en segundo plano. Detalle, premios e historial tienen reintento manual, conservan datos ante fallo temporal y no otorgan sellos. Las mutaciones siguen requiriendo sesión del personal, sucursal activa, referencia única e idempotencia.

Al pegar un QR se admite el origen del navegador y el APP_ORIGIN validado del servidor, nunca dominios arbitrarios. Se extrae exclusivamente el token; no se navega a dominios del QR ni se envía allí una sesión. El QR privado nunca muestra un token opaco provisional como si fuera un enlace móvil mientras falta configuración.

## Criterios de aceptación

- AC-001: con tarjeta del cliente abierta, una compra registrada por otro dispositivo actualiza sellos, premios e historial sin recargar la página.
- AC-002: el refresco pausa cuando la página está oculta, vuelve al recuperar foco/conexión y permite actualizar manualmente; un error visible conserva los datos anteriores.
- AC-003: Operaciones acepta QR del origen canónico configurado aunque el operador use localhost; rechaza dominios ajenos, duplicados, otro formato y tokens malformados sin registrar compras.
- AC-004: configuración local muestra aviso real de acceso limitado; configuración ausente no produce un QR privado de texto que la cámara del teléfono no pueda abrir.
- AC-005: sin sucursal activa, Operaciones explica al dueño o empleado cómo resolver el impedimento y mantiene bloqueada la compra.

## Trazabilidad y validación

| BR | AC | Prueba | Evidencia |
| --- | --- | --- | --- |
| 004, 014–016 | 001–002 | tests/ui/customer-refresh.test.tsx; navegador cliente y empleado | Código previo conservado; pruebas integradas por coordinación, resultados al cierre en development-status.md |
| 005, 009, 012–013 | 003, 005 | tests/ui/operations.test.tsx; card-qr.test.ts | Código previo conservado; pruebas integradas por coordinación, resultados al cierre en development-status.md |
| 004–005 | 004 | tests/ui/customer-mobile.test.tsx; public-config.test.tsx | Código previo conservado; pruebas integradas por coordinación, resultados al cierre en development-status.md |

## Preguntas y riesgos

La comprobación pública DNS/TLS/cámara física queda condicionada a una URL HTTPS desplegada. No se sustituye por resultados del proveedor Auth simulado. Diez segundos es el intervalo de consulta, no una garantía de entrega instantánea ante fallos de red.

La validación HTTPS local se ejecuta con `npm run test:browser:production -- --https`,
certificado temporal y cuentas aisladas. La dirección se toma de APP_ORIGIN;
la prueba decodifica los QR renderizados y sigue sus enlaces. No se instala
una dependencia temporal en producción ni se publica el servicio real.

Aceptación final: diez escenarios de navegador de producción correctos (cinco
escritorio y cinco móvil), con Auth simulado y PostgreSQL temporal. Además, el
flujo real Supabase verificó acceso de las tres cuentas, QR del cliente,
compra Employee y actualización visible a 1/5 sellos sin recargar. La compra
de aceptación permanece en el negocio de prueba. Evidencia agregada en
[estado de desarrollo](../development-status.md).
