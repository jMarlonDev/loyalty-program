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

  routes.post('/customer/session', async (context) => {
    mutationOrigin(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['phone', 'country', 'public_code']);
    const started = await repository.startSession({
      phone: body.phone,
      country: body.country,
    });
    context.header('x-customer-token', started.token);
    context.header('x-customer-expires', started.principal.expires_at);
    let card = null;
    if (body.public_code !== undefined) {
      if (
        typeof body.public_code !== 'string' ||
        !/^[A-Za-z0-9_-]{1,255}$/.test(body.public_code)
      )
        throw new AppError(400, 'INVALID_INPUT', 'Programa inválido.');
      card = await repository.enroll(started.principal, body.public_code);
    }
    return context.json(
      {
        data: {
          authenticated: true,
          phone_masked: started.principal.phone_masked,
          expires_at: started.principal.expires_at,
          card,
        },
      },
      201,
    );
  });

  routes.get('/customer/session', async (context) => {
    const current = await customer(context);
    return context.json({
      data: {
        authenticated: true,
        phone_masked: current.phone_masked,
        expires_at: current.expires_at,
      },
    });
  });

  routes.delete('/customer/session', async (context) => {
    mutationOrigin(context);
    const token = sessionToken(context);
    if (token) {
      const current = await repository.authenticate(token);
      await repository.endSession(current.session_id);
    }
    context.header('x-customer-clear', '1');
    return new Response(null, { status: 204 });
  });

  routes.post('/customer/enrollments', async (context) => {
    mutationOrigin(context);
    const current = await customer(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['public_code']);
    if (
      typeof body.public_code !== 'string' ||
      !/^[A-Za-z0-9_-]{1,255}$/.test(body.public_code)
    )
      throw new AppError(400, 'INVALID_INPUT', 'Programa inválido.');
    return context.json(
      { data: await repository.enroll(current, body.public_code) },
      201,
    );
  });

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
