import { redirect } from 'next/navigation';
import { criarSenha } from '@/lib/acoes';
import { MODO_DEMO, sessao } from '@/lib/servidor';
import { Aviso } from '@/components/Aviso';

type P = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Senha({ searchParams }: P) {
  const sp = await searchParams;
  const s = await sessao();
  if (!s || MODO_DEMO) redirect('/entrar');
  return (
    <main className="wrap" style={{ maxWidth: 480, paddingBlock: '4rem' }}>
      <div className="card">
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{sp.primeira ? 'Crie sua senha' : 'Trocar senha'}</h1>
        <p className="hint" style={{ marginTop: '.5rem' }}>
          {sp.primeira
            ? 'Assim, nas próximas vezes você entra direto com e-mail e senha, sem esperar o link.'
            : 'Escolha a nova senha para entrar no portal.'}
        </p>
        <Aviso sp={sp} />
        <form action={criarSenha} className="form" style={{ marginTop: '1rem' }}>
          <input type="email" name="usuario" autoComplete="username" value={s.email ?? ''} readOnly hidden />
          <label className="campo">Senha <small>(pelo menos 8 caracteres)</small>
            <input type="password" name="senha" required minLength={8} autoComplete="new-password" />
          </label>
          <label className="campo">Repita a senha
            <input type="password" name="confirmar" required minLength={8} autoComplete="new-password" />
          </label>
          <button className="btn">Salvar senha e continuar</button>
        </form>
      </div>
    </main>
  );
}
