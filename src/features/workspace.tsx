import {
  ArrowRight,
  CreditCard,
  LogOut,
  Plus,
  ScanLine,
  Store,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { CardsPanel } from './cards-admin';
import { CustomerCardsPage } from './customer';
import { RestaurantForm } from './management';
import { OperationsPanel } from './operations';
import { ProgramsPanel } from './programs';
import { TeamPanel } from './team';

export function WorkspacePage() {
  const auth = useAuth();
  const restaurants = useCollection<Restaurant>(
    auth.user ? '/restaurants' : null,
  );
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('programs');
  const [creating, setCreating] = useState(false);
  const [businessOnboarding, setBusinessOnboarding] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  useEffect(() => {
    setBusinessOnboarding(
      new URLSearchParams(window.location.search).get('onboarding') ===
        'business',
    );
  }, []);
  const restaurant =
    restaurants.items.find((item) => item.id === selected) ??
    restaurants.items[0];
  const role = restaurant?.actor_role ?? 'employee';
  const canManage = ['owner', 'admin'].includes(role);
  const nav = [
    ...(canManage
      ? [{ id: 'programs', label: 'Mi programa', icon: CreditCard }]
      : []),
    { id: 'operations', label: 'Escáner', icon: ScanLine },
    ...(canManage
      ? [
          { id: 'cards', label: 'Tarjetas', icon: CreditCard },
          { id: 'team', label: 'Equipo', icon: Users },
        ]
      : []),
  ];
  const activeTab = canManage ? tab : 'operations';
  const showCreation = canManage && creating;

  async function logout() {
    try {
      await auth.logout();
      window.location.assign('/');
    } catch (error) {
      setLogoutError(error);
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
                <a
                  href={`/auth?next=${encodeURIComponent(businessOnboarding ? '/app?onboarding=business' : '/app')}`}
                >
                  Iniciar sesión
                  <ArrowRight size={17} />
                </a>
              </Button>
            }
          >
            Entra a tu cuenta para gestionar tu programa, tu equipo y tus
            operaciones.
          </Empty>
        )}
      </main>
    );
  if (restaurants.isLoading)
    return (
      <main id="main-content" className="standalone">
        <Loading label="Preparando tu espacio…" />
      </main>
    );
  if (restaurants.error && !restaurant)
    return (
      <main id="main-content" className="standalone">
        <Brand />
        <ErrorNotice
          error={restaurants.error}
          retry={() => void restaurants.refetch()}
        />
      </main>
    );
  if (!restaurant && !businessOnboarding) return <CustomerCardsPage />;
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
              className={activeTab === item.id && !showCreation ? 'active' : ''}
              aria-current={
                activeTab === item.id && !showCreation ? 'page' : undefined
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
          <p className="field-hint break-all">{auth.user.email}</p>
          {canManage && (
            <>
              <button type="button" onClick={() => setCreating(true)}>
                <Plus size={18} />
                Nuevo restaurante
              </button>
              <a href="/cards">
                <CreditCard size={18} />
                Mis tarjetas personales
              </a>
            </>
          )}
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
          ) : showCreation ||
            (!restaurants.error && !restaurant && businessOnboarding) ? (
            <>
              <PageTitle
                title="Aquí empiezan las buenas visitas"
                description="Crea tu restaurante y dale forma a tu programa."
              />
              <RestaurantForm
                onCreated={(result) => {
                  setSelected(result.id);
                  setCreating(false);
                  setTab('programs');
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
                  <OperationsPanel restaurantId={restaurant.id} />
                )}
                {activeTab === 'cards' && canManage && (
                  <CardsPanel restaurantId={restaurant.id} />
                )}
                {activeTab === 'team' && canManage && (
                  <TeamPanel restaurantId={restaurant.id} />
                )}
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
