import {
  LoyaltyRuleError,
  loyaltyUuid,
  validateLoyaltyInput,
} from '../domain/loyalty.js';
import { AppError } from './errors.js';

export interface PurchaseInput {
  card_id: string;
  location_id: string;
  sale_reference: string;
}
export type LoyaltyResult = Record<string, unknown>;
export interface LoyaltyRepository {
  purchase(
    actor: string,
    restaurant: string,
    input: PurchaseInput,
    key: string,
    requestId?: string,
  ): Promise<LoyaltyResult>;
  redeem(
    actor: string,
    restaurant: string,
    reward: string,
    location: string,
    key: string,
    requestId?: string,
  ): Promise<LoyaltyResult>;
  reverse(
    actor: string,
    restaurant: string,
    purchase: string,
    reason: string,
    key: string,
    requestId?: string,
  ): Promise<LoyaltyResult>;
  preview(actor: string, card: string): Promise<LoyaltyResult>;
  consent(
    actor: string,
    card: string,
    version: number,
    key: string,
    requestId?: string,
  ): Promise<LoyaltyResult>;
  revoke(
    actor: string,
    card: string,
    consent: string,
    key: string,
    requestId?: string,
  ): Promise<LoyaltyResult>;
  close(
    actor: string,
    restaurant: string,
    card: string,
    consent: string,
    key: string,
    requestId?: string,
  ): Promise<LoyaltyResult>;
}
function key(value: string | undefined): string {
  if (!value || !/^[\x21-\x7e]{1,255}$/.test(value))
    throw new AppError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Se requiere Idempotency-Key válido.',
    );
  return value;
}
async function valid<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof LoyaltyRuleError)
      throw new AppError(error.status, error.code, error.message);
    throw error;
  }
}
export function createLoyaltyService(repo: LoyaltyRepository) {
  return {
    purchase: (
      actor: string,
      restaurant: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      valid(() =>
        repo.purchase(
          actor,
          loyaltyUuid(restaurant),
          validateLoyaltyInput('purchase', body) as unknown as PurchaseInput,
          key(idempotencyKey),
          requestId,
        ),
      ),
    redeem: (
      actor: string,
      restaurant: string,
      reward: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      valid(() =>
        repo.redeem(
          actor,
          loyaltyUuid(restaurant),
          loyaltyUuid(reward),
          validateLoyaltyInput('redeem', body).location_id as string,
          key(idempotencyKey),
          requestId,
        ),
      ),
    reverse: (
      actor: string,
      restaurant: string,
      purchase: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      valid(() =>
        repo.reverse(
          actor,
          loyaltyUuid(restaurant),
          loyaltyUuid(purchase),
          validateLoyaltyInput('reverse', body).reason as string,
          key(idempotencyKey),
          requestId,
        ),
      ),
    preview: (actor: string, card: string) =>
      valid(() => repo.preview(actor, loyaltyUuid(card))),
    consent: (
      actor: string,
      card: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      valid(() =>
        repo.consent(
          actor,
          loyaltyUuid(card),
          validateLoyaltyInput('consent', body).benefits_version as number,
          key(idempotencyKey),
          requestId,
        ),
      ),
    revoke: (
      actor: string,
      card: string,
      consent: string,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      valid(() =>
        repo.revoke(
          actor,
          loyaltyUuid(card),
          loyaltyUuid(consent),
          key(idempotencyKey),
          requestId,
        ),
      ),
    close: (
      actor: string,
      restaurant: string,
      card: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      valid(() =>
        repo.close(
          actor,
          loyaltyUuid(restaurant),
          loyaltyUuid(card),
          validateLoyaltyInput('close', body).consent_id as string,
          key(idempotencyKey),
          requestId,
        ),
      ),
  };
}
export type LoyaltyService = ReturnType<typeof createLoyaltyService>;
