'use client';
// Comissões da Central de Agentes como tela do portal: mesmas contas (lib/central/modelo.ts) e a mesma Projeção (projecao.gen.js)
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { type Doc, type Item, FCOL, addMonth, brl, ckey, fam, famsIn, fatItems, int, isAg, kfmt, mesLabel, norm, pct, sum, uniq } from '@/lib/central/modelo';
import { type Credito, type Modelo, mergeCom, projAll } from '@/lib/central/projecao.gen';
import { plural } from '@/lib/formato';
import { Barras } from './Barras';

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESF = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const bruto = (c: Doc) => sum(c.ordens || [], (o: Doc) => o.bruto);
const wkStart = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
const d2 = (d: Date) => String(d.getUTCDate()).padStart(2, '0') + '/' + MES[d.getUTCMonth()];
const dm = (d: Date) => String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');

export type DadosComissoes = { faturas: Doc[]; comissoes: Doc[]; agenciamentos: Doc[]; implantacoes: Doc[]; projecoes: Doc[] };

export function Comissoes({ c, d, hoje }: { c: string; d: DadosComissoes; hoje: string }) {
  const [op, setOp] = useState('todas');
  const [mesSel, setMes] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const centralUrl = (pg: string) => `/corretora/${c}/${pg}`;
  const fichaUrl = (eid: string) => `/corretora/${c}/faturamento?emp=${encodeURIComponent(eid)}`;

  const base = useMemo(() => {
    const f = (x: Doc) => op === 'todas' || fam(x.operadora) === op;
    const faturas = d.faturas.filter(f), comissoes = mergeCom(d.comissoes.filter(f));
    const agcfg = Object.fromEntries(d.agenciamentos.map((a) => [a.id, a]));
    const [y, m, dd] = hoje.split('-').map(Number);
    const PM = projAll(faturas, comissoes, { agcfg, imps: d.implantacoes.filter((i) => op === 'todas' || fam(i.operadora) === op), hoje: new Date(y, m - 1, dd) });
    return { faturas, comissoes, PM };
  }, [d, op, hoje]);
  const { comissoes, PM } = base;
  const ops = famsIn(uniq(d.comissoes.map((x) => fam(x.operadora))));
  const comps = uniq(comissoes.map((x) => x.comp as string)).sort();
  const mes = mesSel && comps.includes(mesSel) ? mesSel : comps[comps.length - 1];
  const eidByName = (nome: string, o: string) => {
    const n = norm(nome); if (!n) return null;
    const r = fatItems(d.faturas).find((x) => norm(x.empresa) === n && (!o || fam(x.operadora) === fam(o)));
    return r ? r.eid : null;
  };

  const cabeca = (
    <div className="page-head">
      <div><h1>Comissões</h1><p>Quanto falta cair, quanto estava previsto e quanto caiu, e o que vai cair de cada seguradora. Datas de cada empresa na <a href={centralUrl('projecao')}>Projeção</a>. <a href={`/central/${c}#comissoes`}>Ver na Central antiga</a></p></div>
      <div className="filtros">
        {ops.length > 1 && (
          <div className="chips" role="group" aria-label="Seguradora">
            {['todas', ...ops].map((o) => (
              <button key={o} type="button" aria-pressed={op === o} onClick={() => setOp(o)}>{o === 'todas' ? 'Todas' : <><i style={{ background: FCOL[o] }} />{o}</>}</button>
            ))}
          </div>
        )}
        {comps.length > 0 && (
          <div className="seg" role="group" aria-label="Mês do extrato">
            {comps.map((m) => <button key={m} type="button" aria-pressed={m === mes} onClick={() => setMes(m)}>{mesLabel(m)}</button>)}
          </div>
        )}
      </div>
    </div>
  );
  if (!comps.length) return <div className="page cx">{cabeca}<p className="empty">Aparece depois da primeira rodada do Agente Comissão.</p></div>;

  const raw = d.comissoes.filter((x) => x.comp === mes && (op === 'todas' || fam(x.operadora) === op));
  const dm_ = comissoes.find((x) => x.comp === mes) || ({} as Doc), it: Item[] = dm_.itens || [], ords: Doc[] = dm_.ordens || [];
  const br = sum(ords, (o) => o.bruto), ap = sum(ords, (o) => o.apagar), deb = sum(ords, (o) => o.debcred), ag = it.filter(isAg), vit = it.filter((i) => !isAg(i));
  const extrasV = sum(dm_.extras || [], (e: Doc) => e.comissao);
  const empN = uniq(it.map((i) => fam(i.operadora) + '|' + norm(i.empresa))).length;
  const pi = comps.indexOf(mes), pd = pi > 0 ? comissoes.find((x) => x.comp === comps[pi - 1]) : null, pb = pd ? sum(pd.ordens || [], (o: Doc) => o.bruto) : 0, dl = pb ? (br - pb) / pb * 100 : 0;

  // mês corrente pela Projeção: o que já caiu e o que falta
  const cmNow = PM ? ckey(PM.hoje) : null;
  const faltaV = PM ? sum(PM.com.filter((x) => ckey(x.data) === cmNow && x.tipo !== 'real'), (x) => x.valor) : 0;

  // gráfico por mês (no mês atual, o que ainda vai cair fica empilhado em cima, em cor clara)
  const src = d.comissoes.filter((x) => op === 'todas' || fam(x.operadora) === op), ck = famsIn(uniq(src.map((x) => fam(x.operadora))));
  const colunas = comps.map((m) => {
    const v: Record<string, number> = {};
    src.filter((x) => x.comp === m).forEach((x) => { const f = fam(x.operadora); v[f] = (v[f] || 0) + bruto(x); });
    if (m === cmNow && faltaV) v['A cair'] = faltaV;
    const ia = src.filter((x) => x.comp === m).flatMap((x) => x.itens || []);
    return { key: m, label: mesLabel(m), title: 'Extrato de ' + mesLabel(m) + (v['A cair'] ? ' + o que falta cair' : ''), vals: v, extra: <>Agenciamento: R$ <b>{brl(sum(ia.filter(isAg), (i: Doc) => i.comissao))}</b></> };
  });

  // por empresa
  type E = { nome: string; op: string; f: string; eid: string | null; com: number; fat: Record<string, number>; taxas: Set<number>; ag: number | null; n: number; fv: number };
  const g: Record<string, E> = {};
  it.forEach((i) => {
    const k = fam(i.operadora) + '|' + norm(i.empresa);
    const e = (g[k] ??= { nome: i.empresa, op: i.operadora, f: fam(i.operadora), eid: i.eid || null, com: 0, fat: {}, taxas: new Set(), ag: null, n: 0, fv: 0 });
    e.com += +i.comissao || 0; e.fat[i.titulo] = +i.valorFat || 0; e.taxas.add(+i.taxa); e.n++;
    if (isAg(i)) e.ag = Math.max(e.ag || 0, +i.parcela || 0);
    if (i.eid) e.eid = i.eid;
  });
  const EL = Object.values(g).map((e) => Object.assign(e, { fv: sum(Object.values(e.fat), (x) => x), eid: e.eid || eidByName(e.nome, e.op) })).sort((a, b) => b.com - a.com);
  const sg: Record<string, number> = {}; raw.forEach((x) => { const f = fam(x.operadora); sg[f] = (sg[f] || 0) + bruto(x); });
  const st = Object.values(sg).reduce((a, b) => a + b, 0) || 1, segs = famsIn(Object.keys(sg)).sort((a, b) => sg[b] - sg[a]), smax = Math.max(1, ...segs.map((f) => sg[f]));
  const qq = q.trim().toUpperCase(), ER = qq ? EL.filter((e) => e.nome.toUpperCase().includes(qq)) : EL;
  const tx = (e: E) => { if (e.taxas.size !== 1) return 'várias'; const t = [...e.taxas][0]; return pct(t, t % 1 ? 2 : 0); };
  const ndiv = it.filter((i) => i.conf && i.conf !== 'OK' && i.conf !== 'Aceita').length;
  const gx: Record<string, { n: number; v: number; nomes: Set<string> }> = {};
  (dm_.extras || []).forEach((e: Doc) => { const k = e.tipo || 'Outros'; const o = (gx[k] ??= { n: 0, v: 0, nomes: new Set() }); o.n++; o.v += +e.comissao || 0; o.nomes.add(String(e.hist || '').split(' · ')[0]); });

  return (
    <div className="page cx">
      {cabeca}
      {PM && <MesAtual PM={PM} op={op} fotos={d.projecoes} />}
      {PM && <PrevistoCaiu PM={PM} op={op} fotos={d.projecoes} mes={mes} setMes={setMes} />}
      {PM && <ACair PM={PM} fichaUrl={fichaUrl} />}
      <Semanas PM={PM} mes={mes} op={op} fotos={d.projecoes} centralUrl={centralUrl} fichaUrl={fichaUrl} />

      <details className="fold">
        <summary><h2>Detalhes do extrato de {mesLabel(mes)}</h2><span className="hint">Comissão bruta, empresas, taxas, ordens de pagamento e lançamentos sem fatura</span></summary>
        <div className="fb cx-det">
      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Comissão bruta {mesLabel(mes)}</span><span className="kpi-v">R$ {brl(br)}</span>
          <span className="kpi-s">{pd && <><span className={dl >= 0 ? 'up' : 'down'}>{dl >= 0 ? '+' : '−'}{pct(Math.abs(dl))}</span> vs {mesLabel(comps[pi - 1])} · </>}pelo mês do extrato</span></div>
        <div className="kpi"><span className="kpi-l">A receber</span><span className="kpi-v">R$ {brl(ap)}</span><span className="kpi-s">{deb ? `depois de R$ ${brl(Math.abs(deb))} de débitos` : 'sem débitos'}</span></div>
        <div className="kpi"><span className="kpi-l">Vitalício</span><span className="kpi-v">R$ {brl(sum(vit, (i) => i.comissao))}</span><span className="kpi-s">{plural(vit.length, 'lançamento', 'lançamentos')}</span></div>
        <div className="kpi"><span className="kpi-l">Agenciamento</span><span className="kpi-v">R$ {brl(sum(ag, (i) => i.comissao))}</span><span className="kpi-s">{ag.length === 1 ? '1 parcela de contrato novo' : `${int(ag.length)} parcelas de contratos novos`}</span></div>
        <div className="kpi"><span className="kpi-l">Empresas pagantes</span><span className="kpi-v">{empN}</span><span className="kpi-s">{extrasV ? `+ R$ ${brl(extrasV)} sem fatura na base` : ''}</span></div>
      </div>

      <div className="grid g32">
        <section className="card">
          <div className="card-h"><h2>Comissão bruta por mês</h2><span className="hint">Pelo mês do extrato · clique num mês para abrir</span></div>
          <ul className="legenda">{ck.map((k) => <li key={k}><i style={{ background: FCOL[k] }} />{k}</li>)}{faltaV > 0 && <li><i style={{ background: 'var(--faint)' }} />A cair no mês</li>}</ul>
          <Barras colunas={colunas} chaves={faltaV ? [...ck, 'A cair'] : ck} sel={mes} onClick={setMes} aria="Comissão bruta por mês" h={240} />
        </section>
        <section className="card">
          <div className="card-h"><h2>Por seguradora</h2><span className="hint">{mesLabel(mes)}</span></div>
          {segs.length ? (
            <div className="hbars">
              {segs.map((f) => (
                <button key={f} type="button" className="hbar cx-hbar" onClick={() => setOp(f)}>
                  <span className="nm">{f}</span>
                  <span className="tr"><span style={{ width: `${Math.max(1, sg[f] / smax * 100).toFixed(1)}%`, background: FCOL[f] }} /></span>
                  <span className="v">R$ {brl(sg[f])}<small>{pct(sg[f] / st * 100)} do mês</small></span>
                </button>
              ))}
            </div>
          ) : <p className="empty">Sem extrato neste mês.</p>}
          <p className="note">Bruto <b>R$ {brl(br)}</b>{deb ? <> − débitos <b>R$ {brl(Math.abs(deb))}</b></> : null} = a receber <b>R$ {brl(ap)}</b></p>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Detalhe por empresa</h2><input className="busca" type="search" placeholder="Buscar empresa" aria-label="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260, marginLeft: 'auto' }} /></div>
        <div className="tbl scroll">
          <table>
            <thead><tr><th>Empresa</th><th>Seguradora</th><th>Tipo</th><th className="num">Faturado (R$)</th><th className="num">Taxa</th><th className="num">Comissão (R$)</th></tr></thead>
            <tbody>
              {ER.map((e) => (
                <tr key={e.f + e.nome}>
                  <td>{e.eid ? <Link href={fichaUrl(e.eid)}>{e.nome}</Link> : e.nome}{e.eid && <small>{e.eid}</small>}</td>
                  <td><span style={{ display: 'inline-block', width: '.55rem', height: '.55rem', borderRadius: 2, background: FCOL[e.f], marginRight: '.35rem' }} />{e.op}</td>
                  <td>{e.ag ? <><span className="ktag ag">Agenciamento</span><small>{e.ag}ª parcela</small></> : <span className="ktag vit">Vitalício</span>}</td>
                  <td className="num">{e.fv ? brl(e.fv) : '—'}</td>
                  <td className="num">{tx(e)}</td>
                  <td className="num"><b>{brl(e.com)}</b></td>
                </tr>
              ))}
              {ER.length ? (
                <tr className="tot"><td>Total</td><td /><td /><td className="num">{brl(sum(ER, (e) => e.fv))}</td><td /><td className="num">{brl(sum(ER, (e) => e.com))}</td></tr>
              ) : <tr><td colSpan={6} className="empty">Nenhuma empresa.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="note">{ndiv ? <>{plural(ndiv, 'lançamento', 'lançamentos')} com diferença na conferência. <a href={centralUrl('pendencias')}>Ver em Pendências</a></> : 'Todos os lançamentos do mês conferem com a fatura ou com o extrato.'}</p>
      </section>

      {dm_.obs && (
        <details className="fold"><summary><h2>Notas da conferência</h2><span className="hint">O que o Agente Comissão observou neste mês</span></summary><div className="fb"><p className="note" style={{ margin: 0 }}>{dm_.obs}</p></div></details>
      )}
      <details className="fold">
        <summary><h2>Ordens de pagamento</h2><span className="hint">{plural(ords.length, 'ordem', 'ordens')} em {mesLabel(mes)}</span></summary>
        <div className="fb"><div className="tbl scroll"><table>
          <thead><tr><th>Ordem</th><th>Data</th><th>Seguradora</th><th className="num">Bruto (R$)</th><th className="num">Débitos (R$)</th><th className="num">A pagar (R$)</th></tr></thead>
          <tbody>
            {ords.slice().sort((a, b) => String(a.dataISO).localeCompare(String(b.dataISO))).map((o, i) => (
              <tr key={String(o.op) + i}><td className="tab">{o.op}<small>{plural(+o.lanc || 0, 'lançamento', 'lançamentos')}</small></td><td>{o.data}</td><td>{o.operadora || ''}<small>{o.empresa || ''}</small></td>
                <td className="num">{brl(o.bruto)}</td><td className="num">{o.debcred ? brl(o.debcred) : '—'}</td><td className="num">{brl(o.apagar)}</td></tr>
            ))}
          </tbody>
        </table></div></div>
      </details>
      <details className="fold">
        <summary><h2>Lançamentos sem fatura na base</h2><span className="hint">Odonto, bônus, seguros gerais e faturas não baixadas</span></summary>
        <div className="fb"><ul className="rows">
          {Object.entries(gx).sort((a, b) => b[1].v - a[1].v).map(([k, o]) => (
            <li key={k}><span><b>{k}</b><small>{plural(o.n, 'lançamento', 'lançamentos')} · {[...o.nomes].slice(0, 4).join(', ')}{o.nomes.size > 4 ? '…' : ''}</small></span><span className="r">R$ {brl(o.v)}</span></li>
          ))}
          {!Object.keys(gx).length && <li><span className="empty">Nada fora das faturas neste mês.</span></li>}
        </ul></div>
      </details>
        </div>
      </details>
    </div>
  );
}

// ---------- blocos de cima: mês atual, previsto × caiu, a cair por seguradora ----------

// previsto de um mês = a primeira rodada da Projeção feita dentro do mês (meses[].total já soma o que caiu e o que falta)
type Foto = { geradoEm: string; mes: Doc };
function primeiraFoto(fotos: Doc[], m: string): Foto | null {
  const F = fotos.filter((f) => Array.isArray(f.meses) && String(f.geradoEm || '').slice(0, 7) === m).sort((a, b) => String(a.geradoEm).localeCompare(String(b.geradoEm)));
  for (const f of F) { const x = f.meses.find((y: Doc) => y.comp === m); if (x) return { geradoEm: f.geradoEm, mes: x }; }
  return null;
}
const previstoDe = (f: Foto | null, op: string, seg?: string) => {
  if (!f) return null;
  const k = seg ?? (op === 'todas' ? null : op);
  return k ? +(f.mes.porSeg?.[k]?.total || 0) : +f.mes.total || 0;
};
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

function MesAtual({ PM, op, fotos }: { PM: Modelo; op: string; fotos: Doc[] }) {
  const T = PM.hoje, cm = ckey(T), L = PM.com.filter((x) => ckey(x.data) === cm);
  const caiu = sum(L.filter((x) => x.tipo === 'real' && x.kind !== 'outro'), (x) => x.valor), F = L.filter((x) => x.tipo !== 'real'), falta = sum(F, (x) => x.valor);
  const at = F.filter((x) => x.atraso), tot = caiu + falta, w = (v: number) => (v / Math.max(1, tot) * 100).toFixed(2) + '%';
  const f1 = primeiraFoto(fotos, cm), p1 = previstoDe(f1, op);
  return (
    <section className="card">
      <div className="card-h"><h2>{MESF[T.getUTCMonth()][0].toUpperCase() + MESF[T.getUTCMonth()].slice(1)} até agora</h2><span className="hint">pela Projeção de hoje</span></div>
      <div className="cstack" role="img" aria-label={`Já caiu R$ ${brl(caiu)} de R$ ${brl(tot)} previstos`}><i style={{ width: w(caiu), background: 'var(--ok-fg)' }} /><i className="falta" style={{ width: w(falta) }} /></div>
      <div className="cleg">
        <span><i style={{ background: 'var(--ok-fg)' }} />Já caiu <b>R$ {brl(caiu)}</b></span>
        <span><i className="falta" />Falta cair <b>R$ {brl(falta)}</b></span>
        <span>Previsto hoje para o mês <b>R$ {brl(tot)}</b>{p1 != null && Math.abs(p1 - tot) >= 1 && <> (no dia {dataBR(f1!.geradoEm)} eram R$ {brl(p1)})</>}</span>
        {at.length > 0 && <span><span className="pill p-bad">R$ {brl(sum(at, (x) => x.valor))} em atraso</span> {plural(uniq(at.map((x) => x.eid || x.empresa)).length, 'empresa devia ter pago e não pagou', 'empresas deviam ter pago e não pagaram')}</span>}
      </div>
    </section>
  );
}

function PrevistoCaiu({ PM, op, fotos, mes, setMes }: { PM: Modelo; op: string; fotos: Doc[]; mes: string; setMes: (m: string) => void }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const cm = ckey(PM.hoje), R = PM.com.filter((x) => x.tipo === 'real' && x.kind !== 'outro');
  const primeiro = R.map((x) => ckey(x.data)).sort()[0] || cm;
  const meses: string[] = []; for (let m = cm; m >= primeiro && meses.length < 6; m = addMonth(m, -1)) meses.push(m);
  const ab = aberto ?? (meses.find((m) => m !== cm && primeiraFoto(fotos, m)) || null);
  const segsM = (m: string, f: Foto | null) => famsIn(uniq([...R.filter((x) => ckey(x.data) === m).map((x) => fam(x.op)), ...Object.keys(f?.mes.porSeg || {})])).filter((s) => op === 'todas' || s === op);
  const Dif = ({ p, c, atual, falta }: { p: number | null; c: number; atual: boolean; falta: number }) =>
    p == null ? <td className="num hint">—</td> : atual ? <td className="num hint">ainda faltam {brl(falta)}</td>
      : <td className="num"><span className={c - p >= 0 ? 'up' : 'down'}>{c - p >= 0 ? '+' : '−'}{brl(Math.abs(c - p))}</span></td>;
  return (
    <section className="card">
      <div className="card-h"><h2>Previsto × caiu, mês a mês</h2><span className="hint">Previsto = primeira projeção do mês · clique no mês para abrir por seguradora</span></div>
      <div className="tbl scroll">
        <table className="pxc">
          <thead><tr><th>Mês</th><th className="num">Previsto (R$)</th><th className="num">Caiu (R$)</th><th className="num">Diferença (R$)</th><th className="num">% que caiu</th></tr></thead>
          <tbody>
            {meses.flatMap((m) => {
              const f = primeiraFoto(fotos, m), p = previstoDe(f, op), Rm = R.filter((x) => ckey(x.data) === m), c = sum(Rm, (x) => x.valor), atual = m === cm;
              const falta = atual ? sum(PM.com.filter((x) => ckey(x.data) === m && x.tipo !== 'real'), (x) => x.valor) : 0, open = ab === m;
              const linhas = [
                <tr key={m} className={m === mes ? 'sel' : ''}>
                  <td><button type="button" className="lnk" aria-expanded={open} onClick={() => { setAberto(open ? '' : m); setMes(m); }}>{open ? '▾' : '▸'} {mesLabel(m)}</button>{atual && <> <span className="pill p-info">em andamento</span></>}</td>
                  <td className="num">{p != null ? brl(p) : <span className="hint">sem projeção guardada</span>}</td>
                  <td className="num">{brl(c)}</td>
                  <Dif p={p} c={c} atual={atual} falta={falta} />
                  <td className="num">{p ? pct(c / p * 100, 0) : '—'}</td>
                </tr>,
              ];
              if (open) segsM(m, f).forEach((sg) => {
                const ps = f ? previstoDe(f, op, sg) : null, cs = sum(Rm.filter((x) => fam(x.op) === sg), (x) => x.valor);
                const fs = atual ? sum(PM.com.filter((x) => ckey(x.data) === m && x.tipo !== 'real' && fam(x.op) === sg), (x) => x.valor) : 0;
                linhas.push(
                  <tr key={m + sg} className="sub">
                    <td><i className="sq" style={{ background: FCOL[sg] }} />{sg}</td>
                    <td className="num">{ps != null ? brl(ps) : '—'}</td><td className="num">{brl(cs)}</td>
                    <Dif p={ps} c={cs} atual={atual} falta={fs} />
                    <td className="num">{ps ? pct(cs / ps * 100, 0) : '—'}</td>
                  </tr>,
                );
              });
              return linhas;
            })}
          </tbody>
        </table>
      </div>
<p className="note">O previsto de cada mês é a primeira projeção guardada dentro dele. Mês sem projeção guardada mostra só o que caiu. Caiu = comissão das faturas, pela data da ordem de pagamento (bônus, odonto e seguros sem fatura ficam nos Detalhes do extrato).</p>
    </section>
  );
}

function ACair({ PM, fichaUrl }: { PM: Modelo; fichaUrl: (e: string) => string }) {
  const T = PM.hoje, cm = ckey(T), L = PM.com.filter((x) => ckey(x.data) === cm);
  const segs = famsIn(uniq(L.map((x) => fam(x.op)))).map((sg) => {
    const X = L.filter((x) => fam(x.op) === sg), F = X.filter((x) => x.tipo !== 'real').sort((a, b) => +a.data - +b.data);
    return { sg, caiu: sum(X.filter((x) => x.tipo === 'real' && x.kind !== 'outro'), (x) => x.valor), falta: sum(F, (x) => x.valor), F, at: sum(F.filter((x) => x.atraso), (x) => x.valor), n: uniq(F.map((x) => x.eid || x.empresa)).length };
  }).filter((s) => s.falta > 0.005 || s.caiu > 0.005).sort((a, b) => b.falta - a.falta);
  const mx = Math.max(1, ...segs.map((s) => s.caiu + s.falta));
  if (!segs.length) return null;
  return (
    <section className="card">
      <div className="card-h"><h2>O que falta cair em {MESF[T.getUTCMonth()]}, por seguradora</h2><span className="hint">Clique na seguradora para ver as empresas e as datas</span></div>
      <div className="acair">
        {segs.map((s) => (
          <details key={s.sg} className="acs">
            <summary>
              <span className="nm"><i className="sq" style={{ background: FCOL[s.sg] }} />{s.sg}<small>{s.n ? `${plural(s.n, 'empresa', 'empresas')} · próxima ${dm(s.F[0].data)}` : 'nada mais a cair'}</small></span>
              <span className="trk"><i style={{ width: `${(s.caiu / mx * 100).toFixed(2)}%`, background: 'var(--ok-fg)' }} /><i style={{ width: `${(s.falta / mx * 100).toFixed(2)}%`, background: FCOL[s.sg] }} /></span>
              <span className="r">R$ {brl(s.falta)}<small>{s.caiu > 0.005 ? `já caiu R$ ${brl(s.caiu)}` : 'nada caiu ainda'}{s.at > 0.005 ? ` · R$ ${brl(s.at)} em atraso` : ''}</small></span>
            </summary>
            <ul className="rows">
              {s.F.map((x, i) => (
                <li key={x.empresa + i}>
                  <span><b>{x.eid ? <Link href={fichaUrl(x.eid)}>{x.empresa}</Link> : x.empresa}</b><small>{dm(x.data)}{x.atraso ? ' · em atraso' : ''} · {x.kind === 'ag' ? 'agenciamento' : 'vitalício'}</small></span>
                  <span className="r">R$ {brl(x.valor)}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <p className="note">Barra: verde = já caiu no mês, cor da seguradora = falta cair.</p>
    </section>
  );
}

type Semana = {
  key: string; dias: string; title: string; a: Date; fim: Date; now: boolean; futura: boolean; caiu: Credito[]; f: Doc | null; dentroF: boolean;
  prev: Credito[]; faltam: Credito[]; fora: Credito[]; aCair: Credito[];
};

// comissão paga por semana do mês escolhido (data da ordem de pagamento), nas mesmas semanas da Projeção,
// conferida com a última rodada do Agente Projeção feita antes da semana começar
function Semanas({ PM, mes, op, fotos, centralUrl, fichaUrl }: { PM: Modelo | null; mes: string; op: string; fotos: Doc[]; centralUrl: (p: string) => string; fichaUrl: (e: string) => string }) {
  const [sel, setSel] = useState<string | null>(null);
  if (!PM) return <section className="card"><div className="card-h"><h2>Comissão paga por semana</h2></div><p className="empty">Aparece depois da primeira rodada do Agente Comissão.</p></section>;
  const T = PM.hoje;
  const okOp = (x: Credito) => op === 'todas' || fam(x.op) === op, chave = (x: Credito) => (x.eid || norm(x.empresa)) + '|' + fam(x.op);
  const R = PM.com.filter((x) => x.tipo === 'real'), P = PM.com.filter((x) => x.tipo !== 'real');
  const F = fotos.filter((f) => Array.isArray(f.itens)).sort((a, b) => String(a.geradoEm).localeCompare(String(b.geradoEm)));
  const [ya, ma] = mes.split('-').map(Number), m0 = new Date(Date.UTC(ya, ma - 1, 1)), m1 = new Date(Date.UTC(ya, ma, 0));
  const weeks: Semana[] = [];
  for (let w = wkStart(m0); w <= m1; w = new Date(w.getTime() + 7 * 864e5)) {
    const a = w < m0 ? m0 : w, e0 = new Date(w.getTime() + 6 * 864e5), b = e0 > m1 ? m1 : e0, fim = new Date(b.getTime() + 864e5 - 1);
    const dentro = (x: { data: Date }) => x.data >= a && x.data <= fim;
    // rodada da Projeção: a última antes da semana começar (00h de Brasília); sem ela, a primeira de dentro da semana
    const ini = new Date(w.getTime() + 3 * 3600e3), antes = F.filter((f) => new Date(f.geradoEm) < ini).pop(), f = antes || F.find((f) => new Date(f.geradoEm) <= fim) || null;
    const prev: Credito[] = f ? f.itens.map((i: Doc) => ({ ...i, data: new Date(i.data + 'T00:00:00Z') })).filter((x: Credito) => okOp(x) && dentro(x)) : [];
    const caiu = R.filter(dentro), desde = f ? new Date(String(f.geradoEm).slice(0, 10) + 'T00:00:00Z') : a;
    const kc = new Set(R.filter((x) => x.data >= desde && x.data <= fim).map(chave)), kp = new Set(prev.map(chave));
    weeks.push({
      key: a.toISOString().slice(0, 10), dias: +a === +b ? d2(a).slice(0, 2) : d2(a).slice(0, 2) + '–' + d2(b).slice(0, 2), title: 'Semana de ' + d2(a) + ' a ' + d2(b), a, fim,
      now: T >= a && T <= fim, futura: a > T, caiu, f, dentroF: !antes, prev, faltam: prev.filter((x) => !kc.has(chave(x))), fora: caiu.filter((x) => x.kind !== 'outro' && !kp.has(chave(x))), aCair: P.filter(dentro),
    });
  }
  const key = sel && weeks.find((w) => w.key === sel) ? sel : (weeks.find((w) => w.now) || weeks.filter((w) => w.caiu.length).pop() || weeks[0]).key;
    const w = weeks.find((x) => x.key === key)!;
  const vC = sum(w.caiu, (x) => x.valor), vP = sum(w.prev, (x) => x.valor), fD = w.f ? new Date(w.f.geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const df = vC - vP;

  const Linha = ({ x, pill, why }: { x: Credito; pill: [string, string]; why: string }) => (
    <li><details className="prow"><summary>
      <span className={'date' + (pill[1] === 'p-bad' ? ' late' : '')}>{String(x.data.getUTCDate()).padStart(2, '0')}<br />{MES[x.data.getUTCMonth()]}</span>
      <span style={{ minWidth: 0 }}><b>{x.empresa}</b><small>{fam(x.op)}</small></span>
      <span className="r">R$ {brl(x.valor)}<small><span className={`pill ${pill[1]}`}>{pill[0]}</span></small></span>
    </summary><div className="pwhy">{why}{x.eid && <><br /><Link className="lnk" href={fichaUrl(x.eid)}>Abrir a empresa</Link></>}</div></details></li>
  );
  const Lista = ({ L, row }: { L: Credito[]; row: (x: Credito, i: number) => React.ReactNode }) => {
    const o = L.slice().sort((a, b) => b.valor - a.valor), top = o.slice(0, 8), rest = o.slice(8);
    return <>
      <ul className="rows plist">{top.map(row)}</ul>
      {rest.length > 0 && <details className="more"><summary>+ {rest.length} {rest.length > 1 ? 'menores' : 'menor'} · R$ {brl(sum(rest, (x) => x.valor))}</summary><ul className="rows plist">{rest.map(row)}</ul></details>}
    </>;
  };
  const k = (x: Credito, i: number) => x.empresa + x.op + +x.data + i;

  return (
    <section className="card">
      <div className="card-h"><h2>Por semana · {MESF[ma - 1]}</h2><span className="hint">Verde = caiu · cor clara = falta cair · clique na semana</span></div>
      <div className="csems" style={{ gridTemplateColumns: `repeat(${weeks.length},minmax(0,1fr))` }}>
        {weeks.map((s) => {
          const on = key === s.key, vc = sum(s.caiu, (x) => x.valor), va = s.futura || s.now ? sum(s.aCair, (x) => x.valor) : 0, t = vc + va, pv = sum(s.prev, (x) => x.valor), nf = s.now ? 0 : s.faltam.length;
          const txt = !t && !nf ? '' : s.futura ? 'previsto' : s.now ? `caiu ${kfmt(vc)} · falta ${kfmt(va)}` : nf ? `${plural(nf, 'empresa não pagou', 'empresas não pagaram')}` : pv ? `${pct(vc / pv * 100, 0)} do previsto` : 'caiu';
          return (
            <button key={s.key} type="button" className={'csem' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setSel(s.key)}
              aria-label={`${s.title}: caiu R$ ${brl(vc)}${va ? ', falta cair R$ ' + brl(va) : ''}`}>
              <span className="d">{s.dias}/{String(s.a.getUTCMonth() + 1).padStart(2, '0')}{s.now ? ' · esta semana' : ''}</span>
              <span className="v">{t ? 'R$ ' + kfmt(t) : '—'}</span>
              <span className="mini"><i style={{ width: `${(vc / Math.max(1, t) * 100).toFixed(1)}%`, background: 'var(--ok-fg)' }} /><i className="falta" style={{ width: `${(va / Math.max(1, t) * 100).toFixed(1)}%` }} /></span>
              <span className={'h' + (nf ? ' late' : '')}>{txt}</span>
            </button>
          );
        })}
      </div>
      <div className="day-h" style={{ marginTop: '1rem' }}>
        <span>{w.title}{w.now ? ' (esta semana)' : ''}</span>
        <span>{w.futura ? 'Previsto R$ ' + brl(sum(w.aCair, (x) => x.valor)) : `Caiu R$ ${brl(vC)} · ${plural(w.caiu.length, 'crédito', 'créditos')}`}</span>
      </div>
      {w.futura ? (
        <p className="note">A semana ainda não chegou. A Projeção prevê R$ {brl(sum(w.aCair, (x) => x.valor))} em {plural(w.aCair.length, 'crédito', 'créditos')}. <a href={centralUrl('projecao')}>Abrir projeção</a></p>
      ) : <>
        {w.f ? (
          <div className="cw-cmp">
            <span>Previsto na rodada de {fD}{w.dentroF ? ' (já dentro da semana)' : ''}: <b>R$ {brl(vP)}</b></span><span>Caiu: <b>R$ {brl(vC)}</b></span>
            <span>{w.now ? 'Até hoje' : 'Diferença'}: <b className={df >= 0 ? 'up' : 'down'}>{df >= 0 ? '+' : '−'}R$ {brl(Math.abs(df))}</b>{vP ? ` (${pct(vC / vP * 100, 0)} do previsto)` : ''}</span>
          </div>
        ) : <p className="note">Nenhuma rodada da Projeção com a data de cada empresa foi guardada antes desta semana, então não dá para comparar com o previsto. As rodadas guardam isso desde 27/10/2026.</p>}
        {w.caiu.length ? (
          <Lista L={w.caiu} row={(x, i) => { const fora = !!w.f && w.fora.includes(x); return <Linha key={k(x, i)} x={x} pill={fora ? ['Fora da previsão', 'p-info'] : ['Caiu', 'p-ok']} why={(x.how || '') + (x.quando ? ' · ' + x.quando : '') + (fora ? `. A rodada de ${fD} não previa esta empresa nesta semana (caiu adiantada, atrasada ou é nova).` : '')} />; }} />
        ) : <p className="empty">Nada caiu nesta semana.</p>}
        {w.f && w.faltam.length > 0 && <>
          <p className="cw-sub">{w.now ? 'Previsto para esta semana e ainda não caiu' : 'Previsto e não caiu'} · {plural(w.faltam.length, 'empresa', 'empresas')} · R$ {brl(sum(w.faltam, (x) => x.valor))}</p>
          <Lista L={w.faltam} row={(x, i) => <Linha key={k(x, i)} x={x} pill={w.now && x.data >= T ? ['A cair', 'p-info'] : ['Não caiu', 'p-bad']} why={`A rodada de ${fD} previa este crédito para ${dm(x.data)}${x.atraso ? ' (já estava em atraso)' : ''}. Ainda não apareceu em nenhum extrato depois dela.`} />} />
        </>}
      </>}
    </section>
  );
}
