import { type ReactNode, useState } from 'react';
import { useAuth } from '../lib/auth';
import { ErrorNotice } from './common';
import { Button } from './ui/button';

export function AccountSession({
  children,
  disabled = false,
  onSignedOut,
}: {
  children?: ReactNode;
  disabled?: boolean;
  onSignedOut?: () => void;
}) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function switchAccount() {
    setBusy(true);
    setError(null);
    try {
      await auth.logout();
      onSignedOut?.();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  if (!auth.user) return null;
  return (
    <fieldset
      className="stack min-w-0"
      aria-label="Cuenta en uso"
      disabled={busy || disabled}
    >
      <p>
        Sesión actual: <strong className="break-all">{auth.user.email}</strong>
      </p>
      {children}
      <Button
        type="button"
        variant="secondary"
        onClick={() => void switchAccount()}
      >
        {busy ? 'Cerrando sesión…' : 'Usar otra cuenta'}
      </Button>
      <ErrorNotice error={error} />
    </fieldset>
  );
}
