# PROGRAMS-001 — Programas, inscripción y tarjetas

Estado: implementada localmente el 2026-10-18 por petición del usuario; integración HTTP global en validación del agente principal.

## Problema y alcance

Fases 3 y 4 de [BACKEND-001](BACKEND-001-plan-de-negocio.md). Referencias: BR-001–005, BR-009, BR-012, BR-016, BR-018, BR-019. Depende de IDENTITY-001 y DB-003. No implementa compra, canje ni cierre.

## Contrato

Prefijo `/api/v1`. JSON `{data}`; listas `{data,next_cursor}`. Todas las rutas salvo acceso público requieren sesión verificada y perfil activo. Errores comunes 400 INVALID_INPUT, 401 UNAUTHENTICATED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT. Datos ajenos se ocultan con 404. Escrituras exigen Idempotency-Key, revalidan acceso antes de reproducir respuesta y rechazan clave reutilizada con cuerpo diferente.

- `POST /restaurants/:id/programs`: Owner/Admin activos, restaurante activo. `{name,description?,stamps_required,reward_description,logo_url?,background_color?,text_color?,card_message?}`. Nombre y premio 1–255; descripción 0–255 o null; meta entero positivo hasta 2147483647; logo HTTPS hasta 2048 o null; colores hex de seis dígitos (default blanco/negro); mensaje 0–160 o null. UUID y código público aleatorio generados por servidor, estado inicial active. 201.
- `GET /restaurants/:id/programs` y `GET /restaurants/:id/programs/:programId`: Owner/Admin activos. Lista paginada por UUID cursor exclusivo `cursor`, `limit` 1–100 (default20).
- `PATCH /restaurants/:id/programs/:programId`: mismos campos opcionales y `status` active/paused/ended; al menos uno. `ended` es definitivo. Desde primera inscripción `stamps_required` y `reward_description` solo pueden repetirse sin cambio; otros campos siguen editables. 200.
- `GET /public/programs/:code`: sin sesión; solo restaurante activo y programa active. Expone id/código/nombre/descripción/meta/premio/diseño/nombre de restaurante; no participantes, personal, tokens o saldos.
- `POST /public/programs/:code/enrollments`: perfil activo, restaurante/programa activos; cuerpo vacío `{}`. Devuelve 201 `{membership,card}` nuevos o 200 existentes sin token privado; una membresía suspendida rechaza. Una cerrada permite una nueva desde cero. Fija terms_locked incluso tras futuros cierres.
- `GET /me/cards`: tarjetas propias paginadas. `GET /me/cards/:cardId`: detalle propio con saldo derivado del libro. `GET /me/cards/:cardId/movements` y `/rewards`: historiales propios paginados; sin datos de otro titular.
- `GET /me/cards/:cardId/qr`: devuelve `{card_id,token}` solamente para membresía active/tarjeta active y restaurante activo. `POST /me/cards/:cardId/qr/rotate`: cuerpo `{}`, mismo acceso, cambia token opaco y devuelve token nuevo; el anterior deja de resolver.
- `POST /restaurants/:id/cards/resolve`: Owner/Admin/Employee activos del restaurante activo, `{token}` opaco de 43 caracteres base64url. Solo resuelve tarjeta/membresía active de ese restaurante y devuelve detalle operativo con saldo, sin material cifrado. Es lectura y no exige idempotencia.

Tokens aleatorios de 32 bytes; almacenamiento SHA-256 para búsqueda y AES-256-GCM con clave de configuración de 32 bytes para recuperación propia. Nunca exponer hash o ciphertext. La clave no se persiste en DB/Git; si falta ciphertext en tarjeta heredada, GET QR devuelve conflicto indicando rotación necesaria.

Todas las mutaciones transaccionan y bloquean restaurante→actor→programa/membresía antes de efectos. Inscripción concurrente se serializa por restaurante, usa unicidad parcial DB y no duplica tarjeta. Cambios de meta concurrentes con inscripción observan bloqueo/terms_locked. Paginación determinista por UUID, devolviendo next_cursor solo con más resultados.

