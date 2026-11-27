import { Camera, Check, Gift, QrCode, RefreshCw, ScanLine } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ErrorNotice, Field, PageTitle } from '../components/common';
import { LoyaltyCard } from '../components/loyalty-card';
import { QrCamera } from '../components/qr-camera';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAction } from '../lib/api';
import {
  clearPendingScan,
  parseCardScan,
  type ScanPurpose,
} from '../lib/card-qr';
import { useAppOrigin } from '../lib/public-config';
import type { ScanResult } from '../lib/types';

const lastLocationKey = 'loyalty:last-location';

function readLastLocation() {
  try {
    return localStorage.getItem(lastLocationKey) ?? '';
  } catch {
    return '';
  }
}

function friendlyError(error: unknown): Error | null {
  if (!error) return null;
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : '';
  if (code === 'CARD_QR_EXPIRED')
    return new Error(
      message ||
        'Este QR ya venció. Pide al cliente que abra su tarjeta para mostrar el QR actual.',
    );
  if (code === 'STAMP_COOLDOWN') return new Error(message);
  if (code === 'REWARD_ALREADY_REDEEMED' || /ya fue usado/i.test(message))
    return new Error('Este premio ya fue usado.');
  return error instanceof Error ? error : new Error('No pudimos completar.');
}

