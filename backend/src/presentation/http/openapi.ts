type Schema = Record<string, unknown>;
const ref = (name: string): Schema => ({
  $ref: `#/components/schemas/${name}`,
});
const text = (maxLength = 255, minLength = 1): Schema => ({
  type: 'string',
  minLength,
  maxLength,
});
const uuid: Schema = { type: 'string', format: 'uuid' };
const date: Schema = { type: 'string', format: 'date-time' };
const nullable = (schema: Schema): Schema => ({
  anyOf: [schema, { type: 'null' }],
});
const enumeration = (...values: string[]): Schema => ({
  type: 'string',
  enum: values,
});
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const array = (items: Schema): Schema => ({ type: 'array', items });
const optionalPatch = (properties: Record<string, Schema>): Schema => ({
  ...object(properties, []),
  minProperties: 1,
});
const email = nullable({ type: 'string', format: 'email', maxLength: 255 });
const phone = nullable(text(20));
const token = {
  type: 'string',
  pattern: '^[A-Za-z0-9_-]{43}$',
  minLength: 43,
  maxLength: 43,
};
const timestamps = { created_at: date, updated_at: date };
const programFields = {
  name: text(),
  description: nullable(text(255, 0)),
  stamps_required: { type: 'integer', minimum: 1, maximum: 2147483647 },
  reward_description: text(),
  logo_url: nullable({
    type: 'string',
    format: 'uri',
    pattern: '^https://',
    maxLength: 2048,
  }),
  background_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  text_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  card_message: nullable(text(160, 0)),
};
const locationFields = {
  name: text(),
  address: text(2000),
  city: text(),
  department: text(),
  phone,
};
const programStatus = enumeration('active', 'paused', 'ended');
const membershipStatus = enumeration('active', 'suspended', 'closed');

