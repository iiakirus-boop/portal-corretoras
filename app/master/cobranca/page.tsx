import Link from 'next/link';
import { cliente } from '@/lib/servidor';
import { competencia, moeda, num, plural } from '@/lib/formato';
import { mensalidade, vidasCarteiraPor, type Contrato, type FaturaUltima } from '@/lib/contas';
import { Pill } from '@/components/Pill';
import type { Corretora } from '@/lib/tipos';

type Fechamento = { id: string; corretora_id: string; competencia: string; vidas_ativas: number; valor: number; status: string };

export default async function Cobranca() {
  const db = await cliente();
  const [{ data: corretoras }, { data: faturas }, { data: fech }] = await Promise.all([
    db.from('corretoras').select('*').order('nome'),
    db.from('faturas_ultimas').select('*'),
    db.from('cobranca_fechamentos').select('*').order('competencia', { ascending: false }),
  ]);
  const cs = (corretoras ?? []) as Corretora[];
  const vidas = vidasCarteiraPor((faturas ?? []) as FaturaUltima[]);
  const linhas = cs.map((c) => {
    const ct = (c.contrato ?? {}) as Contrato;
    const v = vidas.get(c.id) ?? 0;
    return { c, ct, v, p: mensalidade(v, ct) };
  });
  const total = linhas.reduce((t, l) => t + (l.p?.valor ?? 0), 0);
  const fs = (fech ?? []) as Fechamento[];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cobrança</h1>
          <p>A mensalidade de cada corretora sai das vidas ativas na carteira dela: preço por vida da faixa em que o total cai, respeitando o mínimo combinado.</p>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Previsão deste mês</span><span className="kpi-v">{moeda(total)}</span><span className="kpi-s">{plural(linhas.filter((l) => l.p).length, 'corretora', 'corretoras')} com preço combinado</span></div>
        <div className="kpi"><span className="kpi-l">Vidas cobráveis</span><span className="kpi-v">{num(linhas.filter((l) => l.p).reduce((t, l) => t + l.v, 0))}</span></div>
      </div>
      <div className="tbl">
        <table>
          <thead><tr><th>Corretora</th><th className="num">Vidas ativas</th><th>Contrato</th><th className="num">Por vida</th><th className="num">Mensalidade</th></tr></thead>
          <tbody>
            {linhas.map(({ c, ct, v, p }) => (
              <tr key={c.id}>
                <td><Link href={`/master/corretoras/${c.id}`}>{c.nome}</Link></td>
                <td className="num">{num(v)}</td>
                <td>
                  {ct.faixas?.length
                    ? <>{ct.faixas.map((f) => `${f.ate ? `até ${num(f.ate)}` : 'acima'}: ${moeda(f.valor)}`).join('; ')}<small>mínimo {moeda(ct.minimo ?? 0)}{ct.implantacao ? `, implantação ${moeda(ct.implantacao)}` : ''}{ct.piloto ? `, piloto ${ct.piloto}` : ''}</small></>
                    : <span className="hint">{ct.observacao ?? 'sem preço combinado'}</span>}
                </td>
                <td className="num">{p ? moeda(p.porVida) : '—'}</td>
                <td className="num">{p ? <>{moeda(p.valor)}{p.minimoAplicado && <small>valor mínimo</small>}</> : '—'}</td>
              </tr>
            ))}
            <tr className="tot"><td>Total</td><td className="num">{num(linhas.reduce((t, l) => t + l.v, 0))}</td><td /><td /><td className="num">{moeda(total)}</td></tr>
          </tbody>
        </table>
      </div>
      <section className="card">
        <div className="card-h"><h2>Fechamentos</h2><span className="hint">o fechamento do mês é gravado pela máquina de operação</span></div>
        {fs.length === 0 ? <p className="empty">Nenhum mês fechado ainda.</p> : (
          <ul className="rows">
            {fs.map((f) => (
              <li key={f.id}><div><b>{cs.find((c) => c.id === f.corretora_id)?.nome} {competencia(f.competencia)}</b><small>{num(f.vidas_ativas)} vidas</small></div>
                <span className="r">{moeda(f.valor)} <Pill tom={f.status === 'pago' ? 'ok' : f.status === 'faturado' ? 'info' : 'warn'}>{f.status}</Pill></span></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
