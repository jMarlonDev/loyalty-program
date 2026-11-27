import { Check, Copy, Mail, Plus, UserRound, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  MoreButton,
  PageTitle,
} from '../components/common';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAction, useCollection } from '../lib/api';
import type { OperatorEmployee, OperatorInvitation } from '../lib/types';
import { formatDate } from '../lib/utils';

const countries = [
  ['CO', 'Colombia (+57)'],
  ['MX', 'México (+52)'],
  ['AR', 'Argentina (+54)'],
  ['CL', 'Chile (+56)'],
  ['PE', 'Perú (+51)'],
  ['EC', 'Ecuador (+593)'],
  ['VE', 'Venezuela (+58)'],
  ['US', 'Estados Unidos (+1)'],
  ['ES', 'España (+34)'],
  ['BR', 'Brasil (+55)'],
] as const;

export function TeamPanel({ restaurantId }: { restaurantId: string }) {
  const invitations = useCollection<OperatorInvitation>(
    `/restaurants/${restaurantId}/invitations`,
  );
  const employees = useCollection<OperatorEmployee>(
    `/restaurants/${restaurantId}/employees`,
  );
  const invite = useAction<{
    invitation: OperatorInvitation;
    token: string;
    url: string;
    whatsapp_url: string;
  }>();
  const revoke = useAction();
  const update = useAction();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('CO');
  const [created, setCreated] = useState<{
    url: string;
    whatsapp_url: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      const result = await invite.mutateAsync({
        path: `/restaurants/${restaurantId}/invitations`,
        body: { email: email.trim(), phone, country },
      });
      setCreated(result);
      setEmail('');
      setPhone('');
      void invitations.refetch();
    } catch {}
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Enlace copiado.');
    } catch {
      setMessage('No pudimos copiarlo. Selecciona el enlace y cópialo.');
    }
  }

  return (
    <>
      <PageTitle
        title="Equipo"
        description="Invita a quienes registran compras y entregan premios. Todos operan solo en este restaurante."
      />
      <div className="panel stack">
        <h2>
          <Plus size={20} /> Invitar a una persona
        </h2>
        <p className="field-hint">
          La invitación es privada, dura 7 días y solo funciona con el correo
          verificado al que se envía. No hay selector de roles.
        </p>
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <Field label="Correo">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                placeholder="persona@restaurante.com"
              />
            )}
          </Field>
          <Field label="País">
            {(id) => (
              <select
                id={id}
                className="input"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                {countries.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Teléfono">
            {(id) => (
              <Input
                id={id}
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                autoComplete="tel-national"
                placeholder="300 123 4567"
              />
            )}
          </Field>
          <ErrorNotice error={invite.error} />
          <Button disabled={invite.isPending} type="submit">
            <Mail size={17} />
            {invite.isPending ? 'Creando invitación…' : 'Crear invitación'}
          </Button>
        </form>
        {created && (
          <div className="notice notice-success stack" role="status">
            <p>
              <Check size={18} /> Invitación lista. Comparte este enlace privado
              con la persona invitada.
            </p>
            <code className="code-block">{created.url}</code>
            <div className="button-row">
              <Button
                variant="secondary"
                onClick={() => void copy(created.url)}
              >
                <Copy size={16} /> Copiar enlace
              </Button>
              <Button asChild variant="secondary">
                <a href={created.whatsapp_url} target="_blank" rel="noreferrer">
                  Abrir WhatsApp
                </a>
              </Button>
            </div>
            {message && <span>{message}</span>}
          </div>
        )}
      </div>

      <section className="stack">
        <h2>
          <Users size={20} /> Personas con acceso
        </h2>
        <ErrorNotice
          error={employees.error}
          retry={() => void employees.refetch()}
        />
        {employees.isLoading && <Loading />}
        {!employees.isLoading && !employees.items.length && (
          <Empty title="Aún no hay operadores">
            Invita a la primera persona que atenderá compras y premios.
          </Empty>
        )}
        <div className="entity-list">
          {employees.items.map((employee) => (
            <article className="entity-row" key={employee.id}>
              <div className="entity-icon">
                <UserRound size={22} />
              </div>
              <div className="entity-main">
                <h3>{employee.full_name || employee.email}</h3>
                <p className="muted">{employee.email}</p>
                {employee.phone_masked && (
                  <p className="muted">{employee.phone_masked}</p>
                )}
                <span className={`badge badge-${employee.status}`}>
                  {employee.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              {employee.status === 'active' && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={
                      permissions[employee.id] ??
                      employee.can_transfer_cards ??
                      false
                    }
                    disabled={update.isPending}
                    onChange={(event) => {
                      const allowed = event.target.checked;
                      void update
                        .mutateAsync({
                          path: `/restaurants/${restaurantId}/employees/${employee.id}/transfer-permission`,
                          method: 'PATCH',
                          body: { can_transfer_cards: allowed },
                        })
                        .then(() =>
                          setPermissions((current) => ({
                            ...current,
                            [employee.id]: allowed,
                          })),
                        )
                        .catch(() => {});
                    }}
                  />{' '}
                  Puede transferir tarjetas
                </label>
              )}
              {employee.status === 'active' && (
                <Button
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    void update
                      .mutateAsync({
                        path: `/restaurants/${restaurantId}/employees/${employee.id}`,
                        method: 'PATCH',
                        body: { status: 'suspended' },
                      })
                      .then(() => employees.refetch())
                  }
                >
                  Desactivar
                </Button>
              )}
            </article>
          ))}
        </div>
        <MoreButton {...employees} />
      </section>

      <section className="stack">
        <h2>
          <Mail size={20} /> Invitaciones
        </h2>
        <ErrorNotice
          error={invitations.error}
          retry={() => void invitations.refetch()}
        />
        {invitations.isLoading && <Loading />}
        {!invitations.isLoading && !invitations.items.length && (
          <p className="muted">No hay invitaciones pendientes.</p>
        )}
        <div className="entity-list">
          {invitations.items.map((invitation) => (
            <article className="entity-row" key={invitation.id}>
              <div className="entity-main">
                <h3>{invitation.email}</h3>
                {invitation.phone_masked && (
                  <p className="muted">{invitation.phone_masked}</p>
                )}
                <p className="muted">
                  Vence {formatDate(invitation.expires_at)} ·{' '}
                  {invitation.status === 'pending'
                    ? 'Pendiente'
                    : invitation.status === 'accepted'
                      ? 'Aceptada'
                      : 'Revocada'}
                </p>
              </div>
              {invitation.status === 'pending' && (
                <Button
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() =>
                    void revoke
                      .mutateAsync({
                        path: `/restaurants/${restaurantId}/invitations/${invitation.id}/revoke`,
                      })
                      .then(() => invitations.refetch())
                  }
                >
                  Revocar
                </Button>
              )}
            </article>
          ))}
        </div>
        <MoreButton {...invitations} />
      </section>
      <ErrorNotice error={revoke.error || update.error} />
    </>
  );
}
