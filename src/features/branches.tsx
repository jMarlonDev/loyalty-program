import { Check, MapPin, Plus, QrCode, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  PageTitle,
} from '../components/common';
import { ShareQr } from '../components/loyalty-card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAction, useResource } from '../lib/api';
import type {
  Branch,
  BranchInvitation,
  BranchInvitationIssued,
} from '../lib/types';
import { formatDate } from '../lib/utils';

const stateLabel: Record<BranchInvitation['state'], string> = {
  valid: 'Vigente',
  expired: 'Vencida',
  revoked: 'Revocada',
  exhausted: 'Sin usos',
};

export function BranchesPanel({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
  const branches = useResource<Branch[]>(`${base}/branches`);
  const invitations = useResource<BranchInvitation[]>(
    `${base}/branch-invitations`,
  );
  const create = useAction();
  const issue = useAction<BranchInvitationIssued>();
  const renew = useAction<BranchInvitationIssued>();
  const revoke = useAction();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [hours, setHours] = useState('24');
  const [uses, setUses] = useState('1');
  const [shown, setShown] = useState<
    (BranchInvitationIssued & { renewed?: boolean }) | null
  >(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await create.mutateAsync({
        path: `${base}/branches`,
        body: {
          name: name.trim(),
          address: address.trim(),
          ...(point.trim() ? { physical_point: point.trim() } : {}),
        },
      });
      setName('');
      setAddress('');
      setPoint('');
    } catch {}
  }

  async function invite(event: FormEvent, locationId: string) {
    event.preventDefault();
    try {
      const result = await issue.mutateAsync({
        path: `${base}/branches/${locationId}/invitations`,
        body: {
          expires_in_hours: Number(hours),
          max_uses: Number(uses),
        },
      });
      setShown(result);
      setInviting(null);
    } catch {}
  }

  async function renewInvitation(id: string) {
    try {
      setShown({
        ...(await renew.mutateAsync({
          path: `${base}/branch-invitations/${id}/renew`,
        })),
        renewed: true,
      });
    } catch {}
  }

  return (
    <>
      <PageTitle
        title="Sucursales"
        description="Crea tus sucursales e invita a tu equipo con un QR por sucursal."
      />
      <form className="panel stack" onSubmit={(event) => void submit(event)}>
        <h2>
          <Plus size={20} /> Nueva sucursal
        </h2>
        <Field label="Nombre">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
            />
          )}
        </Field>
        <Field label="Dirección">
          {(id) => (
            <Input
              id={id}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
              maxLength={240}
              autoComplete="street-address"
            />
          )}
        </Field>
        <Field
          label="Punto físico (opcional)"
          hint="Ej. caja principal o piso 2."
        >
          {(id) => (
            <Input
              id={id}
              value={point}
              onChange={(event) => setPoint(event.target.value)}
              maxLength={120}
            />
          )}
        </Field>
        <ErrorNotice error={create.error} />
        <Button disabled={create.isPending} type="submit">
          {create.isPending ? 'Creando…' : 'Crear sucursal'}
        </Button>
      </form>

      {shown && (
        <section className="notice notice-success stack" role="status">
          <p>
            <Check size={18} /> Invitación para {shown.location_name}. Vence{' '}
            {formatDate(shown.expires_at)} · {shown.max_uses}{' '}
            {shown.max_uses === 1 ? 'uso' : 'usos'}.
          </p>
          {shown.renewed && (
            <p>
              La invitación anterior dejó de servir. Comparte este QR nuevo.
            </p>
          )}
          <ShareQr
            value={shown.url}
            size={240}
            title="QR de invitación"
            description="El empleado lo escanea con su celular y se une a la sucursal."
          />
          <Button variant="secondary" onClick={() => setShown(null)}>
            Cerrar
          </Button>
        </section>
      )}

      <section className="stack">
        <h2>
          <MapPin size={20} /> Tus sucursales
        </h2>
        <ErrorNotice
          error={branches.error}
          retry={() => void branches.refetch()}
        />
        {branches.isLoading && <Loading />}
        {!branches.isLoading && !branches.error && !branches.data?.length && (
          <Empty title="Aún no hay sucursales">
            Crea la primera para poder invitar empleados.
          </Empty>
        )}
        <div className="entity-list">
          {branches.data?.map((branch) => (
            <article className="entity-row stack" key={branch.id}>
              <div className="entity-main">
                <h3>{branch.name}</h3>
                <p className="muted">
                  {branch.address}
                  {branch.physical_point ? ` · ${branch.physical_point}` : ''}
                </p>
                <p className="muted">
                  {branch.employees}{' '}
                  {branch.employees === 1 ? 'empleado' : 'empleados'}
                </p>
              </div>
              {inviting === branch.id ? (
                <form
                  className="stack"
                  onSubmit={(event) => void invite(event, branch.id)}
                >
                  <Field label="Vigencia (horas)">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={1}
                        max={720}
                        value={hours}
                        onChange={(event) => setHours(event.target.value)}
                        required
                      />
                    )}
                  </Field>
                  <Field label="Usos máximos">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={1}
                        max={100}
                        value={uses}
                        onChange={(event) => setUses(event.target.value)}
                        required
                      />
                    )}
                  </Field>
                  <ErrorNotice error={issue.error} />
                  <Button disabled={issue.isPending} type="submit">
                    <QrCode size={17} />
                    {issue.isPending ? 'Generando…' : 'Generar QR'}
                  </Button>
                </form>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => setInviting(branch.id)}
                >
                  <UserPlus size={17} /> Invitar empleado
                </Button>
              )}
              {invitations.data
                ?.filter((item) => item.location_id === branch.id)
                .map((item) => (
                  <div className="entity-row" key={item.id}>
                    <div className="entity-main">
                      <p>
                        <span className="badge">{stateLabel[item.state]}</span>{' '}
                        {item.uses}/{item.max_uses} usos
                      </p>
                      <p className="muted">
                        Vence {formatDate(item.expires_at)}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={renew.isPending}
                      onClick={() => void renewInvitation(item.id)}
                    >
                      Renovar
                    </Button>
                    {item.state === 'valid' && (
                      <Button
                        variant="ghost"
                        disabled={revoke.isPending}
                        onClick={() =>
                          void revoke
                            .mutateAsync({
                              path: `${base}/branch-invitations/${item.id}/revoke`,
                            })
                            .catch(() => {})
                        }
                      >
                        Revocar
                      </Button>
                    )}
                  </div>
                ))}
            </article>
          ))}
        </div>
        <ErrorNotice error={renew.error || revoke.error} />
      </section>
    </>
  );
}
