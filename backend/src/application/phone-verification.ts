/**
 * NEXT-006: verificación de posesión del teléfono, PREPARADA Y DESACTIVADA.
 *
 * Hoy el alta es directa por teléfono (D-01) y la recuperación ante cambio de
 * celular se hace en el local mediante transferencia (QR de un solo uso).
 * Cuando haya proveedor SMS/WhatsApp, implementar `PhoneVerifier`, activarlo
 * con `PHONE_VERIFICATION=sms|whatsapp` y exigir `verify()` antes de
 * `enrollByPhone` y como vía de recuperación sin pasar por el local.
 */
export type PhoneVerificationChannel = 'disabled' | 'sms' | 'whatsapp';

export interface PhoneVerifier {
  readonly channel: PhoneVerificationChannel;
  readonly enabled: boolean;
  /** Envía un código al teléfono E.164. Nunca registrar el código. */
  send(phoneE164: string): Promise<{ challenge_id: string }>;
  /** Comprueba el código; debe consumirse una sola vez y con límite de intentos. */
  verify(challengeId: string, code: string): Promise<boolean>;
}

export const disabledPhoneVerifier: PhoneVerifier = {
  channel: 'disabled',
  enabled: false,
  async send() {
    throw new Error('La verificación telefónica no está activada.');
  },
  async verify() {
    throw new Error('La verificación telefónica no está activada.');
  },
};

export function phoneVerificationChannel(
  value: string | undefined,
): PhoneVerificationChannel {
  if (value === undefined || value === '' || value === 'disabled')
    return 'disabled';
  if (value === 'sms' || value === 'whatsapp')
    // Hasta integrar el proveedor, cualquier canal pedido queda desactivado.
    return 'disabled';
  throw new Error('PHONE_VERIFICATION debe ser disabled, sms o whatsapp.');
}
