# Ejecución LOYALTY-NEXT-001 — 2026-10-19

Petición vigente: implementar P0–P10 del [plan raíz](../AGENTS.md#plan-vigente-fidelizacion-centrada-en-el-cliente), con subagentes y verificaciones. El historial inferior corresponde al sistema anterior. No se descartan cambios previos; copia del diff y estado inicial en `/tmp/loyalty-next-20261019/` durante esta ejecución (temporal, no fuente permanente).

## Coordinación activa

| Responsable | Alcance de escritura | Entrega y dependencias |
| --- | --- | --- |
| principal | AGENTS raíz/backend, índice/estado, harness, OpenAPI e integración | Respuestas D-01–D-05, contratos antes de handlers, baseline y aceptación agregada |
| p0_specs | BR y specs NEXT-001–005, avisos de supersesión | Schemas, errores, permisos y matriz BR → NC/AC → pruebas; no inferir decisiones pendientes |
| p1_data | DB-006, scripts transition-report y pruebas propias | Inventario y propuesta de expansión; schema/SQL tras contratos acordados |
| p1_realtime | docs/realtime-runtime.md, scripts/pruebas realtime aislados | Probar Nitro instalado, transporte privado y coordinación entre procesos; cambios runtime se integran con principal |

Compartimos árbol de trabajo. Cada agente comunica contratos y archivos antes de ampliar su alcance; el principal integra cambios compartidos. Cada entrega registra archivos, evidencia RED/GREEN, comandos/resultados, límites y siguiente dependencia. No se usa reset, no se eliminan pruebas de seguridad para ocultar fallos y no se editan migraciones 0000–0004.

## Decisiones y puertas

D-01–D-05 respondidas el 2026-10-19: acceso por teléfono sin OTP (el usuario pidió eliminarlo), invitación privada con correo autenticado y teléfono de contacto, ciclos separados para compras con premio pendiente, comprobante al teléfono registrado del titular y programa principal por restaurante. Las specs NEXT-001–003 y las reglas BR reflejan estas respuestas. El OTP ya no forma parte del alcance.

| Fase | Estado | Evidencia / próxima puerta |
| --- | --- | --- |
| P0 | Contratos y decisiones alineados | Decisiones registradas en AGENTS/specs/BR; matriz BR → NC/AC → pruebas aún con evidencia pendiente por fase |
| P1 | Implementación local existente | Migraciones 0005/0006 y esquema NEXT en árbol local; sin migración remota nueva |
| P2–P8 | Implementación local en curso | Rutas, repositorio, outbox/realtime y UI presentes; pruebas PostgreSQL cubren flujo, versiones y concurrencia |
| P9 | Pendiente | Retirada de roles/rutas antiguas solo tras conciliación |
| P10 | Pendiente | Aceptación en navegador, WSS real y release; sin URL pública |

## Punto de reanudación — 2026-10-19

**Estado:** P0 alineado; P1–P8 con implementación local y pruebas PostgreSQL verdes. No hay commit/push ni migración remota nueva. El OTP fue eliminado por decisión del usuario y no existe tabla/migración/ruta relacionada.

**Completado en la última sesión:**
- D-01–D-05 registradas; D-01 = teléfono normalizado sin OTP. Specs NEXT-001–003 y `business-rules.md` actualizadas.
- `POST /api/v1/customer/session` crea/recupera sesión por teléfono; no reutiliza cuentas de dueño/personal por coincidencia.
- Mutaciones NEXT exigen `Origin` exacto. El dueño no obtiene vínculo de operador automático.
- D-03: compra con premio pendiente abre ciclo `collecting` separado; canje debita solo el ciclo del premio y conserva ciclos posteriores.
- Saldo calculado del libro; premios listados por membresía; reemisión incrementa `version`; referencia de venta duplicada responde 409 `SALE_REFERENCE_DUPLICATE`.
- UI de tarjeta/operaciones tolera `cycle:null` y muestra premio disponible aunque el ciclo activo sea otro.

**Verificación reproducible:**
- `npm run check` → 225 UI/servidor, 10 tooling, 256 unit backend.
- `npm run test:db -- --sequence.shuffle --sequence.seed=20261019` → 517/517, 37 archivos, PostgreSQL 17 temporal.
- `npm run build`, `npm run db:check`, `npm run generate` (sin cambios) y `git diff --check` correctos.
- No se ejecutaron navegador, WSS real, WhatsApp real ni migración remota en esta sesión.

**Siguiente tarea recomendada (P7):**
1. Persistir `reward_deliveries` al crear el premio y exponer `delivery_status` en `RewardSummary`/UI, separado de premio y canje.
2. Añadir `POST /customer/rewards/:rewardId/resend` (titular) y hacer que el reenvío del operador use el teléfono registrado del titular, nunca el del operador.
3. Implementar outbox/worker con adapter inyectable, reintentos/lease y estado `pending → accepted → delivered/failed`; sin proveedor real debe responder 503 o quedar pendiente sin fingir envío.
4. Añadir pruebas de fallo de envío, reintento, reemisión y callbacks que no canjean.

**Después:** P9 retirar rutas/roles/columnas sin consumidores tras conciliación; P10 recorrido navegador, WSS/HTTPS y release. No aplicar migraciones remotas ni tocar `.env` sin autorización específica.

**Archivos clave:** `backend/src/infrastructure/next-repository.ts`, `backend/src/presentation/http/next-routes.ts` y `next-openapi.ts`, `backend/db/schema.ts` (`reward_deliveries`, `rewards`, `reward_vouchers`), `src/features/customer.tsx`, `src/features/operations.tsx`, `backend/tests/integration/next-flow.test.ts`.

## Verificaciones de esta ejecución

Verificación local de esta sesión: `npm run check` correcto (lint/tipos, 225 UI/servidor, 10 tooling y 256 unit backend); `npm run test:db -- --sequence.shuffle --sequence.seed=20261019` correcto con 517 pruebas backend en 37 archivos y PostgreSQL 17 temporal; `npm run build`, `npm run db:check` y `npm run generate` (sin cambios) correctos. Se actualizaron next-flow/http-access y la UI para el ciclo separado D-03, el rechazo sin Origin y el dueño sin vínculo de operador. La espera de arranque del contenedor de pruebas se amplió por lentitud del host. Estas pruebas acreditan trabajo local; no acreditan WhatsApp, WSS ni cámara reales. Las suites no cargan DATABASE_URL real.

Impeccable: launcher `context` intentado una vez, sin motor instalado y sin permiso para crear su caché global. PRODUCT/DESIGN leídos directamente; la ausencia del launcher no bloquea diseño ni implementación mediante herramientas disponibles.

Servicios externos: proveedor de verificación, WhatsApp, HTTPS/WSS público y cámara física aún sin verificar. La aceptación local con dobles no demuestra envíos reales ni despliegue. No hay autorización de transformación destructiva remota ni publicación de commits.

# Historial: migración fullstack — 2026-10-18

Solicitud vigente: reconstruir con TanStack Start, React y shadcn, frontend móvil, mismas reglas de negocio y tests antes/después. Reemplaza la reserva histórica del frontend. Fuente canónica: `backend/docs/business-rules.md`; especificación `backend/docs/specs/STACK-001-tanstack-start.md`.

## Responsabilidad e integración

| Área | Responsable | Límite de escritura | Contrato de integración |
| --- | --- | --- | --- |
| HTTP sin Hono | backend_migration | backend/src, backend/tests, spec | createApp().fetch(Request), contratos /api/v1 conservados |
| UI y diseño | frontend | src/features, components, styles, tests/ui, PRODUCT, DESIGN | Fetch del mismo origen; datos reales; cookies HttpOnly |
| Sesión y navegador | auth_harness | src/server/session, bridge, supabase-auth; lib/auth; tests/server y browser | /api/session; PKCE; CSRF por APP_ORIGIN |
| Ensamblaje y entrega | principal | configuración, rutas Start, runtime, deploy, docs raíz | Un proceso Node; un lockfile npm; checks agregados |

Los agentes comunican cambios de contrato antes de integrar. Ninguna regla se mueve a la UI: permisos, aislamiento, idempotencia y transacciones permanecen en dominio/aplicación y PostgreSQL. Cualquier ampliación de lectura debe tener spec y prueba, sin cambiar el libro contable.

## Evidencia previa

- `npm run check` en backend: lint y tipos correctos, 6 tooling y 217 unitarias correctas.
- `npm run test:db` con Docker temporal: las 400 pruebas originales correctas. Durante esa ejecución se incorporaron tres nuevas pruebas de transporte: 401 correctas y 2 RED de 403; no se presentan como regresiones del original.
- Los dos RED nuevos comprueban límite de bytes frente a Content-Length menor y aislamiento del limitador por dirección de adaptador.
- Estado previo de Git modificado preservado; no se usa reset ni se descarta la revisión de calidad existente.

## Puertas de entrega

1. Pruebas unitarias de dominio y UI y sesiones.
2. Integración y HTTP con PostgreSQL temporal y limpieza.
3. Tipos, formato, build SSR/cliente y manifiesto de rutas Start.
4. Navegador móvil/escritorio contra Start, QR y formularios conectados.
5. Paquete de despliegue, variables sin secretos, migraciones explícitas y documentación de límites externos.

El despliegue remoto y la validación del proveedor real solo se afirman si se ejecutan. Configuración de Google/SMTP, credenciales y destino real no se inventan.

## Cierre comprobado

409 backend con PostgreSQL temporal y cobertura, 64 UI/servidor y 10 escenarios Chromium producción correctos. Lint/tipos/build/Drizzle correctos. [Informe completo](project-review-2026-10-18.md). Subagentes completaron implementación y auditoría; su disponibilidad se agotó durante la revisión final y el principal cerró integración, aceptación y documentación. No se atribuye validación real al proveedor simulado.
