import { Hono } from 'hono';
import { AppError } from '../../application/errors.js';
import type { IdentityService } from '../../application/identity.js';
import type { ProgramService } from '../../application/programs.js';
import type { AppEnv } from './base-app.js';

export function createProgramRoutes({
  identityService,
  programService,
}: {
  identityService: IdentityService;
  programService: ProgramService;
}) {
  const app = new Hono<AppEnv>();
  const actor = async (header: string | undefined) => {
    const identity = await identityService.authenticate(header);
    await identityService.getMe(identity);
    return identity.id;
  };
  const body = async (req: Request) => {
    if (
      req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    )
      throw new AppError(400, 'INVALID_INPUT', 'Se requiere JSON.');
    try {
      return await req.json();
    } catch {
      throw new AppError(400, 'INVALID_INPUT', 'JSON inválido.');
    }
  };
  app.post('/restaurants/:id/programs', async (c) =>
    c.json(
      {
        data: await programService.create(
          await actor(c.req.header('Authorization')),
          c.req.param('id'),
          await body(c.req.raw),
          c.req.header('Idempotency-Key'),
          c.get('requestId'),
        ),
      },
      201,
    ),
  );
  app.get('/restaurants/:id/programs', async (c) =>
    c.json(
      await programService.list(
        await actor(c.req.header('Authorization')),
        c.req.param('id'),
        c.req.query(),
      ),
    ),
  );
  app.get('/restaurants/:id/programs/:programId', async (c) =>
    c.json({
      data: await programService.get(
        await actor(c.req.header('Authorization')),
        c.req.param('id'),
        c.req.param('programId'),
      ),
    }),
  );
  app.patch('/restaurants/:id/programs/:programId', async (c) =>
    c.json({
      data: await programService.update(
        await actor(c.req.header('Authorization')),
        c.req.param('id'),
        c.req.param('programId'),
        await body(c.req.raw),
        c.req.header('Idempotency-Key'),
        c.get('requestId'),
      ),
    }),
  );
  app.get('/public/programs/:code', async (c) =>
    c.json({ data: await programService.publicByCode(c.req.param('code')) }),
  );
  app.post('/public/programs/:code/enrollments', async (c) => {
    const result = await programService.enroll(
      await actor(c.req.header('Authorization')),
      c.req.param('code'),
      await body(c.req.raw),
      c.req.header('Idempotency-Key'),
      c.get('requestId'),
    );
    return c.json(
      { data: { membership: result.membership, card: result.card } },
      result.created ? 201 : 200,
    );
  });
  app.get('/me/cards', async (c) =>
    c.json(
      await programService.listCards(
        await actor(c.req.header('Authorization')),
        c.req.query(),
      ),
    ),
  );
  app.get('/me/cards/:cardId', async (c) =>
    c.json({
      data: await programService.cardDetails(
        await actor(c.req.header('Authorization')),
        c.req.param('cardId'),
      ),
    }),
  );
  app.get('/me/cards/:cardId/movements', async (c) =>
    c.json(
      await programService.cardHistory(
        await actor(c.req.header('Authorization')),
        c.req.param('cardId'),
        'movements',
        c.req.query(),
      ),
    ),
  );
  app.get('/me/cards/:cardId/rewards', async (c) =>
    c.json(
      await programService.cardHistory(
        await actor(c.req.header('Authorization')),
        c.req.param('cardId'),
        'rewards',
        c.req.query(),
      ),
    ),
  );
  app.get('/me/cards/:cardId/qr', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({
      data: await programService.getQr(
        await actor(c.req.header('Authorization')),
        c.req.param('cardId'),
      ),
    });
  });
  app.post('/me/cards/:cardId/qr/rotate', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({
      data: await programService.rotateQr(
        await actor(c.req.header('Authorization')),
        c.req.param('cardId'),
        await body(c.req.raw),
        c.req.header('Idempotency-Key'),
        c.get('requestId'),
      ),
    });
  });
  app.post('/restaurants/:id/cards/resolve', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({
      data: await programService.resolveCard(
        await actor(c.req.header('Authorization')),
        c.req.param('id'),
        await body(c.req.raw),
      ),
    });
  });
  return app;
}
