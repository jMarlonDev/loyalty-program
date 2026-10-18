import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicShareQr } from '../../src/components/public-share-qr';

afterEach(() => vi.unstubAllGlobals());
function showShare() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PublicShareQr path="/join/program-code" />
    </QueryClientProvider>,
  );
}
describe('MOBILE-001 enlaces públicos', () => {
  it('usa el origen configurado y no localhost del navegador', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: { appOrigin: 'https://lealtad.example.com' } }),
      );
    vi.stubGlobal('fetch', fetch);
    showShare();
    expect(
      await screen.findByRole('link', {
        name: 'https://lealtad.example.com/join/program-code',
      }),
    ).toHaveAttribute('href', 'https://lealtad.example.com/join/program-code');
    expect(fetch).toHaveBeenCalledWith(
      '/api/public-config',
      expect.objectContaining({ credentials: 'omit' }),
    );
    expect(
      screen.queryByText(/solo funciona en este computador/),
    ).not.toBeInTheDocument();
  });
  it('identifica enlaces locales como pruebas, sin prometer acceso móvil', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: { appOrigin: 'http://localhost:3000' } }),
        ),
    );
    showShare();
    expect(
      await screen.findByText(/solo funciona en este computador/),
    ).toBeVisible();
  });
  it('permite reintentar configuración sin fabricar enlace ante error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('offline', { status: 503 }))
        .mockResolvedValueOnce(
          Response.json({ data: { appOrigin: 'https://lealtad.example.com' } }),
        ),
    );
    showShare();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el enlace',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      'https://lealtad.example.com/join/program-code',
    );
  });
});
