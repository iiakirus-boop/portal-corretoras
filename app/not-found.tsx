import Link from 'next/link';

export const metadata = { title: 'Página não encontrada' };

export default function NaoEncontrada() {
  return (
    <main className="wrap">
      <div className="page tela-aviso">
        <h1>Esta página não existe</h1>
        <p>O endereço pode ter mudado, ou o item foi removido. Volte ao início e procure pela busca no topo.</p>
        <div className="acoes"><Link className="btn" href="/">Voltar ao início</Link></div>
      </div>
    </main>
  );
}