const schemas: Record<string, Schema> = {
  ErrorDetail: object({
    code: text(),
    message: text(2000),
    request_id: text(64),
  }),
  Error: object({ error: ref('ErrorDetail') }),
  Empty: object({}),
  Health: object({ status: enumeration('ok') }),
  Readiness: object({ status: enumeration('ready') }),
  ProfileCreate: object({ full_name: text(), phone }, ['full_name']),
  ProfilePatch: optionalPatch({ full_name: text(), phone }),
  Profile: object({
    id: uuid,
    full_name: text(),
    email,
    phone,
    status: membershipStatus,
    ...timestamps,
  }),
  RestaurantCreate: object(
    {
      name: text(),
      slug: {
        type: 'string',
        maxLength: 255,
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      },
      email,
      phone,
    },
    ['name', 'slug'],
  ),
  RestaurantPatch: optionalPatch({
    name: text(),
    email,
    phone,
    status: enumeration('active', 'suspended'),
  }),
  Restaurant: object({
    id: uuid,
    name: text(),
    slug: text(),
    email,
    phone,
    status: enumeration('active', 'suspended'),
    ...timestamps,
  }),
  LocationCreate: object(locationFields, [
    'name',
    'address',
    'city',
    'department',
  ]),
  LocationPatch: optionalPatch({
    ...locationFields,
    status: enumeration('active', 'inactive'),
  }),
  Location: object({
    id: uuid,
    restaurant_id: uuid,
    ...locationFields,
    status: enumeration('active', 'inactive'),
    ...timestamps,
  }),
  EmployeePatch: optionalPatch({
    role: enumeration('admin', 'employee'),
    status: enumeration('active', 'suspended', 'disabled'),
  }),
  Employee: object({
    id: uuid,
    user_id: uuid,
    restaurant_id: uuid,
    role_id: uuid,
    role: enumeration('owner', 'admin', 'employee'),
    status: enumeration('active', 'suspended', 'disabled'),
    joined_at: date,
    ended_at: nullable(date),
    ...timestamps,
  }),
  InvitationCreate: object({
    email: { type: 'string', format: 'email', maxLength: 255 },
    role: enumeration('admin', 'employee'),
  }),
  TokenInput: object({ token }),
  Invitation: object(
    {
      id: uuid,
      restaurant_id: uuid,
      email: { type: 'string', format: 'email' },
      role_id: uuid,
      role: enumeration('admin', 'employee'),
      expires_at: date,
      status: enumeration('pending', 'accepted', 'revoked'),
      invited_by: uuid,
      accepted_by: nullable(uuid),
      accepted_at: nullable(date),
      created_at: date,
    },
    [
      'id',
      'restaurant_id',
      'email',
      'role_id',
      'expires_at',
      'status',
      'invited_by',
      'created_at',
    ],
  ),
  InvitationCreated: {
    allOf: [
      { ...ref('Invitation') },
      { type: 'object', properties: { token }, required: ['token'] },
    ],
  },
  ProgramCreate: object(programFields, [
    'name',
    'stamps_required',
    'reward_description',
  ]),
  ProgramPatch: optionalPatch({ ...programFields, status: programStatus }),
  Program: object({
    id: uuid,
    restaurant_id: uuid,
    ...programFields,
    public_code: text(),
    status: programStatus,
    terms_locked: { type: 'boolean' },
    ...timestamps,
  }),
  PublicProgram: object({
    id: uuid,
    public_code: text(),
    ...programFields,
    restaurant_name: text(),
  }),
  Membership: object({
    id: uuid,
    user_id: uuid,
    program_id: uuid,
    status: membershipStatus,
    joined_at: date,
    closed_at: nullable(date),
    benefits_version: { type: 'integer', minimum: 0 },
  }),
  Card: object({
    id: uuid,
    membership_id: uuid,
    status: enumeration('active', 'blocked'),
    created_at: date,
  }),
  ProgramResults: object({
    customers: { type: 'integer', minimum: 0 },
    active_cards: { type: 'integer', minimum: 0 },
    purchases: { type: 'integer', minimum: 0 },
    available_rewards: { type: 'integer', minimum: 0 },
    redeemed_rewards: { type: 'integer', minimum: 0 },
  }),
  ProgramCustomer: object({
    id: uuid,
    user_id: uuid,
    full_name: text(),
    email,
    status: membershipStatus,
    joined_at: date,
    card_id: nullable(uuid),
    balance: { type: 'integer' },
    purchases: { type: 'integer' },
    available_rewards: { type: 'integer' },
    redeemed_rewards: { type: 'integer' },
  }),
  CardDetail: object({
    id: uuid,
    membership_id: uuid,
    status: enumeration('active', 'blocked'),
    created_at: date,
    user_id: uuid,
    program_id: uuid,
    membership_status: membershipStatus,
    restaurant_id: uuid,
    program_name: text(),
    stamps_required: programFields.stamps_required,
    reward_description: programFields.reward_description,
    logo_url: programFields.logo_url,
    background_color: programFields.background_color,
    text_color: programFields.text_color,
    card_message: programFields.card_message,
    public_code: text(),
    balance: { type: 'integer', minimum: 0 },
  }),
  Enrollment: object({ membership: ref('Membership'), card: ref('Card') }),
  Qr: object({ card_id: uuid, token }),
  LedgerEntry: object(
    {
      id: uuid,
      membership_id: uuid,
      purchase_id: nullable(uuid),
      reward_id: nullable(uuid),
      stamp_delta: { type: 'integer' },
      created_at: nullable(date),
      kind: nullable(text(30)),
      actor_id: nullable(uuid),
      reason: nullable(text()),
      request_id: nullable(text()),
    },
    [
      'id',
      'membership_id',
      'purchase_id',
      'reward_id',
      'stamp_delta',
      'created_at',
    ],
  ),
  Reward: object({
    id: uuid,
    membership_id: uuid,
    description: text(),
    stamps_spent: { type: 'integer', minimum: 1 },
    status: enumeration('available', 'redeemed', 'cancelled'),
    earned_at: date,
    redeemed_at: nullable(date),
    redeemed_by: nullable(uuid),
    redeemed_location_id: nullable(uuid),
  }),
  PurchaseInput: object({
    card_id: uuid,
    location_id: uuid,
    sale_reference: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^\\S(?:.*\\S)?$',
    },
  }),
  PurchaseResult: object({
    purchase_id: uuid,
    membership_id: uuid,
    balance: { type: 'integer', minimum: 0 },
    rewards: array(uuid),
  }),
  RedeemInput: object({ location_id: uuid }),
  RedeemResult: object({ reward_id: uuid, status: enumeration('redeemed') }),
  ReverseInput: object({ reason: text(1000) }),
  ReverseResult: object({
    purchase_id: uuid,
    status: enumeration('reversed'),
    balance: { type: 'integer', minimum: 0 },
    rewards: array(uuid),
  }),
  AvailableReward: object({
    id: uuid,
    description: text(),
    stamps_spent: { type: 'integer', minimum: 1 },
  }),
  ClosurePreview: object({
    card_id: uuid,
    benefits_version: { type: 'integer', minimum: 0 },
    balance: { type: 'integer', minimum: 0 },
    rewards: array(ref('AvailableReward')),
  }),
  ConsentInput: object({
    benefits_version: { type: 'integer', minimum: 0 },
    accepted: { const: true, type: 'boolean' },
  }),
  Consent: object({
    id: uuid,
    card_id: uuid,
    benefits_version: { type: 'integer', minimum: 0 },
    expires_at: date,
  }),
  RevokeResult: object({ id: uuid, revoked: { type: 'boolean', const: true } }),
  CloseInput: object({ consent_id: uuid }),
  CloseResult: object({ card_id: uuid, status: enumeration('closed') }),
  OpenApiDocument: {
    type: 'object',
    required: ['openapi', 'info', 'paths', 'components'],
    properties: {
      openapi: { const: '3.1.0' },
      info: { type: 'object' },
      paths: { type: 'object' },
      components: { type: 'object' },
    },
    additionalProperties: true,
  },
};
// InvitationCreated adds the returned token to the closed public row schema.
schemas.InvitationCreated = object(
  {
    ...((schemas.Invitation?.properties ?? {}) as Record<string, Schema>),
    token,
  },
  [...((schemas.Invitation?.required ?? []) as string[]), 'token'],
);
schemas.RestaurantWithRole = object({
  ...((schemas.Restaurant?.properties ?? {}) as Record<string, Schema>),
  actor_role: enumeration('owner', 'admin', 'employee'),
});
schemas.ResolvedCard = object({
  ...((schemas.CardDetail?.properties ?? {}) as Record<string, Schema>),
  customer_name: text(),
  customer_email: email,
  available_rewards: array(
    object({ id: uuid, description: text(), status: enumeration('available') }),
  ),
});
schemas.EmployeeDirectory = object({
  ...((schemas.Employee?.properties ?? {}) as Record<string, Schema>),
  full_name: text(),
  email,
});
const id = 'dd4092e0-1951-47e0-af5c-bc0dbb94eaf8',
  otherId = '16171e51-2162-420a-a5c5-0b3eb0817ad8',
  at = '2026-10-18T12:00:00.000Z';
