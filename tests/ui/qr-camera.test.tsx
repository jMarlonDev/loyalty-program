import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QrCamera } from '../../src/components/qr-camera';

const camera = vi.hoisted(() => ({
  decode: vi.fn(),
  stop: vi.fn(),
  trackStop: vi.fn(),
  get: vi.fn(),
}));
vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    decodeFromStream = camera.decode;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  camera.get.mockResolvedValue({
    getTracks: () => [{ stop: camera.trackStop }],
  });
  camera.decode.mockResolvedValue({ stop: camera.stop });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: camera.get },
  });
});
describe('cámara QR móvil', () => {
  it('usa cámara posterior y libera cámara y lector al desmontar', async () => {
    const view = render(<QrCamera onRead={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText('Buscando un código QR…');
    expect(camera.get).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    view.unmount();
    expect(camera.stop).toHaveBeenCalled();
    expect(camera.trackStop).toHaveBeenCalled();
  });
  it('lee una sola vez y detiene la cámara antes de entregar el código', async () => {
    const read = vi.fn();
    render(<QrCamera onRead={read} onClose={vi.fn()} />);
    await screen.findByText('Buscando un código QR…');
    const callback = camera.decode.mock.calls[0]?.[2];
    act(() => {
      callback({ getText: () => 'qr-result' }, undefined, {
        stop: camera.stop,
      });
      callback({ getText: () => 'qr-result' }, undefined, {
        stop: camera.stop,
      });
    });
    expect(read).toHaveBeenCalledExactlyOnceWith('qr-result');
    expect(camera.trackStop).toHaveBeenCalled();
  });
  it('explica denegación y mantiene salida hacia código manual', async () => {
    camera.get.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    render(<QrCamera onRead={vi.fn()} onClose={vi.fn()} />);
    expect(
      await screen.findByText(/Permite el acceso a la cámara/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cerrar cámara' })).toBeVisible();
  });
  it('cierra recursos si permiso se concede después de desmontar', async () => {
    let grant!: (stream: unknown) => void;
    camera.get.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    const view = render(<QrCamera onRead={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(camera.get).toHaveBeenCalled());
    view.unmount();
    await act(async () =>
      grant({ getTracks: () => [{ stop: camera.trackStop }] }),
    );
    expect(camera.trackStop).toHaveBeenCalled();
    expect(camera.decode).not.toHaveBeenCalled();
  });
});