export function OperationsPanel({
  restaurantId,
  initialToken,
  initialPurpose = 'card',
  canManage: _canManage,
}: {
  restaurantId: string;
  initialToken?: string;
  initialPurpose?: ScanPurpose;
  canManage?: boolean;
}) {
  const appOrigin = useAppOrigin();
  const scanAction = useAction<ScanResult>();
  const purchaseAction = useAction<ScanResult>();
  const redeemAction = useAction<ScanResult>();
  const resendAction = useAction<{
    token: string;
    expires_at: string | null;
    whatsapp_url: string;
  }>();
  const [token, setToken] = useState(initialToken ?? '');
  const [purpose, setPurpose] = useState<ScanPurpose>(initialPurpose);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanError, setScanError] = useState<Error | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [reference, setReference] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [opError, setOpError] = useState<unknown>(null);
  const [chosenLocation, setChosenLocation] = useState(readLastLocation);
  const autoLookup = useRef(false);
  const lookupRef = useRef<(value: string, kind: ScanPurpose) => Promise<void>>(
    async () => {},
  );

  useEffect(() => {
    if (initialToken && !autoLookup.current) {
      autoLookup.current = true;
      void lookupRef.current(initialToken, initialPurpose);
    }
  }, [initialToken, initialPurpose]);

  async function lookupValue(value: string, kind: ScanPurpose = purpose) {
    if (scanAction.isPending || purchaseAction.isPending) return;
    const parsed = parseCardScan(
      value,
      window.location.origin,
      restaurantId,
      appOrigin.origin,
      kind,
    );
    setScanError(null);
    setOpError(null);
    setResult(null);
    setMessage('');
    setWhatsapp('');
    setConfirm(false);
    if (!parsed) {
      setScanError(new Error('Escanea o pega un código válido.'));
      return;
    }
    const resolved = parsed.purpose ?? kind;
    setToken(parsed.token);
    setPurpose(resolved);
    try {
      const scanned = await scanAction.mutateAsync({
        path: '/operator/scans',
        body: {
          restaurant_id: restaurantId,
          token: parsed.token,
          purpose: resolved,
        },
      });
      setResult(scanned);
      clearPendingScan();
    } catch {
      setResult(null);
    }
  }
  lookupRef.current = lookupValue;

  const locations = result?.locations ?? [];
  const locationId =
    locations.length === 1
      ? locations[0].id
      : locations.some((item) => item.id === chosenLocation)
        ? chosenLocation
        : '';

  async function purchase(event: FormEvent) {
    event.preventDefault();
    if (!result || purchaseAction.isPending) return;
    if (locations.length > 1 && !locationId) return;
    setMessage('');
    setOpError(null);
    try {
      const next = await purchaseAction.mutateAsync({
        path: '/operator/purchases',
        body: {
          restaurant_id: restaurantId,
          token,
          ...(reference.trim() ? { sale_reference: reference.trim() } : {}),
          ...(locationId ? { location_id: locationId } : {}),
        },
      });
      setResult({
        card: next.card,
        phone_masked: result.phone_masked,
        locations: result.locations,
        reward: (() => {
          const available = next.card.rewards.find(
            (item) => item.status === 'available',
          );
          return available
            ? {
                id: available.id,
                description: available.description,
                status: available.status,
                voucher_token: available.voucher?.token ?? null,
              }
            : null;
        })(),
        allowed_actions: next.card.rewards.some(
          (item) => item.status === 'available',
        )
          ? ['purchase', 'redeem']
          : ['purchase'],
      });
      setReference('');
      setMessage(
        next.card.rewards.some((item) => item.status === 'available')
          ? 'Compra registrada. Hay un premio disponible.'
          : 'Compra registrada. Se sumó un sello.',
      );
    } catch (error) {
      setOpError(error);
    }
  }

  async function redeem(event: FormEvent) {
    event.preventDefault();
    if (!result || !confirm || redeemAction.isPending) return;
    setMessage('');
    setOpError(null);
    try {
      const next = await redeemAction.mutateAsync({
        path: '/operator/redemptions',
        body: {
          restaurant_id: restaurantId,
          token,
          confirm: true,
          ...(locationId ? { location_id: locationId } : {}),
        },
      });
      setResult({
        card: next.card,
        phone_masked: result.phone_masked,
        locations: result.locations,
        reward: null,
        allowed_actions: ['purchase'],
      });
      setConfirm(false);
      setMessage(
        `Premio canjeado: ${result.reward?.description ?? 'entregado'}`,
      );
    } catch (error) {
      setOpError(error);
    }
  }

  async function resend() {
    const reward = result?.reward;
    if (!reward || resendAction.isPending) return;
    try {
      const sent = await resendAction.mutateAsync({
        path: `/operator/rewards/${reward.id}/resend`,
        body: { restaurant_id: restaurantId },
      });
      setWhatsapp(sent.whatsapp_url);
      setMessage('Preparamos el enlace de WhatsApp. Ábrelo para enviarlo.');
    } catch {}
  }

  async function refresh() {
    if (!token) return;
    try {
      setResult(
        await scanAction.mutateAsync({
          path: '/operator/scans',
          body: { restaurant_id: restaurantId, token, purpose },
        }),
      );
    } catch {}
  }

  const card = result?.card;
  const purchaseAllowed =
    result?.allowed_actions?.includes('purchase') ?? false;
  const redeemAllowed = result?.allowed_actions?.includes('redeem') ?? false;
  return (
    <>
      <PageTitle
        title={
          purpose === 'reward' ? 'Entrega del premio' : 'Una visita, un sello'
        }
        description={
          purpose === 'reward'
            ? 'Revisa el premio, confirma la entrega y comienza el siguiente ciclo.'
            : 'Escanea el QR de la tarjeta del cliente y registra su compra.'
        }
      />
      <div className="button-row">
        <Button
          variant="secondary"
          onClick={() => setCameraOpen(true)}
          disabled={cameraOpen || scanAction.isPending}
        >
          <Camera size={18} /> Escanear con cámara
        </Button>
        <Button
          variant="ghost"
          onClick={() => void refresh()}
          disabled={!token || scanAction.isPending}
        >
          <RefreshCw size={16} /> Actualizar
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
      <form
        className="scan-form panel"
        onSubmit={(event) => {
          event.preventDefault();
          void lookupValue(token);
        }}
      >
        <div className="scan-symbol">
          <ScanLine size={27} />
        </div>
        <Field
          label="Código o enlace del QR"
          hint="Usa la cámara, tu lector o pega el código que muestra el cliente."
        >
          {(id) => (
            <Input
              id={id}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Código del QR"
              autoComplete="off"
              disabled={scanAction.isPending}
              required
              maxLength={2048}
            />
          )}
        </Field>
        <Field label="Tipo de código">
          {(id) => (
            <select
              id={id}
              className="input"
              value={purpose}
              onChange={(event) =>
                setPurpose(event.target.value as ScanPurpose)
              }
            >
              <option value="card">Tarjeta del cliente</option>
              <option value="reward">Comprobante de premio</option>
            </select>
          )}
        </Field>
        <Button disabled={scanAction.isPending} type="submit">
          <QrCode size={18} />
          {scanAction.isPending ? 'Buscando…' : 'Abrir tarjeta'}
        </Button>
      </form>
      <ErrorNotice
        error={
          scanError ||
          friendlyError(
            scanAction.error ||
              opError ||
              purchaseAction.error ||
              redeemAction.error,
          ) ||
          resendAction.error
        }
      />
      {message && (
        <p className="notice notice-success" role="status">
          <Check size={20} />
          {message}
        </p>
      )}
      {whatsapp && (
        <p className="notice stack" role="status">
          <span>El mensaje no se envía solo. Abre WhatsApp para enviarlo.</span>
          <a href={whatsapp} target="_blank" rel="noreferrer">
            Abrir WhatsApp con el enlace del premio
          </a>
        </p>
      )}
      {card && (
        <div className="operations-layout">
          <section className="stack">
            <LoyaltyCard
              program={{ ...card.program, name: card.program_name }}
              balance={card.cycle?.stamps ?? 0}
              compact
            />
            <div className="section-heading">
              <div>
                <h2>{card.restaurant_name}</h2>
                <p className="muted">{result.phone_masked}</p>
              </div>
              <span className="badge">
                {card.cycle?.stamps ?? 0}/{card.cycle?.target ?? card.target}{' '}
                sellos
              </span>
            </div>
            <p className="field-hint">
              Estado del ciclo: {card.cycle?.state ?? 'sin ciclo'}. La tarjeta
              del cliente se actualiza sola al confirmar la operación.
            </p>
          </section>
          <section className="stack">
            {purchaseAllowed && (
              <form
                className="panel stack"
                onSubmit={(event) => void purchase(event)}
              >
                <div className="purchase-rule">
                  <span>+1</span>
                  <div>
                    <strong>Un sello por compra</strong>
                    <p>El backend fija la cantidad; no se puede editar.</p>
                  </div>
                </div>
                {locations.length === 1 && <p>Sucursal: {locations[0].name}</p>}
                {locations.length > 1 && (
                  <Field label="Sucursal">
                    {(id) => (
                      <select
                        id={id}
                        className="input"
                        value={locationId}
                        required
                        onChange={(event) => {
                          setChosenLocation(event.target.value);
                          try {
                            localStorage.setItem(
                              lastLocationKey,
                              event.target.value,
                            );
                          } catch {}
                        }}
                      >
                        <option value="" disabled>
                          Elige la sucursal
                        </option>
                        {locations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
                <Field
                  label="Referencia del ticket (opcional)"
                  hint="Número de recibo o factura. Si la escribes, no se puede repetir en este restaurante."
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      maxLength={100}
                      placeholder="Ej. FACT-1042"
                    />
                  )}
                </Field>
                <Button
                  className="w-full"
                  disabled={
                    purchaseAction.isPending ||
                    (locations.length > 1 && !locationId)
                  }
                  type="submit"
                >
                  {purchaseAction.isPending
                    ? 'Registrando…'
                    : 'Registrar compra · +1 sello'}
                </Button>
              </form>
            )}
            {redeemAllowed && result?.reward && (
              <form
                className="panel stack"
                onSubmit={(event) => void redeem(event)}
              >
                <div className="purchase-rule">
                  <span>
                    <Gift size={20} />
                  </span>
                  <div>
                    <strong>{result.reward.description}</strong>
                    <p>Entrega solo si el cliente muestra el QR de canje.</p>
                  </div>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(event) => setConfirm(event.target.checked)}
                  />
                  <span>Confirmo que entregué el premio al cliente.</span>
                </label>
                <Button
                  disabled={!confirm || redeemAction.isPending}
                  type="submit"
                >
                  {redeemAction.isPending
                    ? 'Entregando…'
                    : 'Confirmar entrega y reiniciar ciclo'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={resendAction.isPending}
                  onClick={() => void resend()}
                >
                  Preparar envío por WhatsApp
                </Button>
              </form>
            )}
            {!purchaseAllowed && !redeemAllowed && (
              <p className="notice" role="status">
                Esta tarjeta no permite operaciones en su estado actual.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
