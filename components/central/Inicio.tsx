'use client';
// Início (Visão geral) da Central de Agentes como tela do portal: mesmas contas e a mesma Projeção
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { type Doc, addMonth, brl, ckey, fam, fatItems, int, kfmt, mesLabel, pct, sum, uniq, vidas } from '@/lib/central/modelo';
import { type Credito, mergeCom, projAll } from '@/lib/central/projecao.gen';
import { plural, STATUS_PEDIDO, TIPO_PEDIDO } from '@/lib/formato';
import type { StatusPedido, TipoPedido } from '@/lib/tipos';

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const d2 = (d: Date) => String(d.getUTCDate()).padStart(2, '0') + '/' + MES[d.getUTCMonth()];
const dk = (d: Date) => d.toISOString().slice(0, 10);
const wkStart = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
const sinal = (v: number) => <span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : '−'}{pct(Math.abs(v))}</span>;

export type DadosInicio = { faturas: Doc[]; comissoes: Doc[]; agenciamentos: Doc[]; implantacoes: Doc[]; tarefas: Doc[] };
export type MovInicio = { id: string; tipo: TipoPedido; status: StatusPedido; protocolo: string; empresa: string; pessoa: string; carteirinha: string; prazo: string | null; noticia: string; em: string };
export type FaltaInicio = { eid: string; empresa: string; seguradora: string; vidas: number };
type Carteira = { vidas: number; empresas: number; contratos: number; novo: string };

