'use client';
// Faturamento da Central de Agentes como tela do portal. As contas vêm de lib/central/modelo.ts (as mesmas da Central).
import { useEffect, useMemo, useState } from 'react';
import {
  type Doc, type Item, type Linha, FAIXAS, FCOL, aberto, addMonth, brl, ckey, comissaoItens, empRows, fam, famsIn, fatItems,
  int, mesLabel, norm, pct, pdate, sum, today, uniq, vidas,
} from '@/lib/central/modelo';
import { plural } from '@/lib/formato';
import { Barras } from './Barras';

type Filtro = 'todas' | 'aberto' | 'variou' | 'div';
type Ordem = 'valor' | 'venc' | 'nome' | 'var';

const sinal = (v: number) => <span className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : '−'}{pct(Math.abs(v))}</span>;

export function Faturamento({ c, faturas: todas, comissoes, inicial = null }: { c: string; faturas: Doc[]; comissoes: Doc[] | null; inicial?: string | null }) {
  const [op, setOp] = useState('todas');
  const [mesSel, setMes] = useState<string | null>(null);
  const [fq, setFq] = useState('');
  const [ff, setFf] = useState<Filtro>('todas');
  const [ordem, setOrdem] = useState<Ordem>('valor');
  const [emp, setEmp] = useState<string | null>(inicial);

  const faturas = useMemo(() => (op === 'todas' ? todas : todas.filter((f) => fam(f.operadora) === op)), [todas, op]);
  const ops = famsIn(uniq(todas.map((f) => fam(f.operadora))));
  const itens = useMemo(() => fatItems(faturas), [faturas]);
  const comps = uniq(itens.map((r) => r.comp)).sort();
  const mes = mesSel && comps.includes(mesSel) ? mesSel : comps[comps.length - 1];

  if (!comps.length) {
    return (
      <div className="page-head"><div><h1>Faturamento</h1><p>As faturas aparecem depois da primeira rodada do Agente Faturas.</p></div></div>
    );
  }

  const { rows, pm } = empRows(faturas, mes);
  const tot = sum(rows, (e) => e.valor), docs = faturas.filter((f) => f.comp === mes);
  const nab = rows.filter((e) => e.ab), pIt = pm ? itens.filter((r) => r.comp === pm) : [], ptot = sum(pIt, (r) => r.valor), dl = ptot ? (tot - ptot) / ptot * 100 : 0;
  const eN = new Set(rows.map((e) => e.eid)), eP = new Set(pIt.map((r) => r.eid));
  const sN = sum(rows.filter((e) => eP.has(e.eid)), (e) => e.valor), sP = sum(pIt.filter((r) => eN.has(r.eid)), (r) => r.valor), dlS = sP ? (sN - sP) / sP * 100 : 0;
  const nVidas = sum(rows, (e) => e.vidas);
  const pend = docs.flatMap((d) => d.pendentes || []) as { empresa: string; motivo: string }[];
  const up = docs.map((d) => d.atualizadoEm).filter(Boolean).sort().pop();

  return (
    <div className="page cx">
      <div className="page-head">
        <div>
          <h1>Faturamento</h1>
          <p>{up ? `Atualizado em ${new Date(up).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. ` : ''}Clique numa empresa para ver faturas, vidas e situação. <a href={`/central/${c}#faturamento`}>Ver na Central antiga</a></p>
        </div>
        <div className="filtros">
          {ops.length > 1 && (
            <div className="chips" role="group" aria-label="Seguradora">
              {['todas', ...ops].map((o) => (
                <button key={o} type="button" aria-pressed={op === o} onClick={() => setOp(o)}>
                  {o === 'todas' ? 'Todas' : <><i style={{ background: FCOL[o] }} />{o}</>}
                </button>
              ))}
            </div>
          )}
          <div className="seg" role="group" aria-label="Competência">
            {comps.map((m) => <button key={m} type="button" aria-pressed={m === mes} onClick={() => setMes(m)}>{mesLabel(m)}</button>)}
          </div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Faturado em {mesLabel(mes)}</span><span className="kpi-v">R$ {brl(tot)}</span>
          <span className="kpi-s">{pm ? <>{sinal(dlS)} nas mesmas empresas · {sinal(dl)} no total, vs {mesLabel(pm)}</> : 'primeiro mês na base'}</span></div>
        <div className="kpi"><span className="kpi-l">Empresas</span><span className="kpi-v">{rows.length}</span>
          <span className="kpi-s">{docs.length} {docs.length === 1 ? 'arquivo' : 'arquivos'} de {plural(uniq(docs.map((d) => fam(d.operadora))).length, 'seguradora', 'seguradoras')}</span></div>
        <div className="kpi"><span className="kpi-l">Vidas</span><span className="kpi-v">{int(nVidas)}</span><span className="kpi-s">custo médio R$ {brl(tot / Math.max(1, nVidas))} por vida</span></div>
        <div className="kpi"><span className="kpi-l">Boletos em aberto</span><span className="kpi-v">{nab.length}</span><span className="kpi-s">R$ {brl(sum(nab, (e) => e.valor))}</span></div>
      </div>
      {pend.length > 0 && <p className="msg aviso">Ainda sem fatura em {mesLabel(mes)}: {pend.map((p) => `${p.empresa} — ${p.motivo}`).join('; ')}.</p>}

      <div className="fat-layout">
        <Lista rows={rows} mes={mes} fq={fq} setFq={setFq} ff={ff} setFf={setFf} ordem={ordem} setOrdem={setOrdem} emp={emp} setEmp={setEmp} />
        <section className="ficha" aria-live="polite">
          {emp
            ? <Ficha key={emp} c={c} eid={emp} todas={fatItems(todas)} mes={mes} comissoes={comissoes} fechar={() => setEmp(null)} />
            : <Geral itens={itens} comps={comps} mes={mes} setMes={setMes} rows={rows} setEmp={setEmp} />}
        </section>
      </div>
    </div>
  );
}

