import { AppError } from '../../application/errors.js';

/** The only transport metadata accepted here comes from the server adapter. */
export interface ConnectionInfo {
  remoteAddress?: string;
}

export class HttpContext {
  readonly req;
  constructor(
    request: Request,
    params: Record<string, string>,
    readonly headers: Headers,
    private readonly requestId: string,
  ) {
    const query = new URL(request.url).searchParams;
    this.req = {
      raw: request,
      method: request.method,
      header: (name: string) => request.headers.get(name) ?? undefined,
      param: (name: string) => params[name] ?? '',
      query: ((name?: string) =>
        name === undefined
          ? Object.fromEntries(
              [...new Set(query.keys())].map((key) => [key, query.get(key)]),
            )
          : (query.get(name) ?? undefined)) as {
        (): Record<string, string>;
        (name: string): string | undefined;
      },
      json: () => request.json(),
      text: () => request.text(),
    };
  }
  get(_name: 'requestId') {
    return this.requestId;
  }
  header(name: string, value: string) {
    this.headers.set(name, value);
  }
  json(value: unknown, status = 200) {
    return Response.json(value, { status });
  }
  text(value: string, status = 200) {
    return new Response(value, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }
}

type Handler = (context: HttpContext) => Response | Promise<Response>;
type Route = { method: string; path: string; handler: Handler };
export type RequestBoundary = (
  request: Request,
  connection: ConnectionInfo,
  headers: Headers,
  next: (request: Request) => Promise<Response>,
) => Promise<Response>;

/** A route catalogue for existing API contracts; Start owns the HTTP server. */
export class NativeRoutes {
  readonly routes: Route[] = [];
  boundary?: RequestBoundary;
  on(method: string, path: string, handler: Handler) {
    this.routes.push({ method, path, handler });
    return this;
  }
  get(path: string, handler: Handler) {
    return this.on('GET', path, handler);
  }
  post(path: string, handler: Handler) {
    return this.on('POST', path, handler);
  }
  patch(path: string, handler: Handler) {
    return this.on('PATCH', path, handler);
  }
  delete(path: string, handler: Handler) {
    return this.on('DELETE', path, handler);
  }
  all(path: string, handler: Handler) {
    return this.on('*', path, handler);
  }
  route(prefix: string, child: NativeRoutes) {
    for (const route of child.routes)
      this.on(route.method, `${prefix}${route.path}`, route.handler);
    return this;
  }
  async dispatch(
    request: Request,
    headers: Headers,
    requestId: string,
  ): Promise<Response> {
    const path = new URL(request.url).pathname.split('/');
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    for (const route of this.routes) {
      if (route.method !== '*' && route.method !== method) continue;
      const pattern = route.path.split('/');
      if (pattern.length !== path.length) continue;
      const params: Record<string, string> = {};
      if (
        !pattern.every((part, index) => {
          const segment = path[index] ?? '';
          if (!part.startsWith(':')) return part === segment;
          if (!segment) return false;
          try {
            params[part.slice(1)] = decodeURIComponent(segment);
          } catch {
            throw new AppError(400, 'INVALID_INPUT', 'Invalid URL parameter');
          }
          return true;
        })
      )
        continue;
      return route.handler(
        new HttpContext(request, params, headers, requestId),
      );
    }
    throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  }
}
