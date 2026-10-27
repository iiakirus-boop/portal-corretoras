'use client';
// Projeção da Central de Agentes como tela do portal: a mesma conta (projecao.gen.js, gerado do central.html)
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type Doc, FCOL, addMonth, brl, ckey, fam, famsIn, fatItems, kfmt, mesLabel, pct, sum, today, uniq } from '@/lib/central/modelo';
import { type Credito, mergeCom, projAll } from '@/lib/central/projecao.gen';
import { plural } from '@/lib/formato';
import { Barras } from './Barras';
import { gravar, registrar } from './gravar';

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESF = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const wkStart = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
const d2 = (d: Date) => String(d.getUTCDate()).padStart(2, '0') + '/' + MES[d.getUTCMonth()];
const ord = (n: number) => n + 'ª';
const OPS = ['Porto Saúde', 'Bradesco Saúde', 'Bradesco Dental', 'Amil', 'Amil Dental', 'Hapvida', 'SulAmérica', 'Santa Helena'];

export type DadosProjecao = { faturas: Doc[]; comissoes: Doc[]; agenciamentos: Doc[]; implantacoes: Doc[]; projecoes: Doc[] };

export function Projecao({ c, d, hoje, usuario }: { c: string; d: DadosProjecao; hoje: string; usuario: string }) {
  const router = useRouter();
  const [op, setOp] = useState('todas');
  const [pv, setPv] = useState<'com' | 'emp'>('com');
  const [pmk, setPmk] = useState<string | null>(null);
  const [pwk, setPwk] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [imp, setImp] = useState<Doc | 'nova' | null>(null);
  const fichaUrl = (eid: string) => `/corretora/${c}/faturamento?emp=${encodeURIComponent(eid)}`;
  const avisar = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 5200); };

  const { M, comissoes } = useMemo(() => {
    const f = (x: Doc) => op === 'todas' || fam(x.operadora) === op;
    const comissoes = mergeCom(d.comissoes.filter(f));
    const agcfg = Object.fromEntries(d.agenciamentos.map((a) => [a.id, a]));
    const [y, m, dd] = hoje.split('-').map(Number);
    return { M: projAll(d.faturas.filter(f), comissoes, { agcfg, imps: d.implantacoes.filter(f), hoje: new Date(y, m - 1, dd) }), comissoes };
  }, [d, op, hoje]);
  const ops = famsIn(uniq([...d.faturas, ...d.comissoes].map((x) => fam(x.operadora))));
  const empName = useMemo(() => { const o: Record<string, string> = {}; fatItems(d.faturas).forEach((r) => { o[r.eid] ??= r.empresa; }); return o; }, [d.faturas]);

  const cabeca = (
    <div className="page-head">
      <div><h1>Projeção</h1><p>Quanto deve entrar este mês e nos próximos. Escolha um mês e uma semana para ver as empresas. <a href={`/central/${c}#projecao`}>Ver na Central antiga</a></p></div>
      <div className="filtros">
        {ops.length > 1 && (
          <div className="chips" role="group" aria-label="Seguradora">
            {['todas', ...ops].map((o) => <button key={o} type="button" aria-pressed={op === o} onClick={() => setOp(o)}>{o === 'todas' ? 'Todas' : <><i style={{ background: FCOL[o] }} />{o}</>}</button>)}
          </div>
        )}
        <div className="seg" role="group" aria-label="O que projetar">
          <button type="button" aria-pressed={pv === 'com'} onClick={() => setPv('com')}>Comissão da corretora</button>
          <button type="button" aria-pressed={pv === 'emp'} onClick={() => setPv('emp')}>Pagamentos das empresas</button>
        </div>
      </div>
    </div>
  );
  if (!M) return <div className="page cx">{cabeca}<p className="empty">A projeção aparece depois da primeira rodada do Agente Faturas.</p></div>;

  const com = pv === 'com', L: Credito[] = com ? M.com : M.emp, T = M.hoje, cm = ckey(T);
  const inM = (x: Credito, m: string) => ckey(x.data) === m, S_ = (f: (x: Credito) => boolean) => sum(L.filter(f), (x) => x.valor);

  // destaque: como está o mês atual
  const caiu = S_((x) => inM(x, cm) && x.tipo === 'real'), atrM = L.filter((x) => inM(x, cm) && x.atraso && x.tipo !== 'real'), vAt = sum(atrM, (x) => x.valor);
  const aCair = S_((x) => inM(x, cm) && x.tipo !== 'real') - vAt, tot = caiu + aCair + vAt;
  const w_ = (v: number) => (v / Math.max(1, tot) * 100).toFixed(2) + '%';
  const db_ = sum(comissoes.flatMap((x) => x.ordens || []).filter((o: Doc) => String(o.dataISO || '').slice(0, 7) === cm), (o: Doc) => o.debcred);
  const sh = sum(((M.semHist || []) as Credito[]).filter((x) => inM(x, cm)), (x) => x.valor);

  // mês a mês
  const fk = famsIn(uniq(L.map((x) => fam(x.op)))), first = L.map((x) => ckey(x.data)).sort()[0];
  const months: string[] = []; for (let m = addMonth(cm, -5) > first ? addMonth(cm, -5) : first; m <= addMonth(cm, 3); m = addMonth(m, 1)) months.push(m);
  const mesSel = pmk && months.includes(pmk) ? pmk : cm;
  const colunas = months.map((m) => {
    const v: Record<string, number> = {}; L.filter((x) => inM(x, m)).forEach((x) => { const f = fam(x.op); v[f] = (v[f] || 0) + x.valor; });
    return { key: m, label: mesLabel(m), title: mesLabel(m) + (m === cm ? ' (mês atual)' : ''), vals: v, proj: m > cm };
  });
  const escolherMes = (m: string) => { setPmk(m); setPwk(null); };

  // semanas do mês escolhido
  const [ya, ma] = mesSel.split('-').map(Number), m0 = new Date(Date.UTC(ya, ma - 1, 1)), m1 = new Date(Date.UTC(ya, ma, 0));
  type W = { key: string; dias: string; title: string; it: Credito[]; now: boolean; proj: boolean };
  const weeks: W[] = [];
  for (let w = wkStart(m0); w <= m1; w = new Date(w.getTime() + 7 * 864e5)) {
    const a = w < m0 ? m0 : w, e0 = new Date(w.getTime() + 6 * 864e5), b = e0 > m1 ? m1 : e0;
    const it = L.filter((x) => x.data >= a && x.data <= new Date(b.getTime() + 864e5 - 1));
    weeks.push({ key: a.toISOString().slice(0, 10), dias: +a === +b ? d2(a).slice(0, 2) : d2(a).slice(0, 2) + '–' + d2(b).slice(0, 2), title: 'Semana de ' + d2(a) + ' a ' + d2(b), it, now: T >= a && T <= b, proj: it.length > 0 && it.every((x) => x.tipo === 'proj') });
  }
  const wkey = pwk && weeks.find((b) => b.key === pwk) ? pwk : (weeks.find((b) => b.now) || weeks.find((b) => b.it.length) || weeks[0]).key;
  const sw = weeks.find((b) => b.key === wkey)!, mxw = Math.max(1, ...weeks.map((w) => sum(w.it, (x) => x.valor)));
  const itw = sw.it.slice().sort((a, b) => b.valor - a.valor), top = itw.slice(0, 8), rest = itw.slice(8);
  const PILL: Record<string, [string, string]> = { real: [com ? 'Caiu' : 'Pago', 'p-ok'], prev: [com ? 'A receber' : 'Programado', 'p-info'], proj: ['Projetado', 'p-idle'] };
  const Linha = ({ x }: { x: Credito }) => {
    const late = x.atraso && x.tipo !== 'real', st = late ? ['Em atraso', 'p-bad'] : (PILL[x.tipo] || PILL.proj), why = com ? x.how : x.obs;
    return (
      <li><details className="prow"><summary>
        <span className={'date' + (late ? ' late' : '')}>{String(x.data.getUTCDate()).padStart(2, '0')}<br />{MES[x.data.getUTCMonth()]}</span>
        <span style={{ minWidth: 0 }}><b>{x.empresa}</b><small>{com && <span className={`ktag ${x.kind}`}>{x.kind === 'ag' ? 'Agenciamento' : x.kind === 'outro' ? x.obs || 'Outro' : 'Vitalício'}</span>}{fam(x.op)}</small></span>
        <span className="r">R$ {brl(x.valor)}<small><span className={`pill ${st[1]}`}>{st[0]}</span></small></span>
      </summary><div className="pwhy">{why || 'Sem detalhe do cálculo.'}{x.quando && <><br />Data: {x.quando}</>}{x.eid && <><br /><Link className="lnk" href={fichaUrl(x.eid)}>Abrir a empresa</Link></>}</div></details></li>
    );
  };
  const kx = (x: Credito, i: number) => x.empresa + x.op + +x.data + x.kind + i;

  // implantações, agenciamentos e projetado × realizado
  const imps = d.implantacoes.filter((i) => op === 'todas' || fam(i.operadora) === op).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
  const pvL = M.com.filter((x) => x.tipo !== 'real');
  const agOf = (i: Doc) => sum(pvL.filter((x) => x.kind === 'ag' && ((x.imp && x.imp === 'IMP:' + (i.id || i.empresa)) || (i.eid && x.eid === i.eid))), (x) => x.valor);
  const ni = imps.filter((i) => i.status !== 'Cancelada').length;
  const AG = (M.ag || []) as Doc[];
  const real: Record<string, number> = {}; M.com.filter((x) => x.tipo === 'real').forEach((x) => { const m = ckey(x.data); real[m] = (real[m] || 0) + x.valor; });
  const F = d.projecoes.slice().sort((a, b) => String(a.geradoEm).localeCompare(String(b.geradoEm)));
  const val = (f: Doc, m: string) => { const mm = (f.meses || []).find((x: Doc) => x.comp === m); if (!mm) return null; return op === 'todas' ? mm.total : ((mm.porSeg || {})[op] || {}).total || 0; };
  const acc: { m: string; p: number; r: number; df: number; f: Doc; dentro: boolean; parcial: boolean }[] = [];
  for (let m = addMonth(cm, -5); m <= cm; m = addMonth(m, 1)) {
    const antes = F.filter((f) => f.mesAtual < m && val(f, m) != null).pop(), dentro = F.filter((f) => f.mesAtual === m && val(f, m) != null)[0], f = antes || dentro; if (!f) continue;
    const p = val(f, m) as number, r = real[m] || 0; acc.push({ m, p, r, df: r - p, f, dentro: !antes, parcial: m === cm });
  }

  const mudarAg = async (A: Doc, v: string) => {
    const now = new Date().toISOString(); setSalvando(A.eid);
    try {
      if (v === 'auto') await gravar(c, 'delete', 'agenciamentos', A.eid);
      else await gravar(c, 'set', 'agenciamentos', A.eid, { restantes: +v, aposParcela: +A.last, atualizadoEm: now, por: usuario });
      const nome = empName[A.eid] || A.eid;
      await registrar(c, 'comissoes', v === 'auto' ? `voltou o agenciamento de ${nome} para a regra padrão (300%).` : `recebeu da equipe: ${nome} ainda tem ${v} parcela${+v === 1 ? '' : 's'} de agenciamento depois da ${A.last}ª.`, now);
      router.refresh();
    } catch { avisar('Não salvou. Tente de novo.'); }
    setSalvando(null);
  };

  const params: [string, string][] = [
    ['Horizonte', `Até ${mesLabel(addMonth(cm, 3))}. Repete a última fatura de cada empresa (empresas sem fatura em ${mesLabel(addMonth(M.ultComp, -1))} ou ${mesLabel(M.ultComp)} ficam de fora).`],
    ['Data de cada valor', com ? 'Vencimento da fatura + o prazo que a seguradora costuma levar para pagar aquela empresa (mediana do histórico; sem histórico, 4 dias). Fim de semana vai para segunda. O que já devia ter caído e não caiu conta como atraso e vai para o próximo dia útil.' : 'Vencimento da fatura. Fim de semana vai para o dia útil seguinte.'],
    ...(com ? [
      ['Valor do vitalício', 'Mesma proporção comissão ÷ fatura da última comissão vitalícia paga pela empresa. A taxa vem só de meses sem agenciamento: a linha de 0,01% que o Bradesco paga junto com o agenciamento não conta. Sem histórico de vitalício: % da implantação ou 2% (marcado para conferir). Empresas que já pagam só 0,01% fora do agenciamento continuam em 0,01%.'],
      ['Fatura fora do normal', 'Se a última fatura da empresa veio mais de 30% abaixo da média dos 3 meses anteriores, os meses seguintes usam a média e a linha avisa para conferir.'],
      ['Agenciamento', 'Repete o valor da última parcela paga (da mesma fatura ou subfatura). Quantas parcelas: pelo % da implantação cadastrada (300% = 3 faturas; 250% = 2 inteiras + 50% da 3ª) ou 3 pela regra padrão, a menos que a equipe informe outro número em Agenciamentos em andamento. Depois da última parcela vira vitalício sobre a fatura.'],
      ['Implantações novas', (M.novas || []).length ? `${M.novas.length} sem fatura na base ainda: usa o valor mensal estimado, vencimento informado + 4 dias.` : 'Nenhuma cadastrada sem fatura na base. Use Nova implantação.'],
      ['Sem histórico de comissão', `${(M.semHist || []).length} faturas de empresas que nunca tiveram comissão nos extratos ficam fora da projeção (seria um chute de 2%). Entram sozinhas quando a primeira comissão cair.`],
      ['Empresas sem fatura na base', `${M.extraN} empresas (Amil, Hapvida, SulAmérica e outras): repete a última comissão vitalícia paga, no mesmo dia do mês.`],
    ] as [string, string][] : []),
    ['Não considera', 'Reajuste anual e inclusões ou exclusões de vidas. Empresas novas só entram se forem cadastradas em Implantações.'],
  ];

  return (
    <div className="page cx">
      {cabeca}
      <section className="card ph">
        <div>
          <span className="ph-l">{com ? 'Comissão que cai em ' : 'Pagamentos das empresas em '}{MESF[T.getUTCMonth()]}</span>
          <span className="ph-v">R$ {brl(tot)}</span>
          <div className="ph-bar" role="img" aria-label={`${com ? 'Já caiu' : 'Já pago'} R$ ${brl(caiu)}, ${com ? 'a cair' : 'a pagar'} R$ ${brl(aCair)}${vAt ? ', em atraso R$ ' + brl(vAt) : ''}`}>
            {caiu > 0 && <i style={{ width: w_(caiu), background: 'var(--accent)' }} />}
            {aCair > 0 && <i style={{ width: w_(aCair), background: 'var(--accent)', opacity: 0.35 }} />}
            {vAt > 0 && <i style={{ width: w_(vAt), background: 'var(--bad-fg)' }} />}
          </div>
          <ul className="ph-leg">
            <li><i style={{ background: 'var(--accent)' }} />{com ? 'Já caiu' : 'Já pago'} <b>R$ {brl(caiu)}</b></li>
            <li><i style={{ background: 'var(--accent)', opacity: 0.35 }} />{com ? 'A cair no prazo' : 'A pagar'} <b>R$ {brl(aCair)}</b></li>
            {vAt > 0 && <li><i style={{ background: 'var(--bad-fg)' }} />Em atraso <b>R$ {brl(vAt)}</b> <span>({atrM.length})</span></li>}
          </ul>
          {com && <p className="note" style={{ margin: '.6rem 0 0' }}>Valores brutos.{db_ ? ` Já descontados R$ ${brl(-db_)} de débitos nas ordens do mês: o que caiu líquido foi R$ ${brl(caiu + db_)}.` : ''}{sh ? ` R$ ${brl(sh)} de empresas sem histórico de comissão ficam fora da soma até a primeira comissão delas cair.` : ''}</p>}
        </div>
        <div className="ph-next">
          <span className="ph-l">Próximos meses</span>
          {[1, 2, 3].map((k) => {
            const m = addMonth(cm, k), v = S_((x) => inM(x, m)), ag = S_((x) => inM(x, m) && x.kind === 'ag');
            return <button key={m} type="button" className="ph-m" aria-pressed={mesSel === m} onClick={() => escolherMes(m)}><span>{mesLabel(m)}</span><b>R$ {brl(v)}</b>{com && ag ? <small>R$ {brl(ag)} de agenciamento</small> : null}</button>;
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>{com ? 'Comissão mês a mês' : 'Pagamentos mês a mês'}</h2><span className="hint">Barras claras = projetado · clique num mês</span></div>
        <ul className="legenda">{fk.map((k) => <li key={k}><i style={{ background: FCOL[k] }} />{k}</li>)}<li><i className="hz" />projetado</li></ul>
        <Barras colunas={colunas} chaves={fk} sel={mesSel} onClick={escolherMes} aria="Projeção por mês e seguradora" h={230} />
      </section>

      <section className="card">
        <div className="card-h"><h2>Semanas de {MESF[ma - 1]}</h2><span className="hint">Clique numa semana para ver as empresas</span></div>
        <div className="dstrip" style={{ gridTemplateColumns: `repeat(${weeks.length},minmax(0,1fr))` }}>
          {weeks.map((w) => {
            const v = sum(w.it, (x) => x.valor), na = w.it.filter((x) => x.atraso && x.tipo !== 'real').length, on = wkey === w.key;
            return (
              <button key={w.key} type="button" className={'dcell' + (on ? ' on' : '') + (w.now ? ' today' : '') + (w.proj ? ' proj' : '')} aria-pressed={on} onClick={() => setPwk(w.key)} aria-label={`${w.title}: R$ ${brl(v)}${na ? ', ' + na + ' em atraso' : ''}`}>
                <span className="dn">{w.dias}</span><span className="db"><i style={{ height: `${(v / mxw * 100).toFixed(1)}%` }} /></span>
                <span className="dv">{v ? kfmt(v) : '—'}</span>
                <span className={'dc' + (na ? ' late' : '')}>{na ? na + (na > 1 ? ' atrasos' : ' atraso') : w.it.length ? w.it.length + (com ? ' créd.' : ' bol.') : ' '}</span>
              </button>
            );
          })}
        </div>
        <div className="day-h" style={{ marginTop: '1rem' }}><span>{sw.title}{sw.now ? ' (esta semana)' : ''}</span><span>R$ {brl(sum(itw, (x) => x.valor))} · {plural(itw.length, com ? 'crédito' : 'boleto', com ? 'créditos' : 'boletos')}</span></div>
        {itw.length ? <>
          <ul className="rows plist">{top.map((x, i) => <Linha key={kx(x, i)} x={x} />)}</ul>
          {rest.length > 0 && <details className="more"><summary>+ {rest.length} {rest.length > 1 ? 'menores' : 'menor'} · R$ {brl(sum(rest, (x) => x.valor))}</summary><ul className="rows plist">{rest.map((x, i) => <Linha key={kx(x, i + 8)} x={x} />)}</ul></details>}
          <p className="note">Clique numa linha para ver como o valor foi calculado.</p>
        </> : <p className="empty">Nada nesta semana.</p>}
      </section>

      <details className="fold">
        <summary><h2>Implantações</h2><span className="hint">{ni ? `${ni} ${ni > 1 ? 'ativas' : 'ativa'}` : 'nenhuma cadastrada'}</span></summary>
        <div className="fb">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.6rem' }}><button className="btn" type="button" onClick={() => setImp('nova')}>Nova implantação</button></div>
          {imps.length ? (
            <ul className="rows">
              {imps.map((i) => (
                <li key={i.id}>
                  <button type="button" className="linha-btn" onClick={() => setImp(i)}>
                    <b>{i.empresa}</b><small>{i.operadora} · 1ª fatura {mesLabel(i.inicio)} · R$ {brl(i.valor)}/mês · {String(+i.agPct || 0)}% + {String(i.vitPct ?? 2).replace('.', ',')}% vitalício</small>
                  </button>
                  <span className="r">{i.status === 'Cancelada' ? '—' : 'R$ ' + brl(agOf(i))}<small><span className={`pill ${({ Prevista: 'p-info', Implantada: 'p-ok', Cancelada: 'p-idle' } as Record<string, string>)[i.status] || 'p-info'}`}>{i.status || 'Prevista'}</span> {i.status === 'Cancelada' ? '' : 'agenc. a receber'}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="empty">Nenhuma implantação cadastrada. Toda empresa nova que entrar, cadastre aqui com o % de agenciamento do contrato.</p>}
          <p className="note">Cada implantação cadastrada entra na projeção: o agenciamento pelo % do contrato (300% = 3 faturas; 250% = 2 inteiras + 50% da 3ª) e depois o vitalício.</p>
        </div>
      </details>

      {com && (
        <details className="fold">
          <summary><h2>Agenciamentos em andamento</h2><span className="hint">{AG.length ? plural(AG.length, 'empresa', 'empresas') : 'nenhuma agora'}</span></summary>
          <div className="fb">
            <div className="tbl"><table>
              <thead><tr><th>Empresa</th><th>Já recebido</th><th>Próximos agenciamentos</th><th>Ainda faltam</th><th>Vira vitalício</th></tr></thead>
              <tbody>
                {AG.length ? AG.map((A) => (
                  <tr key={A.eid}>
                    <td>{A.nome}<small>{A.eid}</small></td>
                    <td>{(A.rec || []).map((p: Doc) => ord(p.parcela) + ' ' + p.taxa + '%').join(' · ')}<small>R$ {brl(sum(A.recR || [], (x: Doc) => x.valor))} recebidos</small></td>
                    <td>{(A.prox || []).length ? A.prox.map((x: Doc) => <div key={x.parc}>{ord(x.parc)} · {mesLabel(x.comp)} · R$ {brl(x.valor)}</div>) : <span className="hint">nenhuma</span>}</td>
                    <td>
                      <select className="sel agsel" aria-label={`Agenciamentos que faltam para ${A.nome}`} disabled={salvando === A.eid}
                        value={A.auto ? 'auto' : String(A.restantes)} onChange={(e) => mudarAg(A, e.target.value)}>
                        {['auto', '0', '1', '2', '3', '4'].map((v) => <option key={v} value={v}>{v === 'auto' ? `Automático (${A.restantes})` : v}</option>)}
                      </select>
                    </td>
                    <td>{A.vit ? <>{ord(A.vit.parc)} · {mesLabel(A.vit.comp)}<small>R$ {brl(A.vit.valor)}/mês</small></> : <span className="hint">fora do horizonte</span>}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="empty">Nenhuma empresa em agenciamento agora.</td></tr>}
              </tbody>
            </table></div>
            <p className="note">Ajuste quantas parcelas ainda faltam quando um agenciamento cair. 300% = 3 faturas inteiras. Se caiu a 1ª e o contrato é de 200%, escolha 1. &quot;Automático&quot; volta para a regra padrão.</p>
          </div>
        </details>
      )}

      <details className="fold">
        <summary><h2>Projetado × realizado</h2><span className="hint">{F.length ? plural(F.length, 'rodada', 'rodadas') + ' do Agente Projeção' : ''}</span></summary>
        <div className="fb">
          {acc.length ? <>
            <div className="tbl"><table style={{ minWidth: 0 }}>
              <thead><tr><th>Mês</th><th className="num">Projetado</th><th className="num">Realizado</th><th className="num">Diferença</th></tr></thead>
              <tbody>{acc.map((x) => (
                <tr key={x.m}>
                  <td><b>{mesLabel(x.m)}</b><small>foto de {new Date(x.f.geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{x.dentro ? ' (já dentro do mês)' : ''}</small></td>
                  <td className="num">{brl(x.p)}</td>
                  <td className="num">{brl(x.r)}{x.parcial && <small>até hoje</small>}</td>
                  <td className="num">{x.parcial ? <span className="hint">em aberto</span> : <><span className={x.df >= 0 ? 'up' : 'down'}>{x.df >= 0 ? '+' : '−'}{brl(Math.abs(x.df))}</span><small>{x.p ? pct(x.df / x.p * 100) : ''}</small></>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <p className="note">Projetado = a última rodada feita antes do mês começar. Realizado = comissões creditadas no mês (data da ordem de pagamento).</p>
          </> : <p className="empty">A comparação aparece depois da primeira rodada do Agente Projeção. Cada rodada fica guardada para conferir com o que entrou.</p>}
        </div>
      </details>

      <details className="fold">
        <summary><h2>Como a projeção é calculada</h2></summary>
        <div className="fb"><div className="params">{params.map(([a, b]) => <div className="param" key={a}><b>{a}</b><span>{b}</span></div>)}</div></div>
      </details>

      {imp && <Implantacao c={c} imp={imp === 'nova' ? null : imp} empName={empName} usuario={usuario} imps={d.implantacoes}
        fechar={() => setImp(null)} salvo={(t) => { setImp(null); avisar(t); router.refresh(); }} />}
      {aviso && <p className="msg ok aviso-flutua" role="status">{aviso}</p>}
    </div>
  );
}

function Implantacao({ c, imp, empName, usuario, imps, fechar, salvo }: {
  c: string; imp: Doc | null; empName: Record<string, string>; usuario: string; imps: Doc[]; fechar: () => void; salvo: (t: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [emp, setEmp] = useState(imp?.empresa ?? '');
  const ems = Object.entries(empName).sort((a, b) => a[1].localeCompare(b[1]));
  const nx = addMonth(ckey(today()), 1);
  const abrir = (el: HTMLDialogElement | null) => { ref.current = el; if (el && !el.open) el.showModal(); };

  const enviar = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); setOcupado(true); setErro('');
    const f = new FormData(ev.currentTarget), g = (k: string) => String(f.get(k) ?? '').trim();
    const now = new Date().toISOString(), id = imp?.id || 'IMP-' + now.slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    const old = imps.find((x) => x.id === id);
    const dados = {
      id, empresa: g('empresa'), eid: g('eid'), operadora: g('operadora'), inicio: g('inicio'), diaVenc: +g('dia') || 10, valor: +g('valor') || 0, vidas: +g('vidas') || 0,
      agPct: +g('ag') || 0, vitPct: +g('vit') || 0, status: g('status'), obs: g('obs'), atualizadoEm: now, por: usuario, criadaEm: old?.criadaEm || now, origem: old?.origem || 'Portal',
    };
    try {
      await gravar(c, 'set', 'implantacoes', id, dados);
      await registrar(c, 'projecao', old ? `teve a implantação de ${dados.empresa} atualizada (${dados.status}).` : `recebeu uma implantação nova: ${dados.empresa} (${dados.operadora}, 1ª fatura ${mesLabel(dados.inicio)}, ${dados.agPct}% de agenciamento).`, now);
      salvo('Implantação salva. A projeção já considera.');
    } catch { setErro('Não salvou. Tente de novo.'); setOcupado(false); }
  };

  return (
    <dialog className="cx-modal" ref={abrir} onClose={fechar} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-labelledby="impt">
      <form onSubmit={enviar}>
        <h3 id="impt">{imp ? 'Editar implantação' : 'Nova implantação'}</h3>
        <p className="hint">O Agente Projeção recalcula a projeção com esta empresa.</p>
        <label className="campo">Empresa<input name="empresa" required autoComplete="off" value={emp} onChange={(e) => setEmp(e.target.value)} /></label>
        <label className="campo">Já está na base?
          <select name="eid" defaultValue={imp?.eid ?? ''} onChange={(e) => { const k = e.target.value; if (k && !emp.trim()) setEmp(empName[k] || ''); }}>
            <option value="">Ainda não (empresa nova)</option>
            {ems.map(([k, n]) => <option key={k} value={k}>{n} · {k}</option>)}
          </select>
        </label>
        <label className="campo">Seguradora<select name="operadora" required defaultValue={imp?.operadora ?? 'Porto Saúde'}>{OPS.map((o) => <option key={o}>{o}</option>)}</select></label>
        <div className="grid g2" style={{ gap: '.85rem' }}>
          <label className="campo">Competência da 1ª fatura<input name="inicio" type="month" required defaultValue={imp?.inicio ?? nx} /></label>
          <label className="campo">Dia de vencimento<input name="dia" type="number" min={1} max={31} defaultValue={imp?.diaVenc ?? 10} /></label>
          <label className="campo">Valor mensal estimado (R$)<input name="valor" type="number" min={0} step="0.01" required defaultValue={imp?.valor ?? ''} /></label>
          <label className="campo">Vidas<input name="vidas" type="number" min={0} defaultValue={imp?.vidas || ''} /></label>
          <label className="campo">Agenciamento (%)<input name="ag" type="number" min={0} step={1} required defaultValue={imp?.agPct ?? 300} /></label>
          <label className="campo">Vitalício (%)<input name="vit" type="number" min={0} max={50} step="0.01" defaultValue={imp?.vitPct ?? 2} /></label>
        </div>
        <label className="campo">Situação<select name="status" defaultValue={imp?.status ?? 'Prevista'}><option>Prevista</option><option>Implantada</option><option>Cancelada</option></select></label>
        <label className="campo">Observação<textarea name="obs" defaultValue={imp?.obs ?? ''} placeholder="Contrato, corretor, condições do agenciamento…" /></label>
        {erro && <p className="msg erro">{erro}</p>}
        <div className="acoes"><button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancelar</button><button type="submit" className="btn" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</button></div>
      </form>
    </dialog>
  );
}
