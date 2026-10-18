import { AppError } from '../../application/errors.js';
import type { IdentityService } from '../../application/identity.js';
import type {
  StaffAction,
  StaffCollection,
  StaffService,
} from '../../application/staff.js';
import { type HttpContext, NativeRoutes } from './native-routes.js';

export function createStaffRoutes(dependencies: {
  identityService: IdentityService;
  staffService: StaffService;
}) {
  const app = new NativeRoutes();
  const mutations: [string, string, StaffAction][] = [
    ['POST', '/restaurants', 'restaurant.create'],
    ['PATCH', '/restaurants/:restaurantId', 'restaurant.update'],
    ['POST', '/restaurants/:restaurantId/locations', 'location.create'],
    [
      'PATCH',
      '/restaurants/:restaurantId/locations/:targetId',
      'location.update',
    ],
    [
      'PATCH',
      '/restaurants/:restaurantId/employees/:targetId',
      'employee.update',
    ],
    ['POST', '/restaurants/:restaurantId/invitations', 'invitation.create'],
    [
      'POST',
      '/restaurants/:restaurantId/invitations/:targetId/revoke',
      'invitation.revoke',
    ],
    ['POST', '/invitations/accept', 'invitation.accept'],
  ];
  const reads: [string, StaffCollection][] = [
    ['/restaurants', 'restaurants'],
    ['/restaurants/:restaurantId', 'restaurant'],
    ['/restaurants/:restaurantId/locations', 'locations'],
    ['/restaurants/:restaurantId/employees', 'employees'],
    ['/restaurants/:restaurantId/invitations', 'invitations'],
  ];
  async function authenticate(context: HttpContext) {
    const identity = await dependencies.identityService.authenticate(
      context.req.header('Authorization'),
    );
    await dependencies.identityService.getMe(identity);
    return identity;
  }
  for (const [method, path, action] of mutations) {
    app.on(method, path, async (context) => {
      const actor = await authenticate(context);
      let input: unknown;
      if (
        context.req
          .header('Content-Type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase() !== 'application/json'
      ) {
        throw new AppError(
          400,
          'INVALID_INPUT',
          'Content-Type must be application/json',
        );
      }
      try {
        input = await context.req.json();
      } catch {
        throw new AppError(400, 'INVALID_INPUT', 'Request body must be JSON');
      }
      const restaurantId = context.req.param('restaurantId');
      const targetId = context.req.param('targetId');
      const result = await dependencies.staffService.execute({
        action,
        actor,
        input,
        key: context.req.header('Idempotency-Key') ?? '',
        requestId: context.get('requestId'),
        ...(restaurantId ? { restaurantId } : {}),
        ...(targetId ? { targetId } : {}),
      });
      return context.json(result, action.endsWith('.create') ? 201 : 200);
    });
  }
  for (const [path, collection] of reads) {
    app.get(path, async (context) => {
      const actor = await authenticate(context);
      const restaurantId = context.req.param('restaurantId');
      const cursor = context.req.query('cursor');
      const limit = context.req.query('limit');
      return context.json(
        await dependencies.staffService.query({
          collection,
          actor,
          ...(restaurantId ? { restaurantId } : {}),
          ...(cursor ? { cursor } : {}),
          ...(limit !== undefined ? { limit } : {}),
        }),
      );
    });
  }
  return app;
}
