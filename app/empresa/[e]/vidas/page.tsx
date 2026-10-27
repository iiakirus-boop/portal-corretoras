import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { competencia, data, idadeVida, moeda, num, seg, valorVida } from '@/lib/formato';
import { FAIXAS, faixaDe } from '@/lib/contas';
import type { Fatura, Vida } from '@/lib/tipos';

type P = { params: Promise<{ e: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function Vidas({ params, searchParams }: P) {
  const { e } = await params;
  const sp = await searchParams;
  const x = await exigirEmpresa(e);
  if (!x.veVidas) redirect(`/empresa/${e}`);
  const db = await cliente();
  const { data: fat } = await db.from('faturas').select('*').eq('empresa_id', e);
  const comps = [...new Set(((fat ?? []) as Fatura[]).map((f) => f.competencia))].sort().reverse();
  const comp = sp.mes && comps.includes(sp.mes) ? sp.mes : comps[0];
  let q = db.from('vidas').select('*').eq('empresa_id', e).eq('competencia', comp ?? '').order('familia').order('titular', { ascending: false });
  if (sp.q) q = q.ilike('nome', `%${sp.q}%`);
  const { data: linhas } = await q;
  const vs = (linhas ?? []) as (Vida & { dependente_num?: number })[];
  const faixas = Array(10).fill(0) as number[];
  for (const v of vs) { const i = idadeVida(v); if (i != null) faixas[faixaDe(i)]++; }
  const max = Math.max(1, ...faixas);
  // Preço por pessoa: no plano mais usado, o prêmio mais comum de cada faixa.
  // Se for igual em todas as faixas, a empresa é de taxa média.
  const moda = (xs: number[]) => { const c = new Map<number, number>(); xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1)); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
  const contaPlano = new Map<string, number>(); vs.forEach((v) => v.plano && contaPlano.set(v.plano, (contaPlano.get(v.plano) ?? 0) + 1));
  const planoPrincipal = [...contaPlano].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const precoFaixa = FAIXAS.map((_, f) => moda(vs.filter((v) => v.plano === planoPrincipal && v.premio_base && idadeVida(v) != null && faixaDe(idadeVida(v)!) === f).map((v) => Math.round(v.premio_base! * 100) / 100)));
  const precos = precoFaixa.filter((x): x is number => x != null);
  const taxaMedia = precos.length > 1 && Math.max(...precos) - Math.min(...precos) < 1 ? precos[0] : null;
  const titulares = vs.filter((v) => v.titular).length;
  const novas = vs.filter((v) => v.movimento && v.movimento !== '-');

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Vidas</h1><p>Quem está no plano, conforme a fatura de {competencia(comp ?? null)}. Para incluir ou tirar alguém, faça um pedido.</p></div>
        <nav className="acoes" aria-label="Mês">
          {comps.slice(0, 4).map((m) => <Link key={m} href={`?mes=${m}`} className={`btn sm${m === comp ? '' : ' ghost'}`}>{competencia(m)}</Link>)}
        </nav>
      </div>
      {!comp ? <p className="empty">Ainda não há vidas registradas. Elas aparecem quando a primeira fatura é lida.</p> : (
        <>
          <div className="kpis">
            <div className="kpi"><span className="kpi-l">Pessoas no plano</span><span className="kpi-v">{num(vs.length)}</span></div>
            <div className="kpi"><span className="kpi-l">Titulares</span><span className="kpi-v">{num(titulares)}</span></div>
            <div className="kpi"><span className="kpi-l">Dependentes</span><span className="kpi-v">{num(vs.length - titulares)}</span></div>
            <div className="kpi"><span className="kpi-l">Movimentações no mês</span><span className="kpi-v">{num(novas.length)}</span><span className="kpi-s">inclusões e exclusões na fatura</span></div>
          </div>
          <section className="card">
            <div className="card-h"><h2>Pessoas por faixa de idade</h2><span className="hint">faixas usadas pela ANS no reajuste</span></div>
            <div className="faixas" role="img" aria-label={FAIXAS.map((f, i) => `${f} anos: ${faixas[i]}`).join('; ')}>
              {faixas.map((n, i) => <div key={i} style={{ height: `${(n / max) * 100}%` }}><span>{n || ''}</span></div>)}
            </div>
            <div className="faixas-l">{FAIXAS.map((f) => <span key={f}>{f}</span>)}</div>
            {precos.length > 0 && (taxaMedia != null ? (
              <p className="hint" style={{ marginTop: '.8rem' }}>Taxa média: <b>{moeda(taxaMedia)}</b> por pessoa em todas as idades{contaPlano.size > 1 ? ` (plano ${planoPrincipal})` : ''}.</p>
            ) : (
              <>
                <div className="faixas-l faixas-v" aria-label="Valor por pessoa em cada faixa">{precoFaixa.map((x, i) => <span key={i}>{x != null ? moeda(x).replace('R$', '').trim() : '—'}</span>)}</div>
                <p className="hint" style={{ marginTop: '.4rem' }}>Valor por pessoa em cada faixa (R$){contaPlano.size > 1 ? `, no plano ${planoPrincipal}` : ''}.</p>
              </>
            ))}
          </section>
          <section className="card">
            <div className="card-h">
              <h2>Lista</h2>
              <form className="acoes" role="search">
                <input type="hidden" name="mes" value={comp} />
                <input className="busca" type="search" enterKeyHint="search" name="q" defaultValue={sp.q} placeholder="Buscar pelo nome" aria-label="Buscar pessoa" style={{ width: 220 }} />
                <button className="btn ghost sm">Buscar</button>
              </form>
            </div>
            <div className="tbl scroll">
              <table>
                <thead><tr><th>Nome</th><th>Parentesco</th><th className="num">Idade</th><th>Plano</th><th>Seguradora</th><th>Movimento</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {vs.map((v) => (
                    <tr key={v.id}>
                      <td style={v.titular ? { fontWeight: 700 } : { paddingLeft: '1.6rem' }}>{v.nome}<small>nasc. {data(v.nascimento)}</small></td>
                      <td>{v.parentesco ?? '—'}</td><td className="num">{idadeVida(v) ?? '—'}</td><td>{v.plano ?? '—'}</td><td>{seg(v.seguradora_id)}</td>
                      <td>{v.movimento && v.movimento !== '-' ? v.movimento : '—'}</td><td className="num">{moeda(valorVida(v))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
