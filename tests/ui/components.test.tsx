import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exampleProgram, LoyaltyCard } from '../../src/components/loyalty-card';
import { Button } from '../../src/components/ui/button';
import { Dialog } from '../../src/components/ui/dialog';
import { LandingPage } from '../../src/features/landing';

describe('tarjeta digital y accesibilidad', () => {
  it('expone el saldo y genera un QR real únicamente con token', () => {
    const view = render(<LoyaltyCard program={exampleProgram} balance={3} />);
    expect(screen.getByLabelText('3 de 8 sellos')).toBeInTheDocument();
    expect(screen.queryByLabelText('QR de tu tarjeta')).not.toBeInTheDocument();
    view.rerender(
      <LoyaltyCard
        program={exampleProgram}
        balance={3}
        token={'a'.repeat(43)}
      />,
    );
    expect(
      screen.getByLabelText('QR de tu tarjeta').querySelector('path'),
    ).not.toBeNull();
  });
  it('respeta metas grandes sin crear millones de elementos', () => {
    const { container } = render(
      <LoyaltyCard
        program={{ ...exampleProgram, stamps_required: 2147483647 }}
        balance={5}
      />,
    );
    expect(container.querySelectorAll('.stamp')).toHaveLength(20);
    expect(screen.getByText('5 de 2147483647 sellos')).toBeVisible();
  });
  it('identifica explícitamente la tarjeta de ejemplo', () => {
    render(<LoyaltyCard program={exampleProgram} example />);
    expect(screen.getByText(/sin valor comercial/)).toBeVisible();
  });
  it('el logo roto muestra un icono y conserva el nombre', () => {
    const { container } = render(
      <LoyaltyCard
        program={{
          ...exampleProgram,
          logo_url: 'https://example.com/logo.png',
        }}
      />,
    );
    const logo = container.querySelector('img');
    if (!logo) throw new Error('Expected logo image');
    fireEvent.error(logo);
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByRole('heading', { name: exampleProgram.name }),
    ).toBeVisible();
  });
  it('el diálogo incluye nombre accesible y cierre por teclado', () => {
    let closed = false;
    render(
      <Dialog
        open
        onOpenChange={(value) => {
          closed = !value;
        }}
        title="Cerrar tarjeta"
        description="Confirma la operación."
      >
        <Button>Aceptar</Button>
      </Dialog>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Cerrar tarjeta' }),
    ).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(true);
  });
  it('la presentación lleva a acceso real y no promete Wallet', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('link', { name: /Crear mi programa/ }),
    ).toHaveAttribute('href', '/auth?mode=signup');
    expect(
      screen.queryByText(/Apple Wallet|Google Wallet/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Ver mis tarjetas/ }),
    ).toHaveAttribute('href', '/cards');
  });
});
