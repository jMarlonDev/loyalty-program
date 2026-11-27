import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../application/errors.js';

/**
 * QR-ROTATE-001 (D-06): QR personal del cliente con token firmado HMAC que
 * cambia cada 60 s. Se acepta la ventana actual y la anterior (entre 60 y
 * 120 s de vida), así que una captura de pantalla vieja deja de servir.
 * Formato: `c1` + base64url(card_id[16] | ventana[4] | mac[16]) = 50 chars.
 */
export const CARD_QR_WINDOW_SECONDS = 60;
const PREFIX = 'c1';
const PATTERN = /^c1[A-Za-z0-9_-]{48}$/;

function uuidBytes(id: string): Buffer {
  return Buffer.from(id.replace(/-/g, ''), 'hex');
}
function uuidOf(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isRotatingCardToken(value: unknown): value is string {
  return typeof value === 'string' && PATTERN.test(value);
}

export function requireCardQrToken(value: unknown): string {
  if (!isRotatingCardToken(value))
    throw new AppError(
      400,
      'INVALID_INPUT',
      'El código de la tarjeta no es válido. Pide al cliente que muestre su QR actualizado.',
    );
  return value;
}

export function createCardQr(encryptionKeyHex: string) {
  const key = createHmac('sha256', Buffer.from(encryptionKeyHex, 'hex'))
    .update('loyalty:card-qr:v1')
    .digest();
  const mac = (payload: Buffer) =>
    createHmac('sha256', key).update(payload).digest().subarray(0, 16);
  const windowOf = (now: Date) =>
    Math.floor(now.getTime() / 1000 / CARD_QR_WINDOW_SECONDS);

  return {
    issue(cardId: string, now: Date) {
      const window = windowOf(now);
      const payload = Buffer.alloc(20);
      uuidBytes(cardId).copy(payload, 0);
      payload.writeUInt32BE(window, 16);
      const token = `${PREFIX}${Buffer.concat([payload, mac(payload)]).toString('base64url')}`;
      const rotatesAt = new Date((window + 1) * CARD_QR_WINDOW_SECONDS * 1000);
      return {
        token,
        rotates_at: rotatesAt.toISOString(),
        expires_at: new Date(
          rotatesAt.getTime() + CARD_QR_WINDOW_SECONDS * 1000,
        ).toISOString(),
      };
    },
    /** Devuelve el card_id si la firma es válida y la ventana sigue vigente. */
    verify(token: string, now: Date): string | null {
      if (!isRotatingCardToken(token)) return null;
      const raw = Buffer.from(token.slice(PREFIX.length), 'base64url');
      if (raw.length !== 36) return null;
      const payload = raw.subarray(0, 20);
      const expected = mac(payload);
      const given = raw.subarray(20);
      if (!timingSafeEqual(expected, given)) return null;
      const window = payload.readUInt32BE(16);
      const current = windowOf(now);
      if (window !== current && window !== current - 1) return null;
      return uuidOf(payload.subarray(0, 16));
    },
  };
}
