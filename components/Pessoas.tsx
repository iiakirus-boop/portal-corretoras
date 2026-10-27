// Quem tem acesso e convites pendentes, com o formulário de convite. Usado no master, na corretora e na empresa.
import { convidar, desativarMembro } from '@/lib/acoes';
import { data, PAPEL, plural } from '@/lib/formato';
import { Pill } from './Pill';
import type { Convite, Empresa, Membro, Papel } from '@/lib/tipos';

type Props = {
  de: string;
  corretoraId: string;
  membros: Membro[];
  convites: Convite[];
  empresas?: Empresa[];
  empresaFixa?: string;
  papeis: Papel[];
  podeRemover: boolean;
  eu: string;
};

export function Pessoas({ de, corretoraId, membros, convites, empresas = [], empresaFixa, papeis, podeRemover, eu }: Props) {
  const nomeE = (id: string | null) => (id ? empresas.find((e) => e.id === id)?.nome_curto ?? empresas.find((e) => e.id === id)?.razao_social ?? '' : '');
  const pendentes = convites.filter((c) => !c.aceito_em);
  const pedeEmpresa = !empresaFixa && papeis.some((p) => p.endsWith('_empresa'));
  return (
    <div className="grid g32">
      <section className="card">
        <div className="card-h"><h2>Quem tem acesso</h2><span className="hint">{plural(membros.length, 'pessoa', 'pessoas')}</span></div>
        {membros.length === 0 ? <p className="empty">Ninguém ainda. Convide pelo formulário ao lado.</p> : (
          <ul className="rows">
            {membros.map((m) => (
              <li key={m.id}>
                <div>
                  <b>{m.email ?? 'sem e-mail registrado'}</b>
                  <small>{PAPEL[m.papel]}{m.empresa_id && !empresaFixa ? `, ${nomeE(m.empresa_id)}` : ''}</small>
                </div>
                {podeRemover && m.user_id !== eu ? (
                  <form action={desativarMembro}>
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="de" value={de} />
                    <button className="btn perigo sm">Tirar acesso</button>
                  </form>
                ) : <Pill tom="ok">Ativo</Pill>}
              </li>
            ))}
          </ul>
        )}
        {pendentes.length > 0 && (
          <>
            <h3 style={{ fontSize: '.85rem', fontWeight: 800, margin: '1.1rem 0 .5rem' }}>Convites esperando o primeiro acesso</h3>
            <ul className="rows">
              {pendentes.map((c) => (
                <li key={c.id}>
                  <div><b>{c.email}</b><small>{PAPEL[c.papel]}{c.empresa_id && !empresaFixa ? `, ${nomeE(c.empresa_id)}` : ''}. Convidado em {data(c.criado_em)}</small></div>
                  <Pill tom="warn">Ainda não entrou</Pill>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="card">
        <div className="card-h"><h2>Convidar pessoa</h2></div>
        <form action={convidar} className="form">
          <input type="hidden" name="de" value={de} />
          <input type="hidden" name="corretora_id" value={corretoraId} />
          {empresaFixa && <input type="hidden" name="empresa_id" value={empresaFixa} />}
          <label className="campo">E-mail<input type="email" name="email" required placeholder="nome@empresa.com.br" /></label>
          <label className="campo">O que a pessoa pode fazer
            <select name="papel" required>
              {papeis.map((p) => <option key={p} value={p}>{PAPEL[p]}</option>)}
            </select>
          </label>
          {pedeEmpresa && (
            <label className="campo">Empresa <small>(para gestor, movimentação e financeiro)</small>
              <select name="empresa_id" defaultValue="">
                <option value="">Nenhuma (equipe da corretora)</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_curto ?? e.razao_social}</option>)}
              </select>
            </label>
          )}
          <div><button className="btn">Criar convite</button></div>
          <p className="note">
            A pessoa entra no portal com este e-mail e recebe um link de acesso. Não existe senha para combinar.
            Gestor vê tudo da empresa e aprova pedidos; movimentação cuida das vidas (os pedidos passam pelo gestor);
            financeiro vê faturas e boletos.
          </p>
        </form>
      </section>
    </div>
  );
}
