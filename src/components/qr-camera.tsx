import { useEffect, useRef, useState } from 'react';
import { ErrorNotice } from './common';
import { Button } from './ui/button';

export function QrCamera({
  onRead,
  onClose,
}: {
  onRead: (value: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [ready, setReady] = useState(false);
  const read = useRef(onRead);
  const close = useRef(onClose);
  read.current = onRead;
  close.current = onClose;
  useEffect(() => {
    let disposed = false;
    let controls: { stop: () => void } | undefined;
    let stream: MediaStream | undefined;
    const stop = () => {
      disposed = true;
      controls?.stop();
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
    const visibility = () => {
      if (document.hidden) {
        stop();
        close.current();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('unavailable');
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (disposed) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (disposed || !video.current) {
          stop();
          return;
        }
        controls = await new BrowserQRCodeReader().decodeFromStream(
          stream,
          video.current,
          (result, _error, currentControls) => {
            if (disposed || !result) return;
            currentControls.stop();
            stop();
            read.current(result.getText());
          },
        );
        if (disposed) controls.stop();
        else setReady(true);
      } catch (cause) {
        if (disposed) return;
        stop();
        const denied =
          typeof cause === 'object' &&
          cause !== null &&
          'name' in cause &&
          cause.name === 'NotAllowedError';
        setError(
          new Error(
            denied
              ? 'Permite el acceso a la cámara en tu navegador o pega el código de la tarjeta.'
              : 'No pudimos abrir la cámara. Usa una conexión HTTPS y una cámara disponible, o pega el código de la tarjeta.',
          ),
        );
      }
    }
    void start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return (
    <section className="panel stack" aria-label="Escáner de tarjetas">
      <h2>Escanea la tarjeta del cliente</h2>
      <p className="muted">
        Enfoca el QR. Después podrás revisar la compra y agregar el sello.
      </p>
      {!error && (
        <>
          <video
            ref={video}
            muted
            playsInline
            autoPlay
            aria-label="Vista de la cámara para escanear QR"
            style={{
              width: '100%',
              maxHeight: 360,
              objectFit: 'cover',
              borderRadius: 12,
            }}
          />
          <p role="status">
            {ready ? 'Buscando un código QR…' : 'Abriendo la cámara…'}
          </p>
        </>
      )}
      <ErrorNotice error={error} />
      <Button variant="secondary" onClick={onClose}>
        Cerrar cámara
      </Button>
    </section>
  );
}
