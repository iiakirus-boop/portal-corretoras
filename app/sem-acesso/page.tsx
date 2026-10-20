import { sair } from '@/lib/acoes';

export default function SemAcesso() {
  return (
    <main className="wrap" style={{ maxWidth: 560, paddingBlock: '4rem' }}>
      <div className="card">
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Seu e-mail ainda não tem acesso</h1>
        <p className="hint" style={{ marginTop: '.5rem' }}>
          O acesso é liberado por convite. Peça para a sua corretora (ou para o gestor da sua empresa) convidar este e-mail e entre de novo.
        </p>
        <form action={sair} style={{ marginTop: '1rem' }}><button className="btn ghost">Voltar para a entrada</button></form>
      </div>
    </main>
  );
}
