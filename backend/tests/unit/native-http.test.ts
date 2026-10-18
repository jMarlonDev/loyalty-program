import { describe, expect, it } from 'vitest';
import { createBaseApp } from '../../src/presentation/http/base-app.js';
import { addOperationalMiddleware } from '../../src/presentation/http/operations.js';

describe('STACK-001 transporte Web nativo', () => {
  it('AC-003 conserva params, query, cuerpo y HEAD en Request/Response', async () => {
    const app = createBaseApp({ checkDatabase: async () => {} });
    app.post('/api/v1/example/:id', async (c) =>
      c.json(
        {
          id: c.req.param('id'),
          filter: c.req.query('filter'),
          body: await c.req.json(),
        },
        201,
      ),
    );
    const response = await app.fetch(
      new Request('http://localhost/api/v1/example/caf%C3%A9?filter=active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"amount":1}',
      }),
    );
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: 'café',
      filter: 'active',
      body: { amount: 1 },
    });
    const head = await app.fetch(
      new Request('http://localhost/health', { method: 'HEAD' }),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('AC-004 aísla ventanas por dirección confiable del adaptador servidor', async () => {
    const app = createBaseApp({ checkDatabase: async () => {} });
    addOperationalMiddleware(app, { corsOrigins: [], requestLimit: 1 });
    app.get('/api/v1/example', (c) => c.json({ data: 'ok' }));
    const request = () => new Request('http://localhost/api/v1/example');
    expect(
      (await app.fetch(request(), { remoteAddress: '127.0.0.1' })).status,
    ).toBe(200);
    expect(
      (await app.fetch(request(), { remoteAddress: '127.0.0.2' })).status,
    ).toBe(200);
    expect(
      (await app.fetch(request(), { remoteAddress: '127.0.0.1' })).status,
    ).toBe(429);
  });

  it('AC-004 rechaza bytes excedidos aunque Content-Length sea menor', async () => {
    const app = createBaseApp({ checkDatabase: async () => {} });
    addOperationalMiddleware(app, { corsOrigins: [] });
    app.post('/api/v1/example', (c) => c.json({ data: 'should not run' }));
    const response = await app.fetch(
      new Request('http://localhost/api/v1/example', {
        method: 'POST',
        headers: { 'Content-Length': '1' },
        body: 'x'.repeat(16385),
      }),
    );
    expect(response.status).toBe(413);
  });
});
