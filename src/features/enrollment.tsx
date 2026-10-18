import { ArrowRight, Check } from 'lucide-react';
import {
  Brand,
  Empty,
  ErrorNotice,
  Loading,
  PageTitle,
} from '../components/common';
import { LoyaltyCard } from '../components/loyalty-card';
import { Button } from '../components/ui/button';
import { useAction, useResource } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Program } from '../lib/types';
export function EnrollmentPage({ code }: { code: string }) {
  const auth = useAuth(),
    program = useResource<Program>(
      `/public/programs/${encodeURIComponent(code)}`,
    ),
    enrollment = useAction<{ card: { id: string } }>();
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
          error={auth.error ? new Error(auth.error) : null}
          retry={() => void auth.reload()}
        />
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
                  Tus sellos y premios no vencen
                </p>
              </div>
              {auth.loading ? (
                <Loading />
              ) : enrollment.isSuccess ? (
                <div className="stack">
                  <p className="notice notice-success" role="status">
                    Tu tarjeta está lista. ¡Que sea la primera de muchas
                    visitas!
                  </p>
                  <Button asChild>
                    <a
                      href={
                        enrollment.data?.card?.id
                          ? `/cards?card=${encodeURIComponent(enrollment.data.card.id)}`
                          : '/cards'
                      }
                    >
                      Ver mi tarjeta
                      <ArrowRight size={17} />
                    </a>
                  </Button>
                </div>
              ) : auth.user ? (
                <>
                  <ErrorNotice error={enrollment.error} />
                  <Button
                    disabled={enrollment.isPending}
                    onClick={() =>
                      enrollment.mutate({
                        path: `/public/programs/${encodeURIComponent(code)}/enrollments`,
                      })
                    }
                  >
                    {enrollment.isPending
                      ? 'Creando tu tarjeta…'
                      : 'Quiero mi tarjeta'}
                    <ArrowRight size={17} />
                  </Button>
                </>
              ) : auth.error ? null : (
                <div className="stack">
                  <Button asChild>
                    <a
                      href={`/auth?mode=signup&next=${encodeURIComponent(`/join/${code}`)}`}
                    >
                      Crear cuenta y obtener tarjeta
                      <ArrowRight size={17} />
                    </a>
                  </Button>
                  <a href={`/auth?next=${encodeURIComponent(`/join/${code}`)}`}>
                    Ya tengo una cuenta
                  </a>
                </div>
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
  const auth = useAuth(),
    action = useAction();
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
              <Button asChild>
                <a
                  href={`/auth?next=${encodeURIComponent(`/invite/${token}`)}`}
                >
                  Iniciar sesión
                </a>
              </Button>
            }
          >
            Si todavía no tienes cuenta, puedes crearla desde el acceso.
          </Empty>
        ) : action.isSuccess ? (
          <div className="stack">
            <p role="status" className="notice notice-success">
              Ya formas parte del equipo.
            </p>
            <Button asChild>
              <a href="/app">
                Ir al restaurante
                <ArrowRight size={17} />
              </a>
            </Button>
          </div>
        ) : (
          <div className="panel stack">
            <p>
              Estás entrando con <strong>{auth.user.email}</strong>.
            </p>
            <ErrorNotice error={action.error} />
            <Button
              disabled={action.isPending}
              onClick={() =>
                action.mutate({ path: '/invitations/accept', body: { token } })
              }
            >
              {action.isPending ? 'Aceptando…' : 'Aceptar invitación'}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
