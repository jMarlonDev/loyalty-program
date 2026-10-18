import { MapPin, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  MoreButton,
  PageTitle,
} from '../components/common';
import { PublicShareQr } from '../components/public-share-qr';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAction, useCollection } from '../lib/api';
import type { Employee, Invitation, Location, Restaurant } from '../lib/types';
import { statusLabel } from '../lib/utils';
export function RestaurantForm({
  onCreated,
}: {
  onCreated: (restaurant: Restaurant) => void;
}) {
  const action = useAction<Restaurant>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await action.mutateAsync({
        path: '/restaurants',
        body: {
          name: data.get('name'),
          slug: data.get('slug'),
          email: data.get('email') || null,
          phone: data.get('phone') || null,
        },
      });
      onCreated(result);
    } catch {}
  }
  return (
    <form className="panel stack narrow-panel" onSubmit={submit}>
      <h2>Tu restaurante, tu comunidad</h2>
      <p className="muted">
        Al crearlo tendrás el rol de propietario y podrás invitar a tu equipo.
      </p>
      <Field label="Nombre del restaurante">
        {(id) => (
          <Input
            id={id}
            name="name"
            required
            maxLength={255}
            placeholder="Punto de encuentro"
          />
        )}
      </Field>
      <Field
        label="Identificador único"
        hint="Letras minúsculas, números y guiones."
      >
        {(id) => (
          <Input
            id={id}
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="punto-de-encuentro"
            maxLength={255}
          />
        )}
      </Field>
      <Field label="Correo del restaurante (opcional)">
        {(id) => <Input id={id} name="email" type="email" />}
      </Field>
      <Field label="Teléfono (opcional)">
        {(id) => <Input id={id} name="phone" type="tel" maxLength={20} />}
      </Field>
      <ErrorNotice error={action.error} />
      <Button disabled={action.isPending} type="submit">
        {action.isPending ? 'Creando…' : 'Crear restaurante'}
      </Button>
    </form>
  );
}
export function LocationsPanel({
  restaurantId,
  canManage,
}: {
  restaurantId: string;
  canManage: boolean;
}) {
  const query = useCollection<Location>(
      `/restaurants/${restaurantId}/locations`,
    ),
    action = useAction<Location>();
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      ['name', 'address', 'city', 'department'].map((k) => [k, data.get(k)]),
    );
    try {
      await action.mutateAsync({
        path: `/restaurants/${restaurantId}/locations${editing !== 'new' && editing ? `/${editing.id}` : ''}`,
        method: editing === 'new' ? 'POST' : 'PATCH',
        body: {
          ...body,
          phone: data.get('phone') || null,
          ...(editing !== 'new' ? { status: data.get('status') } : {}),
        },
      });
      setEditing(null);
    } catch {}
  }
  return (
    <>
      <PageTitle
        title="Sucursales"
        description="Tus programas funcionan en todas las sucursales activas."
        action={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={17} />
              Agregar sucursal
            </Button>
          )
        }
      />
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      {query.isLoading && <Loading />}
      {editing && (
        <form
          key={typeof editing === 'string' ? editing : editing.id}
          className="panel stack narrow-panel"
          onSubmit={submit}
        >
          <h2>{editing === 'new' ? 'Nueva sucursal' : 'Editar sucursal'}</h2>
          {(
            [
              { name: 'name', label: 'Nombre' },
              { name: 'address', label: 'Dirección' },
              { name: 'city', label: 'Ciudad' },
              { name: 'department', label: 'Departamento / región' },
              { name: 'phone', label: 'Teléfono (opcional)' },
            ] as const
          ).map((field) => (
            <Field key={field.name} label={field.label}>
              {(id) => (
                <Input
                  id={id}
                  name={field.name}
                  required={field.name !== 'phone'}
                  defaultValue={editing === 'new' ? '' : editing[field.name]}
                  maxLength={
                    field.name === 'address'
                      ? 2000
                      : field.name === 'phone'
                        ? 20
                        : 255
                  }
                />
              )}
            </Field>
          ))}
          {editing !== 'new' && (
            <Field label="Estado">
              {(id) => (
                <select
                  id={id}
                  name="status"
                  className="input"
                  defaultValue={editing.status}
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </select>
              )}
            </Field>
          )}
          <ErrorNotice error={action.error} />
          <div className="button-row">
            <Button disabled={action.isPending} type="submit">
              {action.isPending ? 'Guardando…' : 'Guardar sucursal'}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      <div className="entity-list">
        {query.items.map((location) => (
          <article key={location.id} className="entity-row">
            <div className="entity-icon">
              <MapPin size={21} />
            </div>
            <div className="entity-main">
              <h2>{location.name}</h2>
              <p className="muted">
                {location.address} · {location.city}
              </p>
              <span className={`badge badge-${location.status}`}>
                {statusLabel(location.status)}
              </span>
            </div>
            {canManage && (
              <Button variant="secondary" onClick={() => setEditing(location)}>
                Editar
              </Button>
            )}
          </article>
        ))}
      </div>
      {!query.isLoading && !query.error && !query.items.length && !editing && (
        <Empty title="¿Dónde vuelven tus clientes?">
          Agrega la primera sucursal para poder registrar compras.
        </Empty>
      )}
      <MoreButton {...query} />
    </>
  );
}
export function StaffPanel({
  restaurantId,
  role,
}: {
  restaurantId: string;
  role: string;
}) {
  const employees = useCollection<Employee>(
      `/restaurants/${restaurantId}/employees`,
    ),
    invitations = useCollection<Invitation>(
      `/restaurants/${restaurantId}/invitations`,
    );
  const action = useAction<Invitation>(),
    update = useAction();
  const [showForm, setShowForm] = useState(false),
    [created, setCreated] = useState<Invitation | null>(null),
    [editing, setEditing] = useState<Employee | null>(null);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setCreated(
        await action.mutateAsync({
          path: `/restaurants/${restaurantId}/invitations`,
          body: { email: data.get('email'), role: data.get('role') },
        }),
      );
      setShowForm(false);
    } catch {}
  }
  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    try {
      await update.mutateAsync({
        path: `/restaurants/${restaurantId}/employees/${editing.id}`,
        method: 'PATCH',
        body: { role: data.get('role'), status: data.get('status') },
      });
      setEditing(null);
    } catch {}
  }
  return (
    <>
      <PageTitle
        title="Tu equipo"
        description="Personas de confianza, con los permisos que necesitan."
        action={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus size={17} />
            Invitar persona
          </Button>
        }
      />
      <ErrorNotice
        error={employees.error || invitations.error}
        retry={() => {
          void employees.refetch();
          void invitations.refetch();
        }}
      />
      <ErrorNotice error={update.error} />
      {showForm && (
        <form className="panel stack narrow-panel" onSubmit={invite}>
          <h2>Invitar a tu equipo</h2>
          <Field label="Correo electrónico">
            {(id) => <Input id={id} name="email" type="email" required />}
          </Field>
          <RoleSelect owner={role === 'owner'} />
          <p className="field-hint">
            Comparte el enlace con esa persona. Deberá entrar con el mismo
            correo verificado.
          </p>
          <ErrorNotice error={action.error} />
          <Button disabled={action.isPending} type="submit">
            {action.isPending ? 'Creando…' : 'Crear invitación'}
          </Button>
        </form>
      )}
      {created?.token && (
        <div className="panel">
          <PublicShareQr
            path={`/invite/${encodeURIComponent(created.token)}`}
            title={`Invitación para ${created.email}`}
            description="Este enlace es privado. Compártelo únicamente con la persona invitada."
          />
        </div>
      )}
      {editing && (
        <form className="panel stack narrow-panel" onSubmit={saveEmployee}>
          <h2>Permisos del integrante</h2>
          <RoleSelect owner={role === 'owner'} value={editing.role} />
          <Field label="Estado">
            {(id) => (
              <select
                id={id}
                name="status"
                className="input"
                defaultValue={editing.status}
              >
                <option value="active">Activo</option>
                <option value="suspended">Suspendido</option>
                <option value="disabled">Deshabilitado</option>
              </select>
            )}
          </Field>
          <div className="button-row">
            <Button disabled={update.isPending} type="submit">
              Guardar permisos
            </Button>
            <Button
              variant="ghost"
              onClick={() => setEditing(null)}
              type="button"
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      <h2 className="section-title">Integrantes</h2>
      {employees.isLoading && <Loading />}
      <div className="entity-list">
        {employees.items.map((employee) => (
          <article className="entity-row" key={employee.id}>
            <div className="avatar">
              {(employee.full_name ?? 'P').slice(0, 1)}
            </div>
            <div className="entity-main">
              <h3>
                {employee.full_name ||
                  employee.email ||
                  'Integrante del equipo'}
              </h3>
              <p className="muted">
                {statusLabel(employee.role)} · {statusLabel(employee.status)}
              </p>
            </div>
            {employee.role !== 'owner' &&
              (role === 'owner' || employee.role === 'employee') && (
                <Button
                  variant="secondary"
                  onClick={() => setEditing(employee)}
                >
                  Permisos
                </Button>
              )}
          </article>
        ))}
      </div>
      <MoreButton {...employees} />
      <h2 className="section-title">Invitaciones</h2>
      <div className="entity-list">
        {invitations.items.map((invitation) => (
          <article className="entity-row" key={invitation.id}>
            <div className="entity-main">
              <h3>{invitation.email}</h3>
              <p className="muted">
                {statusLabel(invitation.role)} ·{' '}
                {statusLabel(invitation.status)}
              </p>
            </div>
            {invitation.status === 'pending' &&
              (role === 'owner' || invitation.role === 'employee') && (
                <Button
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      path: `/restaurants/${restaurantId}/invitations/${invitation.id}/revoke`,
                    })
                  }
                >
                  Revocar
                </Button>
              )}
          </article>
        ))}
      </div>
      {!invitations.isLoading &&
        !invitations.error &&
        !invitations.items.length && (
          <p className="muted">Todavía no has enviado invitaciones.</p>
        )}
      <MoreButton {...invitations} />
    </>
  );
}
function RoleSelect({
  owner,
  value = 'employee',
}: {
  owner: boolean;
  value?: string;
}) {
  return (
    <Field label="Rol">
      {(id) => (
        <select id={id} className="input" name="role" defaultValue={value}>
          <option value="employee">Empleado · compras y premios</option>
          {owner && (
            <option value="admin">Administrador · programas y equipo</option>
          )}
        </select>
      )}
    </Field>
  );
}
export function RestaurantSettings({ restaurant }: { restaurant: Restaurant }) {
  const action = useAction<Restaurant>();
  const [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await action.mutateAsync({
        path: `/restaurants/${restaurant.id}`,
        method: 'PATCH',
        body: {
          name: data.get('name'),
          email: data.get('email') || null,
          phone: data.get('phone') || null,
          ...(restaurant.actor_role === 'owner'
            ? { status: data.get('status') }
            : {}),
        },
      });
      setMessage('Datos actualizados.');
    } catch {}
  }
  return (
    <>
      <PageTitle title="Datos del restaurante" />
      <form className="panel stack narrow-panel" onSubmit={save}>
        <Field label="Nombre">
          {(id) => (
            <Input
              id={id}
              name="name"
              defaultValue={restaurant.name}
              required
              maxLength={255}
            />
          )}
        </Field>
        <Field label="Correo (opcional)">
          {(id) => (
            <Input
              id={id}
              name="email"
              type="email"
              defaultValue={restaurant.email ?? ''}
            />
          )}
        </Field>
        <Field label="Teléfono (opcional)">
          {(id) => (
            <Input
              id={id}
              name="phone"
              defaultValue={restaurant.phone ?? ''}
              maxLength={20}
            />
          )}
        </Field>
        {restaurant.actor_role === 'owner' && (
          <Field
            label="Estado"
            hint="Suspender deshabilita las operaciones del restaurante."
          >
            {(id) => (
              <select
                id={id}
                name="status"
                className="input"
                defaultValue={restaurant.status}
              >
                <option value="active">Activo</option>
                <option value="suspended">Suspendido</option>
              </select>
            )}
          </Field>
        )}
        <ErrorNotice error={action.error} />
        <p role="status">{message}</p>
        <Button disabled={action.isPending} type="submit">
          {action.isPending ? 'Guardando…' : 'Guardar datos'}
        </Button>
      </form>
    </>
  );
}
