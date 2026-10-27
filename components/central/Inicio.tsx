'use client';
// Início (Visão geral) da Central de Agentes como tela do portal: mesmas contas e a mesma Projeção
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { type Doc, type Item, aberto, addMonth, brl, ckey, fam, famsIn, fatItems, int, kfmt, mesLabel, pct, pdate, sum, uniq, vidas } from '@/lib/central/modelo';
import { type Credito, mergeCom, projAll } from '@/lib/central/projecao.gen';
import { plural } from '@/lib/formato';

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const d2 = (d: Date) => String(d.getUTCDate()).padStart(2, '0') + '/' + MES[d.getUTCMonth()];
const dk = (d: Date) => d.toISOString().slice(0, 10);
const wkStart = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
const ICON: Record<string, React.ReactNode> = {
  projecao: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  faturas: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  vidas: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /></>,
  movimentacoes: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>,
  comissoes: <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />,
  financeiro: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M12 10v8M19 10v8" /></>,
};
const STATUS: Record<string, [string, string]> = { trabalhando: ['Trabalhando', 'p-info'], em_dia: ['Em dia', 'p-ok'], aguardando: ['Aguardando você', 'p-warn'], em_breve: ['Em breve', 'p-idle'], parado: ['Parado', 'p-bad'] };
const sinal = (v: number) => <span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : '−'}{pct(Math.abs(v))}</span>;

export type DadosInicio = { faturas: Doc[]; comissoes: Doc[]; agenciamentos: Doc[]; implantacoes: Doc[]; tarefas: Doc[]; agentes: Doc[] };

