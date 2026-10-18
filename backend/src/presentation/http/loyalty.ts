import { Hono } from 'hono';
import { AppError } from '../../application/errors.js';
import type { IdentityService } from '../../application/identity.js';
import type { LoyaltyService } from '../../application/loyalty.js';
import type { AppEnv } from './base-app.js';

export function createLoyaltyRoutes({
  identityService,
  loyaltyService,
}: {
  identityService: IdentityService;
  loyaltyService: LoyaltyService;
}) {
  const routes = new Hono<AppEnv>();
  const parseJson = async (request: Request): Promise<unknown> => {
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      throw new AppError(400, 'INVALID_INPUT', 'Se requiere JSON.');
    try {
      return await request.json();
    } catch {
      throw new AppError(400, 'INVALID_INPUT', 'JSON inválido.');
    }
  };
  routes.post('/restaurants/:id/purchases', async (c) => {
    const actor = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json(
      {
        data: await loyaltyService.purchase(
          actor.id,
          c.req.param('id'),
          await parseJson(c.req.raw),
          c.req.header('Idempotency-Key'),
          c.get('requestId'),
        ),
      },
      201,
    );
  });
  routes.post('/restaurants/:id/rewards/:rewardId/redeem', async (c) => {
    const actor = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json({
      data: await loyaltyService.redeem(
        actor.id,
        c.req.param('id'),
        c.req.param('rewardId'),
        await parseJson(c.req.raw),
        c.req.header('Idempotency-Key'),
        c.get('requestId'),
      ),
    });
  });
  routes.post('/restaurants/:id/purchases/:purchaseId/reverse', async (c) => {
    const actor = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json({
      data: await loyaltyService.reverse(
        actor.id,
        c.req.param('id'),
        c.req.param('purchaseId'),
        await parseJson(c.req.raw),
        c.req.header('Idempotency-Key'),
        c.get('requestId'),
      ),
    });
  });
  routes.get('/me/cards/:cardId/closure-preview', async (c) => {
    const actor = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json({
      data: await loyaltyService.preview(actor.id, c.req.param('cardId')),
    });
  });
  routes.post('/me/cards/:cardId/closure-consents', async (c) => {
    const actor = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json(
      {
        data: await loyaltyService.consent(
          actor.id,
          c.req.param('cardId'),
          await parseJson(c.req.raw),
          c.req.header('Idempotency-Key'),
          c.get('requestId'),
        ),
      },
      201,
    );
  });
  routes.delete('/me/cards/:cardId/closure-consents/:consentId', async (c) => {
    const actor = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json({
      data: await loyaltyService.revoke(
        actor.id,
        c.req.param('cardId'),
        c.req.param('consentId'),
        c.req.header('Idempotency-Key'),
        c.get('requestId'),
      ),
    });
  });
  routes.post('/restaurants/:id/cards/:cardId/close', async (c) => {
    const actor = await identityService.authenticate(
      c.req.header('Authorization'),
    );
    return c.json({
      data: await loyaltyService.close(
        actor.id,
        c.req.param('id'),
        c.req.param('cardId'),
        await parseJson(c.req.raw),
        c.req.header('Idempotency-Key'),
        c.get('requestId'),
      ),
    });
  });
  return routes;
}
