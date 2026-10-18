import { Hono } from 'hono';
import { AppError } from '../../application/errors.js';
import type { IdentityService } from '../../application/identity.js';

export function createIdentityRoutes({
  identityService,
}: {
  identityService: IdentityService;
}) {
  const routes = new Hono();
  const parseJson = async (request: Request): Promise<unknown> => {
    const contentType = request.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== 'application/json')
      throw new AppError(400, 'INVALID_INPUT', 'Se requiere un cuerpo JSON.');
    try {
      return await request.json();
    } catch {
      throw new AppError(400, 'INVALID_INPUT', 'Se requiere JSON válido.');
    }
  };
  routes.post('/profiles', async (c) => {
    const identity = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    const result = await identityService.register(
      identity,
      await parseJson(c.req.raw),
    );
    return c.json({ data: result.profile }, result.created ? 201 : 200);
  });
  routes.get('/me', async (c) => {
    const identity = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json({ data: await identityService.getMe(identity) });
  });
  routes.patch('/me', async (c) => {
    const identity = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json({
      data: await identityService.updateMe(
        identity,
        await parseJson(c.req.raw),
      ),
    });
  });
  return routes;
}
