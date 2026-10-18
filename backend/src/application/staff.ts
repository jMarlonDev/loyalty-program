import type { VerifiedIdentity } from '../domain/identity.js';
import { AppError } from './errors.js';

export type StaffAction =
  | 'restaurant.create'
  | 'restaurant.update'
  | 'location.create'
  | 'location.update'
  | 'employee.update'
  | 'invitation.create'
  | 'invitation.revoke'
  | 'invitation.accept';
export type StaffCollection =
  | 'restaurants'
  | 'restaurant'
  | 'locations'
  | 'employees'
  | 'invitations';
export interface StaffCommand {
  action: StaffAction;
  actor: VerifiedIdentity;
  restaurantId?: string;
  targetId?: string;
  input: Record<string, string | null>;
  key: string;
  requestId: string;
}
export interface StaffQuery {
  collection: StaffCollection;
  actor: VerifiedIdentity;
  restaurantId?: string;
  cursor?: string;
  limit: number;
}
export type StaffResult = Record<string, unknown>;
export interface StaffRepository {
  execute(command: StaffCommand): Promise<StaffResult>;
  query(query: StaffQuery): Promise<StaffResult>;
}

export function requireUuid(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AppError(400, 'INVALID_INPUT', 'Invalid identifier');
  }
  return value;
}

const fields: Record<StaffAction, string[]> = {
  'restaurant.create': ['name', 'slug', 'email', 'phone'],
  'restaurant.update': ['name', 'email', 'phone', 'status'],
  'location.create': ['name', 'address', 'city', 'department', 'phone'],
  'location.update': [
    'name',
    'address',
    'city',
    'department',
    'phone',
    'status',
  ],
  'employee.update': ['role', 'status'],
  'invitation.create': ['email', 'role'],
  'invitation.revoke': [],
  'invitation.accept': ['token'],
};

export function parseStaffInput(
  action: StaffAction,
  value: unknown,
): Record<string, string | null> {
  const invalid = () =>
    new AppError(400, 'INVALID_INPUT', 'Invalid command fields');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const source = value as Record<string, unknown>;
  const names = Object.keys(source);
  if (names.some((name) => !fields[action].includes(name))) throw invalid();
  if (!names.length && action !== 'invitation.revoke') throw invalid();
  const required =
    action === 'restaurant.create'
      ? ['name', 'slug']
      : action === 'location.create'
        ? ['name', 'address', 'city', 'department']
        : action === 'invitation.create'
          ? ['email', 'role']
          : action === 'invitation.accept'
            ? ['token']
            : [];
  if (required.some((field) => !Object.hasOwn(source, field))) throw invalid();
  const parsed: Record<string, string | null> = {};
  for (const name of names) {
    const raw = source[name];
    if (
      raw === null &&
      (name === 'phone' ||
        (name === 'email' && !action.startsWith('invitation')))
    ) {
      parsed[name] = null;
      continue;
    }
    if (typeof raw !== 'string') throw invalid();
    const text = raw.trim();
    const max = name === 'address' ? 2000 : name === 'phone' ? 20 : 255;
    if (
      !text ||
      text.length > max ||
      [...text].some((character) => character.charCodeAt(0) < 32)
    )
      throw invalid();
    if (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
      throw invalid();
    if (name === 'slug' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text))
      throw invalid();
    if (name === 'role' && !['admin', 'employee'].includes(text))
      throw invalid();
    if (name === 'status') {
      const allowed =
        action === 'restaurant.update'
          ? ['active', 'suspended']
          : action === 'location.update'
            ? ['active', 'inactive']
            : ['active', 'suspended', 'disabled'];
      if (!allowed.includes(text)) throw invalid();
    }
    if (name === 'token' && !/^[A-Za-z0-9_-]{43}$/.test(text)) throw invalid();
    parsed[name] = name === 'email' ? text.toLowerCase() : text;
  }
  return parsed;
}

export function createStaffService(repository: StaffRepository) {
  function verified(actor: VerifiedIdentity) {
    if (!actor.emailVerified)
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email must be verified');
  }
  return {
    async execute(command: Omit<StaffCommand, 'input'> & { input: unknown }) {
      verified(command.actor);
      if (!command.key || !/^[\x21-\x7e]{1,255}$/.test(command.key)) {
        throw new AppError(
          400,
          'INVALID_IDEMPOTENCY_KEY',
          'Valid Idempotency-Key is required',
        );
      }
      if (command.restaurantId) requireUuid(command.restaurantId);
      if (command.targetId) requireUuid(command.targetId);
      return repository.execute({
        ...command,
        input: parseStaffInput(command.action, command.input),
      });
    },
    async query(
      query: Omit<StaffQuery, 'limit'> & { limit?: string | number },
    ) {
      verified(query.actor);
      if (query.restaurantId) requireUuid(query.restaurantId);
      if (query.cursor) requireUuid(query.cursor);
      const limit = query.limit === undefined ? 20 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError(
          400,
          'INVALID_INPUT',
          'Limit must be an integer from 1 to 100',
        );
      }
      return repository.query({ ...query, limit });
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;
