import { parseAppOrigin } from '../lib/public-origin';

export function publicConfig(env: NodeJS.ProcessEnv): Response {
  try {
    return Response.json(
      { data: { appOrigin: parseAppOrigin(env.APP_ORIGIN) } },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: 'CONFIGURATION_ERROR',
          message:
            'No se pudo obtener la dirección de la aplicación. Contacta al administrador.',
        },
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
