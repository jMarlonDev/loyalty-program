import { ArrowLeft, Search } from 'lucide-react';
import { useState } from 'react';
import {
  Empty,
  ErrorNotice,
  Loading,
  MoreButton,
  PageTitle,
} from '../components/common';
import { PublicShareQr } from '../components/public-share-qr';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { useCollection, useResource } from '../lib/api';
import type { Program } from '../lib/types';
import { formatDate, statusLabel } from '../lib/utils';

interface Results {
  customers: number;
  active_cards: number;
  purchases: number;
  available_rewards: number;
  redeemed_rewards: number;
}
interface Customer {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  status: string;
  joined_at: string;
  card_id: string;
  balance: number;
  available_rewards: number;
  redeemed_rewards: number;
  purchases: number;
}
export function ResultsPanel({
  restaurantId,
  program,
  onBack,
}: {
  restaurantId: string;
  program: Program;
  onBack: () => void;
}) {
  const base = `/restaurants/${restaurantId}/programs/${program.id}`,
    results = useResource<Results>(`${base}/results`),
    customers = useCollection<Customer>(`${base}/customers`);
  const [selected, setSelected] = useState<Customer | null>(null);
  return (
    <>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={17} />
        Volver a tarjetas
      </Button>
      <PageTitle
        title={program.name}
        description="Cada visita tiene una historia. Así va tu programa."
      />
      <section className="panel">
        {program.status === 'active' ? (
          <PublicShareQr
            path={`/join/${encodeURIComponent(program.public_code)}`}
          />
        ) : (
          <p className="muted">
            El programa está{' '}
            {program.status === 'paused' ? 'pausado' : 'finalizado'}. La
            inscripción por QR no está disponible.
          </p>
        )}
      </section>
      <h2 className="section-title">Tu programa en números</h2>
      <ErrorNotice error={results.error} retry={() => void results.refetch()} />
      {results.isLoading && <Loading />}
      {results.data && (
        <>
          <dl className="results-metrics">
            <div>
              <dt>Clientes inscritos</dt>
              <dd>{results.data.customers}</dd>
            </div>
            <div>
              <dt>Compras registradas</dt>
              <dd>{results.data.purchases}</dd>
            </div>
            <div>
              <dt>Premios entregados</dt>
              <dd>{results.data.redeemed_rewards}</dd>
            </div>
          </dl>
          <p className="field-hint">
            {results.data.active_cards} tarjetas activas ·{' '}
            {results.data.available_rewards} premios por entregar. Las compras
            revertidas no se cuentan.
          </p>
        </>
      )}
      <h2 className="section-title">Clientes del programa</h2>
      <ErrorNotice
        error={customers.error}
        retry={() => void customers.refetch()}
      />
      {customers.isLoading && <Loading />}
      {customers.items.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <caption className="sr-only">
              Clientes inscritos en {program.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Sellos</th>
                <th scope="col">Premios disponibles</th>
                <th scope="col">Registro</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.items.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    {customer.full_name}
                    <span>{customer.email}</span>
                  </td>
                  <td>
                    {customer.balance} / {program.stamps_required}
                  </td>
                  <td>{customer.available_rewards}</td>
                  <td>{formatDate(customer.joined_at)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Ver a ${customer.full_name}`}
                      onClick={() => setSelected(customer)}
                    >
                      <Search size={18} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!customers.isLoading && !customers.error && !customers.items.length && (
        <Empty title="El primer cliente está por llegar">
          Comparte tu QR en el mostrador o el enlace de tu programa para
          empezar.
        </Empty>
      )}
      <MoreButton {...customers} />
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.full_name ?? 'Cliente'}
        description="Información del cliente dentro de este programa."
      >
        {selected && (
          <div className="stack">
            <dl className="customer-facts">
              <div>
                <dt>Correo</dt>
                <dd>{selected.email}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{statusLabel(selected.status)}</dd>
              </div>
              <div>
                <dt>Sellos actuales</dt>
                <dd>{selected.balance}</dd>
              </div>
              <div>
                <dt>Premios disponibles</dt>
                <dd>{selected.available_rewards}</dd>
              </div>
              <div>
                <dt>Premios entregados</dt>
                <dd>{selected.redeemed_rewards}</dd>
              </div>
              <div>
                <dt>Compras</dt>
                <dd>{selected.purchases}</dd>
              </div>
              <div>
                <dt>Registro</dt>
                <dd>{formatDate(selected.joined_at)}</dd>
              </div>
            </dl>
            <p className="field-hint">
              Para registrar una compra o entregar un premio, abre «Registrar» y
              pide al cliente el QR de su tarjeta.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
