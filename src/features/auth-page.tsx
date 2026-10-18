import { ArrowLeft, ArrowRight, Check, Gift, Mail } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Brand, ErrorNotice, Field, Loading } from '../components/common';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from '../lib/auth';
import { safeReturnTo } from './forms';
export function AuthPage() {
  const auth = useAuth();
  const [mode, setMode] = useState('login'),
    [next, setNext] = useState('/app'),
    [fixedDestination, setFixedDestination] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode(
      ['signup', 'recover', 'reset'].includes(params.get('mode') ?? '')
        ? (params.get('mode') ?? 'login')
        : 'login',
    );
    const destination = params.get('next');
    setNext(safeReturnTo(destination));
    setFixedDestination(
      Boolean(destination && safeReturnTo(destination) === destination),
    );
    const callbackErrors: Record<string, string> = {
      AUTH_LINK_EXPIRED:
        'El enlace de acceso expiró o se abrió en otro navegador. Inicia sesión de nuevo o solicita otro enlace.',
      AUTH_CANCELLED:
        'Se canceló el acceso con Google. Puedes intentarlo de nuevo.',
      AUTH_UNAVAILABLE:
        'No pudimos completar el acceso. Inténtalo de nuevo en unos minutos.',
    };
    const callbackError = callbackErrors[params.get('error') ?? ''];
    if (callbackError) setError(new Error(callbackError));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      if (mode === 'recover') {
        await auth.recover(email);
        setMessage(
          'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Ábrelo en este navegador durante los próximos 10 minutos.',
        );
      } else if (mode === 'reset') {
        await auth.updatePassword(password);
        setMessage('Contraseña actualizada. Ya puedes continuar.');
        setMode('login');
      } else if (mode === 'signup') {
        const result = await auth.signup(email.trim(), password, name, next);
        if (result.confirmationRequired)
          setMessage(
            'Revisa tu correo y confirma tu cuenta en este navegador durante los próximos 10 minutos.',
          );
        else window.location.assign(next);
      } else {
        await auth.login(email, password);
        window.location.assign(next);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError(null);
    try {
      await auth.google(next);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  const showForm =
    !auth.loading &&
    ((!auth.user && !auth.error) || ['recover', 'reset'].includes(mode));
  const title =
    mode === 'signup'
      ? 'Empecemos algo bueno.'
      : mode === 'recover'
        ? 'Recupera tu acceso.'
        : mode === 'reset'
          ? 'Tu nueva contraseña.'
          : 'Qué gusto verte.';
  return (
    <div className="auth-page">
      <header>
        <Brand />
        <a className="text-link" href="/">
          <ArrowLeft size={17} />
          Volver al inicio
        </a>
      </header>
      <main id="main-content" className="auth-layout">
        <aside className="auth-story">
          <h2>
            Cada compra suma.
            <br />
            Cada regreso <em>cuenta.</em>
          </h2>
          <p>
            Tus tarjetas y recompensas, siempre a mano. Y si gestionas un
            programa, tu equipo y tus operaciones en la misma cuenta.
          </p>
          <div className="auth-stamps" aria-hidden="true">
            <span>
              <Check size={28} />
            </span>
            <span>
              <Check size={28} />
            </span>
            <span>
              <Check size={28} />
            </span>
            <span>
              <Gift size={28} />
            </span>
          </div>
        </aside>
        <section className="auth-panel">
          <h1>{title}</h1>
          <p className="muted">
            {mode === 'signup'
              ? 'Una cuenta para tus tarjetas y tus programas.'
              : mode === 'recover'
                ? 'Te enviaremos un enlace a tu correo.'
                : mode === 'reset'
                  ? 'Elige una contraseña segura para tu cuenta.'
                  : 'Entra para continuar con tu programa de lealtad.'}
          </p>
          {['login', 'signup'].includes(mode) && !fixedDestination && (
            <fieldset
              className="segmented"
              aria-label="Destino después de entrar"
            >
              <button
                type="button"
                aria-pressed={next === '/cards'}
                className={next === '/cards' ? 'selected' : ''}
                onClick={() => setNext('/cards')}
                disabled={busy}
              >
                Mis tarjetas
              </button>
              <button
                type="button"
                aria-pressed={next === '/app'}
                className={next === '/app' ? 'selected' : ''}
                onClick={() => setNext('/app')}
                disabled={busy}
              >
                Administrar
              </button>
            </fieldset>
          )}
          {auth.user && ['login', 'signup'].includes(mode) && (
            <div className="notice stack">
              <p>Ya tienes una sesión abierta con {auth.user.email}.</p>
              <Button asChild>
                <a href={next}>
                  Continuar <ArrowRight size={17} />
                </a>
              </Button>
            </div>
          )}
          {auth.error && !error && (
            <ErrorNotice
              error={new Error(auth.error)}
              retry={() => void auth.reload()}
            />
          )}
          {auth.loading && <Loading label="Restaurando tu sesión…" />}
          <ErrorNotice error={error} />
          {message && (
            <p className="notice notice-success" role="status">
              <Mail size={20} />
              {message}
            </p>
          )}
          {showForm && (
            <>
              <form className="stack" onSubmit={submit}>
                {mode === 'signup' && (
                  <Field label="Nombre completo">
                    {(id) => (
                      <Input
                        id={id}
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={255}
                      />
                    )}
                  </Field>
                )}
                {mode !== 'reset' && (
                  <Field label="Correo electrónico">
                    {(id) => (
                      <Input
                        id={id}
                        type="email"
                        autoComplete="email"
                        placeholder="tu@correo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    )}
                  </Field>
                )}
                {mode !== 'recover' && (
                  <Field
                    label="Contraseña"
                    hint={
                      mode === 'signup' || mode === 'reset'
                        ? 'Al menos 8 caracteres.'
                        : undefined
                    }
                  >
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        autoComplete={
                          mode === 'login' ? 'current-password' : 'new-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={mode === 'login' ? 1 : 8}
                      />
                    )}
                  </Field>
                )}
                <Button type="submit" disabled={busy}>
                  {busy
                    ? 'Un momento…'
                    : mode === 'signup'
                      ? 'Crear cuenta'
                      : mode === 'recover'
                        ? 'Enviar enlace'
                        : mode === 'reset'
                          ? 'Guardar contraseña'
                          : 'Iniciar sesión'}
                  <ArrowRight size={17} />
                </Button>
              </form>
              {['login', 'signup'].includes(mode) && (
                <>
                  <div className="divider-label">o continúa con</div>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    className="full-width"
                    onClick={() => void google()}
                  >
                    Google
                  </Button>
                </>
              )}
              <div className="auth-links">
                {mode === 'login' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('recover');
                        setError(null);
                        setMessage('');
                      }}
                    >
                      Olvidé mi contraseña
                    </button>
                    <p>
                      ¿Primera vez?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signup');
                          setError(null);
                          setMessage('');
                        }}
                      >
                        Crear una cuenta
                      </button>
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setMessage('');
                    }}
                  >
                    Ya tengo una cuenta
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
