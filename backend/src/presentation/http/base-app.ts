import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { AppError } from '../../application/errors.js';

export type AppEnv = { Variables: { requestId: string } };
export interface BaseAppDependencies {
  checkDatabase: () => Promise<void>;
}

export function createBaseApp(dependencies: BaseAppDependencies) {
  const app = new Hono<AppEnv>();
  app.use('*', async (context, next) => {
    const candidate = context.req.header('X-Request-Id');
    const requestId =
      candidate && /^[a-zA-Z0-9_-]{1,64}$/.test(candidate)
        ? candidate
        : randomUUID();
    context.set('requestId', requestId);
    context.header('X-Request-Id', requestId);
    await next();
  });
  app.onError((error, context) => {
    const known = error instanceof AppError;
    return context.json(
      {
        error: {
          code: known ? error.code : 'INTERNAL_ERROR',
          message: known ? error.message : 'Internal server error',
          request_id: context.get('requestId'),
        },
      },
      known ? error.status : 500,
    );
  });
  app.notFound((context) =>
    context.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
          request_id: context.get('requestId'),
        },
      },
      404,
    ),
  );
  app.get('/health', (context) => context.json({ data: { status: 'ok' } }));
  app.get('/ready', async (context) => {
    try {
      await dependencies.checkDatabase();
    } catch {
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Service unavailable');
    }
    return context.json({ data: { status: 'ready' } });
  });
  return app;
}