function Lista({ rows, mes, fq, setFq, ff, setFf, ordem, setOrdem, emp, setEmp }: {
  rows: Linha[]; mes: string; fq: string; setFq: (v: string) => void; ff: Filtro; setFf: (v: Filtro) => void;
  ordem: Ordem; setOrdem: (v: Ordem) => void; emp: string | null; setEmp: (v: string | null) => void;
}) {
  const q = fq.trim().toUpperCase();
  let L = q ? rows.filter((e) => e.nome.toUpperCase().includes(q) || e.eid.toUpperCase().includes(q)) : rows.slice();
  if (ff === 'aberto') L = L.filter((e) => e.ab);
  else if (ff === 'variou') L = L.filter((e) => e.d != null && Math.abs(e.d) > 0.009);
  else if (ff === 'div') L = L.filter((e) => e.div);
  const so: Record<Ordem, (a: Linha, b: Linha) => number> = {
    valor: (a, b) => b.valor - a.valor, nome: (a, b) => a.nome.localeCompare(b.nome),
    venc: (a, b) => (a.venc?.getTime() || 0) - (b.venc?.getTime() || 0), var: (a, b) => Math.abs(b.d || 0) - Math.abs(a.d || 0),
  };
  L.sort(so[ordem]);
  const abrir = (eid: string) => {
    setEmp(eid);
    // no celular a ficha fica embaixo da lista: leva a pessoa até ela
    if (window.innerWidth < 960) setTimeout(() => document.querySelector('.ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  return (
    <aside className="card elist" aria-label="Empresas">
      <div className="tools">
        <input className="busca" type="search" enterKeyHint="search" placeholder="Buscar empresa" aria-label="Buscar empresa" value={fq} onChange={(e) => setFq(e.target.value)} />
        <select className="sel" aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
          <option value="valor">Maior valor</option><option value="venc">Vencimento</option><option value="nome">Nome</option><option value="var">Maior variação</option>
        </select>
      </div>
      <div className="chips" role="group" aria-label="Filtro">
        {([['todas', 'Todas'], ['aberto', 'Em aberto'], ['variou', 'Mudou de valor'], ['div', 'Divergência']] as [Filtro, string][]).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={ff === k} onClick={() => setFf(k)}>{t}</button>
        ))}
      </div>
      <ul>
        {L.map((e) => {
          const st = e.div ? ['dv', 'divergência'] : e.ab ? ['ab', 'em aberto'] : ['', 'pago'];
          const dv = e.d == null ? 'novo' : Math.abs(e.d) < 0.01 ? 'igual' : `${e.d > 0 ? '+' : '−'}R$ ${brl(Math.abs(e.d))}`;
          return (
            <li key={e.eid}>
              <button className="ei" type="button" aria-current={emp === e.eid} onClick={() => abrir(e.eid)}>
                <span className="dot" style={{ background: FCOL[e.fam] }} />
                <b className="nm" title={e.nome}>{e.nome}</b>
                <span className="v">R$ {brl(e.valor)}</span>
                <small>
                  {e.subs > 1 && <span className="subn" title={`${e.subs} subestipulantes`}>{e.subs} subs</span>}
                  {e.pend && <span className="subn pend">a confirmar</span>}
                  {e.eid} · {[...e.ops].join(', ')} · {vidas(e.vidas)}
                </small>
                <span className={`s ${st[0]}`}>{ff === 'variou' ? dv : st[1]}</span>
              </button>
            </li>
          );
        })}
        {!L.length && <li className="empty" style={{ padding: '.5rem .4rem' }}>Nenhuma empresa neste filtro.</li>}
      </ul>
      <p className="hint">{L.length} de {rows.length} empresas em {mesLabel(mes)}</p>
    </aside>
  );
}

