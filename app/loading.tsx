// Enquanto a tela busca os dados: um aviso discreto de "carregando" em vez de a página parecer travada.
export default function Carregando() {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <span className="carregando-barra" aria-hidden />
      <span className="sr">Carregando…</span>
    </div>
  );
}
