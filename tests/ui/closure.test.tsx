import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ClosureForm } from '../../src/features/customer';

const mutateAsync = vi
  .fn()
  .mockResolvedValue({ id: 'consent', expires_at: '2026-10-19T12:00:00Z' });
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useAction: () => ({ mutateAsync, isPending: false }),
  useResource: () => ({
    data: {
      card_id: 'card',
      benefits_version: 3,
      balance: 4,
      rewards: [{ id: 'reward' }],
    },
    isLoading: false,
  }),
}));
it('BR-020/021 exige aceptación explícita y muestra beneficios antes de confirmar', async () => {
  render(<ClosureForm cardId="card" />);
  expect(screen.getByText('4 sellos')).toBeVisible();
  const button = screen.getByRole('button', { name: 'Confirmar mi decisión' });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button);
  await waitFor(() =>
    expect(mutateAsync).toHaveBeenCalledWith({
      path: '/me/cards/card/closure-consents',
      body: { benefits_version: 3, accepted: true },
    }),
  );
});
