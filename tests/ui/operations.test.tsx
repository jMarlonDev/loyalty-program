import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsPanel } from '../../src/features/operations';

const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useAction: () => ({
    mutateAsync: state.call,
    reset: vi.fn(),
    isPending: false,
  }),
  useCollection: () => ({
    items: [{ id: 'location', name: 'Principal', status: 'active' }],
    hasNextPage: false,
  }),
}));
beforeEach(() => {
  state.call.mockReset().mockResolvedValue({
    id: 'card',
    balance: 2,
    program_name: 'Club',
    stamps_required: 8,
  });
});
describe('QR hacia formulario de sello', () => {
  it('resuelve token inicial y abre formulario sin registrar compra', async () => {
    render(
      <OperationsPanel
        restaurantId="11111111-1111-4111-8111-111111111111"
        canManage={false}
        initialToken={'a'.repeat(43)}
      />,
    );
    expect(
      await screen.findByLabelText('Referencia única de venta'),
    ).toBeVisible();
    expect(state.call).toHaveBeenCalledTimes(1);
    expect(state.call).toHaveBeenCalledWith({
      path: '/restaurants/11111111-1111-4111-8111-111111111111/cards/resolve',
      body: { token: 'a'.repeat(43) },
    });
  });
  it('acepta enlace QR pegado y nunca lo envía como token', async () => {
    render(
      <OperationsPanel
        restaurantId="11111111-1111-4111-8111-111111111111"
        canManage={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Código de la tarjeta'), {
      target: {
        value: `${location.origin}/scan#token=${'a'.repeat(43)}&restaurant=11111111-1111-4111-8111-111111111111`,
      },
    });
    fireEvent.submit(
      screen
        .getByLabelText('Código de la tarjeta')
        .closest('form') as HTMLFormElement,
    );
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith(
        expect.objectContaining({ body: { token: 'a'.repeat(43) } }),
      ),
    );
  });
  it('rechaza código malformado sin consultar ni otorgar sellos', async () => {
    render(
      <OperationsPanel
        restaurantId="11111111-1111-4111-8111-111111111111"
        canManage={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Código de la tarjeta'), {
      target: { value: 'https://evil.test/scan#token=wrong' },
    });
    fireEvent.submit(
      screen
        .getByLabelText('Código de la tarjeta')
        .closest('form') as HTMLFormElement,
    );
    expect(await screen.findByText(/código de tarjeta válido/i)).toBeVisible();
    expect(state.call).not.toHaveBeenCalled();
  });
});