function Geral({ itens, comps, mes, setMes, rows, setEmp }: { itens: Item[]; comps: string[]; mes: string; setMes: (m: string) => void; rows: Linha[]; setEmp: (e: string) => void }) {
  const fk = famsIn(uniq(itens.map((r) => fam(r.operadora))));
  const colunas = comps.map((cp) => {
    const it = itens.filter((r) => r.comp === cp), v: Record<string, number> = {};
    it.forEach((r) => { const f = fam(r.operadora); v[f] = (v[f] || 0) + (+r.valor || 0); });
    return { key: cp, label: mesLabel(cp), sub: `${it.length} fat.`, title: `Faturado em ${mesLabel(cp)}`, vals: v };
  });
  const vr = rows.filter((e) => e.d != null && Math.abs(e.d) > 0.009).sort((a, b) => Math.abs(b.d!) - Math.abs(a.d!)).slice(0, 8);
  return (
    <>
      <section className="card">
        <div className="card-h"><h2>Faturado por competência</h2><span className="hint">Clique num mês para trocar</span></div>
        <ul className="legenda">{fk.map((k) => <li key={k}><i style={{ background: FCOL[k] }} />{k}</li>)}</ul>
        <Barras colunas={colunas} chaves={fk} sel={mes} onClick={setMes} aria="Faturado por competência" />
      </section>
      <section className="card">
        <div className="card-h"><h2>Maiores variações em {mesLabel(mes)}</h2><span className="hint">Comparado ao mês anterior</span></div>
        {vr.length ? (
          <div className="hbars">
            {vr.map((e) => (
              <button key={e.eid} type="button" className="hbar cx-hbar" onClick={() => setEmp(e.eid)}>
                <span className="nm" title={e.nome}>{e.nome}</span>
                <span className="tr"><span style={{ width: `${Math.max(2, Math.abs(e.d!) / Math.abs(vr[0].d!) * 100).toFixed(1)}%`, background: e.d! > 0 ? 'var(--s1)' : 'var(--s2)' }} /></span>
                <span className="v"><span className={e.d! > 0 ? 'up' : 'down'}>{e.d! > 0 ? '+' : '−'}R$ {brl(Math.abs(e.d!))}</span>{e.prev ? <small>{pct(e.d! / e.prev * 100)}</small> : null}</span>
              </button>
            ))}
          </div>
        ) : <p className="empty">Nenhuma empresa mudou de valor.</p>}
      </section>
      <div className="card vazio">Escolha uma empresa na lista para abrir a ficha com faturas, vidas, idades e movimentações.</div>
    </>
  );
}

