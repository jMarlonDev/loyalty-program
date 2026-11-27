import { useAppOrigin } from '../lib/public-config';
import { ErrorNotice, Loading } from './common';
import { ShareQr } from './loyalty-card';

export function PublicShareQr({
  path,
  title,
  description,
}: {
  path: string;
  title?: string;
  description?: string;
}) {
  const config = useAppOrigin();
  if (config.isLoading) return <Loading label="Preparando enlace…" />;
  if (config.error)
    return (
      <ErrorNotice error={config.error} retry={() => void config.refetch()} />
    );
  if (!config.origin) return null;
  return (
    <div className="stack">
      {!config.isPublic && (
        <p className="notice" role="status">
          {config.isLan
            ? 'Este enlace de prueba funciona en dispositivos conectados a la misma red. Para usarlo desde fuera de esa red necesitas una dirección pública HTTPS.'
            : 'Este enlace es de prueba y solo funciona en este computador. Para compartirlo con celulares, la aplicación necesita una dirección pública HTTPS.'}
        </p>
      )}
      <ShareQr
        value={`${config.origin}${path}`}
        title={title}
        description={description}
      />
    </div>
  );
}
