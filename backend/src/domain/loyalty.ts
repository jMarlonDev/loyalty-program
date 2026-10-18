export class LoyaltyRuleError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409,
    message: string,
  ) {
    super(message);
  }
}
export function rewardBatches(purchases: string[], target: number): string[][] {
  if (!Number.isSafeInteger(target) || target < 1)
    throw new LoyaltyRuleError('INVALID_TARGET', 409, 'Meta inválida.');
  const batches: string[][] = [];
  for (let i = 0; i + target <= purchases.length; i += target)
    batches.push(purchases.slice(i, i + target));
  return batches;
}
export function loyaltyUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new LoyaltyRuleError(
      'INVALID_INPUT',
      400,
      'Se requiere UUID válido.',
    );
  return value.toLowerCase();
}
export type LoyaltyInputKind =
  | 'purchase'
  | 'redeem'
  | 'reverse'
  | 'consent'
  | 'close';
export function validateLoyaltyInput(
  kind: LoyaltyInputKind,
  input: unknown,
): Record<string, unknown> {
  const fail = () => {
    throw new LoyaltyRuleError('INVALID_INPUT', 400, 'Entrada inválida.');
  };
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return fail();
  const body = { ...(input as Record<string, unknown>) };
  if (
    Object.values(body).some(
      (value) => typeof value === 'string' && value.includes('\u0000'),
    )
  )
    return fail();
  const keys = {
    purchase: ['card_id', 'location_id', 'sale_reference'],
    redeem: ['location_id'],
    reverse: ['reason'],
    consent: ['benefits_version', 'accepted'],
    close: ['consent_id'],
  }[kind];
  if (
    Object.keys(body).length !== keys.length ||
    Object.keys(body).some((key) => !keys.includes(key))
  )
    return fail();
  for (const key of keys)
    if (key.endsWith('_id')) body[key] = loyaltyUuid(body[key]);
  if (
    kind === 'purchase' &&
    (typeof body.sale_reference !== 'string' ||
      body.sale_reference.length < 1 ||
      body.sale_reference.length > 100 ||
      body.sale_reference.trim() !== body.sale_reference)
  )
    return fail();
  if (
    kind === 'reverse' &&
    (typeof body.reason !== 'string' ||
      body.reason.trim().length < 1 ||
      body.reason.length > 1000)
  )
    return fail();
  if (
    kind === 'consent' &&
    (body.accepted !== true ||
      !Number.isSafeInteger(body.benefits_version) ||
      (body.benefits_version as number) < 0)
  )
    return fail();
  return body;
}
export function assertNotSelf(actor: string, customer: string): void {
  if (actor === customer)
    throw new LoyaltyRuleError(
      'SELF_OPERATION',
      403,
      'No puede acreditar ni canjear su propia membresía.',
    );
}