const examples: Record<string, unknown> = {
  Empty: {},
  ProfileCreate: { full_name: 'Ana', phone: '+573001234567' },
  ProfilePatch: { phone: null },
  Profile: {
    id,
    full_name: 'Ana',
    email: 'ana@example.test',
    phone: null,
    status: 'active',
    created_at: at,
    updated_at: at,
  },
  RestaurantCreate: { name: 'Café del Centro', slug: 'cafe-del-centro' },
  RestaurantPatch: { status: 'suspended' },
  Restaurant: {
    id,
    name: 'Café del Centro',
    slug: 'cafe-del-centro',
    email: null,
    phone: null,
    status: 'active',
    created_at: at,
    updated_at: at,
  },
  LocationCreate: {
    name: 'Centro',
    address: 'Calle 1 #2-3',
    city: 'Bogotá',
    department: 'Bogotá D.C.',
  },
  LocationPatch: { status: 'inactive' },
  EmployeePatch: { role: 'employee', status: 'active' },
  InvitationCreate: { email: 'staff@example.test', role: 'employee' },
  TokenInput: { token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
  ProgramCreate: {
    name: 'Cafés',
    stamps_required: 5,
    reward_description: 'Un café',
    background_color: '#FFFFFF',
    text_color: '#000000',
  },
  ProgramPatch: { card_message: '¡Gracias por volver!' },
  PurchaseInput: {
    card_id: id,
    location_id: otherId,
    sale_reference: 'POS-000123',
  },
  PurchaseResult: {
    purchase_id: id,
    membership_id: otherId,
    balance: 1,
    rewards: [],
  },
  RedeemInput: { location_id: otherId },
  RedeemResult: { reward_id: id, status: 'redeemed' },
  ReverseInput: { reason: 'Venta anulada en caja' },
  ReverseResult: {
    purchase_id: id,
    status: 'reversed',
    balance: 0,
    rewards: [],
  },
  ConsentInput: { benefits_version: 2, accepted: true },
  Consent: {
    id,
    card_id: otherId,
    benefits_version: 2,
    expires_at: '2026-10-18T12:15:00.000Z',
  },
  CloseInput: { consent_id: id },
  CloseResult: { card_id: otherId, status: 'closed' },
  RevokeResult: { id, revoked: true },
  Qr: { card_id: id, token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
  ClosurePreview: { card_id: id, benefits_version: 2, balance: 2, rewards: [] },
  Health: { status: 'ok' },
  Readiness: { status: 'ready' },
};
const errors: Record<string, string> = {
  '400': 'INVALID_INPUT',
  '401': 'UNAUTHENTICATED',
  '403': 'FORBIDDEN',
  '404': 'NOT_FOUND',
  '409': 'CONFLICT',
  '413': 'BODY_TOO_LARGE',
  '429': 'RATE_LIMITED',
  '500': 'INTERNAL_ERROR',
  '503': 'SERVICE_UNAVAILABLE',
};
const response = (
  schema: Schema,
  description: string,
  example?: unknown,
): Schema => ({
  description,
  headers: {
    'X-Request-Id': {
      description: 'Correlación de la solicitud.',
      schema: text(64),
    },
  },
  content: {
    'application/json': {
      schema,
      ...(example === undefined ? {} : { example }),
    },
  },
});
interface OperationOptions {
  public?: boolean;
  input?: string;
  output: string;
  status?: number;
  list?: boolean;
  idempotent?: boolean;
  secondary200?: boolean;
  description?: string;
  raw?: boolean;
}
const paths: Record<string, Record<string, Schema>> = {};
function operation(
  method: string,
  path: string,
  operationId: string,
  summary: string,
  options: OperationOptions,
) {
  const parameters: Schema[] = [
    {
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      description:
        'Identificador de correlación opcional, 1–64 letras, números, guion o guion bajo.',
      schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
    },
  ];
  for (const match of path.matchAll(/\{([^}]+)\}/g))
    parameters.push({
      name: match[1],
      in: 'path',
      required: true,
      schema:
        match[1] === 'code'
          ? {
              type: 'string',
              minLength: 1,
              maxLength: 255,
              pattern: '^[A-Za-z0-9_-]+$',
            }
          : uuid,
    });
  if (options.list)
    parameters.push(
      {
        name: 'cursor',
        in: 'query',
        required: false,
        description: 'Último UUID de la página anterior; orden ascendente.',
        schema: uuid,
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    );
  if (options.idempotent)
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description:
        'ASCII visible sin espacios; reusar solo para el mismo comando y cuerpo. Acceso actual se vuelve a verificar antes del replay.',
      schema: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: '^[!-~]+$',
      },
      example: 'checkout-000123',
    });
  const payload = ref(options.output);
  const successSchema = options.raw
    ? payload
    : options.list
      ? object({ data: array(payload), next_cursor: nullable(uuid) })
      : object({ data: payload });
  const successExample =
    examples[options.output] === undefined
      ? undefined
      : options.raw
        ? examples[options.output]
        : options.list
          ? { data: [examples[options.output]], next_cursor: null }
          : { data: examples[options.output] };
  const responses: Record<string, Schema> = {
    [options.status ?? 200]: response(
      successSchema,
      'Operación satisfactoria.',
      successExample,
    ),
  };
  if (options.secondary200)
    responses['200'] = response(
      successSchema,
      'Reutiliza el perfil o la membresía existente.',
      successExample,
    );
  for (const [status, code] of Object.entries(errors)) {
    if (options.public && (status === '401' || status === '403')) continue;
    responses[status] = response(ref('Error'), code, {
      error: {
        code,
        message:
          status === '500'
            ? 'Internal server error'
            : 'La operación no pudo completarse.',
        request_id: 'request-example',
      },
    });
    if (status === '429')
      responses[status] = {
        ...responses[status],
        headers: {
          'X-Request-Id': { schema: text(64) },
          'Retry-After': {
            description: 'Segundos hasta poder reintentar.',
            schema: { type: 'integer', minimum: 1 },
          },
        },
      };
  }
  const tag =
    path.startsWith('/me/') || path.includes('/cards/')
      ? 'Tarjetas'
      : path.includes('programs')
        ? 'Programas'
        : path.includes('purchases') || path.includes('/rewards/')
          ? 'Fidelización'
          : path.includes('restaurants') || path.includes('invitations')
            ? 'Restaurantes y personal'
            : path.startsWith('/api/')
              ? 'Identidad'
              : 'Operación';
  const entry: Schema = {
    operationId,
    summary,
    tags: [tag],
    description: options.description ?? summary,
    security: options.public ? [] : [{ bearerAuth: [] }],
    parameters,
    responses,
  };
  if (options.input)
    entry.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: ref(options.input),
          ...(examples[options.input] === undefined
            ? {}
            : { example: examples[options.input] }),
        },
      },
    };
  paths[path] ??= {};
  paths[path][method] = entry;
}
operation('get', '/health', 'health', 'Comprueba proceso HTTP', {
  public: true,
  output: 'Health',
});
operation('get', '/ready', 'ready', 'Comprueba disponibilidad de PostgreSQL', {
  public: true,
  output: 'Readiness',
});
operation('get', '/openapi.json', 'openapi', 'Contrato OpenAPI 3.1', {
  public: true,
  output: 'OpenApiDocument',
  raw: true,
});
operation(
  'post',
  '/api/v1/profiles',
  'createProfile',
  'Crea o recupera perfil propio',
  {
    input: 'ProfileCreate',
    output: 'Profile',
    status: 201,
    secondary200: true,
    description:
      'Correo e id provienen del proveedor verificado. No modifica el perfil existente ni reactiva identidades.',
  },
);
operation('get', '/api/v1/me', 'getProfile', 'Consulta perfil propio', {
  output: 'Profile',
});
operation(
  'patch',
  '/api/v1/me',
  'patchProfile',
  'Edita nombre o teléfono propios',
  { input: 'ProfilePatch', output: 'Profile' },
);
operation(
  'post',
  '/api/v1/restaurants',
  'createRestaurant',
  'Crea restaurante y Owner atómicamente',
  {
    input: 'RestaurantCreate',
    output: 'Restaurant',
    status: 201,
    idempotent: true,
  },
);
operation(
  'get',
  '/api/v1/restaurants',
  'listRestaurants',
  'Lista restaurantes con pertenencia activa',
  { output: 'RestaurantWithRole', list: true },
);
operation(
  'get',
  '/api/v1/restaurants/{restaurantId}',
  'getRestaurant',
  'Consulta restaurante del personal autenticado',
  { output: 'Restaurant' },
);
operation(
  'patch',
  '/api/v1/restaurants/{restaurantId}',
  'patchRestaurant',
  'Owner/Admin edita restaurante; solo Owner cambia estado',
  { input: 'RestaurantPatch', output: 'Restaurant', idempotent: true },
);
operation(
  'get',
  '/api/v1/restaurants/{restaurantId}/locations',
  'listLocations',
  'Lista sucursales del restaurante',
  { output: 'Location', list: true },
);
operation(
  'post',
  '/api/v1/restaurants/{restaurantId}/locations',
  'createLocation',
  'Owner/Admin crea sucursal',
  {
    input: 'LocationCreate',
    output: 'Location',
    status: 201,
    idempotent: true,
  },
);
operation(
  'patch',
  '/api/v1/restaurants/{restaurantId}/locations/{targetId}',
  'patchLocation',
  'Owner/Admin edita sucursal',
  { input: 'LocationPatch', output: 'Location', idempotent: true },
);
operation(
  'get',
  '/api/v1/restaurants/{restaurantId}/employees',
  'listEmployees',
  'Owner/Admin consulta personal',
  { output: 'EmployeeDirectory', list: true },
);
operation(
  'patch',
  '/api/v1/restaurants/{restaurantId}/employees/{targetId}',
  'patchEmployee',
  'Gestiona personal respetando jerarquía y protegiendo Owner',
  { input: 'EmployeePatch', output: 'Employee', idempotent: true },
);
operation(
  'get',
  '/api/v1/restaurants/{restaurantId}/invitations',
  'listInvitations',
  'Consulta invitaciones sin tokens',
  { output: 'Invitation', list: true },
);
operation(
  'post',
  '/api/v1/restaurants/{restaurantId}/invitations',
  'createInvitation',
  'Crea invitación por siete días y devuelve token compartible',
  {
    input: 'InvitationCreate',
    output: 'InvitationCreated',
    status: 201,
    idempotent: true,
  },
);
operation(
  'post',
  '/api/v1/restaurants/{restaurantId}/invitations/{targetId}/revoke',
  'revokeInvitation',
  'Revoca invitación pendiente',
  { input: 'Empty', output: 'Invitation', idempotent: true },
);
operation(
  'post',
  '/api/v1/invitations/accept',
  'acceptInvitation',
  'Acepta invitación con correo verificado destinatario',
  { input: 'TokenInput', output: 'Employee', idempotent: true },
);
operation(
  'post',
  '/api/v1/restaurants/{id}/programs',
  'createProgram',
  'Owner/Admin crea programa',
  { input: 'ProgramCreate', output: 'Program', status: 201, idempotent: true },
);
operation(
  'get',
  '/api/v1/restaurants/{id}/programs',
  'listPrograms',
  'Owner/Admin lista programas',
  { output: 'Program', list: true },
);
operation(
  'get',
  '/api/v1/restaurants/{id}/programs/{programId}',
  'getProgram',
  'Owner/Admin consulta programa',
  { output: 'Program' },
);
operation(
  'get',
  '/api/v1/restaurants/{id}/programs/{programId}/results',
  'programResults',
  'Owner/Admin consulta resultados reales sin importes financieros',
  { output: 'ProgramResults' },
);
operation(
  'get',
  '/api/v1/restaurants/{id}/programs/{programId}/customers',
  'programCustomers',
  'Owner/Admin consulta inscripciones paginadas con saldo del libro',
  { output: 'ProgramCustomer', list: true },
);
operation(
  'patch',
  '/api/v1/restaurants/{id}/programs/{programId}',
  'patchProgram',
  'Edita diseño o estado; condiciones fijas tras primera inscripción',
  {
    input: 'ProgramPatch',
    output: 'Program',
    idempotent: true,
    description:
      'ended es definitivo; paused permite volver a active. Meta/premio no cambian desde primera inscripción.',
  },
);
operation(
  'get',
  '/api/v1/public/programs/{code}',
  'publicProgram',
  'Consulta programa activo sin datos privados',
  { public: true, output: 'PublicProgram' },
);
operation(
  'post',
  '/api/v1/public/programs/{code}/enrollments',
  'enroll',
  'Inscribe perfil propio en programa activo',
  {
    input: 'Empty',
    output: 'Enrollment',
    status: 201,
    secondary200: true,
    idempotent: true,
  },
);
operation('get', '/api/v1/me/cards', 'listCards', 'Lista tarjetas propias', {
  output: 'CardDetail',
  list: true,
});
operation(
  'get',
  '/api/v1/me/cards/{cardId}',
  'cardDetail',
  'Consulta tarjeta propia y saldo del libro',
  { output: 'CardDetail' },
);
operation(
  'get',
  '/api/v1/me/cards/{cardId}/movements',
  'cardMovements',
  'Lista movimientos propios inmutables',
  { output: 'LedgerEntry', list: true },
);
operation(
  'get',
  '/api/v1/me/cards/{cardId}/rewards',
  'cardRewards',
  'Lista premios propios',
  { output: 'Reward', list: true },
);
operation(
  'get',
  '/api/v1/me/cards/{cardId}/qr',
  'cardQr',
  'Recupera token privado de tarjeta activa',
  { output: 'Qr' },
);
operation(
  'post',
  '/api/v1/me/cards/{cardId}/qr/rotate',
  'rotateQr',
  'Rota token e invalida el anterior',
  { input: 'Empty', output: 'Qr', idempotent: true },
);
operation(
  'post',
  '/api/v1/restaurants/{id}/cards/resolve',
  'resolveCard',
  'Personal activo resuelve token de su restaurante',
  { input: 'TokenInput', output: 'ResolvedCard' },
);
operation(
  'post',
  '/api/v1/restaurants/{id}/purchases',
  'createPurchase',
  'Acredita una compra, un sello y premios automáticos',
  {
    input: 'PurchaseInput',
    output: 'PurchaseResult',
    status: 201,
    idempotent: true,
  },
);
operation(
  'post',
  '/api/v1/restaurants/{id}/rewards/{rewardId}/redeem',
  'redeemReward',
  'Entrega premio una vez, sin descontar sellos nuevamente',
  { input: 'RedeemInput', output: 'RedeemResult', idempotent: true },
);
operation(
  'post',
  '/api/v1/restaurants/{id}/purchases/{purchaseId}/reverse',
  'reversePurchase',
  'Owner/Admin revierte compra por movimientos compensatorios',
  { input: 'ReverseInput', output: 'ReverseResult', idempotent: true },
);
operation(
  'get',
  '/api/v1/me/cards/{cardId}/closure-preview',
  'closurePreview',
  'Muestra beneficios que se perderán al cerrar',
  { output: 'ClosurePreview' },
);
operation(
  'post',
  '/api/v1/me/cards/{cardId}/closure-consents',
  'createClosureConsent',
  'Titular consiente cierre de versión actual por quince minutos',
  { input: 'ConsentInput', output: 'Consent', status: 201, idempotent: true },
);
operation(
  'delete',
  '/api/v1/me/cards/{cardId}/closure-consents/{consentId}',
  'revokeClosureConsent',
  'Titular revoca consentimiento aún no consumido',
  { output: 'RevokeResult', idempotent: true },
);
operation(
  'post',
  '/api/v1/restaurants/{id}/cards/{cardId}/close',
  'closeCard',
  'Personal ejecuta cierre lógico con consentimiento vigente',
  { input: 'CloseInput', output: 'CloseResult', idempotent: true },
);

export const openApiDocument: Record<string, unknown> = {
  openapi: '3.1.0',
  info: {
    title: 'Loyalty Program API',
    version: '1.0.0',
    description:
      'Backend de fidelización por compras. Contratos IDENTITY-001, STAFF-001, PROGRAMS-001, LOYALTY-001 y OPS-001. Correo/Google se autentican con Supabase; no hay endpoints OAuth locales.',
  },
  servers: [{ url: '/', description: 'Mismo origen de la API desplegada' }],
  tags: [
    'Operación',
    'Identidad',
    'Restaurantes y personal',
    'Programas',
    'Tarjetas',
    'Fidelización',
  ].map((name) => ({ name })),
  security: [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Access token Supabase verificado remotamente; no usar id_token de Google ni refresh_token.',
      },
    },
    schemas,
  },
};
