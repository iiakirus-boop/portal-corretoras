'use client';
// Pendências da Central de Agentes como tela do portal: o que precisa de você, o que os agentes estão fazendo e o fechamento de cada mês
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { type Doc, brl, mesLabel, uniq } from '@/lib/central/modelo';
import { mergeCom } from '@/lib/central/projecao.gen';
import { gravar, registrar } from './gravar';

type Linha = { lvl: 'falta' | 'conf' | 'info'; t: string };
const CORTE = 230;

// faturas que os extratos de comissão pagaram mas não estão na base, por competência (comFora da Central)
function comFora(faturas: Doc[], comissoes: Record<string, any>[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const all = faturas.flatMap((d) => (d.itens || []).map((r: Doc) => ({ m: d.comp as string, eid: r.eid, t: +r.titulo })));
  const titBase = new Set(all.map((x) => String(x.t)));
  const ms = uniq(faturas.map((f) => f.comp as string)).sort();
  const med: Record<string, number> = {};
  ms.forEach((m) => { const t = all.filter((x) => x.m === m).map((x) => x.t).sort((a, b) => a - b); med[m] = t.length ? t[Math.floor(t.length / 2)] : Infinity; });
  const out: Record<string, Doc[]> = {}, seen = new Set<number>();
  comissoes.forEach((c) => (c.extras || []).forEach((e: Doc) => {
    if (!/ainda não baixada/i.test(e.tipo || '')) return;
    const t = +e.titulo; if (!t || titBase.has(String(t)) || seen.has(t)) return; seen.add(t);
    const own = all.filter((x) => x.eid === e.eid).sort((a, b) => a.t - b.t); let m: string | null = null;
    if (own.length) { if (t >= own[0].t) own.forEach((x) => { if (t > x.t) m = x.m; }); }
    else { ms.forEach((x) => { if (t >= med[x]) m = x; }); if (!m && t >= Math.min(...all.map((x) => x.t))) m = ms[0]; }
    (out[m || 'antes'] ??= []).push({ extrato: c.comp, ...e });
  }));
  return out;
}

// situação de fechamento de uma competência (statusMes da Central)
function statusMes(m: string, faturas: Doc[], fora: Record<string, Doc[]>) {
  const docs = faturas.filter((f) => f.comp === m), it: Doc[] = docs.flatMap((d) => d.itens || []), parcial = docs.some((d) => d.parcial);
  const pend: Doc[] = docs.flatMap((d) => (d.pendentes || []).map((p: Doc) => ({ tipo: parcial ? 'nao_emitida' : 'sem_fatura', ...p })));
  const falt = pend.filter((p) => p.tipo === 'faltando'), naoEm = pend.filter((p) => p.tipo === 'nao_emitida'), semF = pend.filter((p) => p.tipo === 'sem_fatura'), confF = pend.filter((p) => p.tipo === 'confirmado');
  const valDiv = it.filter((r) => r.confValor === 'Divergência'), semV = it.filter((r) => r.confValor === 'Sem vidas');
  const vidDiv = it.filter((r) => r.confValor === 'OK' && r.confVidas !== 'OK' && !r.verificado), vidVer = it.filter((r) => r.confValor === 'OK' && r.confVidas !== 'OK' && r.verificado);
  const titFalt = new Set(falt.map((p) => String(p.titulo)));
  const cxNovo = (fora[m] || []).filter((e) => !titFalt.has(String(e.titulo)));
  const ms = uniq(faturas.map((f) => f.comp as string)).sort(), cxAnt = m === ms[0] ? fora.antes || [] : [];
  const s = (n: number, um: string, v: string) => n + ' ' + (n > 1 ? v : um);
  const nome = (x: Doc) => String(x.empresa).split(' (')[0];
  const L: Linha[] = [];
  falt.forEach((p) => L.push({ lvl: 'falta', t: `Falta baixar: ${p.empresa}${p.titulo ? ' (fatura ' + p.titulo + ')' : ''} — ${p.motivo}` }));
  valDiv.forEach((r) => L.push({ lvl: 'falta', t: `Valor não bate: ${r.empresa} (fatura ${r.titulo})${r.obs ? ' — ' + r.obs : ''}` }));
  cxNovo.forEach((e) => L.push({ lvl: 'falta', t: `Falta baixar: ${e.hist} (fatura ${e.titulo}) — a Porto pagou R$ ${brl(e.comissao)} de comissão dela no extrato de ${mesLabel(e.extrato)}, mas a fatura não está na base` }));
  naoEm.forEach((p) => L.push({ lvl: 'conf', t: `Ainda não emitida: ${p.empresa} — ${p.motivo}` }));
  semF.forEach((p) => L.push({ lvl: 'conf', t: `Confirmar que não houve fatura: ${p.empresa} (${p.eid}) — ${p.motivo}` }));
  if (confF.length) L.push({ lvl: 'info', t: `Sem fatura no mês, conferido pela data de adesão: ${confF.map((p) => nome(p) + ' (' + p.motivo + ')').join('; ')}` });
  if (semV.length) L.push({ lvl: 'info', t: `Sem relação de vidas para conferir o valor em ${s(semV.length, 'fatura', 'faturas')}: ${semV.map(nome).slice(0, 6).join(', ')}${semV.length > 6 ? '…' : ''}` });
  if (vidVer.length) L.push({ lvl: 'info', t: `Vidas do resumo diferentes do TXT em ${s(vidVer.length, 'fatura', 'faturas')}, já verificado pela equipe (valor confere)` });
  if (vidDiv.length) L.push({ lvl: 'conf', t: `Vidas do resumo do portal não batem com o TXT em ${s(vidDiv.length, 'fatura', 'faturas')} (valor confere): ${vidDiv.map(nome).join(', ')}` });
  if (cxAnt.length) L.push({ lvl: 'info', t: `Antes da base: os extratos de comissões pagaram ${s(cxAnt.length, 'fatura', 'faturas')} de meses anteriores a ${mesLabel(m)}, que não estão na base (R$ ${brl(cxAnt.reduce((a, e) => a + (+e.comissao || 0), 0))} de comissão): ${cxAnt.map((e) => String(e.hist || '').split(' ').slice(0, 2).join(' ')).join(', ')}` });
  let st: [string, string];
  if (falt.length || valDiv.length || cxNovo.length) st = ['Incompleto', 'p-bad'];
  else if (naoEm.length) st = ['Em andamento', 'p-info'];
  else if (semF.length || vidDiv.length) st = ['Conferido com ressalvas', 'p-warn'];
  else st = ['Conferido', 'p-ok'];
  return { st, L, n: it.length, v: it.reduce((a, r) => a + (+r.valor || 0), 0) };
}

export type DadosPendencias = { faturas: Doc[]; comissoes: Doc[]; tarefas: Doc[]; agentes: Doc[]; eventos: Doc[] };

export function Pendencias({ c, d, podeEditar, usuario, nomes, agente = null }: { c: string; d: DadosPendencias; podeEditar: boolean; usuario: string; nomes: Record<string, string>; agente?: string | null }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<string | null>(agente);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nomeAg = (k: string) => d.agentes.find((a) => a.id === k)?.nome || k;
  const usados = uniq(d.tarefas.map((t) => t.agente as string));
  const vis = d.tarefas.filter((t) => !filtro || t.agente === filtro);
  const P = vis.filter((t) => t.coluna === 'precisa').sort((a, b) => String(a.criadaEm).localeCompare(String(b.criadaEm)));
  const A = vis.filter((t) => t.coluna === 'andamento');
  const C = vis.filter((t) => t.coluna === 'concluido').sort((a, b) => String(b.concluidaEm || '').localeCompare(String(a.concluidaEm || ''))).slice(0, 12);
  const fora = comFora(d.faturas, mergeCom(d.comissoes));
  const ms = uniq(d.faturas.map((f) => f.comp as string)).sort().reverse();
  const ev = d.eventos.flatMap((x) => x.itens || []).filter((e: Doc) => !filtro || e.agente === filtro).sort((a: Doc, b: Doc) => String(b.ts).localeCompare(String(a.ts))).slice(0, 30);
  const hojeTxt = new Date().toDateString();

  const resolver = async (t: Doc) => {
    const now = new Date().toISOString(); setSalvando(t.id); setErro(null);
    try {
      await gravar(c, 'update', 'tarefas', t.id, { coluna: 'concluido', concluidaEm: now, concluidaPor: usuario });
      await registrar(c, t.agente, t.textoAoResolver || `teve a tarefa "${t.titulo}" marcada como resolvida.`, now);
      router.refresh();
    } catch { setErro(t.id); }
    setSalvando(null);
  };
  const Cartao = ({ t, acao }: { t: Doc; acao?: boolean }) => (
    <article className="tcard">
      <span className="tag">{nomeAg(t.agente)}</span><h4>{t.titulo}</h4><p>{t.detalhe || ''}</p><span className="who">{t.quem || ''}</span>
      {acao && t.acao && (
        <div><button className="btn ghost" type="button" disabled={!podeEditar || salvando === t.id} title={podeEditar ? undefined : 'Só quem pode editar a Central marca tarefas'} onClick={() => resolver(t)}>
          {erro === t.id ? 'Não salvou. Tente de novo' : salvando === t.id ? 'Salvando…' : t.acao}
        </button></div>
      )}
      {t.coluna === 'concluido' && t.concluidaPor && <span className="done-by">Resolvido por {nomes[t.concluidaPor] || 'alguém da equipe'}</span>}
    </article>
  );
  const Itens = ({ L }: { L: Linha[] }) => (
    <ul>{L.map((x, i) => <li key={i} className={x.lvl === 'falta' ? 'falta' : undefined} title={x.t.length > CORTE ? x.t : undefined}>{x.t.length > CORTE ? x.t.slice(0, 220).replace(/,[^,]*$/, '') + '…' : x.t}</li>)}</ul>
  );
  const s0 = ms.length ? statusMes(ms[0], d.faturas, fora) : null;

  return (
    <div className="page cx">
      <div className="page-head">
        <div><h1>Pendências</h1><p>O que precisa de você, o que os agentes estão fazendo e o que impede cada mês de fechar. <a href={`/central/${c}#pendencias`}>Ver na Central antiga</a></p></div>
        <div className="filtros">
          <div className="chips" role="group" aria-label="Agente">
            <button type="button" aria-pressed={!filtro} onClick={() => setFiltro(null)}>Todos</button>
            {d.agentes.filter((a) => usados.includes(a.id)).map((a) => <button key={a.id} type="button" aria-pressed={filtro === a.id} onClick={() => setFiltro(a.id)}>{String(a.nome || a.id).replace(/^Agente /, '')}</button>)}
          </div>
        </div>
      </div>

      <section><h2 className="sec-t">Precisa de você <span className="pill p-warn">{P.length}</span></h2>
        <div className="tcards">{P.length ? P.map((t) => <Cartao key={t.id} t={t} acao />) : <p className="empty">Nada esperando por você.</p>}</div></section>
      <section><h2 className="sec-t">Em andamento <span className="pill p-info">{A.length}</span></h2>
        <div className="tcards">{A.length ? A.map((t) => <Cartao key={t.id} t={t} />) : <p className="empty">Nenhuma tarefa em andamento.</p>}</div></section>

      <section className="card">
        {s0 ? <>
          <div className="card-h fech-h"><h2>Fechamento de {mesLabel(ms[0])}</h2><span className={`pill ${s0.st[1]}`}>{s0.st[0]}</span><span className="hint">{s0.n} faturas · R$ {brl(s0.v)}</span></div>
          <div className="fr fnow">
            {s0.L.some((x) => x.lvl !== 'info') ? <Itens L={s0.L.filter((x) => x.lvl !== 'info')} /> : <span className="hint">Nada impedindo o fechamento.</span>}
            {s0.L.some((x) => x.lvl === 'info') && (() => { const I = s0.L.filter((x) => x.lvl === 'info'); return <details className="more"><summary>+ {I.length} {I.length > 1 ? 'observações' : 'observação'} sem pendência</summary><Itens L={I} /></details>; })()}
          </div>
        </> : <p className="empty">Sem faturas na base.</p>}
      </section>

      <details className="fold"><summary><h2>Meses anteriores</h2><span className="hint">Fechamento das outras competências</span></summary>
        <div className="fb">{ms.length > 1 ? ms.slice(1).map((m) => {
          const s = statusMes(m, d.faturas, fora);
          return (
            <div className="fr" key={m}>
              <div className="fr-m"><b>{mesLabel(m)}</b><span className={`pill ${s.st[1]}`}>{s.st[0]}</span><span className="tot">{s.n} faturas · R$ {brl(s.v)}</span></div>
              <div>{s.L.length ? <Itens L={s.L} /> : <span className="hint">Todas as faturas baixadas, valores e vidas batendo.</span>}</div>
            </div>
          );
        }) : <p className="empty">Nenhum mês anterior.</p>}</div>
      </details>
      <details className="fold"><summary><h2>Concluídas recentemente</h2><span className="hint">{C.length} mais recentes</span></summary>
        <div className="fb"><div className="tcards">{C.length ? C.map((t) => <Cartao key={t.id} t={t} />) : <p className="empty">Nada concluído ainda.</p>}</div></div>
      </details>
      <details className="fold"><summary><h2>Linha do tempo</h2><span className="hint">O que cada agente fez</span></summary>
        <div className="fb"><ol className="feed">
          {ev.length ? ev.map((e: Doc, i: number) => {
            const dt = new Date(e.ts), hj = dt.toDateString() === hojeTxt;
            return <li key={e.ts + i}><time suppressHydrationWarning>{hj ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</time><span><b>{nomeAg(e.agente)}</b> {e.texto}</span></li>;
          }) : <li><span /><span className="empty">Nada registrado ainda.</span></li>}
        </ol></div>
      </details>
    </div>
  );
}
