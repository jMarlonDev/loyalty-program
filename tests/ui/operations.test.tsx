import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsPanel } from '../../src/features/operations';
import type { CardView, ScanResult } from '../../src/lib/types';

const state = vi.hoisted(() => ({
  call: vi.fn(),
  scan: null as unknown,
  purchase: null as unknown,
  redeem: null as unknown,
  resend: null as unknown,
}));
vi.mock('../../src/lib/public-config', () => ({
  useAppOrigin: () => ({ origin: 'https://loyalty.example' }),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useAction: () => ({
    mutateAsync: state.call,
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}));
const restaurantId = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(43);
function card(overrides: Partial<CardView> = {}): CardView {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    membership_id: '33333333-3333-4333-8333-333333333333',
    program_id: '44444444-4444-4444-8444-444444444444',
    restaurant_id: restaurantId,
    restaurant_name: 'Negocio',
    program_name: 'Club',
    status: 'active',
    version: 1,
    balance: 2,
    target: 8,
    cycle: {
      id: '55555555-5555-4555-8555-555555555555',
      number: 1,
      state: 'collecting',
      stamps: 2,
      target: 8,
    },
    rewards: [],
    program: {
      name: 'Club',
      description: null,
      stamps_required: 8,
      reward_description: 'Un café',
      logo_url: null,
      background_color: '#22346B',
      text_color: '#FFFFFF',
      card_message: null,
      public_code: 'club',
    },
    ...overrides,
  };
}
function scanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    card: card(),
    phone_masked: '••• ••• 45 67',
    reward: null,
    allowed_actions: ['purchase'],
    ...overrides,
  };
}
beforeEach(() => {
  state.call.mockReset().mockImplementation(async (input: { path: string }) => {
    if (input.path === '/operator/scans') return state.scan;
    if (input.path === '/operator/purchases') return state.purchase;
    if (input.path === '/operator/redemptions') return state.redeem;
    return state.resend;
  });
  state.scan = scanResult();
  state.purchase = {
    card: card({ balance: 3, cycle: { ...card().cycle!, stamps: 3 } }),
    event_id: 'event',
  };
  state.redeem = {
    card: card({
      balance: 0,
      cycle: { ...card().cycle!, number: 2, stamps: 0 },
    }),
    event_id: 'event',
  };
  state.resend = {
    token,
    expires_at: null,
    whatsapp_url: 'https://wa.me/573001234567',
  };
});
describe('operación autorizada por el servidor', () => {
  it('abre el código escaneado sin sumar sellos ni pedir sucursal', async () => {
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    expect(
      await screen.findByLabelText('Referencia del ticket (opcional)'),
    ).toBeVisible();
    expect(screen.getByText('••• ••• 45 67')).toBeVisible();
    expect(screen.queryByText(/Sucursal/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revertir/ })).toBeNull();
    expect(state.call).toHaveBeenCalledTimes(1);
    expect(state.call).toHaveBeenCalledWith({
      path: '/operator/scans',
      body: { restaurant_id: restaurantId, token, purpose: 'card' },
    });
  });

  it('registra una compra con referencia única y +1 fijo', async () => {
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    fireEvent.change(
      await screen.findByLabelText('Referencia del ticket (opcional)'),
      { target: { value: 'FACT-9001' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Registrar compra · +1 sello' }),
    );
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith({
        path: '/operator/purchases',
        body: {
          restaurant_id: restaurantId,
          token,
          sale_reference: 'FACT-9001',
        },
      }),
    );
    expect(
      screen.getByText('Compra registrada. Se sumó un sello.'),
    ).toBeVisible();
  });

  it('el QR de canje exige confirmación y no ofrece sumar sellos', async () => {
    state.scan = scanResult({
      reward: {
        id: 'reward',
        description: 'Un café',
        status: 'available',
        voucher_token: token,
      },
      allowed_actions: ['redeem'],
    });
    render(
      <OperationsPanel
        restaurantId={restaurantId}
        initialToken={token}
        initialPurpose="reward"
      />,
    );
    expect(
      await screen.findByText('Entrega del premio', { exact: false }),
    ).toBeVisible();
    expect(state.call).toHaveBeenCalledWith({
      path: '/operator/scans',
      body: { restaurant_id: restaurantId, token, purpose: 'reward' },
    });
    expect(
      screen.queryByLabelText('Referencia del ticket (opcional)'),
    ).not.toBeInTheDocument();
    const confirm = screen.getByRole('checkbox');
    fireEvent.click(confirm);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar entrega y reiniciar ciclo',
      }),
    );
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith({
        path: '/operator/redemptions',
        body: { restaurant_id: restaurantId, token, confirm: true },
      }),
    );
    expect(screen.getByText('Premio canjeado: Un café')).toBeVisible();
  });

  it('prepara el enlace de WhatsApp sin afirmar que fue entregado', async () => {
    state.scan = scanResult({
      reward: {
        id: 'reward',
        description: 'Un café',
        status: 'available',
        voucher_token: token,
      },
      allowed_actions: ['redeem'],
    });
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Preparar envío por WhatsApp',
      }),
    );
    expect(
      await screen.findByText(/El mensaje no se envía solo/),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Abrir WhatsApp/ }),
    ).toHaveAttribute('href', 'https://wa.me/573001234567');
  });

  it('rechaza un código malformado sin consultar al servidor', async () => {
    render(<OperationsPanel restaurantId={restaurantId} />);
    fireEvent.change(screen.getByLabelText('Código o enlace del QR'), {
      target: { value: 'https://evil.test/scan#token=wrong' },
    });
    fireEvent.submit(
      screen.getByLabelText('Código o enlace del QR').closest('form')!,
    );
    expect(await screen.findByText(/código válido/i)).toBeVisible();
    expect(state.call).not.toHaveBeenCalled();
  });

  it('permite elegir sucursal y la envía en la compra', async () => {
    localStorage.setItem('loyalty:last-location', 'l2');
    state.scan = scanResult({
      locations: [
        { id: 'l1', name: 'Centro' },
        { id: 'l2', name: 'Norte' },
      ],
    });
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    const select = await screen.findByLabelText('Sucursal');
    expect(select).toHaveValue('l2');
    fireEvent.change(select, { target: { value: 'l1' } });
    expect(localStorage.getItem('loyalty:last-location')).toBe('l1');
    fireEvent.change(
      screen.getByLabelText('Referencia del ticket (opcional)'),
      {
        target: { value: 'FACT-1' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: /Registrar compra/ }));
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith({
        path: '/operator/purchases',
        body: {
          restaurant_id: restaurantId,
          token,
          sale_reference: 'FACT-1',
          location_id: 'l1',
        },
      }),
    );
  });

  it('muestra como texto la única sucursal', async () => {
    state.scan = scanResult({ locations: [{ id: 'l1', name: 'Centro' }] });
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    expect(await screen.findByText('Sucursal: Centro')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Sucursal' })).toBeNull();
  });

  it('la referencia es opcional y no se envía vacía', async () => {
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    await screen.findByLabelText('Referencia del ticket (opcional)');
    fireEvent.click(
      screen.getByRole('button', { name: 'Registrar compra · +1 sello' }),
    );
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith({
        path: '/operator/purchases',
        body: { restaurant_id: restaurantId, token },
      }),
    );
  });

  async function failPurchase(code: string, message: string) {
    state.call.mockImplementation(async (input: { path: string }) => {
      if (input.path === '/operator/scans') return state.scan;
      throw Object.assign(new Error(message), { code });
    });
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Registrar compra · +1 sello',
      }),
    );
  }

  it('muestra el tiempo de espera destacado', async () => {
    await failPurchase('STAMP_COOLDOWN', 'Espera 3 h 59 min para otro sello.');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Espera 3 h 59 min para otro sello.');
    expect(state.call).toHaveBeenCalledTimes(2);
  });

  it('explica el QR vencido', async () => {
    await failPurchase('CARD_QR_EXPIRED', 'Este QR ya venció.');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este QR ya venció.',
    );
  });

  it('un canje repetido dice que el premio ya fue usado', async () => {
    state.scan = scanResult({
      reward: {
        id: 'reward',
        description: 'Un café',
        status: 'available',
        voucher_token: token,
      },
      allowed_actions: ['redeem'],
    });
    state.call.mockImplementation(async (input: { path: string }) => {
      if (input.path === '/operator/scans') return state.scan;
      throw Object.assign(new Error('x'), { code: 'REWARD_ALREADY_REDEEMED' });
    });
    render(
      <OperationsPanel restaurantId={restaurantId} initialToken={token} />,
    );
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirmar entrega y reiniciar ciclo',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este premio ya fue usado.',
    );
  });
});
