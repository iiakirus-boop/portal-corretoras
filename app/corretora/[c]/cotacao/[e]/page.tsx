import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { cnpj, competencia, moeda, num, plural } from '@/lib/formato';
import { CATEGORIA, FAIXAS, calcularCotacao, lerEscolhas, operadora, pctCob, queryEscolhas, somaFx, type OpcaoCot, resumirPlano } from '@/lib/cotacao';
import { AutoEnviar } from '@/components/AutoEnviar';
import type { Empresa } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

type P = { params: Promise<{ c: string; e: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
type Cand = { op_d: string; plano_d: string; acom_d: string; cobertura: number; valida: boolean; ordem: number; categoria_d: number | null };

// Cotação de uma empresa, calculada na hora (função cot_cotacao). As escolhas (operadoras, plano de cada grupo,
// grupos fora) ficam na URL; a apresentação em PDF usa as mesmas escolhas.
export default async function CotacaoEmpresa({ params, searchParams }: P) {
  const { c, e } = await params;
  const sp = await searchParams;
  await exigirCorretora(c);
  const db = await cliente();
  const { data: emp } = await db.from('empresas').select('*').eq('id', e).eq('corretora_id', c).maybeSingle();
  if (!emp) notFound();
  const em = emp as Empresa;
  const es = lerEscolhas(sp);
  const { cot: k, erro } = await calcularCotacao(db, e, es);
  const base = `/corretora/${c}/cotacao/${e}`;
  const nome = em.nome_curto || em.razao_social;

  if (!k) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>Cotação · {nome}</h1></div><div className="acoes"><Link className="btn ghost" href={`/corretora/${c}/cotacao`}>Todas as empresas</Link></div></div>
        <section className="card"><p className="empty">Não deu para calcular a cotação agora.{erro ? ` (${erro})` : ''}</p></section>
      </div>
    );
  }

  // operadoras na tela: as escolhidas ou, no automático, as que a conta recomendou
  const sel = es.ops ?? k.opcoes.map((o) => o.operadora);
  const ativos = k.grupos.filter((g) => !g.fora);

  // planos possíveis para cada grupo em cada operadora escolhida (para trocar o de>para)
  const cands = new Map<string, Cand[]>();
  const { data: cats } = await db.from('cot_categorias').select('operadora,plano,categoria');
  const cat = new Map(((cats ?? []) as { operadora: string; plano: string; categoria: number }[]).map((x) => [`${x.operadora}|${x.plano}`, x.categoria]));
  if (sel.length) {
    for (const g of ativos) {
      if (g.operadora && g.plano) {
        const { data } = await db.from('cot_equivalencias').select('op_d,plano_d,acom_d,cobertura,valida,ordem,categoria_d')
          .eq('op_o', g.operadora).eq('plano_o', g.plano).eq('acom_o', g.acomodacao ?? '').in('op_d', sel).lte('ordem', 12).order('ordem');
        for (const x of (data ?? []) as Cand[]) cands.set(`${x.op_d}|${g.i}`, [...(cands.get(`${x.op_d}|${g.i}`) ?? []), x]);
      } else {
        const { data } = await db.from('cot_planos').select('operadora,plano,acomodacao,preco_ref').in('operadora', sel).order('preco_ref');
        for (const x of (data ?? []) as { operadora: string; plano: string; acomodacao: string }[])
          cands.set(`${x.operadora}|${g.i}`, [...(cands.get(`${x.operadora}|${g.i}`) ?? []), { op_d: x.operadora, plano_d: x.plano, acom_d: x.acomodacao, cobertura: NaN, valida: false, ordem: 99, categoria_d: cat.get(`${x.operadora}|${x.plano}`) ?? null }]);
      }
    }
  }
  const linhaDe = (op: string, i: number) => k.opcoes.find((o) => o.operadora === op)?.linhas.find((l) => l.grupo === i);
  const completas = k.opcoes.filter((o) => o.completa);
  const melhor = completas.filter((o) => (o.economia ?? 0) > 0).sort((a, b) => (b.economia ?? 0) - (a.economia ?? 0))[0];
  const qPdf = queryEscolhas({ ...es, ops: sel });
  const catTxt = (n: number | null | undefined) => (n ? CATEGORIA[n] : '');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cotação · {nome}</h1>
          <p>{[em.razao_social, em.codigo_interno, em.cnpj ? `CNPJ ${cnpj(em.cnpj)}` : null, k.municipio, k.mei ? 'MEI' : null, k.simples ? 'Simples Nacional' : null, k.situacao_cnpj && k.situacao_cnpj !== 'ATIVA' ? `CNPJ ${k.situacao_cnpj.toLowerCase()} na Receita` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="acoes">
          {completas.length > 0 && <a className="btn" href={`${base}/pdf?${qPdf}`} target="_blank" rel="noopener">Gerar apresentação (PDF)</a>}
          <Link className="btn ghost" href={`/corretora/${c}/cotacao`}>Todas as empresas</Link>
          <Link className="btn ghost" href={`/corretora/${c}/faturamento?emp=${encodeURIComponent(em.codigo_interno ?? '')}`}>Faturamento</Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Vidas na cotação</span><span className="kpi-v">{num(k.vidas)}</span><span className="kpi-s">{plural(k.titulares, 'titular', 'titulares')} · fatura de {competencia(k.competencia)}</span></div>
        <div className="kpi"><span className="kpi-l">Custo atual</span><span className="kpi-v">{moeda(k.custo_atual)}</span><span className="kpi-s">{k.copart ? 'com coparticipação' : 'sem coparticipação'}</span></div>
        <div className="kpi"><span className="kpi-l">Melhor economia</span><span className="kpi-v">{melhor ? moeda(melhor.economia) : '—'}</span><span className="kpi-s">{melhor ? `${operadora(melhor.operadora)} · ${moeda((melhor.economia ?? 0) * 12)} em 12 meses` : 'nenhuma opção mais barata'}</span></div>
        <div className="kpi"><span className="kpi-l">Situação</span><span className="kpi-v" style={{ fontSize: '1rem' }}>{k.status ?? '—'}</span><span className="kpi-s">{k.automatico ? 'operadoras escolhidas automaticamente' : 'operadoras escolhidas por você'}</span></div>
      </div>

      <section className="card">
        <div className="card-h">
          <h2>Montar a cotação</h2>
          <span className="hint">muda na hora · {k.automatico ? 'automático: até 3 operadoras mais baratas com rede e categoria equivalentes' : <Link href={base}>voltar ao automático</Link>}</span>
        </div>
        <AutoEnviar className="form">
          <div>
            <strong style={{ fontSize: '.85rem' }}>Operadoras</strong>
            <div className="chips" style={{ marginTop: '.35rem' }}>
              {k.operadoras.map((o) => (
                <label key={o} className="chip-check"><input type="checkbox" name="op" value={o} defaultChecked={sel.includes(o)} /> {operadora(o)}</label>
              ))}
            </div>
          </div>
          <div className="tbl">
            <table className="cot-fx">
              <thead>
                <tr><th>Grupo de hoje</th><th className="num">Vidas</th><th className="num">Valor hoje</th>{sel.map((o) => <th key={o}>Plano na {operadora(o)}</th>)}<th>Na cotação</th></tr>
              </thead>
              <tbody>
                {k.grupos.map((g) => (
                  <tr key={g.i} style={g.fora ? { opacity: 0.5 } : undefined}>
                    <td><span title={g.plano_atual ?? undefined}>{resumirPlano(g.plano_atual ?? g.plano)}</span>{g.acomodacao ? ` · ${g.acomodacao}` : ''}<small>{g.seguradora}{g.plano ? ` · na tabela: ${g.plano}${catTxt(cat.get(`${g.operadora}|${g.plano}`)) ? ` (${catTxt(cat.get(`${g.operadora}|${g.plano}`))})` : ''}` : ' · plano sem equivalente: escolha à mão'}</small></td>
                    <td className="num">{num(g.vidas)}</td>
                    <td className="num">{moeda(g.valor)}</td>
                    {sel.map((o) => {
                      const l = linhaDe(o, g.i);
                      const atual = es.trocas[o]?.[String(g.i)] ?? '';
                      const cs = cands.get(`${o}|${g.i}`) ?? [];
                      return (
                        <td key={o}>
                          {g.fora ? '—' : (
                            <select name="t" defaultValue={atual ? `${o}:${g.i}:${atual}` : ''} aria-label={`Plano na ${operadora(o)} para ${resumirPlano(g.plano_atual ?? g.plano)}`} style={{ maxWidth: 260 }}>
                              <option value="">{l && l.escolha === 'automatico' ? `Automático: ${l.plano}${l.acomodacao ? ` ${l.acomodacao}` : ''}` : 'Automático'}</option>
                              {cs.map((x) => (
                                <option key={`${x.plano_d}|${x.acom_d}`} value={`${o}:${g.i}:${x.plano_d}|${x.acom_d}`}>
                                  {x.plano_d}{x.acom_d ? ` ${x.acom_d}` : ''}{x.categoria_d ? ` · ${CATEGORIA[x.categoria_d]}` : ''}{Number.isFinite(x.cobertura) ? ` · ${pctCob(x.cobertura)} dos hospitais` : ''}{x.valida ? ' ✓' : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      );
                    })}
                    <td><label className="chip-check"><input type="checkbox" name="fora" value={g.i} defaultChecked={g.fora} /> tirar</label></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <noscript><button className="btn">Recalcular</button></noscript>
        </AutoEnviar>
        <p className="hint" style={{ marginTop: '.5rem' }}>✓ = plano equivalente pelo critério: mesma categoria de mercado (ou vizinha) e rede com pelo menos 70% dos hospitais de hoje que a operadora atende.</p>
      </section>

      {k.opcoes.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Comparativo</h2><span className="hint">valores com IOF de 2,38%</span></div>
          <div className="tbl">
            <table>
              <thead><tr><th>Operadora</th><th>Planos</th><th className="num">Mensal</th><th className="num">Economia/mês</th><th className="num">Economia 12 meses</th><th className="num">Hospitais de hoje</th></tr></thead>
              <tbody>
                <tr><td>Hoje</td><td>{[...new Set(ativos.map((g) => resumirPlano(g.plano_atual ?? g.plano)))].join(', ')}</td><td className="num">{moeda(k.custo_atual)}</td><td className="num">—</td><td className="num">—</td><td className="num">—</td></tr>
                {k.opcoes.map((o) => (
                  <tr key={o.operadora}>
                    <td><a href={`#op-${o.operadora}`}>{operadora(o.operadora)}</a></td>
                    <td>{o.completa ? [...new Set(o.linhas.map((l) => `${l.plano}${l.acomodacao ? ` ${l.acomodacao}` : ''}`))].join(', ') : <span className="pill p-warn">sem tabela para {plural(o.faltando.length, 'grupo', 'grupos')}</span>}</td>
                    <td className="num">{o.completa ? moeda(o.total_iof) : '—'}</td>
                    <td className="num">{o.completa ? <strong className={(o.economia ?? 0) < 0 ? 'down' : ''}>{moeda(o.economia)}</strong> : '—'}</td>
                    <td className="num">{o.completa ? moeda((o.economia ?? 0) * 12) : '—'}</td>
                    <td className="num">{o.completa ? pctCob(o.cobertura) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {k.opcoes.length === 0 && (
        <section className="card"><p className="empty">{k.automatico ? 'Nenhuma operadora sai mais barata com rede e categoria equivalentes. Marque as operadoras acima para cotar mesmo assim.' : 'Marque pelo menos uma operadora.'}</p></section>
      )}

      {k.opcoes.map((o) => <BlocoOperadora key={o.operadora} o={o} grupos={k.grupos} />)}
    </div>
  );
}

function BlocoOperadora({ o, grupos }: { o: OpcaoCot; grupos: { i: number; plano_atual: string | null; plano: string | null }[] }) {
  return (
    <section id={`op-${o.operadora}`} className="card cot-op">
      <div className="card-h">
        <h2>{operadora(o.operadora)}{o.completa && <small>{pctCob(o.cobertura)} dos hospitais de hoje</small>}</h2>
        <span className="hint">{o.completa ? `${moeda(o.total_iof)} por mês com IOF` : 'incompleta'}</span>
      </div>
      {o.faltando.length > 0 && (
        <p className="msg erro">Nenhuma tabela da {operadora(o.operadora)} serve para {o.faltando.map((i) => resumirPlano(grupos.find((g) => g.i === i)?.plano_atual ?? grupos.find((g) => g.i === i)?.plano ?? `grupo ${i}`)).join(', ')} (faixa de vidas, MEI, Simples ou coparticipação). Escolha outro plano para esse grupo ou tire o grupo.</p>
      )}
      {o.linhas.map((l) => (
        <div key={l.grupo} style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 .4rem' }}>
            <strong>{l.plano}{l.acomodacao ? ` · ${l.acomodacao}` : ''}</strong> no lugar de {resumirPlano(l.origem.plano_atual ?? l.origem.plano)}
            {l.escolha === 'manual' && <span className="pill p-info" style={{ marginLeft: '.4rem' }}>escolhido à mão</span>}
            {l.fora_criterio && <span className="pill p-warn" style={{ marginLeft: '.4rem' }}>fora do critério de equivalência</span>}
            {l.tabela.copart && <span className="pill p-warn" style={{ marginLeft: '.4rem' }}>com coparticipação</span>}
            <small className="hint"> · tabela {l.tabela.titulo} ({l.tabela.condicoes})</small>
          </p>
          <div className="tbl">
            <table className="cot-fx">
              <thead><tr><th>Faixa</th><th className="num">Vidas</th><th className="num">Valor por vida</th><th className="num">Subtotal</th></tr></thead>
              <tbody>
                {l.faixas.map((n, j) => n > 0 && (
                  <tr key={j}><td>{FAIXAS[j]}</td><td className="num">{n}</td><td className="num">{moeda(Number(l.valores[j]))}</td><td className="num">{moeda(n * Number(l.valores[j]))}</td></tr>
                ))}
                <tr><td><strong>Subtotal</strong></td><td className="num">{somaFx(l.faixas)}</td><td /><td className="num"><strong>{moeda(l.total)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          {l.faltam && l.faltam.length > 0 && (
            <details className="cot-falta"><summary>{plural(l.faltam.length, 'hospital de hoje fica', 'hospitais de hoje ficam')} de fora ({pctCob(l.cobertura)} da rede atual)</summary>{l.faltam.join(' · ')}</details>
          )}
        </div>
      ))}
      {o.completa && (
        <div className="tbl">
          <table>
            <tbody>
              <tr><td>Total</td><td className="num">{moeda(o.total)}</td></tr>
              <tr><td>IOF 2,38%</td><td className="num">{moeda(o.iof)}</td></tr>
              <tr><td><strong>Total com IOF</strong></td><td className="num"><strong>{moeda(o.total_iof)}</strong></td></tr>
              <tr><td>Economia por mês</td><td className="num"><strong>{moeda(o.economia)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
