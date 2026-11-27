import { useQuery } from '@tanstack/react-query';
import { isLanOrigin, isPublicOrigin, parseAppOrigin } from './public-origin';

export function useAppOrigin() {
  const query = useQuery({
    queryKey: ['public-config'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/public-config', {
        signal,
        credentials: 'omit',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.data?.appOrigin !== 'string')
        throw new Error('No se pudo cargar el enlace. Vuelve a intentarlo.');
      try {
        // The server authorizes LAN HTTP only in development. This validates
        // its response for display; it does not authorize session requests.
        return parseAppOrigin(payload.data.appOrigin, {
          allowPrivateHttp: true,
        });
      } catch {
        throw new Error(
          'La dirección de la aplicación no es válida. Contacta al administrador.',
        );
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const origin = query.data ?? null;
  return {
    origin,
    isPublic: Boolean(origin && isPublicOrigin(origin)),
    isLan: Boolean(origin && isLanOrigin(origin)),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
