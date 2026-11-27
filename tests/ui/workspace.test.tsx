import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleProgram } from '../../src/components/loyalty-card';
import { ProgramEditor } from '../../src/features/programs';
import { WorkspacePage } from '../../src/features/workspace';

const state = vi.hoisted(() => ({
  role: 'employee',
  calls: [] as string[],
  restaurants: true,
  error: null as Error | null,
}));
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user', email: 'staff@example.com' },
    loading: false,
    error: null,
  }),
}));
vi.mock('../../src/lib/public-config', () => ({
  useAppOrigin: () => ({
    origin: 'https://loyalty.example.test',
    isLoading: false,
  }),
}));
vi.mock('../../src/lib/api', () => ({
  ApiError: class extends Error {},
  useAction: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  }),
  useResource: () => ({ data: undefined, isLoading: false }),
  useCustomerSession: () => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCustomerResource: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCustomerAction: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
  useCollection: (path: string) => {
    state.calls.push(path);
    return {
      items:
        path === '/restaurants' && state.restaurants
          ? [
              {
                id: 'restaurant',
                name: 'Negocio',
                actor_role: state.role,
                status: 'active',
              },
            ]
          : [],
      isLoading: false,
      error: path === '/restaurants' ? state.error : null,
      isPending: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  },
}));
beforeEach(() => {
  state.role = 'employee';
  state.calls = [];
  state.restaurants = true;
  state.error = null;
  window.history.replaceState({}, '', '/app');
});
describe('permisos de presentación', () => {
  it('Employee entra a registrar y no consulta programas administrativos', () => {
    render(<WorkspacePage />);
    expect(
      screen.getByRole('heading', { name: 'Una visita, un sello' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Programas' }),
    ).not.toBeInTheDocument();
    expect(state.calls).not.toContain('/restaurants/restaurant/programs');
    expect(
      screen.queryByRole('button', { name: 'Equipo' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Nuevo restaurante' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sucursales' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mi programa' })).toBeNull();
  });
  it('ROLE-001 cliente sin membresías entra a tarjetas sin creación de negocio', () => {
    state.restaurants = false;
    render(<WorkspacePage />);
    expect(screen.getByText('Tus tarjetas viven en tu teléfono')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Crear restaurante' }),
    ).not.toBeInTheDocument();
  });
  it('ROLE-001 alta de negocio explícita permite crear el primer restaurante', () => {
    state.restaurants = false;
    window.history.replaceState({}, '', '/app?onboarding=business');
    render(<WorkspacePage />);
    expect(
      screen.getByRole('button', { name: 'Crear restaurante' }),
    ).toBeVisible();
  });
  it('ROLE-001 empleado no abre creación con parámetros de onboarding', () => {
    window.history.replaceState({}, '', '/app?onboarding=business');
    render(<WorkspacePage />);
    expect(
      screen.getByRole('heading', { name: 'Una visita, un sello' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Crear restaurante' }),
    ).not.toBeInTheDocument();
  });
  it('ROLE-001 error al consultar permisos no habilita alta ni vista de cliente', () => {
    state.restaurants = false;
    state.error = new Error('No se pudo consultar el equipo');
    render(<WorkspacePage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo consultar el equipo',
    );
    expect(
      screen.queryByRole('button', { name: 'Nuevo restaurante' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Crear restaurante' }),
    ).not.toBeInTheDocument();
  });
  it('ROLE-001 el dueño administra su programa, equipo y restaurantes', () => {
    state.role = 'admin';
    render(<WorkspacePage />);
    for (const name of ['Mi programa', 'Equipo', 'Nuevo restaurante']) {
      expect(screen.getByRole('button', { name })).toBeVisible();
    }
    expect(screen.queryByRole('button', { name: 'Sucursales' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajustes' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo restaurante' }));
    expect(
      screen.getByRole('button', { name: 'Crear restaurante' }),
    ).toBeVisible();
  });
  it('ROLE-001 si el permiso cambia a Employee retira el formulario administrativo abierto', () => {
    state.role = 'admin';
    const view = render(<WorkspacePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo restaurante' }));
    expect(
      screen.getByRole('button', { name: 'Crear restaurante' }),
    ).toBeVisible();
    state.role = 'employee';
    view.rerender(<WorkspacePage />);
    expect(
      screen.queryByRole('button', { name: 'Crear restaurante' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Una visita, un sello' }),
    ).toBeVisible();
  });
  it('Owner dispone de programa y equipo sin catálogo de roles', () => {
    state.role = 'owner';
    render(<WorkspacePage />);
    expect(
      screen.getByRole('heading', { name: 'Tarjetas de lealtad' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Equipo' })).toBeVisible();
    expect(screen.queryByText(/Administrador|Empleado/)).toBeNull();
  });
  it('BR-018 bloquea condiciones inscritas y permite cambiar diseño', () => {
    render(
      <ProgramEditor
        restaurantId="restaurant"
        program={{ ...exampleProgram, terms_locked: true }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Sellos para ganar')).toBeDisabled();
    expect(screen.getByLabelText('Recompensa')).toBeDisabled();
    expect(screen.getByLabelText('Nombre de la tarjeta')).toBeEnabled();
    expect(screen.getByLabelText('Color de fondo')).toBeEnabled();
  });
  it('permite definir meta antes de la primera inscripción', () => {
    render(
      <ProgramEditor
        restaurantId="restaurant"
        program={{ ...exampleProgram, terms_locked: false }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Sellos para ganar')).toBeEnabled();
    expect(screen.getByLabelText('Recompensa')).toBeEnabled();
  });
  it('un programa finalizado no ofrece reactivarse', () => {
    render(
      <ProgramEditor
        restaurantId="restaurant"
        program={{ ...exampleProgram, status: 'ended' }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole('option', { name: 'Activo' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Pausado' })).toBeDisabled();
  });
});
