// Ao trocar de tela, a barra de cima fica e o miolo mostra que está carregando.
export default function Carregando() {
  return (
    <div className="page carregando-miolo" role="status" aria-live="polite">
      <span className="carregando-barra" aria-hidden />
      <div className="esqueleto t" /><div className="esqueleto l" />
      <div className="kpis"><div className="esqueleto k" /><div className="esqueleto k" /><div className="esqueleto k" /><div className="esqueleto k" /></div>
      <div className="esqueleto b" />
      <span className="sr">Carregando…</span>
    </div>
  );
}
