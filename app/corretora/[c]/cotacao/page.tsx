import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { competencia, moeda, num, plural, quando } from '@/lib/formato';
import { operadora, tomStatus, type ResultadoCot } from '@/lib/cotacao';
import { Aviso } from '@/components/Aviso';
import type { Empresa } from '@/lib/tipos';
import { recalcularCotacoes } from './acoes';

export const dynamic = 'force-dynamic';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };

const FILTROS: [string, string][] = [['opcoes', 'Com opção mais barata'], ['sem', 'Sem opção mais barata'], ['conferir', 'Para conferir'], ['todas', 'Todas']];

// Cotação automática de todas as empresas com menos de 100 vidas: planos equivalentes (de>para pela rede de hospitais)
// nas outras operadoras, pela tabela de venda em que a empresa se encaixa. A conta é feita no banco (cot_cotar).
export default async function CotacaoLista({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  const [{ data: emps }, { data: res }] = await Promise.all([
    db.from('empresas').select('*').eq('corretora_id', c),
    db.from('cot_resultados').select('*').eq('corretora_id', c),
  ]);
  const es = new Map(((emps ?? []) as Empresa[]).map((e) => [e.id, e]));
  // vindo do Faturamento: ?cod=C021 abre a cotação daquela empresa
  if (sp.cod) {
    const e = [...es.values()].find((x) => x.codigo_interno === sp.cod);
    if (e) redirect(`/corretora/${c}/cotacao/${e.id}`);
  }
  const todos = ((res ?? []) as ResultadoCot[]).filter((r) => r.status !== 'sem vidas de saúde' && r.status !== '100 vidas ou mais');
  const f = sp.f ?? 'opcoes';
  const q = (sp.q ?? '').trim().toUpperCase();
  const grupo = (r: ResultadoCot) => (r.status === 'com opções' ? 'opcoes' : r.status.startsWith('sem opção') ? 'sem' : 'conferir');
  const nome = (id: string) => es.get(id)?.nome_curto || es.get(id)?.razao_social || '—';
  const L = todos
    .filter((r) => f === 'todas' || grupo(r) === f)
    .filter((r) => !q || nome(r.empresa_id).toUpperCase().includes(q) || (es.get(r.empresa_id)?.razao_social ?? '').toUpperCase().includes(q) || es.get(r.empresa_id)?.codigo_interno === q)
    .sort((a, b) => (b.melhor_economia ?? -1) - (a.melhor_economia ?? -1) || nome(a.empresa_id).localeCompare(nome(b.empresa_id)));
  const com = todos.filter((r) => grupo(r) === 'opcoes');
  const econ = com.reduce((s, r) => s + Number(r.melhor_economia ?? 0), 0);
  const ultima = todos.map((r) => r.calculado_em).sort().pop();
  const conta = (k: string) => (k === 'todas' ? todos.length : todos.filter((r) => grupo(r) === k).length);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cotação</h1>
          <p>Empresas com menos de 100 vidas cotadas nos planos equivalentes das outras operadoras, pela distribuição de vidas da última fatura. Só entram as operadoras com pelo menos 70% dos hospitais do plano atual e preço menor que o de hoje (com IOF), até 3 por empresa.</p>
        </div>
        {admin && (
          <form action={recalcularCotacoes} className="acoes">
            <input type="hidden" name="corretora_id" value={c} />
            <button className="btn ghost">Recalcular</button>
          </form>
        )}
      </div>
      <Aviso sp={sp} />
      {todos.length === 0 ? (
        <section className="card"><p className="empty">Ainda não há cotação calculada para esta corretora.{admin ? ' Clique em Recalcular para gerar.' : ''}</p></section>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><span className="kpi-l">Empresas cotadas</span><span className="kpi-v">{num(todos.length)}</span><span className="kpi-s">{ultima ? `calculado ${quando(ultima)}` : ''}</span></div>
            <div className="kpi"><span className="kpi-l">Com opção mais barata</span><span className="kpi-v">{num(com.length)}</span><span className="kpi-s">rede equivalente e preço menor</span></div>
            <div className="kpi"><span className="kpi-l">Economia somada</span><span className="kpi-v">{moeda(econ)}</span><span className="kpi-s">por mês, na melhor opção de cada uma</span></div>
            <div className="kpi"><span className="kpi-l">Para conferir</span><span className="kpi-v">{num(conta('conferir'))}</span><span className="kpi-s">plano sem equivalente, sem valor ou fatura antiga</span></div>
          </div>
          <section className="card">
            <div className="card-h" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
              <div className="chips" role="group" aria-label="Filtrar">
                {FILTROS.map(([k, r]) => (
                  <Link key={k} href={`?f=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`} className={`chip${f === k ? ' on' : ''}`} aria-current={f === k ? 'true' : undefined}>{r} ({conta(k)})</Link>
                ))}
              </div>
              <form role="search" className="acoes">
                <input type="hidden" name="f" value={f} />
                <input className="busca" type="search" name="q" defaultValue={sp.q} placeholder="Buscar empresa" aria-label="Buscar empresa" style={{ width: 220 }} />
              </form>
            </div>
            <div className="tbl">
              <table>
                <thead><tr><th>Empresa</th><th className="num">Vidas</th><th className="num">Custo atual</th><th>Melhor opção</th><th className="num">Economia/mês</th><th>Situação</th></tr></thead>
                <tbody>
                  {L.length === 0 && <tr><td colSpan={6} className="empty">Nenhuma empresa neste filtro.</td></tr>}
                  {L.map((r) => {
                    const o = r.resultado.opcoes?.[0];
                    const e = es.get(r.empresa_id);
                    return (
                      <tr key={r.empresa_id}>
                        <td><Link href={`/corretora/${c}/cotacao/${r.empresa_id}`}>{nome(r.empresa_id)}</Link><small>{[e?.codigo_interno, r.resultado.grupos?.map((g) => g.seguradora).filter((x, i, a) => a.indexOf(x) === i).join(', '), r.resultado.competencia ? competencia(r.resultado.competencia) : null].filter(Boolean).join(' · ')}</small></td>
                        <td className="num">{num(r.vidas)}</td>
                        <td className="num">{moeda(r.custo_atual)}</td>
                        <td>{o ? <>{operadora(o.operadora)}<small>{[...new Set(o.linhas.map((l) => l.plano))].join(', ')} · {moeda(o.total_iof)}</small></> : '—'}</td>
                        <td className="num">{o ? <strong>{moeda(o.economia)}</strong> : '—'}{o && r.custo_atual ? <small>{Math.round((o.economia / r.custo_atual) * 100)}%</small> : null}</td>
                        <td><span className={`pill ${tomStatus(r.status)}`}>{r.status}</span>{r.resultado.opcoes?.length > 1 && <small>{plural(r.resultado.opcoes.length, 'opção', 'opções')}</small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
