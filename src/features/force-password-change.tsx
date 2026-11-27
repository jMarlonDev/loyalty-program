import { ArrowRight } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Brand, ErrorNotice, Field } from '../components/common';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuth } from '../lib/auth';
import { safeReturnTo } from './forms';

export function isStrongPassword(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export function ForcePasswordChange({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!auth.user?.must_change_password) return <>{children}</>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isStrongPassword(password)) {
      setError(new Error('Usa al menos 8 caracteres con letras y números.'));
      return;
    }
    if (password !== confirm) {
      setError(new Error('Las contraseñas no coinciden.'));
      return;
    }
    setBusy(true);
    try {
      await auth.updatePassword(password);
      await auth.reload();
      if (window.location.pathname === '/auth')
        window.location.assign(
          safeReturnTo(new URLSearchParams(window.location.search).get('next')),
        );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header>
        <Brand />
      </header>
      <main id="main-content" className="auth-layout">
        <section className="auth-panel">
          <h1>Cambia tu contraseña temporal</h1>
          <p className="muted">
            Tu administrador creó una contraseña temporal. Elige una propia para
            continuar.
          </p>
          <ErrorNotice error={error} />
          <form className="stack" onSubmit={submit}>
            <Field
              label="Nueva contraseña"
              hint="Al menos 8 caracteres, con letras y números."
            >
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Confirmar contraseña">
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              )}
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Un momento…' : 'Guardar contraseña'}
              <ArrowRight size={17} />
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
