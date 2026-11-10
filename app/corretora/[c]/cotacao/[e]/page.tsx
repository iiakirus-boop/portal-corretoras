import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { cnpj, competencia, moeda, num, plural, quando } from '@/lib/formato';
import { FAIXAS, operadora, pctCob, somaFx, tomStatus, type ResultadoCot } from '@/lib/cotacao';
import { Aviso } from '@/components/Aviso';
import type { Empresa } from '@/lib/tipos';
import { recalcularCotacoes } from '../acoes';

export const dynamic = 'force-dynamic';

type P = { params: Promise<{ c: string; e: string }>; searchParams: Promise<Record<string, string | undefined>> };
type Equiv = { op_o: string; plano_o: string; acom_o: string; op_d: string; plano_d: string; acom_d: string; cobertura: number; cobertura_rel: number; preco_ref: number | null; ordem: number };

export default async function CotacaoEmpresa({ params, searchParams }: P) {
  const { c, e } = await params;
  const sp = await searchParams;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  const [{ data: emp }, { data: res }] = await Promise.all([
    db.from('empresas').select('*').eq('id', e).eq('corretora_id', c).maybeSingle(),
    db.from('cot_resultados').select('*').eq('empresa_id', e).maybeSingle(),
  ]);
  if (!emp) notFound();
  const em = emp as Empresa;
  const r = res as ResultadoCot | null;
  const k = r?.resultado;
  const volta = `/corretora/${c}/cotacao/${e}`;

  // de>para: os planos equivalentes de cada plano atual, nas outras operadoras (os 3 primeiros de cada uma)
  const origens = (k?.grupos ?? []).filter((g) => g.operadora && g.plano);
  const eqs: Equiv[] = [];
  for (const g of origens) {
    const { data } = await db.from('cot_equivalencias').select('*')
      .eq('op_o', g.operadora).eq('plano_o', g.plano).eq('acom_o', g.acomodacao ?? '').lte('ordem', 3)
      .order('op_d').order('ordem');
    eqs.push(...((data ?? []) as Equiv[]));
  }
  const nomeCurto = em.nome_curto || em.razao_social;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cotação · {nomeCurto}</h1>
          <p>{[em.razao_social, em.codigo_interno, em.cnpj ? `CNPJ ${cnpj(em.cnpj)}` : null, k?.municipio, k?.mei ? 'MEI' : null, k?.simples ? 'Simples Nacional' : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="acoes">
          <Link className="btn ghost" href={`/corretora/${c}/cotacao`}>Todas as cotações</Link>
          <Link className="btn ghost" href={`/corretora/${c}/faturamento?emp=${encodeURIComponent(em.codigo_interno ?? '')}`}>Faturamento</Link>
          {admin && (
            <form action={recalcularCotacoes}>
              <input type="hidden" name="corretora_id" value={c} />
              <input type="hidden" name="volta" value={volta} />
              <button className="btn ghost">Recalcular</button>
            </form>
          )}
        </div>
      </div>
      <Aviso sp={sp} />

      {!k ? (
        <section className="card"><p className="empty">Esta empresa ainda não tem cotação calculada.{admin ? ' Clique em Recalcular.' : ''}</p></section>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><span className="kpi-l">Vidas</span><span className="kpi-v">{num(k.vidas)}</span><span className="kpi-s">{plural(k.titulares, 'titular', 'titulares')}</span></div>
            <div className="kpi"><span className="kpi-l">Custo atual</span><span className="kpi-v">{moeda(k.custo_atual)}</span><span className="kpi-s">fatura de {competencia(k.competencia)}{k.copart ? ' · com coparticipação' : ''}</span></div>
            <div className="kpi"><span className="kpi-l">Melhor economia</span><span className="kpi-v">{k.opcoes[0] ? moeda(k.opcoes[0].economia) : '—'}</span><span className="kpi-s">{k.opcoes[0] ? `por mês · ${moeda(k.opcoes[0].economia * 12)} em 12 meses` : 'nenhuma opção mais barata'}</span></div>
            <div className="kpi"><span className="kpi-l">Situação</span><span className="kpi-v" style={{ fontSize: '1rem' }}><span className={`pill ${tomStatus(k.status)}`}>{k.status}</span></span><span className="kpi-s">calculado {quando(k.calculado_em)}{k.situacao_cnpj && k.situacao_cnpj !== 'ATIVA' ? ` · CNPJ ${k.situacao_cnpj.toLowerCase()} na Receita` : ''}</span></div>
          </div>

          <section className="card">
            <div className="card-h"><h2>Cenário atual</h2><span className="hint">vidas da última fatura por faixa etária da ANS</span></div>
            <div className="tbl">
              <table className="cot-fx">
                <thead><tr><th>Plano hoje</th>{FAIXAS.map((f) => <th key={f} className="num">{f}</th>)}<th className="num">Vidas</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {k.grupos.map((g, i) => (
                    <tr key={i}>
                      <td>{g.plano ? `${operadora(g.operadora)} ${g.plano}` : 'Plano sem equivalente na tabela'}{g.acomodacao ? ` · ${g.acomodacao}` : ''}<small>{g.seguradora}</small></td>
                      {g.faixas.map((n, j) => <td key={j} className="num">{n || ''}</td>)}
                      <td className="num">{num(somaFx(g.faixas))}</td>
                      <td className="num">{moeda(g.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {k.opcoes.length > 0 && (
            <section className="card">
              <div className="card-h"><h2>Comparativo</h2><span className="hint">valores com IOF de 2,38%</span></div>
              <div className="tbl">
                <table>
                  <thead><tr><th>Operadora</th><th>Planos</th><th className="num">Mensal</th><th className="num">Economia/mês</th><th className="num">Economia 12 meses</th><th className="num">Rede (hospitais)</th></tr></thead>
                  <tbody>
                    <tr><td>Atual</td><td>{[...new Set(k.grupos.map((g) => g.plano ?? '—'))].join(', ')}</td><td className="num">{moeda(k.custo_atual)}</td><td className="num">—</td><td className="num">—</td><td className="num">—</td></tr>
                    {k.opcoes.map((o) => (
                      <tr key={o.operadora}>
                        <td><a href={`#op-${o.operadora}`}>{operadora(o.operadora)}</a></td>
                        <td>{[...new Set(o.linhas.map((l) => `${l.plano}${l.acomodacao ? ` ${l.acomodacao}` : ''}`))].join(', ')}</td>
                        <td className="num">{moeda(o.total_iof)}</td>
                        <td className="num"><strong>{moeda(o.economia)}</strong><small>{Math.round((o.economia / k.custo_atual) * 100)}%</small></td>
                        <td className="num">{moeda(o.economia * 12)}</td>
                        <td className="num">{pctCob(o.cobertura)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {k.opcoes.map((o) => (
            <section key={o.operadora} id={`op-${o.operadora}`} className="card cot-op">
              <div className="card-h"><h2>{operadora(o.operadora)}<small>{pctCob(o.cobertura)} dos hospitais de hoje</small></h2><span className="hint">{moeda(o.total_iof)} por mês com IOF</span></div>
              {o.linhas.map((l, i) => (
                <div key={i} style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 .4rem' }}><strong>{l.plano}{l.acomodacao ? ` · ${l.acomodacao}` : ''}</strong> no lugar de {l.origem.plano}{l.origem.acomodacao ? ` ${l.origem.acomodacao}` : ''} <small className="hint">· tabela {l.tabela.titulo} ({l.tabela.condicoes})</small></p>
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
            </section>
          ))}

          {eqs.length > 0 && (
            <section className="card">
              <div className="card-h"><h2>De&gt;para</h2><span className="hint">planos mais parecidos pela rede de hospitais, os 3 primeiros de cada operadora; o 1º é o usado na cotação quando a tabela permite</span></div>
              <div className="tbl">
                <table>
                  <thead><tr><th>Plano hoje</th><th>Operadora</th><th>Plano equivalente</th><th className="num">Hospitais de hoje</th><th className="num">Preço médio por vida</th></tr></thead>
                  <tbody>
                    {eqs.filter((q) => q.cobertura >= 0.5).map((q, i) => (
                      <tr key={i}>
                        <td>{q.plano_o}{q.acom_o ? ` · ${q.acom_o}` : ''}</td>
                        <td>{operadora(q.op_d)}</td>
                        <td>{q.ordem === 1 ? <strong>{q.plano_d}</strong> : q.plano_d}{q.acom_d ? ` · ${q.acom_d}` : ''}</td>
                        <td className="num">{pctCob(Number(q.cobertura))}</td>
                        <td className="num">{moeda(q.preco_ref == null ? null : Number(q.preco_ref))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
