import { redirect } from 'next/navigation';
import { entrarDemo, entrarEmail } from '@/lib/acoes';
import { DEMO_USUARIOS } from '@/lib/demo/semente';
import { destino, MODO_DEMO, sessao } from '@/lib/servidor';
import { Aviso } from '@/components/Aviso';

type P = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Entrar({ searchParams }: P) {
  const sp = await searchParams;
  const s = await sessao();
  if (s && s.membros.length) redirect(destino(s));
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
              {MODO_DEMO ? 'Escolha um perfil para ver o portal como essa pessoa vê.' : 'Use o e-mail em que você recebeu o convite. Mandamos um link de acesso, sem senha.'}
            </p>
          </div>
          <Aviso sp={sp} />
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
            <form action={entrarEmail} className="form">
              <label className="campo">E-mail
                <input type="email" name="email" required autoComplete="email" placeholder="voce@empresa.com.br" />
              </label>
              <button className="btn">Receber link de acesso</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
