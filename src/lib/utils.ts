import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const formatDate = (date: string | undefined) =>
  date
    ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
        new Date(date),
      )
    : '—';
export const statusLabel = (status: string) =>
  ({
    active: 'Activo',
    inactive: 'Inactivo',
    paused: 'Pausado',
    ended: 'Finalizado',
    suspended: 'Suspendido',
    disabled: 'Deshabilitado',
    closed: 'Cerrada',
    available: 'Disponible',
    redeemed: 'Entregado',
    cancelled: 'Cancelado',
    pending: 'Pendiente',
    accepted: 'Aceptada',
    revoked: 'Revocada',
    owner: 'Propietario',
    admin: 'Administrador',
    employee: 'Empleado',
  })[status] ?? status;
