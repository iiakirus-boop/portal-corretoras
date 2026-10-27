import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { competencia, data, moeda, num, plural, seg } from '@/lib/formato';
import { somarPor } from '@/lib/contas';
import type { Empresa, LancamentoComissao, PagamentoComissao } from '@/lib/tipos';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };
const CLASSE: Record<string, string> = { vitalicio: 'Vitalício', agenciamento: 'Agenciamento', bonus: 'Bônus', estorno: 'Estorno', outros: 'Outros' };

export default async function Comissoes({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  const { admin } = await exigirCorretora(c);
  if (!admin) redirect(`/corretora/${c}`);
  const db = await cliente();
  const [{ data: pags }, { data: lans }, { data: empresas }] = await Promise.all([
    db.from('comissao_pagamentos').select('*').eq('corretora_id', c).order('data_pagamento', { ascending: false }),
    db.from('comissao_lancamentos').select('*').eq('corretora_id', c),
    db.from('empresas').select('*').eq('corretora_id', c),
  ]);
  const todos = (pags ?? []) as PagamentoComissao[];
  const comps = [...new Set(todos.map((p) => p.competencia))].sort().reverse();
  const comp = sp.mes && comps.includes(sp.mes) ? sp.mes : comps[0];
  const ps = todos.filter((p) => p.competencia === comp);
  const ids = new Set(ps.map((p) => p.id));
  const ls = ((lans ?? []) as LancamentoComissao[]).filter((l) => ids.has(l.pagamento_id));
  const es = (empresas ?? []) as Empresa[];
  const nomeE = (id: string | null) => { const e = es.find((x) => x.id === id); return e?.nome_curto ?? e?.razao_social ?? 'Sem empresa'; };
  const total = ps.reduce((t, p) => t + (p.a_pagar ?? 0), 0);
  const porSeg = [...somarPor(ps, (p) => p.seguradora_id, (p) => p.a_pagar ?? 0)].sort((a, b) => b[1] - a[1]);
  const maxSeg = Math.max(1, ...porSeg.map(([, v]) => v));
  const porClasse = somarPor(ls, (l) => l.classe, (l) => l.comissao ?? 0);
  const porEmp = [...somarPor(ls, (l) => l.empresa_id ?? '', (l) => l.comissao ?? 0)].sort((a, b) => b[1] - a[1]);
  const historico = comps.slice(0, 6).reverse().map((m) => [m, todos.filter((p) => p.competencia === m).reduce((t, p) => t + (p.a_pagar ?? 0), 0)] as const);
  const maxH = Math.max(1, ...historico.map(([, v]) => v));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Comissões</h1><p>Extratos lidos pelos robôs e conferidos com o faturamento. Só administradores da corretora veem esta página.</p></div>
        <nav className="acoes" aria-label="Mês">
          {comps.slice(0, 6).map((m) => <Link key={m} href={`?mes=${m}`} className={`btn sm${m === comp ? '' : ' ghost'}`}>{competencia(m)}</Link>)}
        </nav>
      </div>
      {!comp ? <p className="empty">Nenhum extrato de comissão gravado ainda.</p> : (
        <>
          <div className="kpis">
            <div className="kpi"><span className="kpi-l">A receber em {competencia(comp)}</span><span className="kpi-v">{moeda(total)}</span><span className="kpi-s">{plural(ps.length, 'pagamento', 'pagamentos')} das seguradoras</span></div>
            <div className="kpi"><span className="kpi-l">Vitalício</span><span className="kpi-v">{moeda(porClasse.get('vitalicio') ?? 0)}</span></div>
            <div className="kpi"><span className="kpi-l">Agenciamento</span><span className="kpi-v">{moeda(porClasse.get('agenciamento') ?? 0)}</span><span className="kpi-s">taxa acima de 50%</span></div>
            <div className="kpi"><span className="kpi-l">Empresas pagando</span><span className="kpi-v">{num(porEmp.length)}</span></div>
          </div>
          <div className="grid g2">
            <section className="card">
              <div className="card-h"><h2>Por seguradora</h2></div>
              <div className="hbars">
                {porSeg.map(([s, v]) => (
                  <div className="hbar" key={s}><span className="nm">{seg(s)}</span><span className="tr"><span style={{ width: `${(v / maxSeg) * 100}%` }} /></span><span className="v">{moeda(v)}</span></div>
                ))}
              </div>
            </section>
            <section className="card">
              <div className="card-h"><h2>Últimos meses</h2></div>
              <div className="hbars">
                {historico.map(([m, v]) => (
                  <div className="hbar" key={m}><span className="nm">{competencia(m)}</span><span className="tr"><span style={{ width: `${(v / maxH) * 100}%`, background: m === comp ? 'var(--accent)' : 'var(--faint)' }} /></span><span className="v">{moeda(v)}</span></div>
                ))}
              </div>
            </section>
          </div>
          <div className="grid g2">
            <section className="card">
              <div className="card-h"><h2>Pagamentos</h2></div>
              <ul className="rows">
                {ps.map((p) => (
                  <li key={p.id}><div><b>{seg(p.seguradora_id)}, ordem {p.ordem}</b><small>pago em {data(p.data_pagamento)}</small></div><span className="r">{moeda(p.a_pagar)}</span></li>
                ))}
              </ul>
            </section>
            <section className="card">
              <div className="card-h"><h2>Por empresa</h2></div>
              <div className="tbl">
                <table style={{ minWidth: 0 }}>
                  <thead><tr><th>Empresa</th><th>Tipo</th><th className="num">Taxa</th><th className="num">Comissão</th></tr></thead>
                  <tbody>
                    {ls.sort((a, b) => (b.comissao ?? 0) - (a.comissao ?? 0)).map((l) => (
                      <tr key={l.id}><td>{nomeE(l.empresa_id)}<small>fatura {l.numero_fatura}</small></td><td>{CLASSE[l.classe]}</td><td className="num">{num(l.taxa)}%</td><td className="num">{moeda(l.comissao)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
