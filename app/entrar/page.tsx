import { redirect } from 'next/navigation';
import Link from 'next/link';
import { entrarDemo, entrarEmail, entrarSenha, sair } from '@/lib/acoes';
import { DEMO_USUARIOS } from '@/lib/demo/semente';
import { destino, MODO_DEMO, sessao } from '@/lib/servidor';
import { Aviso } from '@/components/Aviso';

type P = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Entrar({ searchParams }: P) {
  const sp = await searchParams;
  const s = await sessao();
  // Já conectado: segue direto, a não ser que o link tenha falhado ou a pessoa queira trocar de conta
  if (s && s.membros.length && !sp.erro && !sp.trocar) redirect(destino(s));
  return (
    <div className="entrar">
      <section className="entrar-lado">
        <div>
          <h1>Faturas, vidas e pedidos do plano de saúde num lugar só</h1>
          <p>A corretora cuida da carteira; a empresa acompanha boletos, beneficiários e movimentações sem precisar mandar e-mail.</p>
        </div>
        <ul className="entrar-lista">
          <li><span aria-hidden>▸</span><span><b>Empresa:</b> baixe faturas e boletos, veja quem está no plano e peça inclusão, exclusão ou 2ª via.</span></li>
          <li><span aria-hidden>▸</span><span><b>Corretora:</b> acompanhe a carteira inteira, a fila de pedidos e as comissões.</span></li>
          <li><span aria-hidden>▸</span><span><b>Robôs da corretora:</b> buscam as faturas nos portais das seguradoras e deixam tudo aqui.</span></li>
        </ul>
      </section>
      <section className="entrar-form">
        <div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>Entrar</h2>
            <p className="hint" style={{ marginTop: '.3rem' }}>
              {MODO_DEMO ? 'Escolha um perfil para ver o portal como essa pessoa vê.' : 'Entre com seu e-mail e senha. No primeiro acesso, peça o link por e-mail e crie sua senha.'}
            </p>
          </div>
          <Aviso sp={sp} />
          {s && s.membros.length > 0 && (
            <form action={sair} className="msg aviso" style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
              <span>Este navegador está conectado como <b>{s.email}</b>.</span>
              <Link href={destino(s)} className="btn ghost">Continuar como {s.email.split('@')[0]}</Link>
              <button className="btn">Sair e entrar com outra conta</button>
            </form>
          )}
          {s && !s.membros.length && <p className="msg aviso">Seu e-mail ainda não tem acesso. Peça para a corretora enviar um convite.</p>}
          {MODO_DEMO ? (
            <form action={entrarDemo} className="perfis">
              {DEMO_USUARIOS.map((u) => (
                <button key={u.id} name="usuario" value={u.id} className="perfil">
                  <span className="av" aria-hidden>{u.nome[0]}</span>
                  <span><b>{u.nome}</b><small>{u.descricao}</small></span>
                </button>
              ))}
            </form>
          ) : sp.enviado ? (
            <p className="msg ok">Link enviado para {sp.enviado}. Abra o e-mail neste aparelho e clique no link para entrar.</p>
          ) : (
            <>
              <form action={entrarSenha} className="form">
                <label className="campo">E-mail
                  <input type="email" name="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
                </label>
                <label className="campo">Senha
                  <input type="password" name="senha" required autoComplete="current-password" />
                </label>
                <button className="btn">Entrar</button>
              </form>
              <form action={entrarEmail} className="form" style={{ marginTop: '1.4rem', paddingTop: '1.2rem', borderTop: '1px solid var(--line)' }}>
                <p className="hint" style={{ margin: 0 }}>Primeiro acesso ou esqueceu a senha? Mandamos um link para o seu e-mail; ao entrar por ele, você cria a senha.</p>
                <label className="campo">E-mail
                  <input type="email" name="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
                </label>
                <button className="btn ghost">Receber link por e-mail</button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
