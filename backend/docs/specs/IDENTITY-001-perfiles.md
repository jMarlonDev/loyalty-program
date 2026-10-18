# IDENTITY-001 — Identidad verificada y perfil propio

Estado: aceptada para implementación por solicitud de desarrollo del 2026-10-18.

## Problema y alcance

Primera entrega de la fase 1 de [BACKEND-001](BACKEND-001-plan-de-negocio.md): autenticar cada petición con Supabase Auth y mantener un único perfil local por identificador verificado. Correo/contraseña y Google convergen en el mismo contrato; el backend no recibe contraseñas ni implementa OAuth adicional. No comprende inscripción, tarjetas ni permisos de restaurante.

## Referencias

BR-004, BR-008 y BR-009 de [reglas canónicas](../business-rules.md); AC-003 y el rechazo de identidad no verificada/suspendida de AC-005 del plan. La verificación remota sigue [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) y el [modelo User](https://supabase.com/docs/guides/auth/users): usar `id`, `email` y `email_confirmed_at`, nunca roles de metadatos editables.

## Contrato

Todas las rutas bajo `/api/v1` exigen `Authorization: Bearer <access_token>` verificado mediante `GET /auth/v1/user` del proyecto configurado. Timeout de 5 segundos, sin redirecciones. Identificador UUID y correo no vacío hasta 255 caracteres; correo confirmado obligatorio. El proveedor decide la vinculación de identidades. Dos sujetos con igual correo no se fusionan localmente.

- `POST /profiles`: JSON `{ full_name, phone? }`. Nombre recortado de 1–255 caracteres. Teléfono opcional, nulo o texto recortado de 1–20 caracteres. Se rechazan campos desconocidos (incluidos email, id, password y roles). Crea perfil `active` con identificador/correo del proveedor y fechas del servidor; devuelve `201 { data: profile }`. Si ya existe devuelve `200` con el perfil intacto, aun si el cuerpo válido difiere. No cambia estado ni reactiva perfiles.
- `GET /me`: devuelve `200 { data: profile }` para el sujeto autenticado.
- `PATCH /me`: JSON con al menos uno de `full_name` o `phone`, las mismas validaciones y ningún otro campo; actualiza solo campos presentes y fecha. Devuelve `200 { data: profile }`.
- Perfil expuesto: `id`, `full_name`, `email`, `phone`, `status`, `created_at`, `updated_at`; fechas ISO UTC. Nunca `password_hash`.

Errores `{ error: { code, message, request_id } }`: `400 INVALID_INPUT` (JSON/validación), `401 UNAUTHENTICATED` (Bearer ausente o token rechazado), `403 EMAIL_NOT_VERIFIED`, `403 PROFILE_INACTIVE` (suspended/closed), `404 PROFILE_NOT_FOUND`, `503 IDENTITY_UNAVAILABLE` (timeout/red/error o respuesta malformada del proveedor). Fallos internos se normalizan a `500` en la composición HTTP. No se reflejan tokens, claves ni mensajes del proveedor.

Persistencia: `users.id` equivale al UUID verificado. Alta transaccional con `ON CONFLICT (id) DO NOTHING`, lectura y bloqueo del perfil existente; repetir o competir no duplica ni sobrescribe. PATCH bloquea la fila y comprueba estado en la misma transacción antes de escribir para impedir cambios tras suspensión concurrente. Se preserva esquema/migración inicial y `password_hash` permanece nulo en altas nuevas. El correo local se captura al alta; modificación de correo/credenciales sigue perteneciendo a Supabase y su sincronización posterior queda pendiente.

## Criterios de aceptación

- AC-001 — Un Bearer válido y correo confirmado producen identidad del proveedor; token ausente/rechazado y correo no confirmado no crean perfiles.
- AC-002 — Alta y repetición del mismo sujeto conservan un único perfil y no reemplazan su nombre/teléfono. Dos sujetos no se fusionan por correo.
- AC-003 — Lectura/edición se restringen al sujeto; nombres/teléfonos válidos se actualizan y campos sensibles/inválidos se rechazan sin cambios.
- AC-004 — Perfil suspendido/cerrado no se consulta, reactiva ni edita mediante estas rutas; el estado se verifica atómicamente en cambios.
- AC-005 — Caída/timeout/respuesta inválida del proveedor resulta en 503, diferenciada de credencial inválida y sin filtración de secretos.
- AC-006 — Concurrencia de altas devuelve una creación y un perfil único en PostgreSQL real; la edición conserva campos no enviados.

## Trazabilidad y validación

| Reglas | Criterios | Nivel / archivo | Evidencia |
| --- | --- | --- | --- |
| BR-008, BR-009 | AC-001 a AC-004 | unit `tests/unit/identity.test.ts` | RED: 29 fallos contra métodos pendientes; GREEN: 29 pruebas el 2026-10-18 |
| BR-008 | AC-001, AC-005 | unit `tests/unit/identity-provider.test.ts` | RED: 14 fallos contra adaptador pendiente; GREEN: 14 pruebas el 2026-10-18. Dobles HTTP; no prueba del proveedor real |
| BR-009 | AC-002, AC-004, AC-006 | integration `tests/integration/identity.test.ts` | PostgreSQL aislado; coordinado por agente principal |
| BR-004, BR-008 | AC-001 a AC-005 | e2e `tests/e2e/identity.test.ts` | HTTP y PostgreSQL aislado; proveedor doble |

## Preguntas y riesgos

Configuración Google, cliente OAuth, callbacks y verificación real del proveedor dependen del entorno y no están probados por dobles. `/join/:publicCode` y `/auth/callback` pertenecen al frontend reservado: tras autenticar, el cliente conserva el código público, completa POST /profiles y posteriormente usa la inscripción implementada por PROGRAMS-001. Membresías, tarjetas y personal se documentan en sus respectivas specs.

## Refinamiento de calidad — 2026-10-18

- AC-002/AC-003: integración comprueba en PostgreSQL dos sujetos distintos con
  igual correo, repetición que conserva los datos originales, borrado explícito
  de teléfono y edición de sujeto ausente sin crear filas ni alterar otro perfil.
- AC-004/AC-006: fixtures propios por caso; perfiles suspendidos y cerrados
  conservan todos sus campos. Una suspensión sin commit bloquea un PATCH real;
  la prueba observa contención en `pg_stat_activity`, confirma la suspensión y
  comprueba que el PATCH pendiente no cambia datos ni fecha.
- AC-005: el doble HTTP permanece pendiente hasta que la señal de timeout aborta
  la petición. Se verifica 503 y mensaje público sin detalles privados, además
  de JSON nulo/array, correo con NUL y fecha de confirmación malformada.
- Independencia E2E: se demostró RED al ejecutar únicamente `actualiza campos`
  (404 frente a 200), porque dependía del alta realizada por otra prueba.
  Cada caso tiene ahora un sujeto nuevo y crea sus precondiciones; las consultas
  de comprobación filtran por ese sujeto. El PATCH cambia realmente el teléfono
  y comprueba que un rechazo posterior no altera nombre ni teléfono.
- Validación focal inicial: integración identidad/personal 19/19 y adaptador
  de identidad 19/19. La validación agregada al cierre registra el resultado
  definitivo. E2E de identidad: 4/4 con `--sequence.shuffle --sequence.seed=42`
  después de corregir fixtures; `npm run typecheck` satisfactorio. No se cambia
  comportamiento de aplicación ni se acredita OAuth real.
