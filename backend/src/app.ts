import type { Pool } from 'pg';
import {
  createIdentityService,
  type IdentityProvider,
} from './application/identity.js';
import { createLoyaltyService } from './application/loyalty.js';
import { createProgramService } from './application/programs.js';
import { createStaffService } from './application/staff.js';
import { PgBranchRepository } from './infrastructure/branch-repository.js';
import { PgLoyaltyRepository } from './infrastructure/loyalty-repository.js';
import { PgNextRepository } from './infrastructure/next-repository.js';
import { PgProfileRepository } from './infrastructure/profile-repository.js';
import { PgProgramRepository } from './infrastructure/programs-repository.js';
import { PgStaffRepository } from './infrastructure/staff-repository.js';
import { createBaseApp } from './presentation/http/base-app.js';
import { createBranchRoutes } from './presentation/http/branch-routes.js';
import { mountedOpenApiDocument } from './presentation/http/combined-openapi.js';
import { createIdentityRoutes } from './presentation/http/identity.js';
import { createLoyaltyRoutes } from './presentation/http/loyalty.js';
import { createNextRoutes } from './presentation/http/next-routes.js';
import {
  addOperationalMiddleware,
  type OperationLog,
} from './presentation/http/operations.js';
import { createProgramRoutes } from './presentation/http/programs.js';
import { createStaffRoutes } from './presentation/http/staff-routes.js';

export interface AppDependencies {
  pool: Pool;
  identityProvider: IdentityProvider;
  cardTokenEncryptionKey: string;
  corsOrigins?: string[];
  log?: (entry: OperationLog) => void;
  now?: () => Date;
  publicOrigin?: string;
  /** D-06: solo desarrollo; sobrescribe la espera entre sellos de los programas. */
  stampCooldownMinutes?: number | undefined;
}

export function createApp(dependencies: AppDependencies) {
  const app = createBaseApp({
    checkDatabase: async () => {
      await dependencies.pool.query('SELECT 1');
    },
  });
  const identityService = createIdentityService({
    identityProvider: dependencies.identityProvider,
    profiles: new PgProfileRepository(dependencies.pool),
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  addOperationalMiddleware(app, {
    corsOrigins: dependencies.corsOrigins ?? [],
    ...(dependencies.log ? { log: dependencies.log } : {}),
  });
  const repositoryOptions = {
    tokenEncryptionKey: dependencies.cardTokenEncryptionKey,
    ...(dependencies.now ? { now: dependencies.now } : {}),
  };
  app.route('/api/v1', createIdentityRoutes({ identityService }));
  app.route(
    '/api/v1',
    createNextRoutes({
      identityService,
      repository: new PgNextRepository(dependencies.pool, {
        ...repositoryOptions,
        stampCooldownMinutes: dependencies.stampCooldownMinutes,
        ...(dependencies.publicOrigin
          ? { publicOrigin: dependencies.publicOrigin }
          : {}),
      }),
      origin: dependencies.publicOrigin ?? '',
    }),
  );
  app.route(
    '/api/v1',
    createBranchRoutes({
      identityService,
      repository: new PgBranchRepository(dependencies.pool, {
        ...(dependencies.now ? { now: dependencies.now } : {}),
        ...(dependencies.publicOrigin
          ? { publicOrigin: dependencies.publicOrigin }
          : {}),
      }),
      origin: dependencies.publicOrigin ?? '',
    }),
  );
  app.route(
    '/api/v1',
    createStaffRoutes({
      identityService,
      staffService: createStaffService(
        new PgStaffRepository(dependencies.pool, repositoryOptions),
      ),
    }),
  );
  app.route(
    '/api/v1',
    createProgramRoutes({
      identityService,
      programService: createProgramService(
        new PgProgramRepository(dependencies.pool, repositoryOptions),
      ),
    }),
  );
  app.route(
    '/api/v1',
    createLoyaltyRoutes({
      identityService,
      loyaltyService: createLoyaltyService(
        new PgLoyaltyRepository(dependencies.pool, repositoryOptions),
      ),
    }),
  );
  app.get('/openapi.json', (c) => c.json(mountedOpenApiDocument));
  return app;
}