export function Inicio({ c, d, hoje, admin }: { c: string; d: DadosInicio; hoje: string; admin: boolean }) {
  const [hday, setHday] = useState<string | null>(null);
  const base = `/corretora/${c}`, pend = `/central/${c}#pendencias`;
  const fichaUrl = (eid: string) => `${base}/faturamento?emp=${encodeURIComponent(eid)}`;
  const [y, m, dd] = hoje.split('-').map(Number), T = new Date(Date.UTC(y, m - 1, dd)), cm = ckey(T);

  const M = useMemo(() => {
    if (!admin) return null;
    const agcfg = Object.fromEntries(d.agenciamentos.map((a) => [a.id, a]));
    return projAll(d.faturas, mergeCom(d.comissoes), { agcfg, imps: d.implantacoes, hoje: new Date(y, m - 1, dd) });
  }, [d, admin, y, m, dd]);

  const fitems = fatItems(d.faturas), comps = uniq(fitems.map((r) => r.comp)).sort(), fm = comps[comps.length - 1], pm = comps[comps.length - 2];
  const fr = fitems.filter((r) => r.comp === fm), prev = fitems.filter((r) => r.comp === pm), ftot = sum(fr, (r) => r.valor);
  // comparação justa: só as empresas que aparecem nos dois meses
  const eNow = new Set(fr.map((r) => r.eid)), ePrev = new Set(prev.map((r) => r.eid));
  const lfN = sum(fr.filter((r) => ePrev.has(r.eid)), (r) => r.valor), lfP = sum(prev.filter((r) => eNow.has(r.eid)), (r) => r.valor), dlt = lfP ? (lfN - lfP) / lfP * 100 : 0;
  const ptt = sum(prev, (r) => r.valor), dtt = ptt ? (ftot - ptt) / ptt * 100 : 0;
  const cnt = (L: Item[]) => { const o: Record<string, number> = {}; L.forEach((r) => { const f = fam(r.operadora); o[f] = (o[f] || 0) + 1; }); return o; }, cN = cnt(fr), cP = cnt(prev);
  const faltF = famsIn(Object.keys(cP)).filter((f) => (cN[f] || 0) < cP[f]), nFalt = sum(faltF, (f) => cP[f] - (cN[f] || 0)), faltTxt = faltF.map((f) => f + ' −' + (cP[f] - (cN[f] || 0))).join(', ');
  const vid = (r: Item) => +(r.ativos || r.vidas) || 0, vN = sum(fr, vid), vdl = sum(fr.filter((r) => ePrev.has(r.eid)), vid) - sum(prev.filter((r) => eNow.has(r.eid)), vid);
  const novas = [...eNow].filter((e) => !ePrev.has(e)).length;
  const C: Credito[] = M ? M.com : [];
  const mCom = C.filter((x) => ckey(x.data) === cm), caiu = sum(mCom.filter((x) => x.tipo === 'real'), (x) => x.valor), falta = sum(mCom.filter((x) => x.tipo !== 'real'), (x) => x.valor);
  const atrC = C.filter((x) => x.atraso && x.tipo !== 'real'), nm = addMonth(cm, 1), pNext = sum(C.filter((x) => ckey(x.data) === nm), (x) => x.valor), vAtr = sum(atrC, (x) => x.valor);
  // débitos que a seguradora descontou nas ordens do mês e estimativas sem histórico deixadas fora da soma
  const debM = sum(mergeCom(d.comissoes).flatMap((x) => x.ordens || []).filter((o: Doc) => String(o.dataISO || '').slice(0, 7) === cm), (o: Doc) => o.debcred);
  const semH = M ? sum(((M.semHist || []) as Credito[]).filter((x) => ckey(x.data) === cm), (x) => x.valor) : 0;
  const need = d.tarefas.filter((t) => t.coluna === 'precisa'), doing = d.tarefas.filter((t) => t.coluna === 'andamento');

  // comissão desta semana, dia a dia (e o total da próxima)
  const mon = wkStart(T);
  const wk = (k: number) => { const a = new Date(mon.getTime() + 7 * k * 864e5), b = new Date(a.getTime() + 7 * 864e5); return { a, fri: new Date(a.getTime() + 4 * 864e5), it: C.filter((x) => x.data >= a && x.data < b) }; };
  const w0 = wk(0), w1 = wk(1);
  const ST = (x: Credito): [string, string] => (x.tipo === 'real' ? ['Caiu', 'p-ok'] : x.atraso ? ['Em atraso', 'p-bad'] : x.tipo === 'prev' ? ['Previsto', 'p-info'] : ['Projetado', 'p-idle']);
  const wd = [0, 1, 2, 3, 4].map((i) => new Date(w0.a.getTime() + i * 864e5)), dv = (x: Date) => w0.it.filter((c_) => dk(c_.data) === dk(x));
  const mxd = Math.max(1, ...wd.map((x) => sum(dv(x), (c_) => c_.valor)));
  const sel = wd.some((x) => dk(x) === hday) ? hday : null;
  const wTot = sum(w0.it, (x) => x.valor), wReal = sum(w0.it.filter((x) => x.tipo === 'real'), (x) => x.valor), wAg = sum(w0.it.filter((x) => x.kind === 'ag'), (x) => x.valor);
  const wOutro = sum(w0.it.filter((x) => x.kind === 'outro'), (x) => x.valor), wNa = w0.it.filter((x) => x.atraso && x.tipo !== 'real').length;
  const Credito_ = ({ x }: { x: Credito }) => {
    const s = ST(x);
    const corpo = <><span style={{ minWidth: 0 }}><b>{x.empresa}</b><small><span className={`ktag ${x.kind}`}>{x.kind === 'ag' ? 'Agenciamento' : x.kind === 'outro' ? x.obs || 'Outro' : 'Vitalício'}</span>{fam(x.op)}</small></span>
      <span className="r">R$ {brl(x.valor)}<small><span className={`pill ${s[1]}`}>{s[0]}</span></small></span></>;
    return <li>{x.eid ? <Link className="linha-a" href={fichaUrl(x.eid)}>{corpo}</Link> : corpo}</li>;
  };

  // vencimentos dos próximos 15 dias
  const lim = new Date(T.getTime() + 15 * 864e5);
  const abAll = fitems.filter(aberto).map((r) => Object.assign({}, r, { d: pdate(r.venc) as Date }) as Item & { d: Date }).filter((r) => !!r.d);
  const ab = abAll.filter((r) => r.d >= T && r.d <= lim).sort((a, b) => +a.d - +b.d), atr = abAll.filter((r) => r.d < T && r.d >= new Date(T.getTime() - 60 * 864e5));
  // movimentações e agentes
  const mv = d.tarefas.filter((t) => t.agente === 'movimentacoes' || t.tipo === 'movimentacao'), ma = mv.filter((t) => t.coluna !== 'concluido'), mc = mv.filter((t) => t.coluna === 'concluido');
  const pendAg: Record<string, number> = {}; d.tarefas.forEach((t) => { if (t.coluna === 'precisa') pendAg[t.agente] = (pendAg[t.agente] || 0) + 1; });
  const agentes = d.agentes.slice().sort((a, b) => (+a.ordem || 99) - (+b.ordem || 99));

  return (
    <div className="page cx">
      <div className="page-head"><div><h1>Visão geral</h1><p>O que importa hoje: os números do mês{admin ? ', a comissão desta semana' : ''}, os boletos vencendo e o que os agentes estão fazendo. <a href={`/central/${c}#inicio`}>Ver na Central antiga</a></p></div></div>
      <div className="kpis">
        <Link className="kpi" href={`${base}/faturamento`}><span className="kpi-l">Carteira · {mesLabel(fm)}</span><span className="kpi-v">{int(eNow.size)} <span className="kpi-un">empresas</span></span>
          <span className="kpi-s">{vidas(vN)}{pm && <> · <span className={vdl >= 0 ? 'up' : 'down'}>{vdl >= 0 ? '+' : '−'}{int(Math.abs(vdl))}</span> vs {mesLabel(pm)}</>}{pm && novas ? ` · ${novas} ${novas > 1 ? 'novas' : 'nova'}` : ''}</span></Link>
        <Link className="kpi" href={`${base}/faturamento`}><span className="kpi-l">Faturado · {mesLabel(fm)}</span><span className="kpi-v">R$ {brl(ftot)}</span>
          <span className="kpi-s">{pm && <>{sinal(dlt)} nas mesmas empresas · {sinal(dtt)} no total, vs {mesLabel(pm)}</>}{nFalt > 0 && <><br /><span className="down">{plural(nFalt, 'fatura', 'faturas')} a menos</span> ({faltTxt})</>}</span></Link>
        {admin && (
          <Link className="kpi" href={`${base}/projecao`} title={['Bruto, pela data do crédito.', debM ? `Líquido R$ ${brl(caiu + debM)}, depois de R$ ${brl(-debM)} de débitos.` : '', semH ? `R$ ${brl(semH)} sem histórico de comissão, fora da soma.` : ''].filter(Boolean).join(' ')}>
            <span className="kpi-l">Comissão que cai no mês · {mesLabel(cm)}</span><span className="kpi-v">R$ {brl(caiu + falta)}</span>
            <span className="kpi-s">R$ {brl(caiu)} já caiu · R$ {brl(falta)} a cair{vAtr ? <>, <b style={{ color: 'var(--bad-fg)' }}>R$ {brl(vAtr)} em atraso</b></> : null}<br />{mesLabel(nm)}: R$ {brl(pNext)}</span>
          </Link>
        )}
        <a className="kpi" href={pend}><span className="kpi-l">Pendências</span><span className="kpi-v">{need.length} <span className="kpi-un">com você</span></span><span className="kpi-s">{doing.length} em andamento com os agentes</span></a>
      </div>

      <div className="grid g32" style={{ alignItems: 'start' }}>
        <div className="coluna">
          {admin && (
            <section className="card">
              <div className="card-h"><h2>Comissão desta semana</h2>{M && <span className="hint">Próxima semana: R$ {brl(sum(w1.it, (x) => x.valor))}</span>}<Link className="lnk" href={`${base}/projecao`}>Abrir projeção</Link></div>
              {M ? <>
                <div className="wk-h"><span className="hint">{d2(w0.a)} a {d2(w0.fri)}</span><span className="r">R$ {brl(wTot)}</span></div>
                <div className="facts" style={{ marginTop: '.45rem' }}>
                  {wReal > 0 && <span><b>R$ {brl(wReal)}</b> já caiu</span>}
                  <span>vitalício <b>R$ {brl(wTot - wAg - wOutro)}</b></span><span>agenciamento <b>R$ {brl(wAg)}</b></span>
                  {wNa > 0 && <span style={{ color: 'var(--bad-fg)' }}><b>{wNa}</b> em atraso</span>}
                </div>
                <div className="dstrip">
                  {wd.map((x) => {
                    const k = dk(x), L = dv(x), v = sum(L, (c_) => c_.valor), na = L.filter((c_) => c_.atraso && c_.tipo !== 'real').length, on = hday === k;
                    return (
                      <button key={k} type="button" className={'dcell' + (on ? ' on' : '') + (+x === +T ? ' today' : '')} aria-pressed={on} onClick={() => setHday(on ? null : k)}
                        aria-label={`${DS[x.getUTCDay()]} ${d2(x)}: R$ ${brl(v)} em ${plural(L.length, 'crédito', 'créditos')}${na ? ', ' + na + ' em atraso' : ''}`}>
                        <span className="dn">{DS[x.getUTCDay()]} {String(x.getUTCDate()).padStart(2, '0')}</span><span className="db"><i style={{ height: `${(v / mxd * 100).toFixed(1)}%` }} /></span>
                        <span className="dv">{v ? kfmt(v) : '—'}</span><span className={'dc' + (na ? ' late' : '')}>{L.length ? L.length + (na ? ' · ' + na + ' atr.' : '') : ' '}</span>
                      </button>
                    );
                  })}
                </div>
                {sel ? (() => {
                  const L = w0.it.filter((x) => dk(x.data) === sel).sort((p, q) => q.valor - p.valor), top = L.slice(0, 5), rest = L.slice(5), dt = new Date(sel + 'T00:00:00Z');
                  return <>
                    <div className="day-h" style={{ marginTop: '.75rem' }}><span>{DS[dt.getUTCDay()]} {d2(dt)}</span><span>R$ {brl(sum(L, (x) => x.valor))} · {L.length}</span></div>
                    {L.length ? <>
                      <ul className="rows">{top.map((x, i) => <Credito_ key={x.empresa + x.op + i} x={x} />)}</ul>
                      {rest.length > 0 && <details className="more"><summary>+ {rest.length} {rest.length > 1 ? 'menores' : 'menor'} · R$ {brl(sum(rest, (x) => x.valor))}</summary><ul className="rows">{rest.map((x, i) => <Credito_ key={x.empresa + x.op + i} x={x} />)}</ul></details>}
                    </> : <p className="empty">Nada previsto neste dia.</p>}
                  </>;
                })() : <p className="hint" style={{ margin: '.6rem 0 0' }}>Clique num dia para ver as empresas.</p>}
              </> : <p className="empty">A projeção aparece depois da primeira rodada do Agente Faturas.</p>}
            </section>
          )}
          <section className="card">
            <div className="card-h"><h2>Agentes</h2><span className="hint">Clique para ver as tarefas de cada um</span></div>
            <div className="agents">
              {agentes.length ? agentes.map((a) => {
                const n = pendAg[a.id] || 0, st = n ? [`Com você (${n})`, 'p-warn'] : STATUS[a.status] || STATUS.em_dia;
                return (
                  <a key={a.id} className="agent" href={pend} title={a.atividade || ''}>
                    <span className="ic"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICON[a.id] || ICON.faturas}</svg></span>
                    {String(a.nome || a.id).replace(/^Agente /, '')}<span className={`pill ${st[1]}`}>{st[0]}</span>
                  </a>
                );
              }) : <p className="empty">Os agentes aparecem aqui assim que a base responder.</p>}
            </div>
            <div className="hmov">
              {mv.length ? (
                <div className="facts"><span><b>{ma.length}</b> {ma.length === 1 ? 'pedido de movimentação aberto' : 'pedidos de movimentação abertos'}</span><span><b>{mc.length}</b> {mc.length === 1 ? 'concluído' : 'concluídos'}</span><Link className="lnk" href={`${base}/pedidos`}>Ver pedidos</Link></div>
              ) : <p className="hint" style={{ margin: 0 }}>Nenhum pedido de movimentação ainda. Para pedir, abra uma empresa em Empresas.</p>}
            </div>
          </section>
        </div>
        <section className="card">
          <div className="card-h"><h2>Próximos vencimentos</h2><span className="hint">Boletos em aberto</span></div>
          <ul className="rows">
            {ab.slice(0, 7).map((r) => {
              const soon = +r.d - +T <= 3 * 864e5;
              return (
                <li key={r.eid + r.comp + r.titulo}><Link className="linha-a lrow" href={fichaUrl(r.eid)}>
                  <span className={'date' + (soon ? ' soon' : '')}>{String(r.d.getUTCDate()).padStart(2, '0')}<br />{MES[r.d.getUTCMonth()]}</span>
                  <span style={{ minWidth: 0 }}><b>{r.empresa}</b><small>{r.operadora}</small></span><span className="r">R$ {brl(r.valor)}</span>
                </Link></li>
              );
            })}
            {ab.length > 7 && <li><span className="hint">Mais {ab.length - 7} até {String(lim.getUTCDate()).padStart(2, '0')}/{MES[lim.getUTCMonth()]}</span></li>}
            {!ab.length && <li><span className="empty">Nenhum boleto vencendo nos próximos 15 dias.</span></li>}
            {atr.length > 0 && (
              <li><Link className="linha-a" href={`${base}/faturamento`}><span><b style={{ color: 'var(--bad-fg)' }}>{plural(atr.length, 'boleto vencido', 'boletos vencidos')} ainda em aberto</b><small>R$ {brl(sum(atr, (r) => r.valor))} · vale confirmar se já foram pagos</small></span><span className="lnk">Ver boletos</span></Link></li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
