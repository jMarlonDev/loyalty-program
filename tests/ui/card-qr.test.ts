import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cardScanUrl,
  clearPendingScan,
  parseCardScan,
  readPendingScan,
  savePendingScan,
} from '../../src/lib/card-qr';

const scan = {
  token: 'a'.repeat(43),
  restaurantId: '11111111-1111-4111-8111-111111111111',
};
const origin = 'https://loyalty.example';
beforeEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});
describe('QR privado móvil', () => {
  it('el token queda solo en fragmento, fuera de URL enviada al servidor', () => {
    const url = new URL(cardScanUrl(origin, scan));
    expect(url.pathname).toBe('/scan');
    expect(url.search).toBe('');
    expect(url.origin + url.pathname + url.search).not.toContain(scan.token);
    expect(parseCardScan(url.href, origin)).toEqual(scan);
  });
  it('acepta token anterior y rechaza origen ajeno, usuario embebido y duplicados', () => {
    expect(parseCardScan(scan.token, origin, scan.restaurantId)).toEqual(scan);
    expect(
      parseCardScan(cardScanUrl('https://evil.example', scan), origin),
    ).toBeNull();
    expect(
      parseCardScan(
        cardScanUrl(origin, scan).replace('https://', 'https://bad@'),
        origin,
      ),
    ).toBeNull();
    expect(
      parseCardScan(`${cardScanUrl(origin, scan)}&token=${scan.token}`, origin),
    ).toBeNull();
  });
  it('conserva un solo QR temporal por pestaña y lo elimina a los diez minutos', () => {
    vi.useFakeTimers();
    expect(savePendingScan(scan)).toBe(true);
    expect(readPendingScan()).toEqual(scan);
    expect(localStorage.length).toBe(0);
    vi.advanceTimersByTime(600_001);
    expect(readPendingScan()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it('limpia datos al resolver o cerrar sesión y resiste almacenamiento inaccesible', () => {
    savePendingScan(scan);
    clearPendingScan();
    expect(readPendingScan()).toBeNull();
    const failed = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(savePendingScan(scan)).toBe(false);
    failed.mockRestore();
  });
});
