import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_SESSION_MAX_AGE,
  createCustomerCookie,
} from '../../src/server/customer-cookie';

const token = Buffer.alloc(32, 83).toString('base64url');
const secondToken = Buffer.alloc(32, 92).toString('base64url');
const now = new Date('2026-10-19T12:00:00.000Z');
const expiresIn = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const secure = () => createCustomerCookie({ origin: 'https://loyalty.test' });
const request = (cookie: string) =>
  new Request('https://loyalty.test/api/v1/customer/session', {
    headers: { cookie },
  });

describe('NEXT-001 AC-001 customer cookie boundary', () => {
  it('issues opaque cookies with environment attributes', () => {
    const cookies = secure();
    expect(cookies.name).toBe('__Host-loyalty_customer');
    expect(cookies.issue(token, expiresIn(CUSTOMER_SESSION_MAX_AGE), now)).toBe(
      `__Host-loyalty_customer=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000; Secure`,
    );
    const development = createCustomerCookie({
      origin: 'http://192.168.33.9:3000',
      development: true,
    });
    expect(development.name).toBe('loyalty_customer_dev');
    expect(development.issue(token, expiresIn(60), now)).toBe(
      `loyalty_customer_dev=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`,
    );
    expect(
      createCustomerCookie({
        origin: 'https://localhost:3000',
        development: true,
      }).name,
    ).toBe('__Host-loyalty_customer');
  });

  it.each([
    { origin: 'http://localhost:3000' },
    { origin: 'http://192.168.33.9:3000' },
    { origin: 'http://public.example.test', development: true },
    { origin: 'https://loyalty.test/path' },
    { origin: 'https://user:password@loyalty.test' },
    { origin: 'https://loyalty.test?redirect=evil' },
  ])('rejects unsafe origin configuration %j', (options) => {
    expect(() => createCustomerCookie(options)).toThrow(
      'Invalid customer cookie configuration',
    );
  });

  it('never extends the cookie past the server expiry or 400 days', () => {
    const cookies = secure();
    expect(cookies.issue(token, expiresIn(35.8), now)).toContain('Max-Age=35;');
    expect(
      cookies.issue(token, expiresIn(CUSTOMER_SESSION_MAX_AGE + 500), now),
    ).toContain('Max-Age=34560000;');
    for (const expiry of [
      now,
      expiresIn(-1),
      expiresIn(0.5),
      new Date('invalid'),
    ]) {
      expect(() => cookies.issue(token, expiry, now)).toThrow(
        'Invalid customer session expiry',
      );
    }
    expect(() =>
      cookies.issue(token, expiresIn(60), new Date('invalid')),
    ).toThrow('Invalid customer session expiry');
  });

  it('reads only the dedicated cookie and rejects ambiguous duplicates', () => {
    const cookies = secure();
    expect(cookies.read(request(`other=value; ${cookies.name}=${token}`))).toBe(
      token,
    );
    for (const value of [
      `${cookies.name}=${token}; ${cookies.name}=${secondToken}`,
      `${cookies.name}=${token}; ${cookies.name}=${token}`,
      `${cookies.name}=; ${cookies.name}=${token}`,
      `loyalty_customer_dev=${token}`,
      `__Host-loyalty-access=${token}`,
      `prefix${cookies.name}=${token}`,
      `${cookies.name.toUpperCase()}=${token}`,
    ]) {
      expect(cookies.read(request(value))).toBeUndefined();
    }
    expect(cookies.read(new Request('https://loyalty.test'))).toBeUndefined();
  });

  it('rejects malformed and duplicate cookies without accepting alternate token encodings', () => {
    const cookies = secure();
    for (const invalid of [
      '',
      '+573001234567',
      'jwt.payload.signature',
      `${token}=`,
      token.slice(1),
      'B'.repeat(43),
      `"${token}"`,
      `%${token.charCodeAt(0).toString(16)}${token.slice(1)}`,
      `${token}; injected=value`,
    ]) {
      expect(() => cookies.issue(invalid, expiresIn(60), now)).toThrow(
        'Invalid customer session token',
      );
      if (!invalid.includes(';')) {
        expect(
          cookies.read(request(`${cookies.name}=${invalid}`)),
        ).toBeUndefined();
      }
    }
  });

  it('clears only the customer cookie with the same scope and security', () => {
    expect(secure().clear()).toBe(
      '__Host-loyalty_customer=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure',
    );
    expect(
      createCustomerCookie({
        origin: 'http://localhost:3000',
        development: true,
      }).clear(),
    ).toBe('loyalty_customer_dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  });
});
