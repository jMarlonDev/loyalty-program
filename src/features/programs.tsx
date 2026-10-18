import { ArrowLeft, ArrowRight, Palette, Plus, QrCode } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  MoreButton,
  PageTitle,
} from '../components/common';
import { LoyaltyCard } from '../components/loyalty-card';
import { PublicShareQr } from '../components/public-share-qr';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAction, useCollection } from '../lib/api';
import type { Program } from '../lib/types';
import { statusLabel } from '../lib/utils';
import { contrastRatio, type ProgramForm, programPayload } from './forms';
import { ResultsPanel } from './results';
export function ProgramsPanel({
  restaurantId,
  canManage,
}: {
  restaurantId: string;
  canManage: boolean;
}) {
  const query = useCollection<Program>(`/restaurants/${restaurantId}/programs`);
  const [results, setResults] = useState<Program | null>(null);
  const [editing, setEditing] = useState<Program | 'new' | null>(null),
    [sharing, setSharing] = useState<Program | null>(null);
  if (results)
    return (
      <ResultsPanel
        restaurantId={restaurantId}
        program={results}
        onBack={() => setResults(null)}
      />
    );
  if (editing)
    return (
      <ProgramEditor
        restaurantId={restaurantId}
        program={editing === 'new' ? undefined : editing}
        onBack={() => setEditing(null)}
        onSaved={(program) => {
          setEditing(null);
          setSharing(program.status === 'active' ? program : null);
        }}
      />
    );
  return (
    <>
      <PageTitle
        title="Tarjetas de lealtad"
        description="Pequeños detalles que hacen que tus clientes vuelvan."
        action={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={18} />
              Crear tarjeta
            </Button>
          )
        }
      />
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      {query.isLoading && <Loading />}
      {!query.isLoading && !query.error && !query.items.length && (
        <Empty
          title="Tu próxima visita empieza aquí"
          action={
            canManage && (
              <Button onClick={() => setEditing('new')}>
                Crear mi primera tarjeta
                <ArrowRight size={17} />
              </Button>
            )
          }
        >
          Define una recompensa, dale tu estilo y comparte el QR con tus
          clientes.
        </Empty>
      )}
      {sharing && (
        <div className="panel stack">
          <div className="section-heading">
            <h2>Tu tarjeta está lista para compartir</h2>
            <Button variant="ghost" onClick={() => setSharing(null)}>
              Cerrar
            </Button>
          </div>
          <PublicShareQr
            path={`/join/${encodeURIComponent(sharing.public_code)}`}
          />
        </div>
      )}
      <div className="program-grid">
        {query.items.map((program) => (
          <article className="program-tile" key={program.id}>
            <LoyaltyCard program={program} compact />
            <div className="program-tile-bottom">
              <span className={`badge badge-${program.status}`}>
                {statusLabel(program.status)}
              </span>
              <div className="button-row">
                {canManage && (
                  <Button variant="ghost" onClick={() => setEditing(program)}>
                    <Palette size={17} />
                    Editar
                  </Button>
                )}{' '}
                {canManage && (
                  <Button variant="ghost" onClick={() => setResults(program)}>
                    Resultados
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={program.status !== 'active'}
                  title={
                    program.status !== 'active'
                      ? 'Activa el programa para compartir su inscripción.'
                      : undefined
                  }
                  onClick={() => setSharing(program)}
                >
                  <QrCode size={17} />
                  Compartir
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <MoreButton {...query} />
    </>
  );
}
const initial: ProgramForm = {
  name: '',
  description: '',
  stamps_required: 8,
  reward_description: '',
  logo_url: '',
  background_color: '#22346B',
  text_color: '#FFFFFF',
  card_message: 'Siempre es un gusto verte.',
};
export function ProgramEditor({
  restaurantId,
  program,
  onBack,
  onSaved,
}: {
  restaurantId: string;
  program?: Program;
  onBack: () => void;
  onSaved: (program: Program) => void;
}) {
  const [form, setForm] = useState<ProgramForm>(
    program
      ? {
          name: program.name,
          description: program.description ?? '',
          stamps_required: program.stamps_required,
          reward_description: program.reward_description,
          logo_url: program.logo_url ?? '',
          background_color: program.background_color,
          text_color: program.text_color,
          card_message: program.card_message ?? '',
        }
      : initial,
  );
  const [status, setStatus] = useState(program?.status ?? 'active');
  const action = useAction<Program>();
  const conditionsLocked = Boolean(program?.terms_locked);
  const update = <K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const contrast = contrastRatio(form.background_color, form.text_color);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await action.mutateAsync({
        path: `/restaurants/${restaurantId}/programs${program ? `/${program.id}` : ''}`,
        method: program ? 'PATCH' : 'POST',
        body: {
          ...programPayload(form, conditionsLocked),
          ...(program ? { status } : {}),
        },
      });
      onSaved(result);
    } catch {}
  }
  return (
    <>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={17} />
        Volver a tarjetas
      </Button>
      <PageTitle
        title={
          program ? 'Haz que se sienta tuya' : 'Crea una razón para volver'
        }
        description="Un programa sencillo, con toda la personalidad de tu restaurante."
      />
      <div className="editor-layout">
        <form className="panel stack" onSubmit={save}>
          <div className="section-heading">
            <h2>El programa</h2>
            <span className="badge">Una compra = un sello</span>
          </div>
          <Field label="Nombre de la tarjeta">
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Club de clientes"
                required
                maxLength={255}
              />
            )}
          </Field>
          <Field label="Descripción (opcional)">
            {(id) => (
              <Input
                id={id}
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                maxLength={255}
              />
            )}
          </Field>
          <div className="form-grid">
            <Field
              label="Sellos para ganar"
              hint={
                conditionsLocked
                  ? 'Las condiciones se conservan tras la primera inscripción.'
                  : 'Cada compra registrada suma un sello.'
              }
            >
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={2147483647}
                  value={form.stamps_required}
                  disabled={conditionsLocked}
                  onChange={(e) =>
                    update('stamps_required', Number(e.target.value))
                  }
                  required
                />
              )}
            </Field>
            <Field label="Recompensa">
              {(id) => (
                <Input
                  id={id}
                  value={form.reward_description}
                  disabled={conditionsLocked}
                  onChange={(e) => update('reward_description', e.target.value)}
                  placeholder="Una recompensa especial"
                  required
                  maxLength={255}
                />
              )}
            </Field>
          </div>
          {conditionsLocked && (
            <p className="field-hint">
              Para ofrecer otra meta o recompensa, crea un programa nuevo.
            </p>
          )}
          <hr />
          <h2>Tu estilo, en cada visita</h2>
          <div className="form-grid">
            <Field label="Color de fondo">
              {(id) => (
                <div className="color-control">
                  <Input
                    id={id}
                    type="color"
                    value={form.background_color}
                    onChange={(e) => update('background_color', e.target.value)}
                  />
                  <span>{form.background_color.toUpperCase()}</span>
                </div>
              )}
            </Field>
            <Field label="Color del texto">
              {(id) => (
                <div className="color-control">
                  <Input
                    id={id}
                    type="color"
                    value={form.text_color}
                    onChange={(e) => update('text_color', e.target.value)}
                  />
                  <span>{form.text_color.toUpperCase()}</span>
                </div>
              )}
            </Field>
          </div>
          {contrast < 4.5 && (
            <p className="notice" role="status">
              Estos colores tienen poco contraste ({contrast.toFixed(1)}:1). Usa
              un texto más claro u oscuro para que tu tarjeta sea fácil de leer.
            </p>
          )}
          <Field
            label="Logo por enlace HTTPS (opcional)"
            hint="Usa un enlace público de una imagen que te pertenezca."
          >
            {(id) => (
              <Input
                id={id}
                type="url"
                pattern="https://.*"
                value={form.logo_url}
                onChange={(e) => update('logo_url', e.target.value)}
                placeholder="https://tu-restaurante.com/logo.png"
                maxLength={2048}
              />
            )}
          </Field>
          <Field
            label="Mensaje de tu tarjeta"
            hint={`${form.card_message.length}/160 caracteres`}
          >
            {(id) => (
              <Input
                id={id}
                value={form.card_message}
                onChange={(e) => update('card_message', e.target.value)}
                maxLength={160}
              />
            )}
          </Field>
          {program && (
            <Field
              label="Estado del programa"
              hint="Pausar o finalizar impide nuevas compras; los premios obtenidos pueden entregarse."
            >
              {(id) => (
                <select
                  id={id}
                  className="input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="active" disabled={program.status === 'ended'}>
                    Activo
                  </option>
                  <option value="paused" disabled={program.status === 'ended'}>
                    Pausado
                  </option>
                  <option value="ended">Finalizado</option>
                </select>
              )}
            </Field>
          )}
          <ErrorNotice error={action.error} />
          <Button type="submit" disabled={action.isPending}>
            {action.isPending
              ? 'Guardando…'
              : program
                ? 'Guardar cambios'
                : 'Crear tarjeta'}
            <ArrowRight size={17} />
          </Button>
        </form>
        <aside className="preview-column">
          <span className="preview-label">Vista previa de tu tarjeta</span>
          <LoyaltyCard program={form} balance={0} />
          <p className="muted">
            El QR personal aparece en la tarjeta de cada cliente después de
            inscribirse.
          </p>
        </aside>
      </div>
    </>
  );
}