export function Inicio({ c, d, hoje, admin, carteira, faltam, movs }: { c: string; d: DadosInicio; hoje: string; admin: boolean; carteira: Carteira; faltam: FaltaInicio[]; movs: MovInicio[] }) {
  const [hday, setHday] = useState<string | null>(null);
  const base = `/corretora/${c}`, pend = `/corretora/${c}/pendencias`;
  const fichaUrl = (eid: string) => `${base}/faturamento?emp=${encodeURIComponent(eid)}`;
  const [y, m, dd] = hoje.split('-').map(Number), T = new Date(Date.UTC(y, m - 1, dd)), cm = ckey(T);

  const M = useMemo(() => {
    if (!admin) return null;
    const agcfg = Object.fromEntries(d.agenciamentos.map((a) => [a.id, a]));
    return projAll(d.faturas, mergeCom(d.comissoes), { agcfg, imps: d.implantacoes, hoje: new Date(y, m - 1, dd) });
  }, [d, admin, y, m, dd]);

  const fitems = fatItems(d.faturas), comps = uniq(fitems.map((r) => r.comp)).sort(), fm = comps[comps.length - 1], pm = comps[comps.length - 2];
  const fr = fitems.filter((r) => r.comp === fm), prev = fitems.filter((r) => r.comp === pm), ftot = sum(fr, (r) => r.valor);
  const ptt = sum(prev, (r) => r.valor), dtt = ptt ? (ftot - ptt) / ptt * 100 : 0;
  const empF = sum(faltam.filter((x, i) => faltam.findIndex((y) => y.eid === x.eid) === i), () => 1);
  const C: Credito[] = M ? M.com : [];
  const mCom = C.filter((x) => ckey(x.data) === cm), caiu = sum(mCom.filter((x) => x.tipo === 'real'), (x) => x.valor), falta = sum(mCom.filter((x) => x.tipo !== 'real'), (x) => x.valor);
  const atrC = C.filter((x) => x.atraso && x.tipo !== 'real'), nm = addMonth(cm, 1), pNext = sum(C.filter((x) => ckey(x.data) === nm), (x) => x.valor), vAtr = sum(atrC, (x) => x.valor);
  // débitos que a seguradora descontou nas ordens do mês e estimativas sem histórico deixadas fora da soma
  const debM = sum(mergeCom(d.comissoes).flatMap((x) => x.ordens || []).filter((o: Doc) => String(o.dataISO || '').slice(0, 7) === cm), (o: Doc) => o.debcred);
  const semH = M ? sum(((M.semHist || []) as Credito[]).filter((x) => ckey(x.data) === cm), (x) => x.valor) : 0;
  const need = d.tarefas.filter((t) => t.coluna === 'precisa');

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

  const movAbertas = movs.filter((x) => x.status !== 'concluido'), movProntas = movs.filter((x) => x.status === 'concluido');
  const tomC: Record<string, string> = { warn: 'p-warn', info: 'p-info', ok: 'p-ok', idle: 'p-idle', bad: 'p-bad' };
  const Mov = ({ x }: { x: MovInicio }) => {
    const st = STATUS_PEDIDO[x.status];
    return <li><Link className="linha-a" href={`${base}/pedidos/${x.id}`}>
      <span style={{ minWidth: 0 }}><b>{TIPO_PEDIDO[x.tipo]} · {x.empresa}</b>
        <small>{[x.pessoa, x.carteirinha ? `carteirinha ${x.carteirinha}` : '', x.protocolo].filter(Boolean).join(' · ')}</small>
        {x.noticia && <small>“{x.noticia.length > 110 ? x.noticia.slice(0, 110) + '…' : x.noticia}”</small>}</span>
      <span className="r"><span className={`pill ${tomC[st?.tom ?? 'idle']}`}>{st?.rotulo ?? x.status}</span></span>
    </Link></li>;
  };
  const novoL = carteira.novo ? mesLabel(carteira.novo) : mesLabel(fm);

  return (
    <div className="page cx">
      <div className="page-head"><div><h1>Início</h1><p>Os totais do mês, as movimentações em andamento e as empresas que ainda não tiveram a fatura de {novoL} gerada.{need.length > 0 && <> <Link href={pend}><b>{plural(need.length, 'pendência', 'pendências')} com você</b></Link>.</>} <a href={`/central/${c}#inicio`}>Ver na Central antiga</a></p></div></div>
      <div className="kpis">
        <Link className="kpi" href={`${base}/faturamento`}><span className="kpi-l">Faturamento · {mesLabel(fm)}</span><span className="kpi-v">R$ {brl(ftot)}</span>
          <span className="kpi-s">{plural(new Set(fr.map((r) => r.eid)).size, 'empresa', 'empresas')} até agora{pm && <><br />{mesLabel(pm)} fechou em R$ {brl(ptt)}{faltam.length === 0 && <> · {sinal(dtt)}</>}</>}</span></Link>
        {admin && (
          <Link className="kpi" href={`${base}/comissoes`} title={['Bruto, pela data do crédito.', debM ? `Líquido R$ ${brl(caiu + debM)}, depois de R$ ${brl(-debM)} de débitos.` : '', semH ? `R$ ${brl(semH)} sem histórico de comissão, fora da soma.` : ''].filter(Boolean).join(' ')}>
            <span className="kpi-l">Comissão · {mesLabel(cm)}</span><span className="kpi-v">R$ {brl(caiu + falta)}</span>
            <span className="kpi-s">R$ {brl(caiu)} já caiu · R$ {brl(falta)} a cair{vAtr ? <>, <b style={{ color: 'var(--bad-fg)' }}>R$ {brl(vAtr)} em atraso</b></> : null}<br />{mesLabel(nm)}: R$ {brl(pNext)}</span>
          </Link>
        )}
        <Link className="kpi" href={`${base}/empresas`}><span className="kpi-l">Carteira</span><span className="kpi-v">{int(carteira.vidas)} <span className="kpi-un">vidas</span></span>
          <span className="kpi-s">{plural(carteira.empresas, 'empresa', 'empresas')} · {plural(carteira.contratos, 'contrato', 'contratos')}<br />último mês fechado, mais entradas e saídas</span></Link>
        <a className="kpi" href="#faltam"><span className="kpi-l">Falta gerar faturamento · {novoL}</span><span className="kpi-v">{int(empF)} <span className="kpi-un">{empF === 1 ? 'empresa' : 'empresas'}</span></span>
          <span className="kpi-s">{faltam.length ? <>{plural(faltam.length, 'contrato', 'contratos')} · {vidas(sum(faltam, (x) => x.vidas))}</> : 'Todas as faturas do mês já saíram'}</span></a>
        <Link className="kpi" href={`${base}/pedidos`}><span className="kpi-l">Movimentações</span><span className="kpi-v">{int(movAbertas.length)} <span className="kpi-un">em andamento</span></span>
          <span className="kpi-s">{plural(movProntas.length, 'concluída', 'concluídas')} nos últimos 15 dias</span></Link>
      </div>

      <div className="grid g32" style={{ alignItems: 'start' }}>
        <div className="coluna">
          <section className="card">
            <div className="card-h"><h2>Movimentações</h2><span className="hint">Em andamento e concluídas nos últimos 15 dias</span><Link className="lnk" href={`${base}/pedidos`}>Ver pedidos</Link></div>
            {movs.length ? <>
              {movAbertas.length > 0 && <ul className="rows">{movAbertas.slice(0, 8).map((x) => <Mov key={x.id} x={x} />)}</ul>}
              {movAbertas.length > 8 && <p className="hint">Mais {movAbertas.length - 8} em andamento em Pedidos.</p>}
              {movProntas.length > 0 && <details className="more" open={movAbertas.length === 0}><summary>{plural(movProntas.length, 'concluída', 'concluídas')} nos últimos 15 dias</summary><ul className="rows">{movProntas.map((x) => <Mov key={x.id} x={x} />)}</ul></details>}
            </> : <p className="empty">Nenhuma movimentação em andamento. Quando uma empresa pedir inclusão, exclusão ou troca de plano, ela aparece aqui até a carteirinha sair.</p>}
          </section>
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
        </div>
        <section className="card" id="faltam">
          <div className="card-h"><h2>Falta gerar faturamento</h2><span className="hint">Sem fatura de {novoL} ainda</span></div>
          {faltam.length ? <ul className="rows">
            {faltam.map((x) => (
              <li key={x.eid + x.seguradora}><Link className="linha-a" href={fichaUrl(x.eid)}>
                <span style={{ minWidth: 0 }}><b>{x.empresa}</b><small>{x.seguradora}</small></span><span className="r">{vidas(x.vidas)}</span>
              </Link></li>
            ))}
          </ul> : <p className="empty">Todas as empresas já têm a fatura de {novoL}.</p>}
        </section>
      </div>
    </div>
  );
}
