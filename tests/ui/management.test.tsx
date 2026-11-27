import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RestaurantForm,
  RestaurantSettings,
  StaffPanel,
} from '../../src/features/management';
import type { Restaurant } from '../../src/lib/types';

const state = vi.hoisted(() => ({ mutateAsync: vi.fn(), members: false }));
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'owner', email: 'owner@example.test' } }),
}));
vi.mock('../../src/components/public-share-qr', () => ({
  PublicShareQr: ({ path, title }: { path: string; title: string }) => (
    <a href={path}>{title}</a>
  ),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useAction: () => ({
    mutateAsync: state.mutateAsync,
    reset: vi.fn(),
    isPending: false,
  }),
  useCollection: (path: string) => ({
    items:
      state.members && path.endsWith('/employees')
        ? [
            {
              id: 'owner',
              full_name: 'Dueño',
              role: 'owner',
              status: 'active',
            },
            {
              id: 'admin',
              full_name: 'Administradora',
              role: 'admin',
              status: 'active',
            },
          ]
        : [],
    isLoading: false,
    hasNextPage: false,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.members = false;
  state.mutateAsync.mockResolvedValue({ id: 'restaurant' });
});
describe('FLOW-001 formularios de negocio y equipo', () => {
  it('ROLE-001 Admin invita administradores con el mismo formulario de equipo', async () => {
    render(<StaffPanel restaurantId="restaurant" actorRole="admin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Invitar persona' }));
    expect(screen.getByRole('option', { name: /Administrador/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Rol'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'admin2@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear invitación' }));
    await waitFor(() =>
      expect(state.mutateAsync).toHaveBeenCalledWith({
        path: '/restaurants/restaurant/invitations',
        body: { email: 'admin2@example.test', role: 'admin' },
      }),
    );
  });
  it('ROLE-001 Admin cambia otro administrador y conserva protección del Owner', async () => {
    state.members = true;
    render(<StaffPanel restaurantId="restaurant" actorRole="admin" />);
    const owner = screen
      .getByRole('heading', { name: 'Dueño' })
      .closest('article') as HTMLElement;
    const admin = screen
      .getByRole('heading', { name: 'Administradora' })
      .closest('article') as HTMLElement;
    expect(
      within(owner).queryByRole('button', { name: 'Permisos' }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(admin).getByRole('button', { name: 'Permisos' }));
    fireEvent.change(screen.getByLabelText('Rol'), {
      target: { value: 'employee' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));
    await waitFor(() =>
      expect(state.mutateAsync).toHaveBeenCalledWith({
        path: '/restaurants/restaurant/employees/admin',
        method: 'PATCH',
        body: { role: 'employee', status: 'active' },
      }),
    );
  });
  it('ROLE-001 Admin modifica el estado de su restaurante', async () => {
    render(
      <RestaurantSettings
        restaurant={
          {
            id: 'restaurant',
            name: 'Negocio',
            actor_role: 'admin',
            status: 'active',
          } as Restaurant
        }
      />,
    );
    fireEvent.change(screen.getByLabelText('Estado'), {
      target: { value: 'suspended' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    await waitFor(() =>
      expect(state.mutateAsync).toHaveBeenCalledWith({
        path: '/restaurants/restaurant',
        method: 'PATCH',
        body: {
          name: 'Negocio',
          email: null,
          phone: null,
          status: 'suspended',
        },
      }),
    );
  });
  it('crea un restaurante sin identificador único manual ni slug', async () => {
    const onCreated = vi.fn();
    render(<RestaurantForm onCreated={onCreated} />);
    expect(
      screen.queryByLabelText('Identificador único'),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre del restaurante'), {
      target: { value: 'Restaurante Vuelta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear restaurante' }));
    await waitFor(() =>
      expect(state.mutateAsync).toHaveBeenCalledWith({
        path: '/restaurants',
        body: { name: 'Restaurante Vuelta', email: null, phone: null },
      }),
    );
    expect(onCreated).toHaveBeenCalledWith({ id: 'restaurant' });
  });
  it('evita la invitación al mismo dueño y explica sus permisos actuales', async () => {
    render(<StaffPanel restaurantId="restaurant" actorRole="owner" />);
    fireEvent.click(screen.getByRole('button', { name: 'Invitar persona' }));
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'OWNER@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear invitación' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /ya puedes registrar compras/i,
      ),
    );
    expect(state.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue(
      'OWNER@example.test',
    );
  });
  it('permite introducir otro correo y comparte únicamente el QR recién creado', async () => {
    state.mutateAsync.mockResolvedValue({
      id: 'invitation',
      email: 'staff@example.test',
      token: 'staff-token',
    });
    render(<StaffPanel restaurantId="restaurant" actorRole="owner" />);
    fireEvent.click(screen.getByRole('button', { name: 'Invitar persona' }));
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('');
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute(
      'autocomplete',
      'off',
    );
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'staff@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear invitación' }));
    await waitFor(() =>
      expect(state.mutateAsync).toHaveBeenCalledWith({
        path: '/restaurants/restaurant/invitations',
        body: { email: 'staff@example.test', role: 'employee' },
      }),
    );
    expect(
      await screen.findByRole('link', {
        name: 'Invitación para staff@example.test',
      }),
    ).toHaveAttribute('href', '/invite/staff-token');
    fireEvent.click(screen.getByRole('button', { name: 'Invitar persona' }));
    expect(
      screen.queryByRole('link', {
        name: 'Invitación para staff@example.test',
      }),
    ).not.toBeInTheDocument();
  });
});
