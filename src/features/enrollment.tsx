import { ArrowRight, Check, Phone } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { AccountSession } from '../components/account-session';
import {
  Brand,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  PageTitle,
} from '../components/common';
import { LoyaltyCard } from '../components/loyalty-card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  ApiError,
  useAction,
  useCustomerAction,
  useCustomerSession,
  useResource,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import type { CardView, Program } from '../lib/types';

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

export function EnrollmentPage({ code }: { code: string }) {
  const program = useResource<Program>(
    `/public/programs/${encodeURIComponent(code)}`,
  );
  const session = useCustomerSession();
  const start = useCustomerAction<{
    authenticated: boolean;
    phone_masked: string;
    card: CardView | null;
  }>();
  const enrollCard = useCustomerAction<CardView>();
  const [country, setCountry] = useState('CO');
  const [phone, setPhone] = useState('');
  const [card, setCard] = useState<CardView | null>(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    if (!session.data || autoOpened.current || enrollCard.isPending) return;
    autoOpened.current = true;
    void enrollCard
      .mutateAsync({
        path: '/customer/enrollments',
        body: { public_code: code },
      })
      .then(setCard);
  }, [session.data, code, enrollCard]);

  async function enroll(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await start.mutateAsync({
        path: '/customer/session',
        body: { phone, country, public_code: code },
      });
      setCard(result.card);
    } catch {
      setCard(null);
    }
  }

  return (
    <div className="public-page">
      <header>
        <Brand />
        <a className="text-link" href="/cards">
          Mis tarjetas
          <ArrowRight size={17} />
        </a>
      </header>
      <main id="main-content" className="enrollment-layout">
        <ErrorNotice
          error={program.error}
          retry={() => void program.refetch()}
        />
        {program.isLoading && <Loading />}
        {program.data && (
          <>
            <section className="enrollment-copy">
              <h1>
                Nos gusta
                <br />
                que <em>vuelvas.</em>
              </h1>
              <h2>{program.data.restaurant_name}</h2>
              <p>
                {program.data.description ||
                  `Con cada compra sumas un sello. Al completar ${program.data.stamps_required}, recibes tu recompensa.`}
              </p>
              <div className="enrollment-terms">
                <p>
                  <Check size={18} />
                  {program.data.stamps_required} compras para ganar
                </p>
                <p>
                  <Check size={18} />
                  {program.data.reward_description}
                </p>
                <p>
                  <Check size={18} />
                  Tu tarjeta te acompaña en este y otros dispositivos
                </p>
              </div>
              {card ? (
                <div className="stack">
                  <p className="notice notice-success" role="status">
                    Tu tarjeta está lista. No recibiste sellos por inscribirte.
                  </p>
                  <Button asChild>
                    <a href={`/cards?card=${encodeURIComponent(card.id)}`}>
                      Ver mi tarjeta
                      <ArrowRight size={17} />
                    </a>
                  </Button>
                  {session.data && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        void enrollCard
                          .mutateAsync({
                            path: '/customer/session',
                            method: 'DELETE',
                          })
                          .then(() => window.location.reload())
                      }
                    >
                      Usar otro teléfono
                    </button>
                  )}
                </div>
              ) : session.isLoading ? (
                <Loading label="Buscando tu tarjeta…" />
              ) : session.data ? (
                <div className="stack">
                  <p className="field-hint">
                    Ya te reconocemos como {session.data.phone_masked}. Abriendo
                    tu tarjeta de este programa.
                  </p>
                  <ErrorNotice error={start.error} />
                  <Button
                    disabled={start.isPending}
                    onClick={() =>
                      void enrollCard
                        .mutateAsync({
                          path: '/customer/enrollments',
                          body: { public_code: code },
                        })
                        .then(setCard)
                    }
                  >
                    {start.isPending ? 'Abriendo…' : 'Abrir mi tarjeta'}
                  </Button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      void start
                        .mutateAsync({
                          path: '/customer/session',
                          method: 'DELETE',
                        })
                        .then(() => window.location.reload())
                    }
                  >
                    Usar otro teléfono
                  </button>
                </div>
              ) : (
                <form
                  className="stack"
                  onSubmit={(event) => void enroll(event)}
                >
                  <p className="field-hint">
                    Escribe tu teléfono. No necesitas correo ni contraseña.
                  </p>
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
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder="300 123 4567"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        required
                      />
                    )}
                  </Field>
                  <ErrorNotice error={start.error} />
                  <Button disabled={start.isPending} type="submit">
                    <Phone size={17} />
                    {start.isPending
                      ? 'Creando tu tarjeta…'
                      : 'Obtener mi tarjeta'}
                  </Button>
                  <p className="field-hint">
                    Si ya tienes tarjeta con este número, la abriremos sin
                    duplicarla.
                  </p>
                </form>
              )}
            </section>
            <aside>
              <LoyaltyCard program={program.data} />
              <p className="preview-label">
                Tu tarjeta personal se crea al inscribirte.
              </p>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}

