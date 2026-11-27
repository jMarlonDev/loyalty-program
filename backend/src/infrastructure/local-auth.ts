import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import type { Pool } from 'pg';
import { AppError } from '../application/errors.js';
import type { IdentityProvider } from '../application/identity.js';
import type { VerifiedIdentity } from '../domain/identity.js';

/**
 * AUTH-LOCAL-001 (D-07): cuentas de admin y empleados con correo + contraseña
 * guardada con scrypt. Los tokens de acceso/refresco son opacos (256 bits) y
 * en la base solo se guarda su SHA-256. Supabase queda solo como PostgreSQL.
 */
const ACCESS_SECONDS = 24 * 60 * 60;
const REFRESH_SECONDS = 400 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_FAILURES_PER_WINDOW = 10;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function scrypt(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password.normalize('NFKC'),
      salt,
      SCRYPT.keylen,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const parts = stored?.split('$');
  if (!parts || parts.length !== 6 || parts[0] !== 'scrypt') {
    // Igualar el coste para no revelar si la cuenta existe.
    await scrypt(password, randomBytes(16), SCRYPT.N, SCRYPT.r, SCRYPT.p);
    return false;
  }
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash ?? '', 'base64url');
  const actual = await scrypt(
    password,
    Buffer.from(salt ?? '', 'base64url'),
    Number(n),
    Number(r),
    Number(p),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function validatePassword(password: unknown): string {
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 256 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  )
    throw new AppError(
      400,
      'WEAK_PASSWORD',
      'Usa al menos 8 caracteres con letras y números.',
    );
  return password;
}

