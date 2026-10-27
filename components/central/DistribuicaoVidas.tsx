'use client';
// Janela "Distribuição de vidas" da ficha da empresa (Agente Vidas, coleção vidasdist), como na Central
import { useEffect, useRef, useState } from 'react';
import { type Doc, type Item, brl, int, mesLabel, pct, sum, uniq, vidas } from '@/lib/central/modelo';

const FX0 = ['0–18', '19–23', '24–28', '29–33', '34–38', '39–43', '44–48', '49–53', '54–58', '59+'];
// visão por sexo: titular masculino / feminino e dependente masculino / feminino
const SXC: [string, string, string, number][] = [['TM', 'Tit. masc.', 'var(--s1)', 1], ['TF', 'Tit. fem.', 'var(--s5)', 1], ['DM', 'Dep. masc.', 'var(--s1)', 0.45], ['DF', 'Dep. fem.', 'var(--s5)', 0.45]];
const Dl = ({ v }: { v: number }) => (v > 0 ? <b className="up">+{v}</b> : v < 0 ? <b className="down">−{-v}</b> : <b className="hint" style={{ fontWeight: 600 }}>0</b>);
const Q = ({ c }: { c: string }) => <i style={{ display: 'inline-block', width: '.6rem', height: '.6rem', borderRadius: 2, background: c, margin: '0 .3rem 0 .6rem' }} />;