Crear/editar programa, inscribir y rotar QR registran en la misma transacción `audit_events` con actor, restaurante, acción, recurso, fecha y `request_id` HTTP. No incluyen tokens, hashes, ciphertext ni cuerpos. Repetir la misma clave no duplica auditoría. Un cliente directo sin contexto HTTP recibe correlación generada en servidor.

## Criterios y trazabilidad

| AC | Reglas | Comportamiento y prueba |
| --- | --- | --- |
| AC-001 | BR-002, BR-007, BR-019 | Valida diseño y entradas; solo Owner/Admin crea/edita; Employee/ajeno no modifica. unit programs, integration programs |
| AC-002 | BR-018 | Primera inscripción bloquea meta/premio permanentemente; diseño sigue editable. integration programs |
| AC-003 | BR-004, BR-009, BR-016 | Inscripción idempotente/concurrente crea una membresía/tarjeta; programa paused/ended, restaurante suspended y perfil inactivo rechazan sin efectos. integration programs |
| AC-004 | BR-009, BR-021 | Consultas propias no filtran otro titular; reinscripción tras cierre crea nueva membresía/tarjeta. integration programs |
| AC-005 | BR-005, BR-012 | Token privado recuperable/cifrado, rotación invalida anterior, resolución restringida al restaurante autorizado. unit crypto/integration programs |
| AC-006 | BR-016 | ended no reactiva; acceso público mínimo sin participantes ni QR privado. integration programs |

## Evidencia y límites

RED/GREEN observado: 23 casos de validación fallaron contra funciones vacías y pasan; cuatro casos criptográficos fallaron contra funciones vacías y pasan. Siete pruebas de integración fallaron por métodos aún no implementados después de preparar correctamente PostgreSQL aislado y pasaron al implementar. Ampliadas a 11 pruebas que pasan: carreras de inscripción y edición de meta, suspensión de perfil/restaurante/membresía, revocación de permisos antes de replay, ledger/premios propios y ausencia de token claro en persistencia. Typecheck y Biome de los archivos del módulo satisfactorios.

Proveedor identidad sustituido solo en pruebas; integración ejecutada con PostgreSQL real en bases temporales individuales. No se configura Google ni Supabase remoto. La inscripción verifica estado otra vez después del retorno OAuth; callbacks/UI siguen reservados. El replay de un comando de creación conserva su resultado y estado HTTP original; una inscripción con clave nueva que reutiliza membresía responde 200.


Revisión de auditoría completada antes de publicar: se propagó request_id hasta el repositorio; crear, editar, inscribir y rotar registran eventos en la misma transacción. La prueba RED esperaba cuatro eventos y recibía cero. El replay no repite eventos y la auditoría no contiene tokens. Se corrigió asimismo el rechazo de estados enviados como array. Evidencia agregada de ejecución en AGENTS.

## Refinamiento de verificación — 2026-10-18

Los UUID válidos admiten hexadecimal en mayúsculas y se normalizan a minúsculas antes de comparar recursos o calcular la identidad de un reintento. Cambiar únicamente la representación de un UUID no cambia el recurso ni el comando. Las pruebas de atomicidad inducen un fallo de auditoría después de escribir efectos y verifican rollback de negocio, auditoría e idempotencia; un reintento posterior puede completar el comando.

- Regresión RED: UUID con hexadecimal mayúsculo no se normalizaba, rompiendo la equivalencia del comando. GREEN unitario tras normalización; cursores también conservan la identidad canónica.
- Pruebas ampliadas: paginación completa sin duplicados/omisiones/filtración de tarjetas ajenas; creación rechazada compara persistencia previa; listado ya no requiere tarjetas creadas por otro test; fallo inducido al auditar inscripción revierte membresía, tarjeta, bloqueo de condiciones e idempotencia.
- Verificación focal: 25 pruebas unitarias de programas y 14 de integración dentro de la ejecución conjunta programas/fidelización (41/41 correctas con PostgreSQL 17 temporal). No se modifica Supabase ni el esquema.
- Repetición focal con orden aleatorio (`--sequence.shuffle --sequence.seed=20261018`): 41/41 correctas; no depende del orden previo de ejecución. Ambas ejecuciones finalizaron con limpieza automática.
