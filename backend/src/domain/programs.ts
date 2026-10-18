export interface ProgramInput {
  name?: string;
  description?: string | null;
  stamps_required?: number;
  reward_description?: string;
  logo_url?: string | null;
  background_color?: string;
  text_color?: string;
  card_message?: string | null;
  status?: 'active' | 'paused' | 'ended';
}
export class ProgramInputError extends Error {}
function invalid(): never {
  throw new ProgramInputError('Datos del programa inválidos.');
}
export function parseProgramInput(
  body: unknown,
  creation: boolean,
): ProgramInput {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return invalid();
  const data = body as Record<string, unknown>;
  const allowed = [
    'name',
    'description',
    'stamps_required',
    'reward_description',
    'logo_url',
    'background_color',
    'text_color',
    'card_message',
    ...(creation ? [] : ['status']),
  ];
  if (
    !Object.keys(data).length ||
    Object.keys(data).some((k) => !allowed.includes(k))
  )
    return invalid();
  const result: ProgramInput = {};
  for (const key of ['name', 'reward_description'] as const) {
    if (creation || Object.hasOwn(data, key)) {
      const value = data[key];
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.trim().length > 255 ||
        value.includes('\u0000')
      )
        return invalid();
      result[key] = value.trim();
    }
  }
  for (const key of ['description', 'card_message'] as const) {
    if (Object.hasOwn(data, key)) {
      const value = data[key];
      if (
        value !== null &&
        (typeof value !== 'string' ||
          value.length > (key === 'description' ? 255 : 160) ||
          value.includes('\u0000'))
      )
        return invalid();
      result[key] = typeof value === 'string' ? value.trim() : null;
    }
  }
  if (creation || Object.hasOwn(data, 'stamps_required')) {
    const value = data.stamps_required;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 2147483647
    )
      return invalid();
    result.stamps_required = value;
  }
  for (const key of ['background_color', 'text_color'] as const) {
    if (Object.hasOwn(data, key)) {
      const value = data[key];
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
        return invalid();
      result[key] = value.toUpperCase();
    } else if (creation)
      result[key] = key === 'background_color' ? '#FFFFFF' : '#000000';
  }
  if (Object.hasOwn(data, 'logo_url')) {
    const value = data.logo_url;
    if (value === null) result.logo_url = null;
    else {
      if (typeof value !== 'string' || value.length > 2048) return invalid();
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password)
          return invalid();
        result.logo_url = url.toString();
      } catch {
        return invalid();
      }
    }
  }
  if (Object.hasOwn(data, 'status')) {
    if (
      typeof data.status !== 'string' ||
      !['active', 'paused', 'ended'].includes(data.status)
    )
      return invalid();
    result.status = data.status as 'active' | 'paused' | 'ended';
  }
  return result;
}
export interface PageInput {
  cursor: string | null;
  limit: number;
}
export function parsePage(query: {
  cursor?: string;
  limit?: string;
}): PageInput {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (query.limit !== undefined && !/^\d+$/.test(query.limit))
  )
    return invalid();
  return {
    cursor: query.cursor === undefined ? null : requireUuid(query.cursor),
    limit,
  };
}
export function requireUuid(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return invalid();
  return value;
}
export function requireEmptyBody(body: unknown): void {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length
  )
    invalid();
}