export function DistribuicaoVidas({ c, eid, nome, comp, faturas, fechar }: { c: string; eid: string; nome: string; comp?: string | null; faturas: Item[]; fechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [d, setD] = useState<Doc | null | { none: true }>(null);
  const [cur, setCur] = useState<string | null>(comp ?? null);
  const [sx, setSx] = useState(() => { try { return localStorage.getItem('vdSx') === '1'; } catch { return false; } });
  useEffect(() => {
    let vivo = true;
    fetch(`/api/central/${encodeURIComponent(c)}?col=vidasdist&doc=${encodeURIComponent(eid)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { dados: null })).then((j) => { if (vivo) setD(j.dados ?? { none: true }); })
      .catch(() => { if (vivo) setD({ none: true }); });
    return () => { vivo = false; };
  }, [c, eid]);
  const abrir = (el: HTMLDialogElement | null) => { ref.current = el; if (el && !el.open) el.showModal(); };
  const trocaSx = () => { const v = !sx; setSx(v); try { localStorage.setItem('vdSx', v ? '1' : '0'); } catch { /* sem armazenamento */ } };

  let sub = eid, corpo: React.ReactNode;
  if (!d) corpo = <p className="empty">Carregando a distribuição…</p>;
  else if ('none' in d && d.none) {
    const fits = faturas.filter((r) => r.eid === eid), ms = uniq(fits.map((r) => r.comp)).sort().reverse().slice(0, 6);
    corpo = <>
      <p className="msg aviso">O Agente Vidas ainda não tem a relação de vidas desta empresa. A fatura existe, mas a lista de beneficiários não foi baixada.</p>
      {ms.length > 0 && <p className="hint">Vidas informadas nas faturas: {ms.map((m) => mesLabel(m) + ' ' + int(sum(fits.filter((r) => r.comp === m), (r) => r.vidas))).join(' · ')}</p>}
    </>;
  } else {
    const D = d as Doc;
    sub = eid + ' · ' + (D.op || '') + (D.atualizadoEm ? ' · atualizado em ' + new Date(D.atualizadoEm).toLocaleDateString('pt-BR') : '');
    const all = Object.keys(D.comps || {}).sort(), comps = all.filter((k) => D.comps[k].at > 0);
    const k = cur && D.comps[cur] ? cur : D.ult || comps[comps.length - 1];
    const C: Doc = D.comps[k] || {}, FX: string[] = D.faixas || FX0;
    const stOk = !C.st || /^✅/.test(C.st), st = C.st ? String(C.st).replace(/^\S+\s/, '') : '';
    const seg = (
      <div className="seg" role="group" aria-label="Competência" style={{ alignSelf: 'flex-start' }}>
        {all.map((m) => <button key={m} type="button" aria-pressed={m === k} onClick={() => setCur(m)} style={D.comps[m].at > 0 ? undefined : { opacity: 0.55 }} title={D.comps[m].at > 0 ? undefined : 'Sem relação de vidas'}>{mesLabel(m)}</button>)}
      </div>
    );
    const alerta = !stOk && <p className="msg aviso"><b>{st}</b>{C.acao ? ' — ' + C.acao : ''}</p>;
    if (!(C.at > 0)) corpo = <>{seg}{alerta}<p className="empty">Sem relação de vidas nesta competência.{C.inf ? ` A fatura informa ${vidas(C.inf)}.` : ''}</p></>;
    else {
      const pi = comps.indexOf(k), pc: Doc | null = pi > 0 ? D.comps[comps[pi - 1]] : null, pl = mesLabel(comps[pi - 1]);
      const tot = FX.map((_, i) => (C.fT[i] || 0) + (C.fD[i] || 0)), ptot = pc ? FX.map((_, i) => (pc.fT[i] || 0) + (pc.fD[i] || 0)) : null, mx = Math.max(1, ...tot), n = C.at;
      const p59 = n ? tot[9] / n * 100 : 0;
      const botaoSx = C.sx && <button type="button" className="btn ghost sm" aria-pressed={sx} onClick={trocaSx}>{sx ? 'Visão simples' : 'Detalhar por sexo'}</button>;
      const T = (key: string) => sum(C.sx?.[key] || [], (x: number) => x);
      const fatos = (
        <div className="facts">
          <span><b>{int(n)}</b> vidas ativas</span><span><b>{int(C.T)}</b> titulares</span><span><b>{int(C.D)}</b> dependentes</span>
          {C.media != null && <span>idade média <b>{String(C.media).replace('.', ',')}</b></span>}
          {C.max != null && <span>de <b>{C.min}</b> a <b>{C.max}</b> anos</span>}
          <span><b>{pct(p59)}</b> com 59+</span>
          {C.sem ? <span><b>{C.sem}</b> sem idade</span> : null}
          {C.inf != null && <span>fatura informa <b>{int(C.inf)}</b></span>}
          {pc && <span>vs {pl}: <Dl v={n - pc.at} /></span>}
          {sx && C.sx && <><span><b>{T('TM') + T('DM')}</b> masculino</span><span><b>{T('TF') + T('DF')}</b> feminino</span>{T('TN') + T('DN') > 0 && <span><b>{T('TN') + T('DN')}</b> sem sexo identificado</span>}</>}
        </div>
      );
      let faixas: React.ReactNode;
      if (sx && C.sx) {
        const G = C.sx, ni = (i: number) => (G.TN[i] || 0) + (G.DN[i] || 0), temNI = [...G.TN, ...G.DN].some((x: number) => x > 0);
        const temSI = ['TM', 'TF', 'TN', 'DM', 'DF', 'DN'].some((key) => G[key][10] > 0);
        const rows = FX.map((f, i) => ({ l: f, i })).concat(temSI ? [{ l: 's/ idade', i: 10 }] : []);
        const tt = (i: number) => SXC.reduce((s, [key]) => s + (G[key][i] || 0), 0) + ni(i), mxs = Math.max(1, ...rows.map((r) => tt(r.i)));
        const cols = { ['--n' as string]: 4 + (temNI ? 1 : 0) } as React.CSSProperties;
        faixas = (
          <div>
            <div className="vd-sec">Faixas etárias da ANS por sexo {botaoSx}</div>
            <div className="vd-sec" style={{ justifyContent: 'flex-start', marginTop: '-.2rem' }}><span>{SXC.map(([key, l, col, op]) => <span key={key}><Q c={col} />{op < 1 ? <span style={{ opacity: op }} /> : null}{l}</span>)}{temNI && <><Q c="var(--faint)" />não identificado</>}</span></div>
            <div className="fxr sx h" style={cols}><span>Faixa</span><span />{SXC.map(([key, l]) => <span key={key} title={l}>{l.replace('Tit. ', 'T.').replace('Dep. ', 'D.').replace('masc.', '♂').replace('fem.', '♀')}</span>)}{temNI && <span title="sexo não identificado">?</span>}<span>Total</span></div>
            {rows.map((r) => (
              <div key={r.l} className="fxr sx" style={cols} title={`${r.l}: ${SXC.map(([key, l]) => l + ' ' + (G[key][r.i] || 0)).join(' · ')}${ni(r.i) ? ' · não identificado ' + ni(r.i) : ''}`}>
                <span className="fxl">{r.l}</span>
                <span className="fxb">{SXC.map(([key, , col, op]) => <i key={key} style={{ width: `${((G[key][r.i] || 0) / mxs * 100).toFixed(1)}%`, background: col, opacity: op }} />)}{ni(r.i) > 0 && <i style={{ width: `${(ni(r.i) / mxs * 100).toFixed(1)}%`, background: 'var(--faint)' }} />}</span>
                {SXC.map(([key]) => <span key={key}>{G[key][r.i] || 0}</span>)}{temNI && <span>{ni(r.i)}</span>}<span><b>{tt(r.i)}</b></span>
              </div>
            ))}
            <div className="fxr sx tot" style={cols}><span>Total</span><span />{SXC.map(([key]) => <span key={key}>{T(key)}</span>)}{temNI && <span>{T('TN') + T('DN')}</span>}<span>{rows.reduce((s, r) => s + tt(r.i), 0)}</span></div>
            <p className="note" style={{ margin: '.4rem 0 0' }}>Sexo pela operadora quando ela informa (Bradesco); nos demais, pelo parentesco ou pelo primeiro nome.</p>
          </div>
        );
      } else {
        faixas = (
          <div>
            <div className="vd-sec">Faixas etárias da ANS {botaoSx}<span><Q c="var(--accent)" />titulares <Q c="var(--s4)" />dependentes</span></div>
            <div className="fxr h"><span>Faixa</span><span /><span>Tit.</span><span>Dep.</span><span>Total</span><span>{pc ? 'vs ' + pl : '%'}</span></div>
            {FX.map((f, i) => (
              <div key={f} className="fxr" title={`${f} anos: ${vidas(tot[i])} (${pct(n ? tot[i] / n * 100 : 0)})`}>
                <span className="fxl">{f}</span>
                <span className="fxb"><i style={{ width: `${(C.fT[i] / mx * 100).toFixed(1)}%`, background: 'var(--accent)' }} /><i style={{ width: `${(C.fD[i] / mx * 100).toFixed(1)}%`, background: 'var(--s4)' }} /></span>
                <span>{C.fT[i]}</span><span>{C.fD[i]}</span><span><b>{tot[i]}</b></span><span>{ptot ? <Dl v={tot[i] - ptot[i]} /> : pct(n ? tot[i] / n * 100 : 0, 0)}</span>
              </div>
            ))}
            <div className="fxr tot"><span>Total</span><span /><span>{sum(C.fT, (x: number) => x)}</span><span>{sum(C.fD, (x: number) => x)}</span><span>{sum(tot, (x) => x)}</span><span>{ptot ? <Dl v={sum(tot, (x) => x) - sum(ptot, (x) => x)} /> : '100%'}</span></div>
          </div>
        );
      }
      const evm = Math.max(1, ...comps.map((m) => D.comps[m].at)), gcol = { gridTemplateColumns: `repeat(${comps.length},minmax(0,1fr))` };
      const planos: [string, number, number, number][] = C.planos || [];
      const mv: Doc[] = (D.mov || []).slice().sort((a: Doc, b: Doc) => String(b.comp).localeCompare(String(a.comp)));
      corpo = <>
        {seg}{alerta}{fatos}
        <div className="grid g2" style={{ gap: '1.25rem' }}>
          {faixas}
          <div>
            <div className="vd-sec">Vidas por competência <span>clique para trocar</span></div>
            <div className="vd-ev" style={gcol}>{comps.map((m) => <button key={m} type="button" className={m === k ? 'on' : ''} style={{ height: `${(D.comps[m].at / evm * 100).toFixed(1)}%` }} aria-label={`${mesLabel(m)}: ${vidas(D.comps[m].at)}`} onClick={() => setCur(m)}><span>{D.comps[m].at}</span></button>)}</div>
            <div className="vd-evl" style={gcol}>{comps.map((m) => <span key={m}>{mesLabel(m)}</span>)}</div>
          </div>
        </div>
        <div>
          <div className="vd-sec">Planos <span>{planos.length} {planos.length === 1 ? 'plano' : 'planos'}</span></div>
          <div className="tbl"><table style={{ minWidth: 0 }}>
            <thead><tr><th>Plano</th><th className="num">Tit.</th><th className="num">Dep.</th><th className="num">Total</th><th className="num">R$</th></tr></thead>
            <tbody>{planos.map((p, i) => <tr key={p[0] + i}><td><span title={p[0]}>{String(p[0]).replace(/^\d+\s+/, '').slice(0, 46)}</span></td><td className="num">{p[1]}</td><td className="num">{p[2]}</td><td className="num"><b>{p[1] + p[2]}</b></td><td className="num">{p[3] ? brl(p[3]) : '—'}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div>
          <div className="vd-sec">Entradas e saídas <span>mesma pessoa = mesmo CPF entre os meses</span></div>
          {mv.length ? (
            <div className="tbl"><table style={{ minWidth: 0 }}>
              <thead><tr><th>Mês</th><th className="num">Antes</th><th className="num">Entradas</th><th className="num">Saídas</th><th className="num">Agora</th><th>Quem</th></tr></thead>
              <tbody>{mv.map((m) => (
                <tr key={m.comp} style={m.comp === k ? { fontWeight: 700 } : undefined}>
                  <td>{mesLabel(m.comp)}<small>vs {mesLabel(m.de)}</small></td><td className="num">{m.antes}</td>
                  <td className="num">{m.ent ? <span className="up">+{m.ent}</span> : '0'}</td><td className="num">{m.sai ? <span className="down">−{m.sai}</span> : '0'}</td><td className="num">{m.agora}</td>
                  <td style={{ minWidth: 200 }}>
                    {m.ent || m.sai ? (
                      <details className="vd-mov"><summary className="lnk" style={{ fontSize: '.76rem' }}>ver nomes</summary>
                        {(m.entN || []).length > 0 && <div className="nm"><b className="up">Entraram:</b> {m.entN.join(', ')}</div>}
                        {(m.saiN || []).length > 0 && <div className="nm"><b className="down">Saíram:</b> {m.saiN.join(', ')}</div>}
                      </details>
                    ) : <span className="hint">sem mudança</span>}
                    {m.obs && <small style={{ color: 'var(--warn-fg)' }}>{m.obs}</small>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="empty">Só uma competência na base: o movimento aparece a partir do 2º mês.</p>}
        </div>
        <p className="note" style={{ margin: 0 }}>Só vidas ativas. Faixas pela idade informada pela operadora. Dados do Agente Vidas, a partir da relação de vidas de cada fatura.</p>
      </>;
    }
  }

  return (
    <dialog className="cx-modal vd-modal" ref={abrir} onClose={fechar} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-labelledby="vdt">
      <div className="vd">
        <div className="vd-h">
          <div><h3 id="vdt">Distribuição de vidas · {nome}</h3><p>{sub}</p></div>
          <button type="button" className="vd-x" aria-label="Fechar" onClick={() => ref.current?.close()}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        {corpo}
      </div>
    </dialog>
  );
}
