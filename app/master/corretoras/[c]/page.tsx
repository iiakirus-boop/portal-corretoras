import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cliente, exigirSessao } from '@/lib/servidor';
import { cnpj, competencia, data, moeda, num, seg, SEGURADORA } from '@/lib/formato';
import { alternarLogin, salvarLogin } from '@/lib/acoes';
import { mensalidade, vidasCarteira, vidasEmpresaPor, type Contrato, type VidaCarteira } from '@/lib/contas';
import { Aviso } from '@/components/Aviso';
import { Pessoas } from '@/components/Pessoas';
import { Pill } from '@/components/Pill';
import type { CodigoSeguradora, Convite, Corretora, Empresa, Membro } from '@/lib/tipos';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function CorretoraMaster({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  const s = await exigirSessao();
  const db = await cliente();
  const { data: cor } = await db.from('corretoras').select('*').eq('id', c).maybeSingle();
  if (!cor) notFound();
  const k = cor as Corretora;
  const [{ data: cnpjs }, { data: codigos }, { data: empresas }, { data: vidasC }, { data: membros }, { data: convites }] = await Promise.all([
    db.from('corretora_cnpjs').select('*').eq('corretora_id', c),
    db.from('corretora_codigos').select('*').eq('corretora_id', c),
    db.from('empresas').select('*').eq('corretora_id', c).order('razao_social'),
    db.from('vidas_carteira').select('*').eq('corretora_id', c),
    db.from('membros').select('*').eq('corretora_id', c).eq('ativo', true),
    db.from('convites').select('*').eq('corretora_id', c),
  ]);
  const es = (empresas ?? []) as Empresa[];
  const vc = (vidasC ?? []) as VidaCarteira[];
  const vidasE = vidasEmpresaPor(vc);
  const segsE = new Map<string, string[]>();
  for (const v of vc) if (v.seguradora_id) segsE.set(v.empresa_id, [...(segsE.get(v.empresa_id) ?? []), seg(v.seguradora_id)]);
  const base = vc[0]?.base ?? '';
  const mov = vc.reduce((t, v) => t + v.inclusoes - v.exclusoes, 0);
  const vidas = vidasCarteira(vc);
  const contrato = (k.contrato ?? {}) as Contrato;
  const preco = mensalidade(vidas, contrato);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/master/corretoras" className="voltar">Corretoras</Link>
          <h1>{k.nome}</h1>
          <p>{k.razao_social} ({cnpj(k.cnpj)})</p>
        </div>
        <div className="acoes">
          <a href={`/corretora/${c}`} className="btn">Abrir o painel desta corretora</a>
          <a href={`/central/${c}`} className="btn ghost">Central antiga</a>
        </div>
      </div>
      <Aviso sp={sp} />

      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Empresas ativas</span><span className="kpi-v">{num(es.filter((e) => e.ativa).length)}</span></div>
        <div className="kpi"><span className="kpi-l">Vidas ativas</span><span className="kpi-v">{num(vidas)}</span><span className="kpi-s">faturadas desde {competencia(base || null)}{mov ? `, ${mov > 0 ? '+' : ''}${num(mov)} de movimentações` : ''}</span></div>
        <div className="kpi"><span className="kpi-l">Mensalidade da plataforma</span><span className="kpi-v">{preco ? moeda(preco.valor) : '—'}</span><span className="kpi-s">{preco ? `${moeda(preco.porVida)} por vida${preco.minimoAplicado ? ', valor mínimo' : ''}` : contrato.observacao ?? 'sem preço combinado'}</span></div>
        <div className="kpi"><span className="kpi-l">Desde</span><span className="kpi-v">{data(k.criado_em)}</span><span className="kpi-s">{k.slug}</span></div>
      </div>

      <div className="grid g2">
        <section className="card">
          <div className="card-h"><h2>Logins nas seguradoras</h2><span className="hint">os agentes entram por estes logins; pode ter vários por seguradora</span></div>
          <ul className="rows">
            {((codigos ?? []) as CodigoSeguradora[])
              .sort((a, b) => a.seguradora_id.localeCompare(b.seguradora_id) || a.codigo.localeCompare(b.codigo))
              .map((x) => (
                <li key={x.id}>
                  <div><b>{seg(x.seguradora_id)} {x.codigo}</b><small>{[x.rotulo, x.uso && x.uso !== 'ambos' ? `só ${x.uso === 'comissao' ? 'comissão' : 'faturas'}` : null].filter(Boolean).join(' · ')}</small></div>
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    {x.ativo ? <Pill tom="ok">Ativo</Pill> : <Pill tom="idle">Parado</Pill>}
                    <form action={alternarLogin}>
                      <input type="hidden" name="corretora_id" value={c} /><input type="hidden" name="id" value={x.id} />
                      <input type="hidden" name="ligar" value={x.ativo ? '0' : '1'} />
                      <button className="btn ghost">{x.ativo ? 'Parar' : 'Ligar'}</button>
                    </form>
                  </div>
                </li>
              ))}
          </ul>
          <details className="more">
            <summary>Cadastrar outro login</summary>
            <form action={salvarLogin} className="form">
              <input type="hidden" name="corretora_id" value={c} />
              <div className="linha">
                <label className="campo">Seguradora
                  <select name="seguradora_id" required defaultValue="">
                    <option value="" disabled>Escolha</option>
                    {Object.entries(SEGURADORA).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                  </select>
                </label>
                <label className="campo">Código do login <small>(ex.: 045M)</small><input name="codigo" required /></label>
              </div>
              <div className="linha">
                <label className="campo">Nome para reconhecer<input name="rotulo" placeholder="Ex.: grupo de contratos 2" /></label>
                <label className="campo">Serve para
                  <select name="uso" defaultValue="ambos">
                    <option value="ambos">Faturas e comissão</option><option value="faturas">Só faturas</option><option value="comissao">Só comissão</option>
                  </select>
                </label>
              </div>
              <div className="linha">
                <label className="campo">Pasta no PC <small>(opcional)</small><input name="pasta" placeholder="Ex.: Hapvida_045M" /></label>
                <label className="campo">Prefixo da ordem de comissão <small>(opcional)</small><input name="prefixo" placeholder="Ex.: HAP-045M-" /></label>
              </div>
              <p className="hint">A senha não vai para o site. Depois de cadastrar, no PC clique uma vez em &quot;Entrar na seguradora&quot; para guardar a senha deste login.</p>
              <button className="btn">Cadastrar login</button>
            </form>
          </details>
        </section>
        <section className="card">
          <div className="card-h"><h2>CNPJs da corretora</h2></div>
          <ul className="rows">
            {((cnpjs ?? []) as { cnpj: string; razao_social: string | null; principal: boolean }[]).map((x) => (
              <li key={x.cnpj}><div><b>{cnpj(x.cnpj)}</b><small>{x.razao_social}</small></div>{x.principal && <Pill tom="info">Principal</Pill>}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Empresas da carteira</h2><Link href={`/corretora/${c}/empresas`} className="hint">gerenciar no painel da corretora</Link></div>
        {es.length === 0 ? <p className="empty">Nenhuma empresa cadastrada.</p> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Empresa</th><th>Seguradoras</th><th className="num">Vidas</th></tr></thead>
              <tbody>
                {es.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/corretora/${c}/empresas/${e.id}`}>{e.razao_social}</Link><small>{e.codigo_interno} {e.cnpj}</small></td>
                    <td>{(segsE.get(e.id) ?? []).join(', ') || '—'}</td>
                    <td className="num">{num(vidasE.get(e.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Pessoas de={`/master/corretoras/${c}`} corretoraId={c} eu={s.userId} podeRemover
        membros={((membros ?? []) as Membro[]).filter((m) => !m.empresa_id)}
        convites={((convites ?? []) as Convite[]).filter((x) => !x.empresa_id)}
        papeis={['admin_corretora', 'operador_corretora']} />
    </div>
  );
}
