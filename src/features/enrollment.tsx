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
import { saveCardCache } from '../lib/card-cache';
import type { EnrollmentResult, Program } from '../lib/types';

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

function enrollmentError(error: unknown) {
  if (error instanceof ApiError && error.code === 'CARD_ALREADY_ACTIVE')
    return (
      <div className="notice notice-error" role="alert">
        <div>
          <p>Este número ya tiene una tarjeta activa.</p>
          <p className="field-hint">
            Si cambiaste de celular, pide en el local que transfieran tu
            tarjeta.
          </p>
        </div>
      </div>
    );
  if (error instanceof ApiError && error.status === 429)
    return (
      <div className="notice notice-error" role="alert">
        <p>Demasiados intentos. Intenta más tarde.</p>
      </div>
    );
  return <ErrorNotice error={error} />;
}

export function EnrollmentPage({ code }: { code: string }) {
  const program = useResource<Program>(
    `/public/programs/${encodeURIComponent(code)}`,
  );
  const session = useCustomerSession();
  const enroll = useCustomerAction<EnrollmentResult>();
  const [step, setStep] = useState<'intro' | 'phone' | 'declined'>('intro');
  const [country, setCountry] = useState('CO');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    if (!session.data || autoOpened.current) return;
    autoOpened.current = true;
    enroll
      .mutateAsync({
        path: '/customer/enrollments',
        body: { public_code: code },
      })
      .then((value) => {
        saveCardCache(value.card);
        setResult(value);
      })
      .catch(setFailure);
  }, [session.data, code, enroll]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    try {
      const value = await enroll.mutateAsync({
        path: '/customer/enrollments',
        body: { public_code: code, phone, country },
      });
      saveCardCache(value.card);
      setResult(value);
    } catch (error) {
      setResult(null);
      setFailure(error);
    }
  }

  const otherProgram = result?.existing && result.same_program === false;
  const card = result?.card;

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
              </div>
              {card ? (
                <div className="stack">
                  {otherProgram ? (
                    <p className="notice" role="status">
                      Este dispositivo ya tiene una tarjeta activa en{' '}
                      {card.program_name}.
                    </p>
                  ) : (
                    <>
                      <p className="notice notice-success" role="status">
                        {result?.existing
                          ? 'Esta es tu tarjeta.'
                          : 'Tu tarjeta está lista. No recibiste sellos por inscribirte.'}
                      </p>
                      {result?.notice && (
                        <p className="notice" role="status">
                          {result.notice}
                        </p>
                      )}
                    </>
                  )}
                  <p className="field-hint">
                    {card.cycle?.stamps ?? card.balance} de{' '}
                    {card.cycle?.target ?? card.target} sellos.
                  </p>
                  <Button asChild>
                    <a href={`/cards?card=${encodeURIComponent(card.id)}`}>
                      Ver mi tarjeta
                      <ArrowRight size={17} />
                    </a>
                  </Button>
                </div>
              ) : session.isLoading ? (
                <Loading label="Buscando tu tarjeta…" />
              ) : session.data ? (
                <div className="stack">
                  <Loading label="Abriendo tu tarjeta…" />
                  {failure != null && (
                    <>
                      {enrollmentError(failure)}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          autoOpened.current = false;
                          setFailure(null);
                          void session.refetch();
                        }}
                      >
                        Reintentar
                      </Button>
                    </>
                  )}
                </div>
              ) : step === 'declined' ? (
                <div className="stack">
                  <p className="notice" role="status">
                    Sin problema. No creamos ninguna tarjeta. Puedes volver a
                    escanear el QR cuando quieras.
                  </p>
                  <Button variant="secondary" onClick={() => setStep('intro')}>
                    Quiero unirme
                  </Button>
                </div>
              ) : step === 'intro' ? (
                <div className="stack">
                  <p className="field-hint">
                    Solo necesitas tu teléfono. Sin correo ni contraseña.
                  </p>
                  <Button onClick={() => setStep('phone')}>Unirme</Button>
                  <Button variant="ghost" onClick={() => setStep('declined')}>
                    Ahora no
                  </Button>
                </div>
              ) : (
                <form
                  className="stack"
                  onSubmit={(event) => void submit(event)}
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
                  {failure != null && enrollmentError(failure)}
                  <Button disabled={enroll.isPending} type="submit">
                    <Phone size={17} />
                    {enroll.isPending
                      ? 'Creando tu tarjeta…'
                      : 'Obtener mi tarjeta'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('intro')}
                  >
                    Volver
                  </Button>
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
