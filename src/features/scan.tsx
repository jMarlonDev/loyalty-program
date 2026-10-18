import { useEffect, useState } from 'react';
import { Brand, Empty, ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
import { useResource } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  type CardScan,
  clearPendingScan,
  parseCardScan,
  readPendingScan,
  savePendingScan,
} from '../lib/card-qr';
import type { Restaurant } from '../lib/types';
import { OperationsPanel } from './operations';

export function ScanPage() {
  const auth = useAuth();
  const [scan, setScan] = useState<CardScan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    const capture = () => {
      const fragment = window.location.hash;
      const current = fragment
        ? parseCardScan(window.location.href, window.location.origin)
        : readPendingScan();
      if (fragment) {
        window.history.replaceState(window.history.state, '', '/scan');
        clearPendingScan();
        if (current) setStorageAvailable(savePendingScan(current));
      }
      setScan(current);
      setLoaded(true);
    };
    capture();
    window.addEventListener('hashchange', capture);
    const ended = () => {
      clearPendingScan();
      setScan(null);
    };
    window.addEventListener('loyalty:logout', ended);
    return () => {
      window.removeEventListener('hashchange', capture);
      window.removeEventListener('loyalty:logout', ended);
    };
  }, []);
  const restaurant = useResource<Restaurant>(
    auth.user && scan ? `/restaurants/${scan.restaurantId}` : null,
  );
  return (
    <div className="customer-page">
      <header className="customer-header">
        <Brand />
        <a href="/app">Volver a operaciones</a>
      </header>
      <main id="main-content" className="workspace-content">
        {!loaded || auth.loading ? (
          <Loading label="Preparando la tarjeta…" />
        ) : (
          <>
            <ErrorNotice
              error={auth.error ? new Error(auth.error) : null}
              retry={() => void auth.reload()}
            />
            {!scan ? (
              <Empty title="Escanea una tarjeta para continuar">
                Abre el QR de un cliente o utiliza la cámara dentro de
                Operaciones.
              </Empty>
            ) : !auth.user ? (
              !auth.error && (
                <Empty
                  title="Accede como personal del restaurante"
                  action={
                    <Button asChild>
                      <a href="/auth?next=%2Fscan">
                        Iniciar sesión para agregar un sello
                      </a>
                    </Button>
                  }
                >
                  {storageAvailable
                    ? 'Conservaremos esta tarjeta mientras inicias sesión en esta pestaña.'
                    : 'Tu navegador no permite conservar este código. Inicia sesión y vuelve a escanearlo.'}
                </Empty>
              )
            ) : (
              <>
                <ErrorNotice
                  error={restaurant.error}
                  retry={() => void restaurant.refetch()}
                />
                {restaurant.isLoading && (
                  <Loading label="Comprobando acceso al restaurante…" />
                )}
                {restaurant.data && (
                  <>
                    <p className="muted">{restaurant.data.name}</p>
                    <OperationsPanel
                      key={`${scan.restaurantId}:${scan.token}`}
                      restaurantId={scan.restaurantId}
                      canManage={['owner', 'admin'].includes(
                        restaurant.data.actor_role ?? '',
                      )}
                      initialToken={scan.token}
                    />
                  </>
                )}
                {restaurant.error && (
                  <p className="muted">
                    Solo el personal autorizado de este restaurante puede abrir
                    la tarjeta y registrar compras.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
