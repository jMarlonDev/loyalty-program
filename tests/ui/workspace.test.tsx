import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleProgram } from '../../src/components/loyalty-card';
import { ProgramEditor } from '../../src/features/programs';
import { WorkspacePage } from '../../src/features/workspace';

const state = vi.hoisted(() => ({ role: 'employee', calls: [] as string[] }));
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user', email: 'staff@example.com' },
    loading: false,
    error: null,
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
  useCollection: (path: string) => {
    state.calls.push(path);
    return {
      items:
        path === '/restaurants'
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
  });
  it('Owner dispone de tarjetas y equipo', () => {
    state.role = 'owner';
    render(<WorkspacePage />);
    expect(
      screen.getByRole('heading', { name: 'Tarjetas de lealtad' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Equipo' })).toBeVisible();
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
