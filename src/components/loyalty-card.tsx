import { Check, Gift, QrCode, Star, Ticket } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import type { Program } from '../lib/types';
import { ErrorNotice } from './common';
import { Button } from './ui/button';
export const exampleProgram: Program = {
  id: 'example',
  name: 'Club Vuelta',
  description: 'Cada compra suma una nueva oportunidad de volver.',
  stamps_required: 8,
  reward_description: 'Una recompensa especial',
  logo_url: null,
  background_color: '#22346B',
  text_color: '#FFFFFF',
  card_message: 'Lo bueno es que vuelves.',
  status: 'active',
  public_code: '',
};
export function LoyaltyCard({
  program,
  balance = 0,
  token,
  example = false,
  compact = false,
}: {
  program: Partial<Program>;
  balance?: number;
  token?: string;
  example?: boolean;
  compact?: boolean;
}) {
  const goal = program.stamps_required ?? 0;
  const shown = Math.min(goal, 20);
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  return (
    <article
      className={`loyalty-card${compact ? ' loyalty-card-compact' : ''}`}
      style={{
        backgroundColor: program.background_color ?? '#22346B',
        color: program.text_color ?? '#FFFFFF',
      }}
      aria-label={`Tarjeta ${program.name ?? ''}`}
    >
      <div className="loyalty-card-heading">
        <div>
          {program.logo_url && brokenLogo !== program.logo_url ? (
            <img
              className="card-logo"
              src={program.logo_url}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setBrokenLogo(program.logo_url ?? null)}
            />
          ) : (
            <Ticket size={28} strokeWidth={1.5} />
          )}
          <h2>{program.name || 'Nombre de tu tarjeta'}</h2>
        </div>
        <span className="card-stamp-label">
          SELLOS
          <strong>
            {balance}
            <span> / {goal || '—'}</span>
          </strong>
        </span>
      </div>
      <div
        className="stamp-grid"
        role="img"
        aria-label={`${balance} de ${goal} sellos`}
      >
        {Array.from({ length: shown }, (_, index) => index + 1).map((slot) => (
          <span
            key={`stamp-${slot}`}
            className={`stamp ${slot <= balance ? 'stamp-filled' : ''}`}
            aria-hidden="true"
          >
            {slot <= balance ? (
              <Check size={20} strokeWidth={3} />
            ) : slot === goal ? (
              <Gift size={18} />
            ) : (
              <Star size={17} />
            )}
          </span>
        ))}
      </div>
      {goal > 20 && (
        <p className="card-message">
          {balance} de {goal} sellos
        </p>
      )}
      <div className="card-reward">
        <span>Tu próxima recompensa</span>
        <strong>{program.reward_description || 'Una razón para volver'}</strong>
      </div>
      {!compact && (
        <>
          <p className="card-message">
            {program.card_message || 'Cada compra, un poco más cerca.'}
          </p>
          {token && (
            <div className="card-qr" style={{ width: 'min(100%, 216px)' }}>
              <QRCodeSVG
                value={token}
                size={192}
                marginSize={4}
                level="M"
                title="Código de tu tarjeta para el personal"
                aria-label="QR de tu tarjeta"
              />
              <span>Muestra este QR al comprar</span>
            </div>
          )}
        </>
      )}
      {example && (
        <span className="example-label">
          Tarjeta de ejemplo · sin valor comercial
        </span>
      )}
    </article>
  );
}
export function ShareQr({
  value,
  title = 'Comparte tu programa',
  description = 'Tus clientes escanean el QR y se inscriben desde su celular.',
}: {
  value: string;
  title?: string;
  description?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState(''),
    [error, setError] = useState<unknown>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Enlace copiado.');
      setError(null);
    } catch {
      setError(new Error('No pudimos copiarlo. Selecciona y copia el enlace.'));
    }
  };
  const download = () => {
    const svg = container.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lealtad-qr.svg';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="share-qr">
      <div ref={container} className="share-qr-image">
        <QRCodeSVG
          value={value}
          size={160}
          marginSize={4}
          level="M"
          title={title}
        />
      </div>
      <div className="stack">
        <h2>{title}</h2>
        <p className="muted">{description}</p>
        <a className="share-link" href={value}>
          {value}
        </a>
        <div className="button-row">
          <Button variant="secondary" onClick={() => void copy()}>
            Copiar enlace
          </Button>
          <Button variant="secondary" onClick={download}>
            <QrCode size={17} />
            Descargar QR
          </Button>
        </div>
        <span role="status">{message}</span>
        <ErrorNotice error={error} />
      </div>
    </section>
  );
}
