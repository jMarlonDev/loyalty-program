import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { AuthProvider } from '@/lib/auth';
import '../styles.css';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: 'Lealtad · Cada visita cuenta' },
        {
          name: 'description',
          content:
            'Tarjetas de fidelización para tu restaurante. Acumula sellos, comparte tu QR y recompensa cada visita.',
        },
        { name: 'theme-color', content: '#f7f5ef' },
      ],
    }),
    component: Root,
    notFoundComponent: () => (
      <main id="main-content" className="standalone stack">
        <h1>No encontramos esta página</h1>
        <p>Comprueba el enlace o vuelve al inicio.</p>
        <a href="/">Volver al inicio</a>
      </main>
    ),
    errorComponent: ({ reset }) => (
      <main id="main-content" className="standalone stack">
        <h1>No pudimos cargar esta página</h1>
        <p>Vuelve a intentarlo en un momento.</p>
        <button type="button" onClick={reset}>
          Reintentar
        </button>
        <a href="/">Volver al inicio</a>
      </main>
    ),
  },
);

function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <a className="skip-link" href="#main-content">
              Saltar al contenido
            </a>
            <Outlet />
          </AuthProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
