import { AppError } from './errors.js';

const dialCodes: Record<string, string> = {
  AR: '54',
  BO: '591',
  BR: '55',
  CA: '1',
  CL: '56',
  CO: '57',
  CR: '506',
  DO: '1',
  EC: '593',
  ES: '34',
  GT: '502',
  HN: '504',
  MX: '52',
  NI: '505',
  PA: '507',
  PE: '51',
  PY: '595',
  SV: '503',
  US: '1',
  UY: '598',
  VE: '58',
};
const nationalLengths: Record<string, number[]> = {
  AR: [10],
  BO: [8],
  BR: [10, 11],
  CA: [10],
  CL: [9],
  CO: [10],
  CR: [8],
  DO: [10],
  EC: [9],
  ES: [9],
  GT: [8],
  HN: [8],
  MX: [10],
  NI: [8],
  PA: [7, 8],
  PE: [9],
  PY: [9],
  SV: [8],
  US: [10],
  UY: [8],
  VE: [10],
};

export function normalizePhone(value: unknown, country: unknown): string {
  if (typeof country !== 'string')
    throw new AppError(
      400,
      'INVALID_PHONE',
      'Selecciona el país del teléfono.',
    );
  const code = country.toUpperCase();
  const dial = dialCodes[code];
  if (!dial)
    throw new AppError(400, 'INVALID_PHONE', 'País de teléfono no admitido.');
  if (typeof value !== 'string')
    throw new AppError(400, 'INVALID_PHONE', 'Escribe tu teléfono.');
  const raw = value.trim();
  if (!raw || raw.length > 32 || !/^[+()\d\s.-]+$/.test(raw))
    throw new AppError(400, 'INVALID_PHONE', 'El teléfono no es válido.');
  let digits = raw.replace(/\D/g, '');
  if (!digits)
    throw new AppError(400, 'INVALID_PHONE', 'El teléfono no es válido.');
  if (raw.startsWith('+')) {
    // Explicit international input already includes its country code.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else {
    digits = digits.replace(/^0+/, '');
    const expected = nationalLengths[code];
    if (expected && !expected.includes(digits.length))
      throw new AppError(
        400,
        'INVALID_PHONE',
        'El teléfono no tiene la longitud esperada para el país.',
      );
    digits = `${dial}${digits}`;
  }
  if (!/^[1-9]\d{6,14}$/.test(digits))
    throw new AppError(400, 'INVALID_PHONE', 'El teléfono no es válido.');
  return `+${digits}`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone.replace(/\d(?=\d{2})/g, '•');
  return `${phone.slice(0, 3)} •••• ${phone.slice(-4)}`;
}

export function requireNextUuid(
  value: unknown,
  message = 'Identificador inválido.',
): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new AppError(400, 'INVALID_INPUT', message);
  return value;
}

export function requireToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new AppError(400, 'INVALID_INPUT', 'El código no es válido.');
  return value;
}

export function requireEmail(value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  const email = value.trim().toLowerCase();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw invalid();
  return email;
}

export function requireSaleReference(value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  const reference = value.trim();
  if (
    reference.length < 1 ||
    reference.length > 100 ||
    [...reference].some((character) => character.charCodeAt(0) < 32)
  )
    throw invalid();
  return reference;
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

export function requireOnly(
  value: Record<string, unknown>,
  fields: string[],
): void {
  if (Object.keys(value).some((field) => !fields.includes(field)))
    throw invalid();
}

function invalid() {
  return new AppError(400, 'INVALID_INPUT', 'La solicitud no es válida.');
}

export interface CustomerPrincipal {
  session_id: string;
  customer_id: string;
  user_id: string;
  phone: string;
  phone_masked: string;
  expires_at: string;
}

export interface CardView {
  id: string;
  membership_id: string;
  program_id: string;
  restaurant_id: string;
  restaurant_name: string;
  program_name: string;
  status: string;
  version: number;
  balance: number;
  target: number;
  cycle: {
    id: string;
    number: number;
    state: 'collecting' | 'reward_available' | 'redeemed';
    stamps: number;
    target: number;
  } | null;
  rewards: Array<{
    id: string;
    description: string;
    status: string;
    accounting_mode: string;
    earned_at: string;
    voucher: { token: string; expires_at: string | null } | null;
    whatsapp_url: string | null;
  }>;
  program: {
    name: string;
    description: string | null;
    stamps_required: number;
    reward_description: string;
    logo_url: string | null;
    background_color: string;
    text_color: string;
    card_message: string | null;
    public_code: string;
  };
}