function conf(r: Item): [string, string, number] {
  const ok = r.confValor === 'OK' && (r.confVidas === 'OK' || !r.confVidas);
  return ok ? ['OK', 'p-ok', 0] : r.confValor === 'Sem vidas' ? ['Sem vidas', 'p-idle', 1] : r.confValor === 'OK' ? ['Vidas divergem', 'p-bad', 2] : ['Divergência', 'p-bad', 3];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Vidas = { none?: boolean; comp?: string; cnpj?: string; diaVenc?: string; hist?: Record<string, { incl: number; excl: number }>; vidas?: any[] };

function Ficha({ c, eid, todas, mes, comissoes, fechar }: { c: string; eid: string; todas: Item[]; mes: string; comissoes: Doc[] | null; fechar: () => void }) {
  const [v, setV] = useState<Vidas | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let vivo = true;
    fetch(`/api/central/${encodeURIComponent(c)}?col=vidas&doc=${encodeURIComponent(eid)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { dados: null })).then((j) => { if (vivo) setV(j.dados ?? { none: true }); })
      .catch(() => { if (vivo) setV({ none: true }); });
    return () => { vivo = false; };
  }, [c, eid]);

  const all = todas.filter((r) => r.eid === eid);
  if (!all.length) return <div className="card vazio">Empresa sem faturas na base.</div>;
  const nome = all[0].empresa, comps = uniq(all.map((r) => r.comp)).sort(), cur = all.filter((r) => r.comp === mes);
  const last = cur.length ? cur : all.filter((r) => r.comp === comps[comps.length - 1]);
  const lc = last[0].comp, ops = uniq(all.map((r) => r.operadora)), vtot = sum(last, (r) => r.valor), vv = sum(last, (r) => r.ativos ?? r.vidas);
  const n_ = norm(nome);
  const cit = comissaoItens(comissoes ?? []).filter((i) => i.eid === eid || (!i.eid && norm(i.empresa) === n_ && ops.some((o) => fam(o) === fam(i.operadora))));
  const c12 = cit.filter((i) => i.ext >= addMonth(ckey(today()), -11));
  const venc = last.map((r) => r.venc).filter(Boolean).sort()[0] || '—', abr = last.some(aberto);
  const fat12 = sum(all.filter((r) => r.comp >= addMonth(ckey(today()), -12)), (r) => r.valor);
  const hist = v && !v.none ? v.hist : undefined;
  const mov = (cp: string, sub?: boolean) => {
    const h = hist?.[cp];
    return !sub && h && (h.incl || h.excl) ? <><span className="up">+{h.incl}</span> <span className="down">−{h.excl}</span></> : '—';
  };
  const linha = (r: Item, sub = false) => {
    const k = conf(r);
    return (
      <tr key={r.comp + r.titulo + (sub ? 's' : '')} className={sub ? 'subf' : ''} style={!sub && r.comp === mes ? { fontWeight: 700 } : undefined}>
        <td>{sub ? '' : mesLabel(r.comp)}</td>
        <td className="tab">{r.titulo}<small>{r.operadora}{r.nfs > 1 ? ` · +${r.nfs - 1} NF${r.nfs > 2 ? 's' : ''} das subs` : ''}</small></td>
        <td>{r.venc || '—'}</td>
        <td className="num">{int(r.ativos ?? r.vidas)}</td>
        <td className="num">{mov(r.comp, sub)}</td>
        <td className="num">{brl(r.valor)}</td>
        <td><span className={`pill ${aberto(r) ? 'p-warn' : 'p-idle'}`}>{aberto(r) ? 'Em aberto' : 'Pago'}</span></td>
        <td><span className={`pill ${k[1]}`}>{k[0]}</span></td>
      </tr>
    );
  };

  return (
    <>
      <section className="card">
        <div className="fh">
          <div>
            <h2>{nome}{last.some((r) => r.grupoPendente) && <span className="pill p-warn">Agrupamento a confirmar</span>}</h2>
            <p>{eid} · {ops.join(', ')}{v?.cnpj ? ` · CNPJ ${v.cnpj}` : ''}{v?.diaVenc ? ` · vence todo dia ${v.diaVenc}` : ''}</p>
          </div>
          <div className="acoes"><button className="btn ghost" type="button" onClick={fechar}>Fechar</button></div>
        </div>
        <div className="mini-k">
          <div><span className="kpi-l">Fatura {mesLabel(lc)}</span><div className="kpi-v">R$ {brl(vtot)}</div>
            <span className="kpi-s">vence {venc} · <span className={`pill ${abr ? 'p-warn' : 'p-idle'}`}>{abr ? 'em aberto' : 'pago'}</span></span></div>
          <div><span className="kpi-l">Vidas</span><div className="kpi-v">{int(vv)}</div><span className="kpi-s">R$ {brl(vtot / Math.max(1, vv))} por vida</span></div>
          {comissoes && <div><span className="kpi-l">Comissão 12 meses</span><div className="kpi-v">R$ {brl(sum(c12, (i) => i.comissao))}</div>
            <span className="kpi-s">{c12.length ? `${pct(sum(c12, (i) => i.comissao) / Math.max(1, fat12) * 100)} do faturado` : 'sem comissão encontrada'}</span></div>}
          <div><span className="kpi-l">Na base desde</span><div className="kpi-v">{mesLabel(comps[0])}</div><span className="kpi-s">{comps.length} {comps.length === 1 ? 'mês faturado' : 'meses faturados'}</span></div>
        </div>
      </section>

      <Subs last={last} />

      <section className="card">
        <div className="card-h"><h2>Faturas</h2><span className="hint">Uma linha por mês · clique em &quot;N faturas&quot; para abrir</span></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Mês</th><th>Fatura</th><th>Vencimento</th><th className="num">Vidas</th><th className="num">Mov.</th><th className="num">Valor (R$)</th><th>Boleto</th><th>Conferência</th></tr></thead>
            <tbody>
              {comps.slice().reverse().flatMap((cp) => {
                const G = all.filter((r) => r.comp === cp).sort((a, b) => (+b.valor || 0) - (+a.valor || 0));
                if (G.length === 1) return [linha(G[0])];
                const k = eid + '|' + cp, ab = G.some(aberto), w = G.map(conf).sort((a, b) => b[2] - a[2])[0];
                const vs = G.map((r) => r.venc).filter(Boolean).sort((a, b) => (pdate(a)?.getTime() ?? 0) - (pdate(b)?.getTime() ?? 0))[0];
                return [
                  <tr key={cp} style={cp === mes ? { fontWeight: 700 } : undefined}>
                    <td>{mesLabel(cp)}</td>
                    <td><button className="lnk" type="button" aria-expanded={!!abertos[k]} onClick={() => setAbertos({ ...abertos, [k]: !abertos[k] })}>{G.length} faturas</button></td>
                    <td>{vs || '—'}</td>
                    <td className="num">{int(sum(G, (r) => r.ativos ?? r.vidas))}</td>
                    <td className="num">{mov(cp)}</td>
                    <td className="num">{brl(sum(G, (r) => r.valor))}</td>
                    <td><span className={`pill ${ab ? 'p-warn' : 'p-idle'}`}>{ab ? 'Em aberto' : 'Pago'}</span></td>
                    <td><span className={`pill ${w[1]}`}>{w[0]}</span></td>
                  </tr>,
                  ...(abertos[k] ? G.map((r) => linha(r, true)) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>

      <VidasCard v={v} />
    </>
  );
}

// quadro de subestipulantes da empresa principal no mês (subsDet vem do Agente Faturas)
function Subs({ last }: { last: Item[] }) {
  const it = last.find((r) => r.subsDet && r.subsDet.length > 1);
  if (!it) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L = it.subsDet as any[], own = L.filter((s) => s.titulo), tv = sum(own, (s) => s.valor), vd = (s: { vidasSub?: number; vidas?: number }) => (s.vidasSub != null ? s.vidasSub : s.vidas);
  const totP = sum(last, (r) => r.valor), bate = Math.abs(tv - totP) < 0.02;
  return (
    <section className="card">
      <div className="card-h"><h2>Subestipulantes</h2><span className="hint">{L.length} em {mesLabel(it.comp)} · {own.length} com NF própria</span>{it.grupoPendente && <span className="pill p-warn">Agrupamento a confirmar</span>}</div>
      <div className="tbl">
        <table>
          <thead><tr><th>Código</th><th>Empresa</th><th>Fatura</th><th>Vencimento</th><th className="num">Vidas</th><th className="num">Valor (R$)</th><th>Boleto</th><th>Conferência</th></tr></thead>
          <tbody>
            {L.map((s, i) => (
              <tr key={s.cod + i}>
                <td className="tab">{s.cod}{i === 0 && <small>principal</small>}</td>
                <td><b>{s.nome || '—'}</b>{s.cnpj && <small>CNPJ {s.cnpj}</small>}</td>
                <td className="tab">{s.titulo || '—'}</td>
                <td>{s.venc || '—'}</td>
                <td className="num">{int(vd(s))}</td>
                <td className="num">{s.valor != null ? brl(s.valor) : <>—{s.valorVidas ? <small>prêmio das vidas {brl(s.valorVidas)}</small> : null}</>}</td>
                <td>{s.boleto ? <span className={`pill ${/aberto/i.test(s.boleto) ? 'p-warn' : s.boleto === 'Sem boleto' ? 'p-bad' : 'p-idle'}`}>{s.boleto}</span> : <span className="hint">na NF da principal</span>}</td>
                <td>{s.confValor ? <span className={`pill ${s.confValor === 'OK' ? 'p-ok' : s.confValor === 'Sem vidas' ? 'p-idle' : 'p-bad'}`}>{s.confValor}</span> : <span className="hint">—</span>}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Total</td><td>{own.length} NF{own.length === 1 ? '' : 's'}</td><td /><td /><td className="num">{int(sum(L, vd))}</td><td className="num">{brl(tv)}</td>
              <td colSpan={2}>{bate ? <span className="pill p-ok">bate com a fatura da empresa</span> : <span className="pill p-warn">fatura da empresa: R$ {brl(totP)}</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">Sem NF própria: a subestipulante é cobrada dentro da fatura da principal. Nesses casos aparecem as vidas dela e o prêmio dessas vidas.</p>
    </section>
  );
}

function VidasCard({ v }: { v: Vidas | null }) {
  const [vq, setVq] = useState('');
  if (!v) return <section className="card"><div className="card-h"><h2>Vidas</h2></div><p className="empty">Carregando as vidas…</p></section>;
  if (v.none || !(v.vidas || []).length) {
    return <section className="card"><div className="card-h"><h2>Vidas</h2></div><p className="empty">A relação de vidas desta empresa ainda não está nesta ficha.</p></section>;
  }
  const L = v.vidas!, at = L.filter((x) => x.sit !== 'Excluído'), tit = at.filter((x) => x.td === 'T'), dep = at.filter((x) => x.td !== 'T');
  const idades = at.map((x) => +x.id).filter((x) => x >= 0), media = idades.length ? sum(idades, (x) => x) / idades.length : 0;
  const fx = FAIXAS.map(([a, b, l]) => ({ l, n: idades.filter((x) => x >= a && x <= b).length })), mx = Math.max(1, ...fx.map((f) => f.n));
  const pl: Record<string, { n: number; v: number }> = {};
  at.forEach((x) => { const k = x.plano || 'Sem plano'; pl[k] ??= { n: 0, v: 0 }; pl[k].n++; pl[k].v += +x.tot || 0; });
  const incl = L.filter((x) => +x.pr > 0), exc = L.filter((x) => x.sit === 'Excluído');
  // famílias: titular primeiro e dependentes logo abaixo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: Record<string, any[]> = {};
  L.forEach((x) => { (g[x.fam || x.n] ??= []).push(x); });
  const q = vq.trim().toUpperCase();
  let grupos = Object.values(g).map((x) => x.sort((a, b) => (a.td === 'T' ? 0 : 1) - (b.td === 'T' ? 0 : 1)));
  if (q) grupos = grupos.filter((x) => x.some((y) => String(y.n).toUpperCase().includes(q)));
  grupos.sort((a, b) => String(a[0].n).localeCompare(String(b[0].n)));
  const dt = (s?: string) => (s ? s.split('-').reverse().join('/') : '—');
  return (
    <section className="card">
      <div className="card-h"><h2>Vidas</h2><span className="hint">Relação de {mesLabel(v.comp)}</span></div>
      <div className="facts" style={{ marginBottom: '1rem' }}>
        <span><b>{at.length}</b> ativas</span><span><b>{tit.length}</b> titulares</span><span><b>{dep.length}</b> dependentes</span>
        <span>idade média <b>{media.toFixed(0)}</b></span><span>mais velho <b>{idades.length ? Math.max(...idades) : '—'}</b></span>
        {incl.length > 0 && <span><b className="up">+{incl.length}</b> {incl.length === 1 ? 'inclusão' : 'inclusões'} no mês</span>}
        {exc.length > 0 && <span><b className="down">−{exc.length}</b> {exc.length === 1 ? 'exclusão' : 'exclusões'} no mês</span>}
      </div>
      <div className="grid g2" style={{ marginBottom: '1.1rem' }}>
        <div>
          <div className="kpi-l">Faixas etárias da ANS</div>
          <div className="faixas">{fx.map((f) => <div key={f.l} style={{ height: `${(f.n / mx * 100).toFixed(1)}%`, ...(f.l === '59+' ? { background: 'var(--s2)' } : {}) }} title={`${f.l} anos: ${vidas(f.n)}`}><span>{f.n || ''}</span></div>)}</div>
          <div className="faixas-l">{fx.map((f) => <span key={f.l}>{f.l}</span>)}</div>
        </div>
        <div>
          <div className="kpi-l" style={{ marginBottom: '.5rem' }}>Planos</div>
          <ul className="rows">
            {Object.entries(pl).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, o]) => (
              <li key={k}><b title={k}>{k.replace(/^\d+\s+/, '')}</b><span className="r">{vidas(o.n)}<small>R$ {brl(o.v)}</small></span></li>
            ))}
          </ul>
        </div>
      </div>
      <input className="busca" type="search" enterKeyHint="search" placeholder="Buscar beneficiário" aria-label="Buscar beneficiário" value={vq} onChange={(e) => setVq(e.target.value)} style={{ maxWidth: 280, marginBottom: '.6rem' }} />
      <div className="tbl scroll">
        <table>
          <thead><tr><th>Beneficiário</th><th>Parentesco</th><th className="num">Idade</th><th>Plano</th><th>Adesão</th><th className="num">Valor (R$)</th></tr></thead>
          <tbody>
            {grupos.flatMap((gr) => gr.map((x, i) => (
              <tr key={(x.fam || x.n) + i + x.n} className={x.sit === 'Excluído' ? 'excl' : ''}>
                <td style={i ? { paddingLeft: '1.6rem' } : undefined}><b>{x.n}</b>{+x.pr > 0 && <> <span className="pill p-info">inclusão</span></>}</td>
                <td>{x.par || (x.td === 'T' ? 'Titular' : 'Dependente')}</td>
                <td className="num">{x.id ?? '—'}</td>
                <td><span title={x.plano}>{String(x.plano || '—').replace(/^\d+\s+/, '').slice(0, 34)}</span></td>
                <td>{dt(x.ades)}</td>
                <td className="num">{brl(x.tot)}{+x.cop > 0 && <small>copart {brl(x.cop)}</small>}</td>
              </tr>
            )))}
            {!grupos.length && <tr><td colSpan={6} className="empty">Ninguém com esse nome.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Ordenado por família: o titular primeiro e os dependentes logo abaixo. Riscado = excluído no mês.</p>
    </section>
  );
}