export function InvitationPage({ token }: { token: string }) {
  const auth = useAuth();
  const action = useAction();
  const resetInvitation = action.reset;
  const invitationIdentity = `${auth.user?.id}/${token}`;
  const previousInvitationIdentity = useRef(invitationIdentity);
  useEffect(() => {
    if (previousInvitationIdentity.current !== invitationIdentity) {
      resetInvitation();
      previousInvitationIdentity.current = invitationIdentity;
    }
  }, [invitationIdentity, resetInvitation]);
  const acceptanceError =
    action.error instanceof ApiError
      ? action.error.status === 403
        ? new Error(
            'Entra con el correo verificado de la invitación. Si esta es otra cuenta, usa «Usar otra cuenta»; si el correo es correcto, confirma que el dueño mantiene tu invitación vigente.',
          )
        : [404, 409].includes(action.error.status)
          ? new Error(
              'La invitación ya no está disponible. Solicita una nueva al dueño del restaurante.',
            )
          : action.error
      : action.error;
  return (
    <div className="public-page">
      <header>
        <Brand />
      </header>
      <main id="main-content" className="standalone">
        <ErrorNotice
          error={auth.error ? new Error(auth.error) : null}
          retry={() => void auth.reload()}
        />
        <PageTitle
          title="Un lugar en el equipo"
          description="Acepta la invitación con el correo verificado al que fue dirigida."
        />
        {auth.loading ? (
          <Loading />
        ) : !auth.user && auth.error ? null : !auth.user ? (
          <Empty
            title="Entra para aceptar la invitación"
            action={
              <div className="stack">
                <Button asChild>
                  <a
                    href={`/auth?mode=signup&next=${encodeURIComponent(`/invite/${token}`)}`}
                  >
                    Crear cuenta de empleado
                  </a>
                </Button>
                <Button asChild variant="secondary">
                  <a
                    href={`/auth?next=${encodeURIComponent(`/invite/${token}`)}`}
                  >
                    Iniciar sesión
                  </a>
                </Button>
              </div>
            }
          >
            Usa el correo al que enviaron la invitación. Podrás escanear
            tarjetas, registrar compras y entregar premios.
          </Empty>
        ) : action.isSuccess ? (
          <div className="stack">
            <p role="status" className="notice notice-success">
              Ya formas parte del equipo.
            </p>
            <Button asChild>
              <a href="/app">
                Ir al escáner
                <ArrowRight size={17} />
              </a>
            </Button>
          </div>
        ) : (
          <div className="panel stack">
            <AccountSession disabled={action.isPending}>
              <p className="field-hint">
                El correo de esta cuenta debe coincidir con el de la invitación
                y estar verificado.
              </p>
              <ErrorNotice error={acceptanceError} />
              <Button
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    path: '/invitations/accept',
                    body: { token },
                  })
                }
              >
                {action.isPending ? 'Aceptando…' : 'Aceptar invitación'}
              </Button>
            </AccountSession>
          </div>
        )}
      </main>
    </div>
  );
}
