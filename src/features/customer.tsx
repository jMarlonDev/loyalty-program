import {
  ArrowLeft,
  ArrowRight,
  Gift,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Brand,
  Empty,
  ErrorNotice,
  Loading,
  PageTitle,
} from '../components/common';
import { LoyaltyCard, ShareQr } from '../components/loyalty-card';
import { Button } from '../components/ui/button';
import {
  useCustomerAction,
  useCustomerResource,
  useCustomerSession,
} from '../lib/api';
import { cardScanUrl, uuidPattern } from '../lib/card-qr';
import { useAppOrigin } from '../lib/public-config';
import { useCardEvents } from '../lib/realtime';
import type { CardView } from '../lib/types';
import { formatDate } from '../lib/utils';

export function CustomerCardsPage() {
  const session = useCustomerSession();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const restore = () => {
      const cardId = new URLSearchParams(window.location.search).get('card');
      setSelected(cardId && uuidPattern.test(cardId) ? cardId : null);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  function selectCard(cardId: string | null) {
    setSelected(cardId);
    window.history.pushState(
      window.history.state,
      '',
      cardId ? `/cards?card=${encodeURIComponent(cardId)}` : '/cards',
    );
  }
  return (
    <div className="customer-page">
      <header className="customer-header">
        <Brand />
        <nav aria-label="Mi cuenta">
          <a href="/app">Personal del restaurante</a>
          {session.data && (
            <button
              type="button"
              onClick={() =>
                void fetch('/api/v1/customer/session', {
                  method: 'DELETE',
                  credentials: 'same-origin',
                }).then(() => window.location.assign('/'))
              }
            >
              <LogOut size={16} />
              Olvidar este dispositivo
            </button>
          )}
        </nav>
      </header>
      <main id="main-content" className="workspace-content">
        <ErrorNotice
          error={session.error}
          retry={() => void session.refetch()}
        />
        {session.isLoading ? (
          <Loading label="Buscando tus tarjetas…" />
        ) : selected ? (
          <CustomerCardDetail
            cardId={selected}
            onBack={() => selectCard(null)}
          />
        ) : !session.data ? (
          <NoCustomerSession />
        ) : (
          <CustomerCardList
            phone={session.data.phone_masked}
            onSelect={selectCard}
          />
        )}
      </main>
    </div>
  );
}

function NoCustomerSession() {
  return (
    <Empty
      title="Tus tarjetas viven en tu teléfono"
      action={
        <Button asChild>
          <a href="/">
            Volver al inicio
            <ArrowRight size={17} />
          </a>
        </Button>
      }
    >
      Escanea el QR del restaurante donde compras para recibir tu tarjeta. No
      necesitas correo ni contraseña.
    </Empty>
  );
}

function CustomerCardList({
  phone,
  onSelect,
}: {
  phone: string;
  onSelect: (cardId: string) => void;
}) {
  const cards = useCustomerResource<CardView[]>('/customer/cards', {
    live: true,
  });
  return (
    <>
      <PageTitle
        title="Mis tarjetas"
        description={`Estás en este dispositivo como ${phone}.`}
      />
      <ErrorNotice error={cards.error} retry={() => void cards.refetch()} />
      {cards.isLoading && <Loading />}
      {!cards.isLoading && !cards.error && !cards.data?.length && (
        <Empty
          title="Aún no tienes tarjetas"
          action={
            <Button asChild variant="secondary">
              <a href="/">Buscar un restaurante</a>
            </Button>
          }
        >
          Escanea el QR del restaurante y escribe tu teléfono para empezar.
        </Empty>
      )}
      <div className="card-grid">
        {cards.data?.map((card) => (
          <button
            type="button"
            className="customer-card-button"
            key={card.id}
            onClick={() => onSelect(card.id)}
          >
            <LoyaltyCard
              program={{ ...card.program, name: card.program_name }}
              balance={card.cycle?.stamps ?? 0}
              compact
            />
            <span className="customer-card-meta">
              <span>{card.restaurant_name}</span>
              <span>
                {card.cycle?.stamps ?? 0}/{card.cycle?.target ?? card.target}{' '}
                sellos
                {card.cycle?.state === 'reward_available' && ' · Premio listo'}
              </span>
            </span>
          </button>
        ))}
      </div>
      {cards.isFetching && !cards.isLoading && (
        <p className="field-hint" role="status">
          Actualizando tus sellos…
        </p>
      )}
    </>
  );
}

function CustomerCardDetail({
  cardId,
  onBack,
}: {
  cardId: string;
  onBack: () => void;
}) {
  const card = useCustomerResource<CardView>(`/customer/cards/${cardId}`, {
    live: true,
  });
  const qr = useCustomerResource<{ token: string }>(
    `/customer/cards/${cardId}/qr`,
  );
  const reissue = useCustomerAction<{ token: string; expires_at: string }>();
  const appOrigin = useAppOrigin();
  const [message, setMessage] = useState('');
  useCardEvents(cardId);
  const current = card.data;
  const cycle = current?.cycle ?? null;
  const reward = current?.rewards.find((item) => item.status === 'available');
  const scan =
    qr.data?.token && current && appOrigin.origin
      ? cardScanUrl(appOrigin.origin, {
          token: qr.data.token,
          restaurantId: current.restaurant_id,
        })
      : undefined;
  const rewardScan =
    reward?.voucher?.token && current && appOrigin.origin
      ? cardScanUrl(appOrigin.origin, {
          token: reward.voucher.token,
          restaurantId: current.restaurant_id,
          purpose: 'reward',
        })
      : undefined;
  async function reissueReward() {
    if (!reward) return;
    try {
      await reissue.mutateAsync({
        path: `/customer/rewards/${reward.id}/voucher/reissue`,
      });
      setMessage('Generamos un código nuevo. El anterior ya no sirve.');
      void card.refetch();
    } catch {}
  }
  return (
    <>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={17} />
        Mis tarjetas
      </Button>
      <ErrorNotice error={card.error} retry={() => void card.refetch()} />
      {card.isLoading && <Loading />}
      {current && (
        <>
          <PageTitle
            title={current.program_name}
            description={
              reward
                ? 'Tu premio está listo. Muéstralo al personal para recibirlo.'
                : 'Muestra tu QR en cada compra. Cada visita suma un sello.'
            }
          />
          <div className="customer-detail">
            <section className="stack">
              <LoyaltyCard
                program={{ ...current.program, name: current.program_name }}
                balance={cycle?.stamps ?? 0}
                token={scan}
              />
              <p className="field-hint" role="status" aria-live="polite">
                {cycle?.stamps ?? 0} de{' '}
                {cycle?.target ?? current.program.stamps_required} sellos
                {!cycle || cycle.state === 'collecting'
                  ? '. Se actualiza solo al registrar una compra.'
                  : ''}
              </p>
              {appOrigin.origin && !appOrigin.isPublic && (
                <p className="notice">
                  Este enlace funciona en dispositivos conectados a la misma
                  red. Para usarlo desde cualquier lugar se necesita HTTPS
                  público.
                </p>
              )}
              <ErrorNotice error={qr.error} retry={() => void qr.refetch()} />
              {qr.data && (
                <details className="token-details">
                  <summary>
                    <QrCode size={15} /> Mostrar código para copiar
                  </summary>
                  <p className="field-hint">
                    Compártelo solo con personal de este restaurante.
                  </p>
                  <code>{qr.data.token}</code>
                </details>
              )}
              <Button
                variant="secondary"
                disabled={qr.isFetching}
                onClick={() => {
                  void qr.refetch();
                  void card.refetch();
                }}
              >
                <RefreshCw size={16} />
                Actualizar tarjeta
              </Button>
            </section>
            <section className="stack">
              <h2>Tu premio</h2>
              {reward ? (
                <>
                  <p className="notice notice-success">
                    <Gift size={18} /> {reward.description}
                  </p>
                  <p className="field-hint">
                    Muestra este QR de canje al personal. No lo compartas con
                    nadie más. El QR de tu tarjeta no sirve para canjear.
                  </p>
                  {rewardScan ? (
                    <ShareQr
                      value={rewardScan}
                      title="QR de tu premio"
                      description="El personal lo escanea y confirma la entrega."
                    />
                  ) : (
                    <Loading label="Preparando tu premio…" />
                  )}
                  <div className="button-row">
                    {reward.whatsapp_url && (
                      <Button asChild variant="secondary">
                        <a
                          href={reward.whatsapp_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Enviar a mi WhatsApp
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      disabled={reissue.isPending}
                      onClick={() => void reissueReward()}
                    >
                      Generar un código nuevo
                    </Button>
                  </div>
                  <ErrorNotice error={reissue.error} />
                  {message && <p role="status">{message}</p>}
                </>
              ) : cycle?.state === 'redeemed' ? (
                <p className="notice notice-success">
                  <ShieldCheck size={18} /> Premio entregado. Tu nueva tarjeta
                  ya está en marcha.
                </p>
              ) : (
                <Empty title="Lo bueno está por llegar">
                  Te faltan{' '}
                  {(cycle?.target ?? current.program.stamps_required) -
                    (cycle?.stamps ?? 0)}{' '}
                  compras para tu próximo premio:{' '}
                  {current.program.reward_description}.
                </Empty>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
