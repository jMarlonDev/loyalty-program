import { Check, Copy, UserPlus, UserRound, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  PageTitle,
} from '../components/common';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAction, useResource } from '../lib/api';
import type { Branch, StaffMember } from '../lib/types';

function BranchChecks({
  branches,
  selected,
  onChange,
}: {
  branches: Branch[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="stack">
      <legend>Sucursales</legend>
      {branches.map((branch) => (
        <label className="check-row" key={branch.id}>
          <input
            type="checkbox"
            checked={selected.includes(branch.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, branch.id]
                  : selected.filter((id) => id !== branch.id),
              )
            }
          />{' '}
          {branch.name}
        </label>
      ))}
    </fieldset>
  );
}

export function StaffPanel({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
  const staff = useResource<StaffMember[]>(`${base}/staff`);
  const branches = useResource<Branch[]>(`${base}/branches`);
  const create = useAction<{
    employee_id: string;
    email: string;
    temporary_password: string | null;
    existing_account: boolean;
  }>();
  const update = useAction();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [created, setCreated] = useState<{
    email: string;
    password: string | null;
    existing: boolean;
  } | null>(null);
  const [copied, setCopied] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!picked.length) return;
    try {
      const result = await create.mutateAsync({
        path: `${base}/staff`,
        body: {
          email: email.trim(),
          full_name: name.trim(),
          location_ids: picked,
        },
      });
      setCreated({
        email: result.email ?? email.trim(),
        password: result.temporary_password,
        existing: result.existing_account,
      });
      setCopied('');
      setEmail('');
      setName('');
      setPicked([]);
    } catch {}
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('Contraseña copiada.');
    } catch {
      setCopied('No pudimos copiarla. Selecciónala y cópiala.');
    }
  }

  const branchList = branches.data ?? [];
  return (
    <>
      <PageTitle
        title="Empleados"
        description="Los empleados solo escanean y operan en las sucursales que les asignes."
      />
      <form className="panel stack" onSubmit={(event) => void submit(event)}>
        <h2>
          <UserPlus size={20} /> Crear empleado manualmente
        </h2>
        <Field label="Nombre">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Correo">
          {(id) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="off"
            />
          )}
        </Field>
        {branches.isLoading ? (
          <Loading />
        ) : branchList.length ? (
          <BranchChecks
            branches={branchList}
            selected={picked}
            onChange={setPicked}
          />
        ) : (
          <p className="notice">Primero crea una sucursal.</p>
        )}
        <ErrorNotice error={create.error || branches.error} />
        <Button disabled={create.isPending || !picked.length} type="submit">
          {create.isPending ? 'Creando…' : 'Crear empleado'}
        </Button>
      </form>

      {created && (
        <div className="notice notice-success stack" role="status">
          <p>
            <Check size={18} /> Empleado creado: {created.email}.
          </p>
          {created.password ? (
            <>
              <p>Contraseña temporal (deberá cambiarla al entrar):</p>
              <code className="code-block">{created.password}</code>
              <p>
                <strong>Cópiala ahora: no se volverá a mostrar.</strong>
              </p>
              <Button
                variant="secondary"
                onClick={() => void copy(created.password ?? '')}
              >
                <Copy size={16} /> Copiar contraseña
              </Button>
              {copied && <span>{copied}</span>}
            </>
          ) : (
            <p>
              Ya tenía cuenta: entra con su contraseña actual y ahora puede
              operar en las sucursales asignadas.
            </p>
          )}
          <Button variant="ghost" onClick={() => setCreated(null)}>
            Cerrar
          </Button>
        </div>
      )}

      <section className="stack">
        <h2>
          <Users size={20} /> Personas con acceso
        </h2>
        <ErrorNotice error={staff.error} retry={() => void staff.refetch()} />
        {staff.isLoading && <Loading />}
        {!staff.isLoading && !staff.error && !staff.data?.length && (
          <Empty title="Aún no hay empleados">
            Créalos aquí o invítalos con el QR de una sucursal.
          </Empty>
        )}
        <div className="entity-list">
          {staff.data?.map((member) => (
            <article className="entity-row stack" key={member.id}>
              <div className="entity-main">
                <h3>
                  <UserRound size={18} /> {member.full_name || member.email}
                </h3>
                <p className="muted">{member.email}</p>
                <span className={`badge badge-${member.status}`}>
                  {member.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
                <p className="muted">
                  {member.locations.length
                    ? member.locations.map((item) => item.name).join(', ')
                    : 'Sin sucursales'}
                </p>
              </div>
              {editing === member.id ? (
                <div className="stack">
                  <BranchChecks
                    branches={branchList}
                    selected={draft}
                    onChange={setDraft}
                  />
                  <Button
                    disabled={update.isPending}
                    onClick={() =>
                      void update
                        .mutateAsync({
                          path: `${base}/staff/${member.id}/locations`,
                          method: 'PATCH',
                          body: { location_ids: draft },
                        })
                        .then(() => setEditing(null))
                        .catch(() => {})
                    }
                  >
                    Guardar sucursales
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(member.id);
                    setDraft(member.locations.map((item) => item.id));
                  }}
                >
                  Editar sucursales
                </Button>
              )}
              {member.status === 'active' && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={
                      permissions[member.id] ?? member.can_transfer_cards
                    }
                    disabled={update.isPending}
                    onChange={(event) => {
                      const allowed = event.target.checked;
                      void update
                        .mutateAsync({
                          path: `${base}/employees/${member.id}/transfer-permission`,
                          method: 'PATCH',
                          body: { can_transfer_cards: allowed },
                        })
                        .then(() =>
                          setPermissions((current) => ({
                            ...current,
                            [member.id]: allowed,
                          })),
                        )
                        .catch(() => {});
                    }}
                  />{' '}
                  Puede transferir tarjetas
                </label>
              )}
            </article>
          ))}
        </div>
        <ErrorNotice error={update.error} />
      </section>
    </>
  );
}
