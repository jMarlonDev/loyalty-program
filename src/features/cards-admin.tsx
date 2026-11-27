import { ArrowLeft, CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty, ErrorNotice, Loading, PageTitle } from '../components/common';
import { ShareQr } from '../components/loyalty-card';
import { Button } from '../components/ui/button';
import { useAction, useResource } from '../lib/api';
import type { AdminCardDetail, AdminCardRow } from '../lib/types';
import { formatDate } from '../lib/utils';

export function CardsPanel({ restaurantId }: { restaurantId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const list = useResource<AdminCardRow[]>(
    selected ? null : `/restaurants/${restaurantId}/cards`,
  );
  if (selected)
    return (
      <CardDetail
        key={selected}
        restaurantId={restaurantId}
        cardId={selected}
        onBack={() => setSelected(null)}
        onOpen={setSelected}
      />
    );
  return (
    <>
      <PageTitle
        title="Tarjetas"
        description="Clientes inscritos en este restaurante."
      />
      <ErrorNotice error={list.error} retry={() => void list.refetch()} />
      {list.isLoading && <Loading />}
      {!list.isLoading && !list.error && !list.data?.length && (
        <Empty title="Aún no hay tarjetas">
          Cuando un cliente se una desde el QR del restaurante aparecerá aquí.
        </Empty>
      )}
      <div className="entity-list">
        {list.data?.map((row) => (
          <article className="entity-row" key={row.card_id}>
            <div className="entity-icon">
              <CreditCard size={22} />
            </div>
            <div className="entity-main">
              <h3>{row.phone_masked}</h3>
              <p className="muted">
                {row.program_name} · {row.stamps} sellos
                {row.pending_rewards > 0 &&
                  ` · ${row.pending_rewards} premio(s) pendiente(s)`}
              </p>
              <p className="muted">
                Inicio {formatDate(row.joined_at)}
                {row.closed_at && ` · Cierre ${formatDate(row.closed_at)}`}
              </p>
              <span className={`badge badge-${row.status}`}>
                {row.status === 'active' ? 'Activa' : 'Cerrada'}
              </span>{' '}
              {row.is_reenrollment && (
                <span className="badge">
                  Reinscrito ({row.previous_cards_count} anteriores)
                </span>
              )}
            </div>
            <Button variant="ghost" onClick={() => setSelected(row.card_id)}>
              Ver detalle
            </Button>
          </article>
        ))}
      </div>
    </>
  );
}

function CardDetail({
  restaurantId,
  cardId,
  onBack,
  onOpen,
}: {
  restaurantId: string;
  cardId: string;
  onBack: () => void;
  onOpen: (cardId: string) => void;
}) {
  const detail = useResource<AdminCardDetail>(
    `/restaurants/${restaurantId}/cards/${cardId}`,
  );
  const transfer = useAction<{
    token: string;
    url: string;
    expires_at: string;
  }>();
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(false);
  const [issued, setIssued] = useState<{
    url: string;
    expires_at: string;
  } | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!issued) return;
    const tick = () =>
      setLeft(
        Math.max(
          0,
          Math.floor((Date.parse(issued.expires_at) - Date.now()) / 1000),
        ),
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [issued]);
  async function generate() {
    try {
      setIssued(
        await transfer.mutateAsync({
          path: `/restaurants/${restaurantId}/cards/${cardId}/transfers`,
        }),
      );
      setConfirming(false);
    } catch {}
  }
  const data = detail.data;
  return (
    <>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={17} />
        Tarjetas
      </Button>
      <ErrorNotice error={detail.error} retry={() => void detail.refetch()} />
      {detail.isLoading && <Loading />}
      {data && (
        <div className="stack">
          <PageTitle
            title={data.phone}
            description={`${data.program_name} · ${data.status === 'active' ? 'Activa' : 'Cerrada'}`}
          />
          <p className="muted">
            Inicio {formatDate(data.joined_at)}
            {data.closed_at && ` · Cierre ${formatDate(data.closed_at)}`}
            {data.close_reason && ` (${data.close_reason})`}
          </p>
          {data.is_reenrollment && (
            <p className="notice">
              Reinscrito ({data.previous_cards_count} anteriores)
            </p>
          )}
          <section className="stack">
            <h2>Compras</h2>
            {data.purchases.length ? (
              <ul>
                {data.purchases.map((purchase, index) => (
                  <li key={purchase.id ?? index}>
                    {formatDate(purchase.created_at)}
                    {purchase.reference && ` · ${purchase.reference}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Sin compras.</p>
            )}
            <h2>Premios</h2>
            {data.rewards.length ? (
              <ul>
                {data.rewards.map((reward, index) => (
                  <li key={reward.id ?? index}>
                    {reward.description} · {reward.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Sin premios.</p>
            )}
          </section>
          {data.previous_cards.length > 0 && (
            <section className="stack">
              <h2>Tarjetas anteriores</h2>
              {data.previous_cards.map((previous) => (
                <Button
                  key={previous.card_id}
                  variant="secondary"
                  onClick={() => onOpen(previous.card_id)}
                >
                  {formatDate(previous.joined_at)} —{' '}
                  {previous.closed_at
                    ? formatDate(previous.closed_at)
                    : 'activa'}{' '}
                  ({previous.status === 'active' ? 'Activa' : 'Cerrada'})
                </Button>
              ))}
            </section>
          )}
          {data.status === 'active' && (
            <section className="panel stack">
              <h2>Transferir a nuevo dispositivo</h2>
              {issued ? (
                left > 0 ? (
                  <>
                    <p role="status">
                      Pide al cliente que escanee este QR con su nuevo celular.
                      Vence en {Math.floor(left / 60)}:
                      {String(left % 60).padStart(2, '0')}.
                    </p>
                    <ShareQr
                      value={issued.url}
                      title="QR de transferencia"
                      description="Un solo uso."
                    />
                  </>
                ) : (
                  <p className="notice" role="status">
                    El QR venció. Genera uno nuevo.
                  </p>
                )
              ) : null}
              {!confirming ? (
                <Button variant="secondary" onClick={() => setConfirming(true)}>
                  Transferir a nuevo dispositivo
                </Button>
              ) : (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={verified}
                      onChange={(event) => setVerified(event.target.checked)}
                    />{' '}
                    Verifiqué a la persona en el local
                  </label>
                  <ErrorNotice error={transfer.error} />
                  <div className="button-row">
                    <Button
                      disabled={!verified || transfer.isPending}
                      onClick={() => void generate()}
                    >
                      {transfer.isPending ? 'Generando…' : 'Generar QR'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirming(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
