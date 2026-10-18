import { randomUUID } from 'node:crypto';
import { AppError } from '../../application/errors.js';
import { type ConnectionInfo, NativeRoutes } from './native-routes.js';

export interface BaseAppDependencies {
  checkDatabase: () => Promise<void>;
}

class HttpApplication extends NativeRoutes {
  fetch = async (
    request: Request,
    connection: ConnectionInfo = {},
  ): Promise<Response> => {
    const candidate = request.headers.get('X-Request-Id');
    const requestId =
      candidate && /^[a-zA-Z0-9_-]{1,64}$/.test(candidate)
        ? candidate
        : randomUUID();
    const headers = new Headers({ 'X-Request-Id': requestId });
    const dispatch = (input: Request) =>
      this.dispatch(input, headers, requestId);
    let response: Response;
    try {
      response = this.boundary
        ? await this.boundary(request, connection, headers, dispatch)
        : await dispatch(request);
    } catch (error) {
      const known = error instanceof AppError;
      response = Response.json(
        {
          error: {
            code: known ? error.code : 'INTERNAL_ERROR',
            message: known ? error.message : 'Internal server error',
            request_id: requestId,
          },
        },
        { status: known ? error.status : 500 },
      );
    }
    const finalHeaders = new Headers(response.headers);
    headers.forEach((value, key) => {
      finalHeaders.set(key, value);
    });
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: finalHeaders,
    });
  };
  request(input: string | Request, init?: RequestInit) {
    return this.fetch(
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(input, 'http://localhost'), init),
    );
  }
}

export function createBaseApp(dependencies: BaseAppDependencies) {
  const app = new HttpApplication();
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
