import { useQuery } from '@tanstack/react-query';
import { isPublicOrigin, parseAppOrigin } from './public-origin';

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
        return parseAppOrigin(payload.data.appOrigin);
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
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
