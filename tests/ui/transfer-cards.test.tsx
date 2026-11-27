import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardsPanel } from '../../src/features/cards-admin';
import { TransferPage } from '../../src/features/transfer';
import { ApiError } from '../../src/lib/api';

const state = vi.hoisted(() => ({
  claim: vi.fn(),
  transfer: vi.fn(),
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <span data-testid="qr-value">{value}</span>
  ),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  useCustomerAction: () => ({ mutateAsync: state.claim }),
  useAction: () => ({
    mutateAsync: state.transfer,
    isPending: false,
    error: null,
  }),
  useResource: (path: string | null) => ({
    data: !path
      ? undefined
      : path.endsWith('/cards')
        ? [
            {
              card_id: 'c1',
              program_name: 'Club',
              status: 'active',
              joined_at: '2026-01-01T00:00:00Z',
              closed_at: null,
              is_reenrollment: true,
              previous_cards_count: 2,
              phone_masked: '••• 45 67',
              stamps: 3,
              pending_rewards: 0,
            },
          ]
        : {
            card_id: 'c1',
            program_name: 'Club',
            status: 'active',
            phone: '+573001234567',
            phone_masked: '••• 45 67',
            joined_at: '2026-01-01T00:00:00Z',
            closed_at: null,
            close_reason: null,
            is_reenrollment: true,
            previous_cards_count: 2,
            purchases: [],
            rewards: [],
            previous_cards: [],
          },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
});
describe('transferencia de tarjeta', () => {
  it('lee el token del fragmento, lo borra de la URL y reclama', async () => {
    window.history.replaceState({}, '', '/transfer#token=abc');
    state.claim.mockResolvedValue({
      card: {
        id: 'c1',
        program_name: 'Club',
        balance: 2,
        target: 8,
        cycle: null,
      },
    });
    render(<TransferPage />);
    await waitFor(() =>
      expect(state.claim).toHaveBeenCalledWith({
        path: '/customer/transfers/claim',
        body: { token: 'abc' },
      }),
    );
    expect(window.location.hash).toBe('');
    expect(
      await screen.findByRole('link', { name: 'Ver mi tarjeta' }),
    ).toBeVisible();
  });
  it('un código inválido muestra el error claro', async () => {
    window.history.replaceState({}, '', '/transfer#token=bad');
    state.claim.mockRejectedValue(new ApiError(409, 'TRANSFER_INVALID', 'x'));
    render(<TransferPage />);
    expect(
      await screen.findByText(
        'El código de transferencia no es válido o venció.',
      ),
    ).toBeVisible();
  });
});
describe('administración de tarjetas', () => {
  it('lista con badge de reinscripción y exige verificar a la persona', async () => {
    state.transfer.mockResolvedValue({
      token: 't',
      url: 'https://x.test/transfer#token=t',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    render(<CardsPanel restaurantId="r1" />);
    expect(screen.getByText('Reinscrito (2 anteriores)')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByText('+573001234567')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Transferir a nuevo dispositivo' }),
    );
    const generate = screen.getByRole('button', { name: 'Generar QR' });
    expect(generate).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Verifiqué a la persona/));
    fireEvent.click(generate);
    expect(await screen.findByTestId('qr-value')).toHaveTextContent(
      'https://x.test/transfer#token=t',
    );
    expect(screen.getByText(/Vence en/)).toBeVisible();
  });
});
