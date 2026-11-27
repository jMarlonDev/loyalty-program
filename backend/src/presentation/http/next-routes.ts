import { AppError } from '../../application/errors.js';
import type { IdentityService } from '../../application/identity.js';
import {
  requireEmail,
  requireNextUuid,
  requireObject,
  requireOnly,
  requireSaleReference,
  requireToken,
} from '../../application/next.js';
import type { PgNextRepository } from '../../infrastructure/next-repository.js';
import { requireIdempotencyKey } from '../../infrastructure/transactions.js';
import { type HttpContext, NativeRoutes } from './native-routes.js';

export function createNextRoutes({
  identityService,
  repository,
  origin,
}: {
  identityService: IdentityService;
  repository: PgNextRepository;
  origin: string;
}) {
  const routes = new NativeRoutes();

  const json = async (request: Request): Promise<Record<string, unknown>> => {
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      throw new AppError(400, 'INVALID_INPUT', 'Se requiere un cuerpo JSON.');
    try {
      return requireObject(await request.json());
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, 'INVALID_INPUT', 'El JSON no es válido.');
    }
  };
  const sessionToken = (context: HttpContext) =>
    context.req.header('x-customer-session') ?? '';
  const customer = async (context: HttpContext) => {
    const token = sessionToken(context);
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión.');
    return repository.authenticate(token);
  };
  const account = async (context: HttpContext) => {
    const identity = await identityService.authenticate(
      context.req.header('Authorization'),
    );
    await identityService.getMe(identity);
    return identity;
  };
  const mutationOrigin = (context: HttpContext) => {
    const requestOrigin = context.req.header('Origin');
    if (!requestOrigin || requestOrigin !== origin)
      throw new AppError(403, 'INVALID_ORIGIN', 'Origen no permitido.');
  };

  routes.get('/customer/session', async (context) => {
    const current = await customer(context);
    return context.json({
      data: {
        authenticated: true,
        card_id: current.card_id,
        phone_masked: current.phone_masked,
        expires_at: current.expires_at,
      },
    });
  });

  const publicCode = (value: unknown): string => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value))
      throw new AppError(400, 'INVALID_INPUT', 'Programa inválido.');
    return value;
  };
  /** Sesión válida del dispositivo o null (sin sesión, revocada o vencida). */
  const optionalCustomer = async (context: HttpContext) => {
    const token = sessionToken(context);
    if (!token) return null;
    try {
      return await repository.authenticate(token);
    } catch (error) {
      if (error instanceof AppError && error.status === 401) return null;
      throw error;
    }
  };
  const issueSession = (
    context: HttpContext,
    session: { token: string; expires_at: string },
  ) => {
    context.header('x-customer-token', session.token);
    context.header('x-customer-expires', session.expires_at);
  };

  // NEXT-006: alta por teléfono. Con sesión del dispositivo devuelve su
  // tarjeta y nunca crea otra; sin sesión, el teléfono solo sirve para crear.
  routes.post('/customer/enrollments', async (context) => {
    mutationOrigin(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['public_code', 'phone', 'country']);
    const code = publicCode(body.public_code);
    const current = await optionalCustomer(context);
    if (current) {
      const existing = await repository.deviceCard(current, code);
      return context.json({ data: { existing: true, ...existing } }, 200);
    }
    await repository.limitEnrollment({
      ip: context.req.header('x-loyalty-client-address'),
      device: context.req.header('x-loyalty-device'),
    });
    const enrolled = await repository.enrollByPhone({
      publicCode: code,
      phone: body.phone,
      country: body.country,
      userAgent: context.req.header('user-agent'),
    });
    issueSession(context, enrolled);
    return context.json(
      {
        data: {
          existing: false,
          reenrollment: enrolled.reenrollment,
          notice: enrolled.reenrollment
            ? 'Este número ya participó en el programa. Se creó una tarjeta nueva sin sellos.'
            : null,
          card: enrolled.card,
        },
      },
      201,
    );
  });

  routes.post('/customer/cards/:cardId/close', async (context) => {
    mutationOrigin(context);
    const current = await customer(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['confirm']);
    if (body.confirm !== true)
      throw new AppError(
        400,
        'CONFIRMATION_REQUIRED',
        'Confirma que quieres salir del programa.',
      );
    const result = await repository.closeCard(
      current,
      requireNextUuid(context.req.param('cardId')),
    );
    context.header('x-customer-clear', '1');
    return context.json({ data: result });
  });

  routes.post('/customer/transfers/claim', async (context) => {
    mutationOrigin(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['token']);
    const current = await optionalCustomer(context);
    const claimed = await repository.claimTransfer({
      token: requireToken(body.token),
      currentSessionId: current?.session_id,
      userAgent: context.req.header('user-agent'),
    });
    issueSession(context, claimed);
    return context.json({ data: { card: claimed.card } }, 201);
  });

  routes.get('/restaurants/:restaurantId/cards', async (context) => {
    const actor = await account(context);
    const phone = context.req.query('phone');
    return context.json({
      data: await repository.listRestaurantCards(
        actor.id,
        requireNextUuid(context.req.param('restaurantId')),
        phone === undefined
          ? {}
          : { phone, country: context.req.query('country') ?? 'CO' },
      ),
    });
  });

  routes.get('/restaurants/:restaurantId/cards/:cardId', async (context) => {
    const actor = await account(context);
    return context.json({
      data: await repository.getRestaurantCard(
        actor.id,
        requireNextUuid(context.req.param('restaurantId')),
        requireNextUuid(context.req.param('cardId')),
      ),
    });
  });

  routes.post(
    '/restaurants/:restaurantId/cards/:cardId/transfers',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      return context.json(
        {
          data: await repository.createTransfer(
            actor.id,
            requireNextUuid(context.req.param('restaurantId')),
            requireNextUuid(context.req.param('cardId')),
          ),
        },
        201,
      );
    },
  );

  routes.patch(
    '/restaurants/:restaurantId/employees/:targetId/transfer-permission',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      const body = await json(context.req.raw);
      requireOnly(body, ['can_transfer_cards']);
      if (typeof body.can_transfer_cards !== 'boolean')
        throw new AppError(400, 'INVALID_INPUT', 'Valor de permiso inválido.');
      return context.json({
        data: await repository.setEmployeeTransferPermission(
          actor.id,
          requireNextUuid(context.req.param('restaurantId')),
          requireNextUuid(context.req.param('targetId')),
          body.can_transfer_cards,
        ),
      });
    },
  );

  routes.get('/customer/cards', async (context) => {
    const current = await customer(context);
    return context.json({
      data: await repository.listCards(current),
      next_cursor: null,
    });
  });

  routes.get('/customer/cards/:cardId', async (context) => {
    const current = await customer(context);
    return context.json({
      data: await repository.getCard(
        current,
        requireNextUuid(context.req.param('cardId')),
      ),
    });
  });

  routes.get('/customer/cards/:cardId/qr', async (context) => {
    const current = await customer(context);
    context.header('Cache-Control', 'no-store');
    return context.json({
      data: await repository.getCardQr(
        current,
        requireNextUuid(context.req.param('cardId')),
      ),
    });
  });

  routes.get('/customer/rewards/:rewardId/voucher', async (context) => {
    const current = await customer(context);
    context.header('Cache-Control', 'no-store');
    return context.json({
      data: {
        ...(await repository.getRewardVoucher(
          current,
          requireNextUuid(context.req.param('rewardId')),
        )),
        purpose: 'reward',
      },
    });
  });

  routes.post(
    '/customer/rewards/:rewardId/voucher/reissue',
    async (context) => {
      mutationOrigin(context);
      const current = await customer(context);
      return context.json({
        data: {
          ...(await repository.reissueRewardVoucher(
            current,
            requireNextUuid(context.req.param('rewardId')),
          )),
          purpose: 'reward',
        },
      });
    },
  );

  routes.post('/operator/scans', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['restaurant_id', 'token', 'purpose']);
    if (body.purpose !== 'card' && body.purpose !== 'reward')
      throw new AppError(
        400,
        'INVALID_INPUT',
        'Propósito de escaneo inválido.',
      );
    return context.json({
      data: await repository.scan(
        actor.id,
        requireNextUuid(body.restaurant_id),
        requireToken(body.token),
        body.purpose,
      ),
    });
  });

  routes.post('/operator/purchases', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['restaurant_id', 'token', 'sale_reference']);
    return context.json(
      {
        data: await repository.purchase({
          userId: actor.id,
          restaurantId: requireNextUuid(body.restaurant_id),
          token: requireToken(body.token),
          saleReference: requireSaleReference(body.sale_reference),
          key: requireIdempotencyKey(context.req.header('Idempotency-Key')),
          requestId: context.get('requestId'),
        }),
      },
      201,
    );
  });

  routes.post('/operator/redemptions', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['restaurant_id', 'token', 'confirm']);
    if (body.confirm !== true)
      throw new AppError(
        400,
        'INVALID_INPUT',
        'Confirma la entrega del premio.',
      );
    return context.json(
      {
        data: await repository.redeem({
          userId: actor.id,
          restaurantId: requireNextUuid(body.restaurant_id),
          token: requireToken(body.token),
          key: requireIdempotencyKey(context.req.header('Idempotency-Key')),
          requestId: context.get('requestId'),
        }),
      },
      201,
    );
  });

  routes.post('/operator/rewards/:rewardId/resend', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['restaurant_id']);
    return context.json(
      {
        data: await repository.resendReward(
          actor.id,
          requireNextUuid(body.restaurant_id),
          requireNextUuid(context.req.param('rewardId')),
        ),
      },
      202,
    );
  });

  routes.post('/restaurants/:restaurantId/invitations', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['email', 'phone', 'country']);
    return context.json(
      {
        data: await repository.createInvitation({
          userId: actor.id,
          restaurantId: requireNextUuid(context.req.param('restaurantId')),
          email: requireEmail(body.email),
          phone: typeof body.phone === 'string' ? body.phone : '',
          country: typeof body.country === 'string' ? body.country : '',
        }),
      },
      201,
    );
  });

  routes.get('/restaurants/:restaurantId/invitations', async (context) => {
    const actor = await account(context);
    return context.json({
      data: await repository.listInvitations(
        actor.id,
        requireNextUuid(context.req.param('restaurantId')),
      ),
      next_cursor: null,
    });
  });

  routes.post(
    '/restaurants/:restaurantId/invitations/:targetId/revoke',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      return context.json({
        data: await repository.revokeInvitation(
          actor.id,
          requireNextUuid(context.req.param('restaurantId')),
          requireNextUuid(context.req.param('targetId')),
        ),
      });
    },
  );

  routes.post('/invitations/accept', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['token']);
    return context.json({
      data: await repository.acceptInvitation(
        actor.id,
        actor.email.toLowerCase(),
        requireToken(body.token),
      ),
    });
  });

  routes.get('/restaurants/:restaurantId/employees', async (context) => {
    const actor = await account(context);
    return context.json({
      data: await repository.listEmployees(
        actor.id,
        requireNextUuid(context.req.param('restaurantId')),
      ),
      next_cursor: null,
    });
  });

  routes.patch(
    '/restaurants/:restaurantId/employees/:targetId',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      const body = await json(context.req.raw);
      requireOnly(body, ['status']);
      if (body.status !== 'suspended' && body.status !== 'disabled')
        throw new AppError(400, 'INVALID_INPUT', 'Estado inválido.');
      return context.json({
        data: await repository.setEmployeeStatus(
          actor.id,
          requireNextUuid(context.req.param('restaurantId')),
          requireNextUuid(context.req.param('targetId')),
          body.status,
        ),
      });
    },
  );

  return routes;
}
