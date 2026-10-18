import {
  AlertCircle,
  ArrowRight,
  LoaderCircle,
  Repeat2,
  Ticket,
} from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { ApiError } from '../lib/api';
import { Button } from './ui/button';
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Lealtad, inicio">
      <span className="brand-mark">
        <Repeat2 size={22} />
      </span>
      lealtad<span className="brand-dot">.</span>
    </a>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  const auth = error instanceof ApiError && error.status === 401;
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={20} />
      <div>
        <p>
          {auth
            ? 'Inicia sesión para continuar.'
            : error instanceof Error
              ? error.message
              : 'No pudimos completar la solicitud.'}
        </p>
        {auth ? (
          <a href="/auth">Entrar a mi cuenta</a>
        ) : (
          retry && (
            <Button variant="ghost" onClick={retry}>
              Reintentar
            </Button>
          )
        )}
      </div>
    </div>
  );
}
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spinner" size={20} />
      {label}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">
        <Ticket size={32} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function MoreButton({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}) {
  return hasNextPage ? (
    <Button
      variant="secondary"
      disabled={isFetchingNextPage}
      onClick={() => void fetchNextPage()}
    >
      {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
      <ArrowRight size={16} />
    </Button>
  ) : null;
}
