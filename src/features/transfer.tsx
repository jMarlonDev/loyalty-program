import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Brand, Empty, ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
import { ApiError, useCustomerAction } from '../lib/api';
import type { CardView } from '../lib/types';

export function TransferPage() {
  const claim = useCustomerAction<{ card: CardView }>();
  const [card, setCard] = useState<CardView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    window.history.replaceState(window.history.state, '', '/transfer');
    if (!token) {
      setMissing(true);
      return;
    }
    claim
      .mutateAsync({ path: '/customer/transfers/claim', body: { token } })
      .then((result) => setCard(result.card))
      .catch((failure) =>
        setError(
          failure instanceof ApiError && failure.code === 'TRANSFER_INVALID'
            ? new Error('El código de transferencia no es válido o venció.')
            : failure,
        ),
      );
  }, [claim]);

  return (
    <div className="public-page">
      <header>
        <Brand />
      </header>
      <main id="main-content" className="standalone">
        {card ? (
          <div className="stack">
            <h1>Tu tarjeta está en este dispositivo</h1>
            <p className="notice notice-success" role="status">
              {card.program_name}: {card.cycle?.stamps ?? card.balance} de{' '}
              {card.cycle?.target ?? card.target} sellos.
            </p>
            <Button asChild>
              <a href={`/cards?card=${encodeURIComponent(card.id)}`}>
                Ver mi tarjeta
                <ArrowRight size={17} />
              </a>
            </Button>
          </div>
        ) : missing ? (
          <Empty title="Falta el código de transferencia">
            Pide en el local que generen un QR nuevo y escanéalo de nuevo.
          </Empty>
        ) : error ? (
          <div className="stack">
            <ErrorNotice error={error} />
            <p className="field-hint">
              Pide en el local que generen un QR nuevo.
            </p>
          </div>
        ) : (
          <Loading label="Transfiriendo tu tarjeta…" />
        )}
      </main>
    </div>
  );
}
