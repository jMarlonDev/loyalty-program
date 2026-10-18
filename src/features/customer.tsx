import {
  ArrowLeft,
  ArrowRight,
  Gift,
  LogOut,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  Brand,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  MoreButton,
  PageTitle,
} from '../components/common';
import { LoyaltyCard } from '../components/loyalty-card';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useAction, useCollection, useResource } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cardScanUrl, uuidPattern } from '../lib/card-qr';
import { useAppOrigin } from '../lib/public-config';
import type {
  LoyaltyCard as Card,
  ClosurePreview,
  Movement,
  Reward,
} from '../lib/types';
import { formatDate, statusLabel } from '../lib/utils';
export function CustomerCardsPage() {
  const auth = useAuth(),
    cards = useCollection<Card>(auth.user ? '/me/cards' : null);
  const [selected, setSelected] = useState<string | null>(null),
    [profileOpen, setProfileOpen] = useState(false),
    [logoutError, setLogoutError] = useState<unknown>(null);
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
  async function logout() {
    try {
      await auth.logout();
      window.location.assign('/');
    } catch (e) {
      setLogoutError(e);
    }
  }
  return (
    <div className="customer-page">
      <header className="customer-header">
        <Brand />
        <nav aria-label="Mi cuenta">
          <a href="/app">Mi restaurante</a>
          {auth.user && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Datos de mi cuenta"
                onClick={() => setProfileOpen(true)}
              >
                <Settings size={20} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cerrar sesión"
                onClick={() => void logout()}
              >
                <LogOut size={20} />
              </Button>
            </>
          )}
        </nav>
      </header>
      <main id="main-content" className="customer-content">
        <ErrorNotice
          error={logoutError || (auth.error ? new Error(auth.error) : null)}
          retry={() => void auth.reload()}
        />
        {auth.loading ? (
          <Loading />
        ) : !auth.user && auth.error ? null : !auth.user ? (
          <Empty
            title="Tus lugares favoritos, contigo"
            action={
              <Button asChild>
                <a
                  href={`/auth?next=${encodeURIComponent(selected ? `/cards?card=${selected}` : '/cards')}`}
                >
                  Entrar a mis tarjetas
                  <ArrowRight size={17} />
                </a>
              </Button>
            }
          >
            Inicia sesión para consultar tus sellos y premios.
          </Empty>
        ) : selected ? (
          <CardDetail cardId={selected} onBack={() => selectCard(null)} />
        ) : (
          <>
            <PageTitle
              title="Mis tarjetas"
              description="Cada visita cuenta. Tu próxima recompensa está más cerca."
            />
            <ErrorNotice
              error={cards.error}
              retry={() => void cards.refetch()}
            />
            {cards.isLoading && <Loading />}
            {!cards.isLoading && !cards.error && !cards.items.length && (
              <Empty title="Tu primera tarjeta te espera">
                Escanea el QR de un restaurante o abre su enlace para
                inscribirte en su programa.
              </Empty>
            )}
            <div className="customer-cards">
              {cards.items.map((card) => (
                <article key={card.id}>
                  <button
                    type="button"
                    className="card-open-button"
                    onClick={() => selectCard(card.id)}
                    aria-label={`Abrir ${card.program_name}`}
                  >
                    <LoyaltyCard
                      program={{ ...card, name: card.program_name }}
                      balance={card.balance}
                      compact
                    />
                    <span className="card-open-footer">
                      <span>{statusLabel(card.status)}</span>
                      <span>
                        Ver mi tarjeta
                        <ArrowRight size={17} />
                      </span>
                    </span>
                  </button>
                </article>
              ))}
            </div>
            <MoreButton {...cards} />
          </>
        )}
      </main>
      <Dialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        title="Tu cuenta"
        description="Actualiza los datos de tu perfil."
      >
        {profileOpen && <ProfileForm />}
      </Dialog>
    </div>
  );
}
function ProfileForm() {
  const profile = useResource<{
      full_name: string;
      phone: string | null;
      email: string;
    }>('/me'),
    action = useAction();
  const [saved, setSaved] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    try {
      await action.mutateAsync({
        path: '/me',
        method: 'PATCH',
        body: { full_name: data.get('name'), phone: data.get('phone') || null },
      });
      setSaved(true);
    } catch {}
  }
  if (profile.isLoading) return <Loading />;
  return (
    <form className="stack" onSubmit={submit}>
      <ErrorNotice error={profile.error || action.error} />
      {profile.data && (
        <>
          <Field label="Nombre completo">
            {(id) => (
              <Input
                id={id}
                name="name"
                defaultValue={profile.data.full_name}
                maxLength={255}
                required
              />
            )}
          </Field>
          <Field label="Teléfono (opcional)">
            {(id) => (
              <Input
                id={id}
                name="phone"
                type="tel"
                defaultValue={profile.data.phone ?? ''}
                maxLength={20}
              />
            )}
          </Field>
          <p className="muted">{profile.data.email}</p>
          <Button disabled={action.isPending} type="submit">
            Guardar datos
          </Button>
          {saved && <p role="status">Tus datos están actualizados.</p>}
        </>
      )}
    </form>
  );
}
function CardDetail({
  cardId,
  onBack,
}: {
  cardId: string;
  onBack: () => void;
}) {
  const details = useResource<Card>(`/me/cards/${cardId}`),
    qr = useResource<{ token: string }>(
      details.data?.status === 'active' ? `/me/cards/${cardId}/qr` : null,
    ),
    rewards = useCollection<Reward>(`/me/cards/${cardId}/rewards`),
    movements = useCollection<Movement>(`/me/cards/${cardId}/movements`);
  const rotate = useAction<{ token: string }>(),
    [rotateOpen, setRotateOpen] = useState(false),
    [closing, setClosing] = useState(false),
    [tab, setTab] = useState<'rewards' | 'history'>('rewards');
  const card = details.data;
  const appOrigin = useAppOrigin();
  async function rotateQr() {
    try {
      await rotate.mutateAsync({ path: `/me/cards/${cardId}/qr/rotate` });
      setRotateOpen(false);
    } catch {}
  }
  return (
    <>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={17} />
        Mis tarjetas
      </Button>
      <ErrorNotice error={details.error} retry={() => void details.refetch()} />
      {details.isLoading && <Loading />}
      {card && (
        <>
          <PageTitle
            title={card.program_name}
            description={
              card.status === 'active'
                ? 'Muestra tu código al comprar y deja que cada visita sume.'
                : 'Esta tarjeta está cerrada. Puedes consultar su historial.'
            }
          />
          <div className="customer-detail">
            <section className="stack">
              <LoyaltyCard
                program={{ ...card, name: card.program_name }}
                balance={card.balance}
                token={
                  qr.data?.token && appOrigin.origin
                    ? cardScanUrl(appOrigin.origin, {
                        token: qr.data.token,
                        restaurantId: card.restaurant_id,
                      })
                    : qr.data?.token
                }
              />
              {qr.isLoading && <Loading label="Cargando tu código…" />}
              <ErrorNotice
                error={appOrigin.error}
                retry={() => void appOrigin.refetch()}
              />
              {appOrigin.origin && !appOrigin.isPublic && (
                <p className="notice">
                  El enlace de esta tarjeta aún usa una dirección local. El
                  administrador debe configurar una URL pública HTTPS para
                  abrirlo desde otros dispositivos.
                </p>
              )}
              <ErrorNotice error={qr.error} retry={() => void qr.refetch()} />
              {qr.data && (
                <details className="token-details">
                  <summary>Mostrar código para copiar</summary>
                  <p className="field-hint">
                    Compártelo solo con personal de este restaurante.
                  </p>
                  <code>{qr.data.token}</code>
                </details>
              )}
              {card.status === 'active' && (
                <>
                  <Button variant="ghost" onClick={() => setRotateOpen(true)}>
                    <RefreshCw size={16} />
                    Renovar mi código
                  </Button>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() => setClosing(true)}
                  >
                    Solicitar cierre de esta tarjeta
                  </button>
                </>
              )}
            </section>
            <section className="stack">
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={tab === 'rewards'}
                  className={tab === 'rewards' ? 'selected' : ''}
                  onClick={() => setTab('rewards')}
                >
                  Mis premios
                </button>
                <button
                  type="button"
                  aria-pressed={tab === 'history'}
                  className={tab === 'history' ? 'selected' : ''}
                  onClick={() => setTab('history')}
                >
                  Mis movimientos
                </button>
              </div>
              {tab === 'rewards' ? (
                <>
                  <ErrorNotice error={rewards.error} />
                  {rewards.isLoading && <Loading />}
                  {!rewards.isLoading &&
                    !rewards.error &&
                    !rewards.items.length && (
                      <Empty title="Lo bueno está por llegar">
                        Sigue visitando este restaurante para conseguir tu
                        primer premio.
                      </Empty>
                    )}
                  <div className="entity-list">
                    {rewards.items.map((reward) => (
                      <article className="entity-row" key={reward.id}>
                        <div className="entity-icon">
                          <Gift size={22} />
                        </div>
                        <div className="entity-main">
                          <h3>{reward.description}</h3>
                          <span className={`badge badge-${reward.status}`}>
                            {statusLabel(reward.status)}
                          </span>
                          {reward.status === 'available' && (
                            <>
                              <p className="field-hint">
                                Pide al personal que registre la entrega.
                              </p>
                              <details>
                                <summary>Código del premio</summary>
                                <code>{reward.id}</code>
                              </details>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  <MoreButton {...rewards} />
                </>
              ) : (
                <>
                  <ErrorNotice error={movements.error} />
                  {movements.isLoading && <Loading />}
                  {!movements.isLoading &&
                    !movements.error &&
                    !movements.items.length && (
                      <p className="muted">Todavía no tienes movimientos.</p>
                    )}
                  <div className="entity-list">
                    {movements.items.map((movement) => (
                      <article className="entity-row" key={movement.id}>
                        <span className="movement-delta">
                          {movement.stamp_delta > 0 ? '+' : ''}
                          {movement.stamp_delta}
                        </span>
                        <div className="entity-main">
                          <h3>
                            {movement.stamp_delta > 0
                              ? 'Sellos recibidos'
                              : 'Ajuste de sellos'}
                          </h3>
                          <p className="muted">
                            {formatDate(movement.created_at)}
                          </p>
                          {movement.purchase_id && (
                            <details>
                              <summary>Código de compra</summary>
                              <code>{movement.purchase_id}</code>
                            </details>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  <MoreButton {...movements} />
                </>
              )}
            </section>
          </div>
        </>
      )}
      <Dialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title="Renovar tu código"
        description="El código anterior dejará de funcionar. Tu tarjeta, sellos y premios se conservan."
      >
        <div className="stack">
          <ErrorNotice error={rotate.error} />
          <Button disabled={rotate.isPending} onClick={() => void rotateQr()}>
            Generar un nuevo código
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={closing}
        onOpenChange={setClosing}
        title="Antes de cerrar tu tarjeta"
        description="Revisa los beneficios que perderás. El personal del restaurante completará el cierre después de tu confirmación."
      >
        {closing && <ClosureForm cardId={cardId} />}
      </Dialog>
    </>
  );
}
export function ClosureForm({ cardId }: { cardId: string }) {
  const preview = useResource<ClosurePreview>(
      `/me/cards/${cardId}/closure-preview`,
    ),
    action = useAction<{ id: string; expires_at: string }>(),
    revoke = useAction();
  const [consent, setConsent] = useState<{
      id: string;
      expires_at: string;
    } | null>(null),
    [accepted, setAccepted] = useState(false);
  async function confirm() {
    if (!preview.data) return;
    try {
      setConsent(
        await action.mutateAsync({
          path: `/me/cards/${cardId}/closure-consents`,
          body: {
            benefits_version: preview.data.benefits_version,
            accepted: true,
          },
        }),
      );
    } catch {}
  }
  async function undo() {
    if (!consent) return;
    try {
      await revoke.mutateAsync({
        path: `/me/cards/${cardId}/closure-consents/${consent.id}`,
        method: 'DELETE',
      });
      setConsent(null);
      setAccepted(false);
    } catch {}
  }
  return (
    <div className="stack">
      <ErrorNotice error={preview.error || action.error || revoke.error} />
      {preview.isLoading && <Loading />}
      {preview.data && (
        <>
          <div className="notice">
            <p>
              <strong>{preview.data.balance} sellos</strong> se anularán.
            </p>
            <p>
              <strong>{preview.data.rewards.length} premios disponibles</strong>{' '}
              se cancelarán.
            </p>
          </div>
          {consent ? (
            <>
              <p role="status">
                Confirmación registrada. Entrega este código al personal:
              </p>
              <code className="code-block">{consent.id}</code>
              <p className="field-hint">
                Válido hasta{' '}
                {new Date(consent.expires_at).toLocaleString('es-CO')}. Si tus
                beneficios cambian, tendrás que confirmar de nuevo.
              </p>
              <Button
                variant="secondary"
                disabled={revoke.isPending}
                onClick={() => void undo()}
              >
                Revocar mi confirmación
              </Button>
            </>
          ) : (
            <>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  Entiendo los beneficios que perderé y quiero cerrar esta
                  tarjeta.
                </span>
              </label>
              <Button
                variant="destructive"
                disabled={!accepted || action.isPending}
                onClick={() => void confirm()}
              >
                Confirmar mi decisión
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
