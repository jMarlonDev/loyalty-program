import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/application/errors.js';
import type { IdentityService } from '../../src/application/identity.js';
import {
  createStaffService,
  type StaffRepository,
} from '../../src/application/staff.js';
import { createBaseApp } from '../../src/presentation/http/base-app.js';
import { createStaffRoutes } from '../../src/presentation/http/staff-routes.js';

function setup() {
  const actor = {
    id: randomUUID(),
    email: 'staff@example.test',
    emailVerified: true,
  };
  const identityService = {
    authenticate: vi.fn(async (header: string | undefined) => {
      if (header !== 'Bearer valid')
        throw new AppError(401, 'UNAUTHENTICATED', 'Sign in');
      return actor;
    }),
    getMe: vi.fn(async () => ({ id: actor.id, status: 'active' })),
  } as unknown as IdentityService;
  const repository: StaffRepository = {
    execute: vi.fn(async () => ({ data: { id: 'created' } })),
    query: vi.fn(async () => ({ data: [], next_cursor: null })),
  };
  const app = createBaseApp({ checkDatabase: async () => {} });
  app.route(
    '/api/v1',
    createStaffRoutes({
      identityService,
      staffService: createStaffService(repository),
    }),
  );
  return { app, repository, actor };
}
const headers = {
  Authorization: 'Bearer valid',
  'Content-Type': 'application/json',
  'Idempotency-Key': 'command-1',
};

describe('STAFF-001 AC-006 HTTP boundaries', () => {
  it('creates restaurant with server-derived identity and request correlation', async () => {
    const { app, repository, actor } = setup();
    const response = await app.request('/api/v1/restaurants', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Cafe', slug: 'cafe' }),
    });
    expect(response.status).toBe(201);
    expect(repository.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        action: 'restaurant.create',
        key: 'command-1',
        requestId: response.headers.get('x-request-id'),
      }),
    );
  });

  it('rejects role injection, malformed JSON and missing idempotency without persistence', async () => {
    const { app, repository } = setup();
    for (const body of [
      '{',
      JSON.stringify({ name: 'Cafe', slug: 'cafe', role: 'owner' }),
    ]) {
      const response = await app.request('/api/v1/restaurants', {
        method: 'POST',
        headers,
        body,
      });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_INPUT');
    }
    const response = await app.request('/api/v1/restaurants', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Cafe', slug: 'cafe' }),
    });
    expect(response.status).toBe(400);
    const wrongType = await app.request('/api/v1/restaurants', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ name: 'Cafe', slug: 'cafe' }),
    });
    expect(wrongType.status).toBe(400);
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('enforces authentication and bounds pagination before repository access', async () => {
    const { app, repository } = setup();
    expect((await app.request('/api/v1/restaurants')).status).toBe(401);
    expect(
      (await app.request('/api/v1/restaurants?limit=101', { headers })).status,
    ).toBe(400);
    expect(
      (await app.request('/api/v1/restaurants?cursor=bad', { headers })).status,
    ).toBe(400);
    expect(repository.query).not.toHaveBeenCalled();
    const response = await app.request('/api/v1/restaurants', { headers });
    expect(response.status).toBe(200);
    expect(repository.query).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, collection: 'restaurants' }),
    );
  });

  it('rejects owner role assignment and invalid target ID before persistence', async () => {
    const { app, repository } = setup();
    const restaurant = randomUUID();
    const target = randomUUID();
    const response = await app.request(
      `/api/v1/restaurants/${restaurant}/employees/${target}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: 'owner' }),
      },
    );
    expect(response.status).toBe(400);
    expect(
      (await app.request('/api/v1/restaurants/bad/locations', { headers }))
        .status,
    ).toBe(400);
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('dispatches invitation acceptance and logical location updates', async () => {
    const { app, repository } = setup();
    const restaurant = randomUUID();
    const target = randomUUID();
    expect(
      (
        await app.request('/api/v1/invitations/accept', {
          method: 'POST',
          headers,
          body: JSON.stringify({ token: 'a'.repeat(43) }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/v1/restaurants/${restaurant}/locations/${target}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'inactive' }),
          },
        )
      ).status,
    ).toBe(200);
    expect(repository.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'location.update',
        restaurantId: restaurant,
        targetId: target,
        input: { status: 'inactive' },
      }),
    );
  });
});
