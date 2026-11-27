import { ArrowRight } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Brand,
  Empty,
  ErrorNotice,
  Field,
  Loading,
} from '../components/common';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const storageKey = 'loyalty:staff-invitation';

interface Preview {
  restaurant_name: string;
  location_name: string;
  expires_at: string;
}

function readStored() {
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function JoinStaffPage() {
  const auth = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const [accepting, setAccepting] = useState(false);
  const [joined, setJoined] = useState<{
    restaurant_name: string;
    location_name: string;
  } | null>(null);
  const started = useRef(false);
  const accepted = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    let value = fromHash ?? readStored();
    if (fromHash) {
      try {
        sessionStorage.setItem(storageKey, fromHash);
      } catch {}
      window.history.replaceState(window.history.state, '', '/join-staff');
    }
    setToken(value);
    setChecked(true);
    if (!value) return;
    value = String(value);
    api<{ data: Preview }>('/staff-invitations/preview', {
      method: 'POST',
      body: { token: value },
    })
      .then((result) => setPreview(result.data))
      .catch((failure) => setError(failure));
  }, []);

  useEffect(() => {
    if (!auth.user || !token || !preview || accepted.current) return;
    accepted.current = true;
    setAccepting(true);
    api<{
      data: { restaurant_name: string; location_name: string };
    }>('/staff-invitations/accept', { method: 'POST', body: { token } })
      .then((result) => {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        setJoined(result.data);
        window.location.assign('/app');
      })
      .catch((failure) => setError(failure))
      .finally(() => setAccepting(false));
  }, [auth.user, token, preview]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (mode === 'signup')
        await auth.signup(email.trim(), password, name.trim(), '/app');
      else await auth.login(email.trim(), password);
    } catch (failure) {
      setFormError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-page">
      <header>
        <Brand />
      </header>
      <main id="main-content" className="standalone">
        {!checked || auth.loading ? (
          <Loading label="Comprobando la invitación…" />
        ) : !token ? (
          <Empty title="Falta la invitación">
            Escanea de nuevo el QR que te dio tu administrador.
          </Empty>
        ) : error ? (
          <div className="stack">
            <ErrorNotice error={error} />
            <p className="field-hint">
              Pide a tu administrador una invitación nueva.
            </p>
          </div>
        ) : joined ? (
          <p className="notice notice-success" role="status">
            Ya formas parte de {joined.restaurant_name} · Sucursal{' '}
            {joined.location_name}.
          </p>
        ) : !preview ? (
          <Loading label="Comprobando la invitación…" />
        ) : (
          <div className="stack">
            <h1>
              Te invitan a {preview.restaurant_name} · Sucursal{' '}
              {preview.location_name}
            </h1>
            {auth.user ? (
              accepting && <Loading label="Uniéndote al equipo…" />
            ) : (
              <form className="stack" onSubmit={(event) => void submit(event)}>
                <p className="muted">
                  {mode === 'signup'
                    ? 'Crea tu cuenta para unirte.'
                    : 'Entra con tu cuenta para unirte.'}
                </p>
                {mode === 'signup' && (
                  <Field label="Nombre completo">
                    {(id) => (
                      <Input
                        id={id}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        autoComplete="name"
                      />
                    )}
                  </Field>
                )}
                <Field label="Correo electrónico">
                  {(id) => (
                    <Input
                      id={id}
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                    />
                  )}
                </Field>
                <Field label="Contraseña">
                  {(id) => (
                    <Input
                      id={id}
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={mode === 'signup' ? 8 : undefined}
                      autoComplete={
                        mode === 'signup' ? 'new-password' : 'current-password'
                      }
                    />
                  )}
                </Field>
                <ErrorNotice error={formError} />
                <Button disabled={busy} type="submit">
                  {busy
                    ? 'Un momento…'
                    : mode === 'signup'
                      ? 'Crear cuenta y unirme'
                      : 'Entrar y unirme'}
                  <ArrowRight size={17} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setMode(mode === 'signup' ? 'login' : 'signup')
                  }
                >
                  {mode === 'signup' ? 'Ya tengo cuenta' : 'Crear una cuenta'}
                </Button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
