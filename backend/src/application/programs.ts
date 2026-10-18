import {
  type PageInput,
  type ProgramInput,
  ProgramInputError,
  parsePage,
  parseProgramInput,
  requireEmptyBody,
  requireUuid,
} from '../domain/programs.js';
import { AppError } from './errors.js';

export type ProgramRecord = Record<string, unknown>;
export interface ProgramPage {
  data: ProgramRecord[];
  next_cursor: string | null;
}
export interface EnrollmentResult {
  created: boolean;
  membership: ProgramRecord;
  card: ProgramRecord;
}
export interface ProgramRepository {
  create(
    actorId: string,
    restaurantId: string,
    input: ProgramInput,
    key: string,
    requestId?: string,
  ): Promise<ProgramRecord>;
  list(
    actorId: string,
    restaurantId: string,
    page: PageInput,
  ): Promise<ProgramPage>;
  get(
    actorId: string,
    restaurantId: string,
    programId: string,
  ): Promise<ProgramRecord>;
  update(
    actorId: string,
    restaurantId: string,
    programId: string,
    input: ProgramInput,
    key: string,
    requestId?: string,
  ): Promise<ProgramRecord>;
  publicByCode(code: string): Promise<ProgramRecord>;
  enroll(
    actorId: string,
    code: string,
    key: string,
    requestId?: string,
  ): Promise<EnrollmentResult>;
  listCards(actorId: string, page: PageInput): Promise<ProgramPage>;
  cardDetails(actorId: string, cardId: string): Promise<ProgramRecord>;
  cardHistory(
    actorId: string,
    cardId: string,
    kind: 'movements' | 'rewards',
    page: PageInput,
  ): Promise<ProgramPage>;
  getQr(
    actorId: string,
    cardId: string,
  ): Promise<{ card_id: string; token: string }>;
  rotateQr(
    actorId: string,
    cardId: string,
    key: string,
    requestId?: string,
  ): Promise<{ card_id: string; token: string }>;
  resolveCard(
    actorId: string,
    restaurantId: string,
    token: string,
  ): Promise<ProgramRecord>;
}
function valid<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ProgramInputError)
      throw new AppError(400, 'INVALID_INPUT', error.message);
    throw error;
  }
}
function key(value: string | undefined): string {
  if (!value || !/^[\x21-\x7e]{1,255}$/.test(value))
    throw new AppError(
      400,
      'INVALID_INPUT',
      'Se requiere Idempotency-Key válido.',
    );
  return value;
}
function code(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(value))
    throw new AppError(404, 'NOT_FOUND', 'Programa inexistente.');
  return value;
}
export function createProgramService(repo: ProgramRepository) {
  return {
    create: (
      actor: string,
      restaurant: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      repo.create(
        actor,
        valid(() => requireUuid(restaurant)),
        valid(() => parseProgramInput(body, true)),
        key(idempotencyKey),
        requestId,
      ),
    list: (
      actor: string,
      restaurant: string,
      query: { cursor?: string; limit?: string },
    ) =>
      repo.list(
        actor,
        valid(() => requireUuid(restaurant)),
        valid(() => parsePage(query)),
      ),
    get: (actor: string, restaurant: string, program: string) =>
      repo.get(
        actor,
        valid(() => requireUuid(restaurant)),
        valid(() => requireUuid(program)),
      ),
    update: (
      actor: string,
      restaurant: string,
      program: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) =>
      repo.update(
        actor,
        valid(() => requireUuid(restaurant)),
        valid(() => requireUuid(program)),
        valid(() => parseProgramInput(body, false)),
        key(idempotencyKey),
        requestId,
      ),
    publicByCode: (value: string) => repo.publicByCode(code(value)),
    enroll: (
      actor: string,
      value: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) => {
      valid(() => requireEmptyBody(body));
      return repo.enroll(actor, code(value), key(idempotencyKey), requestId);
    },
    listCards: (actor: string, query: { cursor?: string; limit?: string }) =>
      repo.listCards(
        actor,
        valid(() => parsePage(query)),
      ),
    cardDetails: (actor: string, card: string) =>
      repo.cardDetails(
        actor,
        valid(() => requireUuid(card)),
      ),
    cardHistory: (
      actor: string,
      card: string,
      kind: 'movements' | 'rewards',
      query: { cursor?: string; limit?: string },
    ) =>
      repo.cardHistory(
        actor,
        valid(() => requireUuid(card)),
        kind,
        valid(() => parsePage(query)),
      ),
    getQr: (actor: string, card: string) =>
      repo.getQr(
        actor,
        valid(() => requireUuid(card)),
      ),
    rotateQr: (
      actor: string,
      card: string,
      body: unknown,
      idempotencyKey: string | undefined,
      requestId?: string,
    ) => {
      valid(() => requireEmptyBody(body));
      return repo.rotateQr(
        actor,
        valid(() => requireUuid(card)),
        key(idempotencyKey),
        requestId,
      );
    },
    resolveCard: (actor: string, restaurant: string, body: unknown) => {
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !('token' in body) ||
        typeof body.token !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.token)
      )
        throw new AppError(400, 'INVALID_INPUT', 'Token de tarjeta inválido.');
      return repo.resolveCard(
        actor,
        valid(() => requireUuid(restaurant)),
        body.token,
      );
    },
  };
}
export type ProgramService = ReturnType<typeof createProgramService>;
