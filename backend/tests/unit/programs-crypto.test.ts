import { describe, expect, it } from 'vitest';
import {
  createCardToken,
  decryptCardToken,
  encryptCardToken,
  hashCardToken,
} from '../../src/infrastructure/programs-crypto.js';

const key = 'ab'.repeat(32);
describe('PROGRAMS-001 AC-005 private token cryptography', () => {
  it('generates distinct opaque 256-bit tokens', () => {
    const first = createCardToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createCardToken()).not.toBe(first);
  });
  it('encrypts recoverably with randomized authenticated encryption', () => {
    const token = 'a'.repeat(43);
    const encrypted = encryptCardToken(token, key);
    expect(encrypted).not.toContain(token);
    expect(decryptCardToken(encrypted, key)).toBe(token);
    expect(encryptCardToken(token, key)).not.toBe(encrypted);
    expect(hashCardToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('rejects tampering and wrong key', () => {
    const encrypted = encryptCardToken('a'.repeat(43), key);
    expect(() => decryptCardToken(encrypted, 'cd'.repeat(32))).toThrow();
    expect(() => decryptCardToken(`${encrypted}0`, key)).toThrow();
  });
  it('rejects weak or malformed encryption keys', () => {
    expect(() => encryptCardToken('token', 'short')).toThrow();
    expect(() => encryptCardToken('token', 'z'.repeat(64))).toThrow();
  });
});