export function normalizeEmail(email: unknown): string {
  if (
    typeof email !== 'string' ||
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    throw new AppError(400, 'INVALID_INPUT', 'Escribe un correo válido.');
  return email.trim().toLowerCase();
}

const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const isToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export interface LocalUser {
  id: string;
  email: string;
  full_name: string;
  must_change_password: boolean;
}

export interface LocalSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: LocalUser;
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
const expired = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.');

export class LocalAuthStore implements IdentityProvider {
  private readonly now: () => Date;
  constructor(
    private readonly pool: Pool,
    options: { now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  private async issue(
    user: LocalUser,
    userAgent?: string,
  ): Promise<LocalSession> {
    const access = newToken();
    const refresh = newToken();
    const now = this.now();
    await this.pool.query(
      `INSERT INTO staff_sessions(id,user_id,access_hash,access_expires_at,refresh_hash,refresh_expires_at,user_agent,created_at,last_seen_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [
        randomUUID(),
        user.id,
        tokenHash(access),
        new Date(now.getTime() + ACCESS_SECONDS * 1000),
        tokenHash(refresh),
        new Date(now.getTime() + REFRESH_SECONDS * 1000),
        userAgent ? userAgent.slice(0, 255) : null,
        now,
      ],
    );
    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: ACCESS_SECONDS,
      user,
    };
  }

  private async limitLogin(email: string): Promise<void> {
    const since = new Date(this.now().getTime() - LOGIN_WINDOW_MS);
    const failures =
      (
        await this.pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM enrollment_attempts WHERE scope='login' AND key_hash=$1 AND created_at>$2",
          [tokenHash(`login:${email}`), since],
        )
      ).rows[0]?.n ?? 0;
    if (failures >= LOGIN_FAILURES_PER_WINDOW)
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Demasiados intentos. Espera unos minutos.',
      );
  }

  private async recordFailure(email: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO enrollment_attempts(id,scope,key_hash,created_at) VALUES($1,'login',$2,$3)",
      [randomUUID(), tokenHash(`login:${email}`), this.now()],
    );
  }

  async login(
    emailInput: unknown,
    password: unknown,
    userAgent?: string,
  ): Promise<LocalSession> {
    const email = normalizeEmail(emailInput);
    if (typeof password !== 'string' || !password || password.length > 256)
      throw invalidCredentials();
    await this.limitLogin(email);
    const row = (
      await this.pool.query<
        LocalUser & { password_hash: string | null; status: string }
      >(
        `SELECT id,email,full_name,password_hash,status,must_change_password
         FROM users WHERE lower(email)=$1`,
        [email],
      )
    ).rows[0];
    const valid = await verifyPassword(password, row?.password_hash);
    if (!row || !valid || row.status !== 'active') {
      await this.recordFailure(email);
      throw invalidCredentials();
    }
    return this.issue(
      {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        must_change_password: row.must_change_password,
      },
      userAgent,
    );
  }

  /** Alta propia (p. ej. empleado que llega con un QR de invitación). */
  async signup(
    emailInput: unknown,
    passwordInput: unknown,
    fullNameInput: unknown,
    userAgent?: string,
  ): Promise<LocalSession> {
    const email = normalizeEmail(emailInput);
    const password = validatePassword(passwordInput);
    const fullName =
      typeof fullNameInput === 'string' ? fullNameInput.trim() : '';
    if (!fullName || fullName.length > 255)
      throw new AppError(400, 'INVALID_INPUT', 'Escribe tu nombre.');
    const user = await this.createUser({ email, password, fullName });
    return this.issue(user, userAgent);
  }

  /** Crea una cuenta local. `mustChange` obliga a cambiar la contraseña temporal. */
  async createUser(input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string | null;
    mustChange?: boolean;
  }): Promise<LocalUser> {
    const now = this.now();
    const id = randomUUID();
    const hash = await hashPassword(validatePassword(input.password));
    try {
      await this.pool.query(
        `INSERT INTO users(id,full_name,email,phone,password_hash,must_change_password,status,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,'active',$7,$7)`,
        [
          id,
          input.fullName,
          normalizeEmail(input.email),
          input.phone ?? null,
          hash,
          input.mustChange === true,
          now,
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new AppError(
          409,
          'EMAIL_TAKEN',
          'Ya existe una cuenta con ese correo. Inicia sesión.',
        );
      throw error;
    }
    return {
      id,
      email: normalizeEmail(input.email),
      full_name: input.fullName,
      must_change_password: input.mustChange === true,
    };
  }

  private async session(access: string) {
    if (!isToken(access)) throw expired();
    const row = (
      await this.pool.query<LocalUser & { session_id: string }>(
        `SELECT s.id AS session_id,u.id,u.email,u.full_name,u.must_change_password
         FROM staff_sessions s JOIN users u ON u.id=s.user_id
         WHERE s.access_hash=$1 AND s.revoked_at IS NULL AND s.access_expires_at>$2
           AND u.status='active'`,
        [tokenHash(access), this.now()],
      )
    ).rows[0];
    if (!row) throw expired();
    return row;
  }

  async user(access: string): Promise<LocalUser> {
    const { session_id: _session, ...user } = await this.session(access);
    return user;
  }

  /** IdentityProvider: el resto del backend autoriza con este id. */
  async verifyAccessToken(token: string): Promise<VerifiedIdentity> {
    const user = await this.user(token);
    return { id: user.id, email: user.email, emailVerified: true };
  }

  async refresh(refresh: string, userAgent?: string): Promise<LocalSession> {
    if (!isToken(refresh)) throw expired();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = (
        await client.query<LocalUser & { session_id: string }>(
          `SELECT s.id AS session_id,u.id,u.email,u.full_name,u.must_change_password
           FROM staff_sessions s JOIN users u ON u.id=s.user_id
           WHERE s.refresh_hash=$1 AND s.revoked_at IS NULL AND s.refresh_expires_at>$2
             AND u.status='active'
           FOR UPDATE OF s`,
          [tokenHash(refresh), this.now()],
        )
      ).rows[0];
      if (!row) throw expired();
      // Rotación: el refresh usado deja de servir.
      await client.query(
        'UPDATE staff_sessions SET revoked_at=$2 WHERE id=$1',
        [row.session_id, this.now()],
      );
      await client.query('COMMIT');
      const { session_id: _session, ...user } = row;
      return this.issue(user, userAgent);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async logout(access: string): Promise<void> {
    if (!isToken(access)) return;
    await this.pool.query(
      'UPDATE staff_sessions SET revoked_at=$2 WHERE access_hash=$1 AND revoked_at IS NULL',
      [tokenHash(access), this.now()],
    );
  }

  /** Cambia la contraseña, retira la marca temporal y cierra las demás sesiones. */
  async updatePassword(access: string, password: unknown): Promise<void> {
    const current = await this.session(access);
    const hash = await hashPassword(validatePassword(password));
    await this.pool.query(
      'UPDATE users SET password_hash=$2,must_change_password=false,updated_at=$3 WHERE id=$1',
      [current.id, hash, this.now()],
    );
    await this.pool.query(
      'UPDATE staff_sessions SET revoked_at=$3 WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',
      [current.id, current.session_id, this.now()],
    );
  }
}
