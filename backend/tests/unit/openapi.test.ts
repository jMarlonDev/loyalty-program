import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { openApiDocument } from '../../src/presentation/http/openapi.js';

type Schema = Record<string, unknown>;
type Operation = {
  operationId: string;
  security: unknown[];
  parameters: { name: string; in: string; required?: boolean }[];
  requestBody?: {
    content: { 'application/json': { schema: { $ref: string } } };
  };
  responses: Record<string, unknown>;
};
const paths = openApiDocument.paths as Record<
  string,
  Record<string, Operation>
>;
const schemas = () =>
  (openApiDocument.components as { schemas: Record<string, Schema> }).schemas;

describe('OPS-001 AC-005 OpenAPI executable contract', () => {
  it('documents exactly the mounted HTTP operations', () => {
    const app = createApp({
      pool: new pg.Pool({
        connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused',
      }),
      identityProvider: {
        verifyAccessToken: async () => ({
          id: 'dd4092e0-1951-47e0-af5c-bc0dbb94eaf8',
          email: 'test@example.test',
          emailVerified: true,
        }),
      },
      cardTokenEncryptionKey: 'ab'.repeat(32),
    });
    const actual = [
      ...new Set(
        app.routes
          .filter((route) =>
            ['GET', 'POST', 'PATCH', 'DELETE'].includes(route.method),
          )
          .map(
            (route) =>
              `${route.method.toLowerCase()} ${route.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}')}`,
          ),
      ),
    ].sort();
    const documented = Object.entries(paths)
      .flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method} ${path}`),
      )
      .sort();
    expect(documented).toEqual(actual);
  });
  it('requires bearer for every private operation and no authentication for public endpoints', () => {
    expect(Object.keys(paths).length).toBeGreaterThan(25);
    for (const [path, methods] of Object.entries(paths))
      for (const [method, operation] of Object.entries(methods)) {
        const isPublic =
          ['/health', '/ready', '/openapi.json'].includes(path) ||
          (path === '/api/v1/public/programs/{code}' && method === 'get');
        expect(operation.security, `${method} ${path}`).toEqual(
          isPublic ? [] : [{ bearerAuth: [] }],
        );
      }
  });
  it('requires retry keys on transactional writes and binds every route parameter', () => {
    for (const [path, methods] of Object.entries(paths))
      for (const [method, operation] of Object.entries(methods)) {
        for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map(
          (match) => match[1],
        ))
          expect(operation.parameters).toContainEqual(
            expect.objectContaining({ name, in: 'path', required: true }),
          );
        if (
          ['post', 'patch', 'delete'].includes(method) &&
          ![
            '/api/v1/profiles',
            '/api/v1/me',
            '/api/v1/restaurants/{id}/cards/resolve',
          ].includes(path)
        )
          expect(operation.parameters).toContainEqual(
            expect.objectContaining({
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
            }),
          );
      }
    expect(paths['/api/v1/restaurants/{id}/purchases']?.post).toBeDefined();
  });
  it('uses closed request schemas and resolvable component references', () => {
    const all = schemas();
    for (const methods of Object.values(paths))
      for (const operation of Object.values(methods)) {
        if (!operation.requestBody) continue;
        const name = operation.requestBody.content[
          'application/json'
        ].schema.$ref
          .split('/')
          .at(-1) as string;
        expect(all[name], name).toBeDefined();
        expect(all[name]?.additionalProperties, name).toBe(false);
      }
    const check = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const [name, entry] of Object.entries(value)) {
        if (name === '$ref') {
          const parts = String(entry).split('/').slice(1);
          let target: unknown = openApiDocument;
          for (const part of parts)
            target = (target as Record<string, unknown>)?.[part];
          expect(target, entry as string).toBeDefined();
        } else check(entry);
      }
    };
    check(openApiDocument);
  });
  it('specifies purchase reference, explicit consent, positive target and stable error envelope', () => {
    const all = schemas();
    expect(
      (all.PurchaseInput?.properties as Schema)?.sale_reference,
    ).toMatchObject({ type: 'string', minLength: 1, maxLength: 100 });
    expect((all.ConsentInput?.properties as Schema)?.accepted).toEqual({
      const: true,
      type: 'boolean',
    });
    expect(
      (all.ProgramCreate?.properties as Schema)?.stamps_required,
    ).toMatchObject({ type: 'integer', minimum: 1 });
    expect(all.ErrorDetail?.required).toEqual([
      'code',
      'message',
      'request_id',
    ]);
  });
});
