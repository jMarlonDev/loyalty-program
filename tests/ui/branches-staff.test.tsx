import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchesPanel } from '../../src/features/branches';
import { StaffPanel } from '../../src/features/staff';

const state = vi.hoisted(() => ({
  action: vi.fn(),
  invitations: [] as unknown[],
  staff: [] as unknown[],
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <span data-testid="qr-value">{value}</span>
  ),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useAction: () => ({
    mutateAsync: state.action,
    isPending: false,
    error: null,
  }),
  useResource: (path: string) => {
    const data = path.endsWith('/branches')
      ? [
          {
            id: 'b1',
            name: 'Centro',
            address: 'Calle 1',
            physical_point: null,
            status: 'active',
            employees: 2,
          },
          {
            id: 'b2',
            name: 'Norte',
            address: 'Calle 2',
            physical_point: null,
            status: 'active',
            employees: 0,
          },
        ]
      : path.endsWith('/branch-invitations')
        ? state.invitations
        : state.staff;
    return { data, isLoading: false, error: null, refetch: vi.fn() };
  },
}));
beforeEach(() => {
  state.action.mockReset();
  state.invitations = [];
  state.staff = [];
});

describe('sucursales', () => {
  it('crea una sucursal', async () => {
    state.action.mockResolvedValue({});
    render(<BranchesPanel restaurantId="r1" />);
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Sur' },
    });
    fireEvent.change(screen.getByLabelText('Dirección'), {
      target: { value: 'Av 3' },
    });
    fireEvent.change(screen.getByLabelText(/Punto físico/), {
      target: { value: 'Caja 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));
    await waitFor(() =>
      expect(state.action).toHaveBeenCalledWith({
        path: '/restaurants/r1/branches',
        body: { name: 'Sur', address: 'Av 3', physical_point: 'Caja 1' },
      }),
    );
  });

  it('genera una invitación con valores por defecto y muestra el QR', async () => {
    state.action.mockResolvedValue({
      id: 'i1',
      token: 't',
      url: 'https://x.test/join-staff#token=t',
      expires_at: '2026-12-01T00:00:00Z',
      max_uses: 1,
      uses: 0,
      state: 'valid',
      location_name: 'Centro',
    });
    render(<BranchesPanel restaurantId="r1" />);
    fireEvent.click(
      screen.getAllByRole('button', { name: /Invitar empleado/ })[0],
    );
    expect(screen.getByLabelText('Vigencia (horas)')).toHaveValue(24);
    expect(screen.getByLabelText('Usos máximos')).toHaveValue(1);
    fireEvent.click(screen.getByRole('button', { name: 'Generar QR' }));
    expect(await screen.findByTestId('qr-value')).toHaveTextContent(
      'https://x.test/join-staff#token=t',
    );
    expect(state.action).toHaveBeenCalledWith({
      path: '/restaurants/r1/branches/b1/invitations',
      body: { expires_in_hours: 24, max_uses: 1 },
    });
  });

  it('renueva y revoca invitaciones', async () => {
    state.invitations = [
      {
        id: 'i1',
        location_id: 'b1',
        location_name: 'Centro',
        expires_at: '2026-12-01T00:00:00Z',
        max_uses: 3,
        uses: 1,
        state: 'valid',
      },
    ];
    state.action.mockResolvedValue({
      id: 'i2',
      token: 'n',
      url: 'https://x.test/join-staff#token=n',
      expires_at: '2026-12-02T00:00:00Z',
      max_uses: 3,
      uses: 0,
      state: 'valid',
      location_name: 'Centro',
    });
    render(<BranchesPanel restaurantId="r1" />);
    expect(screen.getByText('Vigente')).toBeVisible();
    expect(screen.getByText(/1\/3 usos/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Renovar' }));
    expect(
      await screen.findByText(/invitación anterior dejó de servir/),
    ).toBeVisible();
    expect(screen.getByTestId('qr-value')).toHaveTextContent('token=n');
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    await waitFor(() =>
      expect(state.action).toHaveBeenCalledWith({
        path: '/restaurants/r1/branch-invitations/i1/revoke',
      }),
    );
  });
});

describe('empleados', () => {
  it('crea un empleado y muestra la contraseña temporal una vez', async () => {
    state.action.mockResolvedValue({
      employee_id: 'e1',
      email: 'ana@x.test',
      temporary_password: 'Temp-1234',
      existing_account: false,
    });
    render(<StaffPanel restaurantId="r1" />);
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByLabelText('Correo'), {
      target: { value: 'ana@x.test' },
    });
    fireEvent.click(screen.getByLabelText('Norte'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }));
    expect(await screen.findByText('Temp-1234')).toBeVisible();
    expect(screen.getByText(/no se volverá a mostrar/)).toBeVisible();
    expect(state.action).toHaveBeenCalledWith({
      path: '/restaurants/r1/staff',
      body: { email: 'ana@x.test', full_name: 'Ana', location_ids: ['b2'] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Temp-1234')).toBeNull();
  });

  it('edita las sucursales de un empleado', async () => {
    state.staff = [
      {
        id: 'e1',
        user_id: 'u1',
        full_name: 'Ana',
        email: 'ana@x.test',
        status: 'active',
        must_change_password: false,
        can_transfer_cards: false,
        locations: [{ id: 'b1', name: 'Centro' }],
      },
    ];
    state.action.mockResolvedValue({});
    render(<StaffPanel restaurantId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar sucursales' }));
    const boxes = screen.getAllByLabelText('Norte');
    fireEvent.click(boxes[boxes.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar sucursales' }));
    await waitFor(() =>
      expect(state.action).toHaveBeenCalledWith({
        path: '/restaurants/r1/staff/e1/locations',
        method: 'PATCH',
        body: { location_ids: ['b1', 'b2'] },
      }),
    );
  });
});
