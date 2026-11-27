import { openApiDocument } from './openapi.js';

type Schema = Record<string, unknown>;
const establishedSchemas = (
  openApiDocument.components as { schemas: Record<string, Schema> }
).schemas;
const ref = (name: string): Schema => ({
  $ref: `#/components/schemas/${name}`,
});
const string = (maxLength = 255, minLength = 1): Schema => ({
  type: 'string',
  minLength,
  maxLength,
});
const uuid: Schema = { type: 'string', format: 'uuid' };
const date: Schema = { type: 'string', format: 'date-time' };
const integer = (minimum = 0): Schema => ({
  type: 'integer',
  minimum,
  maximum: Number.MAX_SAFE_INTEGER,
});
const enumeration = (...values: string[]): Schema => ({
  type: 'string',
  enum: values,
});
const nullable = (schema: Schema): Schema => ({
  anyOf: [schema, { type: 'null' }],
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
const token: Schema = { ...string(43, 43), pattern: '^[A-Za-z0-9_-]{43}$' };
const publicCode: Schema = { ...string(), pattern: '^[A-Za-z0-9_-]+$' };
const phone: Schema = { ...string(32, 4), pattern: '^[+0-9][0-9 ()-]*$' };
const country: Schema = { ...string(2, 2), pattern: '^[A-Z]{2}$' };
const programProperties: Record<string, Schema> = {
  id: uuid,
  restaurant_id: uuid,
  restaurant_name: string(),
  public_code: publicCode,
  name: string(),
  description: nullable(string(255, 0)),
  stamps_required: integer(1),
  reward_description: string(),
  logo_url: nullable({ ...string(2048), format: 'uri', pattern: '^https://' }),
  background_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  text_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  card_message: nullable(string(160, 0)),
};

const schemas: Record<string, Schema> = {
  Empty: object({}),
  Error: object({ error: ref('ErrorDetail') }),
  ErrorDetail: object({
    code: string(),
    message: string(2000),
    request_id: string(64),
  }),
  PublicProgram: object({
    ...programProperties,
    status: enumeration('active'),
  }),
  PublicProgramSnapshot: object({
    ...programProperties,
    status: enumeration('active', 'paused', 'ended'),
  }),
  CustomerSessionInput: object({ phone, country, public_code: publicCode }, [
    'phone',
    'country',
  ]),
  CustomerSessionView: object({
    authenticated: { type: 'boolean', const: true },
    expires_at: date,
    phone_masked: string(32),
  }),
  CustomerSessionCreated: object({
    authenticated: { type: 'boolean', const: true },
    expires_at: date,
    phone_masked: string(32),
    card: nullable(ref('CustomerCard')),
  }),
  CustomerEnrollmentInput: object({ public_code: publicCode }),
  CustomerCard: object({
    id: uuid,
    membership_id: uuid,
    program_id: uuid,
    restaurant_id: uuid,
    restaurant_name: string(),
    program_name: string(),
    status: enumeration('active', 'blocked'),
    version: integer(),
    balance: integer(),
    target: integer(1),
    cycle: nullable(
      object({
        id: uuid,
        number: integer(1),
        state: enumeration('collecting', 'reward_available', 'redeemed'),
        stamps: integer(),
        target: integer(1),
      }),
    ),
    rewards: array(ref('RewardSummary')),
    program: ref('PublicProgramSnapshot'),
  }),
  RewardSummary: object({
    id: uuid,
    status: enumeration('available', 'redeemed', 'cancelled'),
    description: string(),
    accounting_mode: enumeration('legacy_debited', 'debit_on_redemption'),
    earned_at: date,
    voucher: nullable(object({ token, expires_at: nullable(date) })),
    whatsapp_url: nullable({ ...string(4096), format: 'uri' }),
  }),
  CardQr: object({
    card_id: uuid,
    purpose: { type: 'string', const: 'card' },
    token,
  }),
  CardEvent: object({
    event_id: uuid,
    card_id: uuid,
    version: integer(),
    type: enumeration(
      'purchase.recorded',
      'reward.available',
      'reward.redeemed',
      'card.changed',
    ),
  }),
  CardSubscription: object(
    {
      type: { type: 'string', const: 'subscribe' },
      card_id: uuid,
      last_version: integer(),
    },
    ['type', 'card_id'],
  ),
  VoucherView: object({
    reward_id: uuid,
    card_id: uuid,
    purpose: { type: 'string', const: 'reward' },
    token,
    expires_at: nullable(date),
  }),
  OperatorScanInput: object({
    restaurant_id: uuid,
    purpose: enumeration('card', 'reward'),
    token,
  }),
  OperatorScan: object({
    purpose: enumeration('card', 'reward'),
    card: object({
      id: uuid,
      program_id: uuid,
      program_name: string(),
      phone_masked: string(32),
      balance: integer(),
      target: integer(1),
      version: integer(),
    }),
    reward: nullable(ref('RewardSummary')),
    allowed_actions: array(enumeration('purchase', 'redeem', 'resend')),
  }),
  PurchaseInput: object({
    restaurant_id: uuid,
    token,
    sale_reference: string(100),
  }),
  PurchaseResult: object({
    purchase: object({
      id: uuid,
      card_id: uuid,
      sale_reference: string(100),
      stamps_earned: { type: 'integer', const: 1 },
      created_at: date,
    }),
    card: ref('CustomerCard'),
    reward: nullable(ref('RewardSummary')),
    version: integer(),
    event_id: uuid,
  }),
  RedemptionInput: object({
    restaurant_id: uuid,
    token,
    confirm: { type: 'boolean', const: true },
  }),
  RedemptionResult: object({
    redemption: object({
      id: uuid,
      reward_id: uuid,
      card_id: uuid,
      redeemed_at: date,
    }),
    card: ref('CustomerCard'),
    version: integer(),
    event_id: uuid,
  }),
  OperatorResendInput: object({ restaurant_id: uuid }),
  DeliveryTask: object({
    reward_id: uuid,
    token,
    expires_at: nullable(date),
    whatsapp_url: { ...string(4096), format: 'uri' },
  }),
  OperatorInvitationInput: object({
    email: { ...string(), format: 'email' },
    phone,
    country,
  }),
  OperatorAcceptanceInput: object({ token }),
  OperatorMembershipPatch: object({
    status: enumeration('suspended', 'disabled'),
  }),
  OperatorInvitation: object({
    id: uuid,
    restaurant_id: uuid,
    email: { ...string(), format: 'email' },
    phone_masked: string(32),
    status: enumeration('pending', 'accepted', 'revoked', 'expired'),
    expires_at: date,
    whatsapp_url: nullable({ ...string(4096), format: 'uri' }),
  }),
  OperatorInvitationCreated: object({
    invitation: ref('OperatorInvitation'),
    token,
    whatsapp_url: nullable({ ...string(4096), format: 'uri' }),
  }),
  OperatorMembership: object({
    id: uuid,
    restaurant_id: uuid,
    user_id: uuid,
    email: nullable({ ...string(), format: 'email' }),
    phone_masked: nullable(string(32)),
    status: enumeration('active', 'suspended', 'disabled'),
    joined_at: date,
    ended_at: nullable(date),
  }),
  RestaurantCreate: establishedSchemas.RestaurantCreate!,
  RestaurantPatch: establishedSchemas.RestaurantPatch!,
  ProgramCreate: establishedSchemas.ProgramCreate!,
  ProgramPatch: establishedSchemas.ProgramPatch!,
  Program: establishedSchemas.Program!,
  Restaurant: object({
    id: uuid,
    name: string(),
    email: nullable({ ...string(), format: 'email' }),
    phone: nullable(string(20)),
    status: enumeration('active', 'suspended'),
    created_at: date,
    updated_at: date,
    access: object({
      is_owner: { type: 'boolean' },
      can_operate: { type: 'boolean' },
    }),
  }),
};

interface Operation {
  method: 'get' | 'post' | 'delete' | 'patch';
  path: string;
  id: string;
  summary: string;
  input?: string;
  output?: string;
  auth?: 'public' | 'operator' | 'owner' | 'account';
  status?: number;
  list?: boolean;
  retry?: boolean;
  decisions?: string[];
  existing?: boolean;
  alternate200?: boolean;
  websocket?: boolean;
  setsCookie?: boolean;
}

const responseHeaders: Schema = {
  'X-Request-Id': { schema: string(64) },
  'Cache-Control': { schema: { type: 'string', const: 'no-store' } },
};
const jsonResponse = (schema: Schema, description: string): Schema => ({
  description,
  headers: responseHeaders,
  content: { 'application/json': { schema } },
});
const paths: Record<string, Record<string, Schema>> = {};
function operation(options: Operation) {
  const parameters: Schema[] = [
    {
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      schema: { ...string(64), pattern: '^[A-Za-z0-9_-]+$' },
    },
  ];
  for (const match of options.path.matchAll(/\{([^}]+)\}/g))
    parameters.push({
      name: match[1],
      in: 'path',
      required: true,
      schema: match[1] === 'code' ? publicCode : uuid,
    });
  if (options.method !== 'get' || options.websocket)
    parameters.push({
      name: 'Origin',
      in: 'header',
      required: true,
      schema: { type: 'string', format: 'uri' },
      description:
        'Debe coincidir exactamente con el origen configurado; no autoriza por sí solo.',
    });
  if (options.retry)
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { ...string(128), pattern: '^[A-Za-z0-9_-]+$' },
      description:
        'Reutilizar en reintentos del mismo comando; revalidar actor antes del replay.',
    });
  if (options.list)
    parameters.push(
      { name: 'cursor', in: 'query', required: false, schema: uuid },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    );
  const success = options.output
    ? jsonResponse(
        options.list
          ? object({
              data: array(ref(options.output)),
              next_cursor: nullable(uuid),
            })
          : object({ data: ref(options.output) }),
        options.summary,
      )
    : { description: options.summary, headers: responseHeaders };
  if (options.setsCookie)
    success.headers = {
      ...responseHeaders,
      'Set-Cookie': {
        schema: string(1024),
        description:
          'Cookie opaca HttpOnly de cliente; nunca contiene teléfono ni saldo.',
      },
    };
  const responses: Record<string, Schema> = {
    [options.status ?? 200]: success,
  };
  if (options.alternate200)
    responses['200'] = jsonResponse(
      object({ data: ref(options.output as string) }),
      'Inscripción existente, sin duplicación ni sello.',
    );
  for (const code of [400, 401, 403, 404, 409, 413, 429, 500, 503]) {
    if (code === 401 && options.auth === 'public') continue;
    const response = jsonResponse(
      ref('Error'),
      'Error sin efecto comercial no confirmado.',
    );
    if (code === 429)
      response.headers = {
        ...responseHeaders,
        'Retry-After': {
          schema: integer(1),
          description: 'Segundos hasta nuevo intento.',
        },
      };
    responses[code] = response;
  }
  const entry: Schema = {
    operationId: options.id,
    summary: options.summary,
    parameters,
    responses,
    security:
      options.auth === 'public'
        ? []
        : options.auth
          ? [{ bearerAuth: [] }, { staffSession: [] }]
          : [{ customerSession: [] }],
    'x-implementation': 'mounted',
    'x-authorization': options.auth ?? 'customer',
    'x-decision-dependencies': options.decisions ?? [],
  };
  if (options.existing) entry['x-existing-route'] = true;
  if (options.input)
    entry.requestBody = {
      required: true,
      content: { 'application/json': { schema: ref(options.input) } },
    };
  if (options.websocket)
    entry['x-websocket'] = {
      incoming: ref('CardSubscription'),
      event: ref('CardEvent'),
      specification: 'NEXT-004',
      description:
        'Upgrade privado, solo suscripción/lectura. Nunca muta saldo.',
    };
  paths[options.path] ??= {};
  paths[options.path]![options.method] = entry;
}

