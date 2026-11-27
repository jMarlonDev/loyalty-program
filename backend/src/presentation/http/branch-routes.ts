import { AppError } from '../../application/errors.js';
import type { IdentityService } from '../../application/identity.js';
import {
  requireNextUuid,
  requireObject,
  requireOnly,
  requireToken,
} from '../../application/next.js';
import type { PgBranchRepository } from '../../infrastructure/branch-repository.js';
import { type HttpContext, NativeRoutes } from './native-routes.js';

/** BRANCH-001: sucursales, empleados por sucursal e invitaciones por QR. */
export function createBranchRoutes({
  identityService,
  repository,
  origin,
}: {
  identityService: IdentityService;
  repository: PgBranchRepository;
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
  const account = async (context: HttpContext) => {
    const identity = await identityService.authenticate(
      context.req.header('Authorization'),
    );
    await identityService.getMe(identity);
    return identity;
  };
  const mutationOrigin = (context: HttpContext) => {
    if (context.req.header('Origin') !== origin)
      throw new AppError(403, 'INVALID_ORIGIN', 'Origen no permitido.');
  };
  const restaurant = (context: HttpContext) =>
    requireNextUuid(context.req.param('restaurantId'));
  const target = (context: HttpContext) =>
    requireNextUuid(context.req.param('targetId'));

  routes.get('/restaurants/:restaurantId/branches', async (context) => {
    const actor = await account(context);
    return context.json({
      data: await repository.listBranches(actor.id, restaurant(context)),
    });
  });

  routes.post('/restaurants/:restaurantId/branches', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['name', 'address', 'physical_point']);
    return context.json(
      {
        data: await repository.createBranch(
          actor.id,
          restaurant(context),
          body,
        ),
      },
      201,
    );
  });

  routes.get('/restaurants/:restaurantId/staff', async (context) => {
    const actor = await account(context);
    return context.json({
      data: await repository.listEmployees(actor.id, restaurant(context)),
    });
  });

  routes.post('/restaurants/:restaurantId/staff', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['email', 'full_name', 'location_ids', 'password']);
    return context.json(
      {
        data: await repository.createEmployee(
          actor.id,
          restaurant(context),
          body,
        ),
      },
      201,
    );
  });

  routes.patch(
    '/restaurants/:restaurantId/staff/:targetId/locations',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      const body = await json(context.req.raw);
      requireOnly(body, ['location_ids']);
      return context.json({
        data: await repository.setEmployeeLocations(
          actor.id,
          restaurant(context),
          target(context),
          body,
        ),
      });
    },
  );

  routes.post(
    '/restaurants/:restaurantId/branches/:targetId/invitations',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      const body = await json(context.req.raw);
      requireOnly(body, ['expires_in_hours', 'max_uses']);
      return context.json(
        {
          data: await repository.createInvitation(
            actor.id,
            restaurant(context),
            target(context),
            body,
          ),
        },
        201,
      );
    },
  );

  routes.get(
    '/restaurants/:restaurantId/branch-invitations',
    async (context) => {
      const actor = await account(context);
      return context.json({
        data: await repository.listInvitations(actor.id, restaurant(context)),
      });
    },
  );

  routes.post(
    '/restaurants/:restaurantId/branch-invitations/:targetId/renew',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      return context.json(
        {
          data: await repository.renewInvitation(
            actor.id,
            restaurant(context),
            target(context),
          ),
        },
        201,
      );
    },
  );

  routes.post(
    '/restaurants/:restaurantId/branch-invitations/:targetId/revoke',
    async (context) => {
      mutationOrigin(context);
      const actor = await account(context);
      return context.json({
        data: await repository.revokeInvitation(
          actor.id,
          restaurant(context),
          target(context),
        ),
      });
    },
  );

  // Token en el cuerpo (no en la URL) para no dejarlo en logs ni historial.
  routes.post('/staff-invitations/preview', async (context) => {
    mutationOrigin(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['token']);
    return context.json({
      data: await repository.previewInvitation(requireToken(body.token)),
    });
  });

  routes.post('/staff-invitations/accept', async (context) => {
    mutationOrigin(context);
    const actor = await account(context);
    const body = await json(context.req.raw);
    requireOnly(body, ['token']);
    return context.json(
      {
        data: await repository.acceptInvitation(
          actor.id,
          requireToken(body.token),
        ),
      },
      201,
    );
  });

  return routes;
}
