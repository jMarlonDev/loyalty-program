import { nextOpenApiDocument } from './next-openapi.js';
import { openApiDocument } from './openapi.js';

type Document = Record<string, unknown>;

const legacy = structuredClone(openApiDocument) as Document;
const next = nextOpenApiDocument as Document;
const legacyPaths = (legacy.paths ?? {}) as Record<string, unknown>;
const nextPaths = (next.paths ?? {}) as Record<string, unknown>;
const legacyComponents = (legacy.components ?? {}) as Record<string, unknown>;
const nextComponents = (next.components ?? {}) as Record<string, unknown>;

for (const legacyOnly of [
  '/api/v1/restaurants/{restaurantId}/employees/{employeeId}',
  '/api/v1/restaurants/{restaurantId}/invitations/{invitationId}/revoke',
])
  delete legacyPaths[legacyOnly];

export const mountedOpenApiDocument: Document = {
  ...legacy,
  ...next,
  info: {
    title: 'Loyalty Program API',
    version: '2.0.0',
    description:
      'Contrato de las rutas montadas. NEXT-001–005 convive temporalmente con rutas heredadas hasta completar P9.',
  },
  paths: { ...legacyPaths, ...nextPaths },
  components: {
    ...legacyComponents,
    ...nextComponents,
    schemas: {
      ...((legacyComponents.schemas ?? {}) as Record<string, unknown>),
      ...((nextComponents.schemas ?? {}) as Record<string, unknown>),
    },
    securitySchemes: {
      ...((legacyComponents.securitySchemes ?? {}) as Record<string, unknown>),
      ...((nextComponents.securitySchemes ?? {}) as Record<string, unknown>),
    },
  },
};
