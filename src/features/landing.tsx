import { ArrowRight, Check, Gift, QrCode, Repeat2, Store } from 'lucide-react';
import { Brand } from '../components/common';
import { exampleProgram, LoyaltyCard } from '../components/loyalty-card';
import { Button } from '../components/ui/button';
export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav aria-label="Navegación principal">
          <a href="/cards">Mis tarjetas</a>
          <a href="/app">Administrar</a>
          <Button asChild variant="secondary">
            <a href="/auth">
              Iniciar sesión
              <ArrowRight size={16} />
            </a>
          </Button>
        </nav>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Un buen motivo
              <br />
              para <em>volver.</em>
            </h1>
            <p>
              Tu programa de fidelidad, a tu manera. Crea tarjetas digitales,
              registra compras y recompensa a quienes vuelven a elegirte.
            </p>
            <div className="button-row">
              <Button asChild>
                <a href="/auth?mode=signup">
                  Crear mi programa
                  <ArrowRight size={18} />
                </a>
              </Button>
              <Button asChild variant="ghost">
                <a href="#como-funciona">Cómo funciona</a>
              </Button>
            </div>
            <p className="hero-note">
              <Check size={16} />
              Una compra. Un sello. Un motivo para volver.
            </p>
          </div>
          <div className="hero-art">
            <div className="hero-card-back" aria-hidden="true">
              <Repeat2 size={30} />
              <span>Cada visita cuenta.</span>
            </div>
            <div className="hero-card-main">
              <LoyaltyCard program={exampleProgram} balance={3} example />
            </div>
            <div className="hero-receipt">
              <span className="receipt-check">
                <Check size={18} />
              </span>
              <div>
                <strong>Una visita más cerca</strong>
                <span>Así se ve tu tarjeta digital</span>
              </div>
            </div>
          </div>
        </section>
        <section id="como-funciona" className="how-section">
          <div className="section-intro">
            <h2>
              Simple para tu equipo.
              <br />
              Especial para tus clientes.
            </h2>
            <p>
              Desde la primera compra hasta el próximo premio: tarjetas, equipo
              y operaciones en un mismo lugar.
            </p>
          </div>
          <div className="how-steps">
            <article>
              <Store size={25} />
              <h3>Hazla tuya</h3>
              <p>
                Elige la meta, el premio y los colores que hacen único a tu
                negocio.
              </p>
            </article>
            <article>
              <QrCode size={25} />
              <h3>Comparte tu QR</h3>
              <p>
                Tus clientes abren el enlace, crean su cuenta y reciben su
                tarjeta digital.
              </p>
            </article>
            <article>
              <Gift size={25} />
              <h3>Da razones para volver</h3>
              <p>
                Tu equipo registra cada compra. Al completar la meta, el premio
                queda disponible.
              </p>
            </article>
          </div>
        </section>
        <section className="landing-client">
          <div>
            <h2>¿Vienes por tus sellos?</h2>
            <p>
              Consulta tus tarjetas y descubre cuánto falta para tu próximo
              premio.
            </p>
          </div>
          <Button asChild variant="secondary">
            <a href="/cards">
              Ver mis tarjetas
              <ArrowRight size={17} />
            </a>
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Cada vínculo cuenta.</span>
        <a href="/app">Gestionar mi programa</a>
      </footer>
    </div>
  );
}
