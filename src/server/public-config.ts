import { readAppOrigin } from './config';

export function publicConfig(env: NodeJS.ProcessEnv): Response {
  try {
    return Response.json(
      {
        data: {
          appOrigin: readAppOrigin(env),
          // AUTH-LOCAL-001: la UI oculta Google y la recuperación por correo.
          authProvider:
            env.AUTH_PROVIDER?.trim() === 'supabase' ? 'supabase' : 'local',
        },
      },
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
