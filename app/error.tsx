'use client';
// Quando uma tela falha, a pessoa vê isto em vez da mensagem técnica em inglês.
import { useEffect } from 'react';

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="wrap">
      <div className="page tela-aviso">
        <h1>Algo deu errado nesta tela</h1>
        <p>Não foi você. Os dados continuam guardados. Tente de novo; se continuar, avise a corretora e diga em qual tela estava.</p>
        <div className="acoes">
          <button className="btn" onClick={() => reset()}>Tentar de novo</button>
          <a className="btn ghost" href="/">Voltar ao início</a>
        </div>
        {error.digest && <p className="hint">Código para o suporte: {error.digest}</p>}
      </div>
    </main>
  );
}