operation({
  method: 'get',
  path: '/api/v1/public/programs/{code}',
  id: 'nextPublicProgram',
  summary: 'Programa público sin inscripción ni sello',
  auth: 'public',
  output: 'PublicProgram',
  existing: true,
});
operation({
  method: 'post',
  path: '/api/v1/customer/session',
  id: 'startCustomerSession',
  summary: 'Identificar el teléfono y emitir la sesión larga del dispositivo',
  auth: 'public',
  input: 'CustomerSessionInput',
  output: 'CustomerSessionCreated',
  status: 201,
  setsCookie: true,
  decisions: ['D-01'],
});
operation({
  method: 'get',
  path: '/api/v1/customer/session',
  id: 'customerSession',
  summary: 'Leer la sesión actual sin exponer el teléfono completo',
  output: 'CustomerSessionView',
});
operation({
  method: 'delete',
  path: '/api/v1/customer/session',
  id: 'forgetCustomerDevice',
  summary: 'Revocar este dispositivo sin borrar beneficios',
  status: 204,
  setsCookie: true,
});
operation({
  method: 'post',
  path: '/api/v1/customer/enrollments',
  id: 'enrollCustomer',
  summary: 'Crear o recuperar la tarjeta sin sello inicial',
  input: 'CustomerEnrollmentInput',
  output: 'CustomerCard',
  status: 201,
  alternate200: true,
  decisions: ['D-05'],
});
operation({
  method: 'get',
  path: '/api/v1/customer/cards',
  id: 'customerCards',
  summary: 'Tarjetas propias',
  output: 'CustomerCard',
  list: true,
});
operation({
  method: 'get',
  path: '/api/v1/customer/cards/{cardId}',
  id: 'customerCard',
  summary: 'Saldo y beneficios canónicos de una tarjeta propia',
  output: 'CustomerCard',
});
operation({
  method: 'get',
  path: '/api/v1/customer/cards/{cardId}/qr',
  id: 'customerCardQr',
  summary: 'QR de identificación de tarjeta',
  output: 'CardQr',
});
operation({
  method: 'get',
  path: '/api/v1/customer/rewards/{rewardId}/voucher',
  id: 'customerRewardVoucher',
  summary: 'Comprobante de un premio propio disponible',
  output: 'VoucherView',
});
operation({
  method: 'post',
  path: '/api/v1/customer/rewards/{rewardId}/voucher/reissue',
  id: 'reissueCustomerRewardVoucher',
  summary: 'Revocar QR anterior y reemitir el mismo beneficio',
  input: 'Empty',
  output: 'VoucherView',
  retry: true,
});
operation({
  method: 'get',
  path: '/api/v1/customer/events',
  id: 'customerEvents',
  summary: 'Canal privado de notificaciones persistidas',
  status: 101,
  websocket: true,
});
operation({
  method: 'post',
  path: '/api/v1/operator/scans',
  id: 'operatorScan',
  summary: 'Leer QR con propósito sin registrar compra o entrega',
  auth: 'operator',
  input: 'OperatorScanInput',
  output: 'OperatorScan',
});
operation({
  method: 'post',
  path: '/api/v1/operator/purchases',
  id: 'operatorPurchase',
  summary: 'Confirmar compra real y sumar exactamente un sello',
  auth: 'operator',
  input: 'PurchaseInput',
  output: 'PurchaseResult',
  status: 201,
  retry: true,
  decisions: ['D-03'],
});
operation({
  method: 'post',
  path: '/api/v1/operator/redemptions',
  id: 'operatorRedemption',
  summary: 'Confirmar entrega y consumir comprobante una vez',
  auth: 'operator',
  input: 'RedemptionInput',
  output: 'RedemptionResult',
  status: 201,
  retry: true,
  decisions: ['D-03'],
});
operation({
  method: 'post',
  path: '/api/v1/operator/rewards/{rewardId}/resend',
  id: 'resendOperatorReward',
  summary: 'Reenviar al titular verificado sin elegir destinatario',
  auth: 'operator',
  input: 'OperatorResendInput',
  output: 'DeliveryTask',
  status: 202,
  decisions: ['D-04'],
});
operation({
  method: 'post',
  path: '/api/v1/restaurants/{restaurantId}/invitations',
  id: 'inviteOperator',
  summary: 'Propietario invita operador sin asignar rol',
  auth: 'owner',
  input: 'OperatorInvitationInput',
  output: 'OperatorInvitationCreated',
  status: 201,
  decisions: ['D-02'],
});
operation({
  method: 'get',
  path: '/api/v1/restaurants/{restaurantId}/invitations',
  id: 'operatorInvitations',
  summary: 'Propietario consulta invitaciones de su negocio',
  auth: 'owner',
  output: 'OperatorInvitation',
  list: true,
  decisions: ['D-02'],
});
operation({
  method: 'post',
  path: '/api/v1/restaurants/{restaurantId}/invitations/{targetId}/revoke',
  id: 'revokeOperatorInvitation',
  summary: 'Propietario revoca invitación conservando historial',
  auth: 'owner',
  input: 'Empty',
  output: 'OperatorInvitation',
  decisions: ['D-02'],
});
operation({
  method: 'post',
  path: '/api/v1/invitations/accept',
  id: 'acceptOperatorInvitation',
  summary: 'Consumir invitación con la cuenta autenticada del correo invitado',
  auth: 'account',
  input: 'OperatorAcceptanceInput',
  output: 'OperatorMembership',
  decisions: ['D-02'],
});
operation({
  method: 'get',
  path: '/api/v1/restaurants/{restaurantId}/employees',
  id: 'operatorMemberships',
  summary: 'Vínculos de operadores del restaurante propio',
  auth: 'owner',
  output: 'OperatorMembership',
  list: true,
  decisions: ['D-02'],
});
operation({
  method: 'patch',
  path: '/api/v1/restaurants/{restaurantId}/employees/{targetId}',
  id: 'revokeOperatorMembership',
  summary: 'Suspender o desactivar acceso de operador',
  auth: 'owner',
  input: 'OperatorMembershipPatch',
  output: 'OperatorMembership',
  decisions: ['D-02'],
});
operation({
  method: 'post',
  path: '/api/v1/restaurants',
  id: 'createOwnedRestaurant',
  summary:
    'Crear negocio con propietario directo y sin permiso implícito de caja',
  auth: 'account',
  input: 'RestaurantCreate',
  output: 'Restaurant',
  status: 201,
  retry: true,
});
operation({
  method: 'get',
  path: '/api/v1/restaurants',
  id: 'accessibleRestaurants',
  summary: 'Restaurantes propios o vinculados con acceso calculado servidor',
  auth: 'account',
  output: 'Restaurant',
  list: true,
});
operation({
  method: 'get',
  path: '/api/v1/restaurants/{restaurantId}',
  id: 'accessibleRestaurant',
  summary: 'Contexto de restaurante autorizado',
  auth: 'account',
  output: 'Restaurant',
});
operation({
  method: 'patch',
  path: '/api/v1/restaurants/{restaurantId}',
  id: 'updateOwnedRestaurant',
  summary: 'Propietario actualiza su negocio',
  auth: 'owner',
  input: 'RestaurantPatch',
  output: 'Restaurant',
  retry: true,
});
operation({
  method: 'post',
  path: '/api/v1/restaurants/{id}/programs',
  id: 'createOwnedProgram',
  summary: 'Propietario define programa y premio',
  auth: 'owner',
  input: 'ProgramCreate',
  output: 'Program',
  status: 201,
  retry: true,
  decisions: ['D-05'],
});
operation({
  method: 'get',
  path: '/api/v1/restaurants/{id}/programs',
  id: 'ownedPrograms',
  summary: 'Programas propios conservando históricos',
  auth: 'owner',
  output: 'Program',
  list: true,
});
operation({
  method: 'get',
  path: '/api/v1/restaurants/{id}/programs/{programId}',
  id: 'ownedProgram',
  summary: 'Programa y diseño del propietario',
  auth: 'owner',
  output: 'Program',
});
operation({
  method: 'patch',
  path: '/api/v1/restaurants/{id}/programs/{programId}',
  id: 'updateOwnedProgram',
  summary:
    'Personalizar y publicar conservando código público y condiciones bloqueadas',
  auth: 'owner',
  input: 'ProgramPatch',
  output: 'Program',
  retry: true,
});

export const nextOpenApiDocument: Record<string, unknown> = {
  openapi: '3.1.0',
  info: {
    title: 'Loyalty Next API',
    version: '2.0.0',
    description:
      'Contratos NEXT-001–004 alineados con D-01–D-05 y los handlers montados. La disponibilidad externa de WhatsApp no está acreditada.',
  },
  servers: [{ url: '/', description: 'Mismo origen HTTPS' }],
  paths,
  components: {
    securitySchemes: {
      customerSession: {
        type: 'apiKey',
        in: 'cookie',
        name: '__Host-loyalty_customer',
        description:
          'Token opaco de cliente. HTTP local explícito usa loyalty_customer_dev.',
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Cuenta de personal verificada mediante Supabase Auth.',
      },
      staffSession: {
        type: 'apiKey',
        in: 'cookie',
        name: '__Host-loyalty-access',
        description:
          'Cookie de cuenta de personal; nunca sustituye la sesión cliente.',
      },
    },
    schemas,
  },
};
