import {
  ArrowRight,
  CreditCard,
  LogOut,
  MapPin,
  Plus,
  ScanLine,
  Settings,
  Store,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  Brand,
  Empty,
  ErrorNotice,
  Loading,
  MoreButton,
  PageTitle,
} from '../components/common';
import { Button } from '../components/ui/button';
import { useCollection } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Restaurant } from '../lib/types';
import { statusLabel } from '../lib/utils';
import {
  LocationsPanel,
  RestaurantForm,
  RestaurantSettings,
  StaffPanel,
} from './management';
import { OperationsPanel } from './operations';
import { ProgramsPanel } from './programs';
export function WorkspacePage() {
  const auth = useAuth(),
    restaurants = useCollection<Restaurant>(auth.user ? '/restaurants' : null);
  const [selected, setSelected] = useState(''),
    [tab, setTab] = useState('programs'),
    [creating, setCreating] = useState(false),
    [logoutError, setLogoutError] = useState<unknown>(null);
  const restaurant =
    restaurants.items.find((item) => item.id === selected) ??
    restaurants.items[0];
  const role = restaurant?.actor_role ?? 'employee',
    canManage = ['owner', 'admin'].includes(role);
  const nav = [
    ...(canManage
      ? [{ id: 'programs', label: 'Programas', icon: CreditCard }]
      : []),
    { id: 'operations', label: 'Operaciones', icon: ScanLine },
    { id: 'locations', label: 'Sucursales', icon: MapPin },
    ...(canManage
      ? [
          { id: 'staff', label: 'Equipo', icon: Users },
          { id: 'settings', label: 'Ajustes', icon: Settings },
        ]
      : []),
  ];
  const activeTab =
    !canManage && ['staff', 'settings', 'programs'].includes(tab)
      ? 'operations'
      : tab;
  async function logout() {
    try {
      await auth.logout();
      window.location.assign('/');
    } catch (e) {
      setLogoutError(e);
    }
  }
  if (auth.loading)
    return (
      <main id="main-content" className="standalone">
        <Loading label="Preparando tu espacio…" />
      </main>
    );
  if (!auth.user)
    return (
      <main id="main-content" className="standalone">
        <Brand />
        <ErrorNotice
          error={auth.error ? new Error(auth.error) : null}
          retry={() => void auth.reload()}
        />
        {!auth.error && (
          <Empty
            title="El lugar de tus mejores clientes"
            action={
              <Button asChild>
                <a href="/auth?next=%2Fapp">
                  Iniciar sesión
                  <ArrowRight size={17} />
                </a>
              </Button>
            }
          >
            Entra a tu cuenta para gestionar tu restaurante, tus programas y tu
            equipo.
          </Empty>
        )}
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-context">
          <label htmlFor="restaurant-select">Tu restaurante</label>
          <select
            id="restaurant-select"
            aria-label="Tu restaurante"
            className="input"
            value={restaurant?.id ?? ''}
            onChange={(event) => {
              setSelected(event.target.value);
              setCreating(false);
              setTab('programs');
            }}
          >
            <option value="" disabled>
              Selecciona un restaurante
            </option>
            {restaurants.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {restaurant && (
            <span className="role-label">{statusLabel(role)}</span>
          )}
          <MoreButton {...restaurants} />
        </div>
        <nav className="workspace-nav" aria-label="Gestión del restaurante">
          {nav.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activeTab === item.id && !creating ? 'active' : ''}
              aria-current={
                activeTab === item.id && !creating ? 'page' : undefined
              }
              onClick={() => {
                setTab(item.id);
                setCreating(false);
              }}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" onClick={() => setCreating(true)}>
            <Plus size={18} />
            Nuevo restaurante
          </button>
          <a href="/cards">
            <CreditCard size={18} />
            Mis tarjetas personales
          </a>
          <button type="button" onClick={() => void logout()}>
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <span>
            <Store size={17} />
            {restaurant?.name ?? 'Tu espacio de lealtad'}
          </span>
          <a href="/cards">
            Mis tarjetas
            <ArrowRight size={16} />
          </a>
        </header>
        <main id="main-content" className="workspace-content">
          <ErrorNotice
            error={logoutError || restaurants.error}
            retry={() => void restaurants.refetch()}
          />
          {restaurants.isLoading ? (
            <Loading />
          ) : creating || (!restaurants.error && !restaurant) ? (
            <>
              <PageTitle
                title="Aquí empiezan las buenas visitas"
                description="Crea tu restaurante y dale forma a tu primer programa."
              />
              <RestaurantForm
                onCreated={(result) => {
                  setSelected(result.id);
                  setCreating(false);
                  setTab('locations');
                }}
              />
            </>
          ) : (
            restaurant && (
              <div key={restaurant.id}>
                {activeTab === 'programs' && (
                  <ProgramsPanel
                    restaurantId={restaurant.id}
                    canManage={canManage}
                  />
                )}
                {activeTab === 'operations' && (
                  <OperationsPanel
                    restaurantId={restaurant.id}
                    canManage={canManage}
                  />
                )}
                {activeTab === 'locations' && (
                  <LocationsPanel
                    restaurantId={restaurant.id}
                    canManage={canManage}
                  />
                )}
                {activeTab === 'staff' && canManage && (
                  <StaffPanel restaurantId={restaurant.id} role={role} />
                )}
                {activeTab === 'settings' && canManage && (
                  <RestaurantSettings restaurant={restaurant} />
                )}
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
