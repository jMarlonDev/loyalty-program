import { Camera, Check, Gift, QrCode, RotateCcw, ScanLine } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Empty, ErrorNotice, Field, PageTitle } from '../components/common';
import { LoyaltyCard } from '../components/loyalty-card';
import { QrCamera } from '../components/qr-camera';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useAction, useCollection } from '../lib/api';
import { cardScanUrl, clearPendingScan, parseCardScan } from '../lib/card-qr';
import type { LoyaltyCard as Card, Location, Reward } from '../lib/types';
import { purchasePayload } from './forms';

type ResolvedCard = Card & {
  customer_name?: string;
  customer_email?: string;
  available_rewards?: Reward[];
};
export function OperationsPanel({
  restaurantId,
  canManage,
  initialToken,
}: {
  restaurantId: string;
  canManage: boolean;
  initialToken?: string;
}) {
  const locations = useCollection<Location>(
      `/restaurants/${restaurantId}/locations`,
    ),
    resolve = useAction<ResolvedCard>(),
    action = useAction<Record<string, unknown>>();
  const [token, setToken] = useState(initialToken ?? ''),
    [cameraOpen, setCameraOpen] = useState(false),
    [scanError, setScanError] = useState<Error | null>(null),
    [card, setCard] = useState<ResolvedCard | null>(null),
    [location, setLocation] = useState(''),
    [reference, setReference] = useState(''),
    [reward, setReward] = useState(''),
    [purchase, setPurchase] = useState(''),
    [reason, setReason] = useState(''),
    [consent, setConsent] = useState(''),
    [mode, setMode] = useState<'purchase' | 'redeem' | 'reverse'>('purchase'),
    [message, setMessage] = useState(''),
    [closeOpen, setCloseOpen] = useState(false),
    [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const selectedLocation =
    location ||
    locations.items.find((item) => item.status === 'active')?.id ||
    '';
  const autoLookup = useRef(false);
  const lookupRef = useRef<(value: string) => Promise<void>>(async () => {});
  useEffect(() => {
    if (initialToken && !autoLookup.current) {
      autoLookup.current = true;
      void lookupRef.current(initialToken);
    }
  }, [initialToken]);
  async function lookupValue(value: string) {
    if (resolve.isPending || action.isPending) return;
    const scan = parseCardScan(value, window.location.origin, restaurantId);
    setScanError(null);
    setCard(null);
    if (!scan) {
      setScanError(new Error('Escanea o pega un código de tarjeta válido.'));
      return;
    }
    if (scan.restaurantId.toLowerCase() !== restaurantId.toLowerCase()) {
      window.location.assign(cardScanUrl(window.location.origin, scan));
      return;
    }
    setToken(scan.token);
    setMode('purchase');
    setMessage('');
    setReceipt(null);
    setReward('');
    setPurchase('');
    setConsent('');
    setReference('');
    setReason('');
    action.reset();
    try {
      const result = await resolve.mutateAsync({
        path: `/restaurants/${restaurantId}/cards/resolve`,
        body: { token: scan.token },
      });
      setCard(result);
      clearPendingScan();
    } catch {
      setCard(null);
    }
  }
  lookupRef.current = lookupValue;
  async function lookup(event: FormEvent) {
    event.preventDefault();
    await lookupValue(token);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!card || resolve.isPending || action.isPending) return;
    setMessage('');
    try {
      const result = await action.mutateAsync(
        mode === 'purchase'
          ? {
              path: `/restaurants/${restaurantId}/purchases`,
              body: purchasePayload(card.id, selectedLocation, reference),
            }
          : mode === 'redeem'
            ? {
                path: `/restaurants/${restaurantId}/rewards/${reward}/redeem`,
                body: { location_id: selectedLocation },
              }
            : {
                path: `/restaurants/${restaurantId}/purchases/${purchase}/reverse`,
                body: { reason },
              },
      );
      setReceipt(result);
      setMessage(
        mode === 'purchase'
          ? 'Compra registrada. Se ha sumado un sello.'
          : mode === 'redeem'
            ? 'Premio entregado. No se han descontado sellos adicionales.'
            : 'Compra revertida. El historial original se conserva.',
      );
      setReference('');
      setReason('');
      const refreshed = await resolve.mutateAsync({
        path: `/restaurants/${restaurantId}/cards/resolve`,
        body: { token: token.trim() },
      });
      setCard(refreshed);
    } catch {}
  }
  async function closeCard() {
    if (!card) return;
    try {
      await action.mutateAsync({
        path: `/restaurants/${restaurantId}/cards/${card.id}/close`,
        body: { consent_id: consent },
      });
      setCard(null);
      setCloseOpen(false);
      setMessage('Tarjeta cerrada con el consentimiento del cliente.');
    } catch {}
  }
  return (
    <>
      <PageTitle
        title="Una visita, un sello"
        description="Abre la tarjeta de tu cliente para registrar su compra o entregar un premio."
      />
      <div className="button-row">
        <Button
          variant="secondary"
          onClick={() => setCameraOpen(true)}
          disabled={cameraOpen || resolve.isPending || action.isPending}
        >
          <Camera size={18} /> Escanear con cámara
        </Button>
      </div>
      {cameraOpen && (
        <QrCamera
          onClose={() => setCameraOpen(false)}
          onRead={(value) => {
            setCameraOpen(false);
            void lookupValue(value);
          }}
        />
      )}
      <form className="scan-form panel" onSubmit={lookup}>
        <div className="scan-symbol">
          <ScanLine size={27} />
        </div>
        <Field
          label="Código de la tarjeta"
          hint="Usa la cámara, tu lector o pega el código o enlace que muestra el cliente."
        >
          {(id) => (
            <Input
              id={id}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Código del QR personal"
              autoComplete="off"
              disabled={resolve.isPending || action.isPending}
              required
              maxLength={2048}
            />
          )}
        </Field>
        <Button disabled={resolve.isPending || action.isPending} type="submit">
          <QrCode size={18} />
          {resolve.isPending ? 'Buscando…' : 'Abrir tarjeta'}
        </Button>
      </form>
      <ErrorNotice error={scanError || resolve.error || locations.error} />
      {message && (
        <p className="notice notice-success" role="status">
          <Check size={20} />
          {message}
        </p>
      )}
      {card ? (
        <div className="operations-layout">
          <section className="stack">
            <div className="section-heading">
              <div>
                <h2>{card.customer_name || 'Tarjeta del cliente'}</h2>
                {card.customer_email && (
                  <p className="muted">{card.customer_email}</p>
                )}
              </div>
              <span className="badge">{card.balance} sellos</span>
            </div>
            <fieldset className="segmented" aria-label="Operación">
              {(
                [
                  { id: 'purchase', name: 'Registrar compra' },
                  { id: 'redeem', name: 'Entregar premio' },
                  ...(canManage
                    ? [{ id: 'reverse', name: 'Revertir compra' }]
                    : []),
                ] as const
              ).map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  aria-pressed={mode === tab.id}
                  className={mode === tab.id ? 'selected' : ''}
                  onClick={() => {
                    setMode(tab.id as typeof mode);
                    action.reset();
                    setMessage('');
                  }}
                >
                  {tab.name}
                </button>
              ))}
            </fieldset>
            <form className="panel stack" onSubmit={submit}>
              {mode !== 'reverse' && (
                <Field label="Sucursal de la operación">
                  {(id) => (
                    <select
                      id={id}
                      className="input"
                      value={selectedLocation}
                      onChange={(e) => setLocation(e.target.value)}
                      required
                    >
                      <option value="">Selecciona una sucursal</option>
                      {locations.items
                        .filter((item) => item.status === 'active')
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  )}
                </Field>
              )}
              {locations.hasNextPage && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void locations.fetchNextPage()}
                >
                  Cargar más sucursales
                </Button>
              )}
              {mode === 'purchase' ? (
                <>
                  <div className="purchase-rule">
                    <span>+1</span>
                    <div>
                      <strong>Un sello por compra</strong>
                      <p>
                        El premio se genera automáticamente al completar la
                        meta.
                      </p>
                    </div>
                  </div>
                  <Field
                    label="Referencia única de venta"
                    hint="Usa el número de recibo o factura. No se puede repetir en esta sucursal."
                  >
                    {(id) => (
                      <Input
                        id={id}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        required
                        maxLength={100}
                        placeholder="Ej. FACT-1042"
                      />
                    )}
                  </Field>
                </>
              ) : mode === 'redeem' ? (
                <>
                  {card.available_rewards ? (
                    card.available_rewards.length ? (
                      <Field label="Premio disponible">
                        {(id) => (
                          <select
                            id={id}
                            className="input"
                            value={reward}
                            onChange={(e) => setReward(e.target.value)}
                            required
                          >
                            <option value="">Selecciona el premio</option>
                            {card.available_rewards?.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.description}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    ) : (
                      <p className="muted">
                        Esta tarjeta aún no tiene premios disponibles.
                      </p>
                    )
                  ) : (
                    <Field
                      label="Código del premio"
                      hint="El cliente puede encontrarlo en los premios de su tarjeta."
                    >
                      {(id) => (
                        <Input
                          id={id}
                          value={reward}
                          onChange={(e) => setReward(e.target.value)}
                          required
                          placeholder="Identificador del premio"
                        />
                      )}
                    </Field>
                  )}
                  <p className="field-hint">
                    Confirma la entrega física antes de registrar el canje.
                  </p>
                </>
              ) : (
                <>
                  <Field label="Código de compra">
                    {(id) => (
                      <Input
                        id={id}
                        value={purchase}
                        onChange={(e) => setPurchase(e.target.value)}
                        required
                        placeholder="Identificador de la compra registrada"
                      />
                    )}
                  </Field>
                  <Field label="Motivo de la reversión">
                    {(id) => (
                      <Input
                        id={id}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                        maxLength={500}
                      />
                    )}
                  </Field>
                  <p className="field-hint">
                    No puedes revertir una compra que haya generado un premio ya
                    entregado.
                  </p>
                </>
              )}
              <ErrorNotice error={action.error} />
              <Button
                disabled={
                  action.isPending ||
                  resolve.isPending ||
                  (mode !== 'reverse' && !selectedLocation) ||
                  (mode === 'redeem' && card.available_rewards?.length === 0)
                }
                type="submit"
              >
                {action.isPending
                  ? 'Guardando…'
                  : mode === 'purchase'
                    ? 'Registrar compra y sumar un sello'
                    : mode === 'redeem'
                      ? 'Confirmar entrega del premio'
                      : 'Revertir compra'}
                {mode === 'redeem' ? (
                  <Gift size={17} />
                ) : mode === 'reverse' ? (
                  <RotateCcw size={17} />
                ) : (
                  <Check size={17} />
                )}
              </Button>
            </form>
            {receipt && (
              <div className="notice receipt-detail">
                <strong>Comprobante de operación</strong>
                {Object.entries(receipt)
                  .filter(
                    ([key, value]) =>
                      ['purchase_id', 'reward_id', 'balance'].includes(key) &&
                      ['string', 'number'].includes(typeof value),
                  )
                  .map(([key, value]) => (
                    <p key={key}>
                      {key === 'purchase_id'
                        ? 'Compra'
                        : key === 'reward_id'
                          ? 'Premio'
                          : 'Saldo'}
                      : <code>{String(value)}</code>
                    </p>
                  ))}
              </div>
            )}
            <button
              type="button"
              className="danger-link"
              onClick={() => setCloseOpen(true)}
            >
              Cerrar tarjeta con autorización del cliente
            </button>
          </section>
          <aside className="preview-column">
            <LoyaltyCard
              program={{ ...card, name: card.program_name }}
              balance={card.balance}
            />
            <p className="field-hint">
              El QR de esta tarjeta pertenece al cliente. No lo compartas.
            </p>
          </aside>
        </div>
      ) : (
        !resolve.isPending && (
          <Empty title="Listos para la próxima visita">
            El código de la tarjeta identifica al cliente dentro de este
            restaurante.
          </Empty>
        )
      )}
      <Dialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Cerrar la tarjeta"
        description="El cliente debe haber confirmado el cierre desde su cuenta. Se anulan el saldo y los premios pendientes; el historial se conserva."
      >
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void closeCard();
          }}
        >
          <Field label="Código de consentimiento del cliente">
            {(id) => (
              <Input
                id={id}
                value={consent}
                onChange={(e) => setConsent(e.target.value)}
                required
              />
            )}
          </Field>
          <ErrorNotice error={action.error} />
          <Button
            type="submit"
            variant="destructive"
            disabled={action.isPending}
          >
            Confirmar cierre autorizado
          </Button>
        </form>
      </Dialog>
    </>
  );
}
