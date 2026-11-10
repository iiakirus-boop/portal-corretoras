import Link from 'next/link';
import { cliente } from '@/lib/servidor';
import { CONFERENCIA_TIPO, competencia, data, moeda, quando, SEGURADORA, seg } from '@/lib/formato';
import { desfazerExclusao, excluirRegistro, ignorarAviso, ligarEmpresa, reabrirAviso } from '@/lib/acoes';
import { Aviso } from '@/components/Aviso';
import { Pill } from '@/components/Pill';
import type { Conferencia, Corretora, Empresa } from '@/lib/tipos';

export const metadata = { title: 'Corrigir dados' };

type P = { searchParams: Promise<Record<string, string | undefined>> };
type Conf = Conferencia & { chave: string; ignorada_em: string | null; nota: string | null };
type Exc = { tabela: string; registro_id: string; resumo: string | null; motivo: string | null; excluido_em: string };

const ABAS = [
  { id: 'avisos', rotulo: 'Avisos da Conferência' },
  { id: 'faturas', rotulo: 'Faturas' },
  { id: 'comissoes', rotulo: 'Lançamentos de comissão' },
  { id: 'excluidos', rotulo: 'Excluídos' },
];
// lançamento de comissão ou fatura que o aviso aponta (a chave é o id do registro)
const PELO_ID: Record<string, 'faturas' | 'comissao_lancamentos'> = {
  valor_divergem: 'faturas', vidas_divergem: 'faturas', comissao_calculo: 'comissao_lancamentos', comissao_classe: 'comissao_lancamentos',
};

export default async function Corrigir({ searchParams }: P) {
  const sp = await searchParams;
  const db = await cliente();
  const { data: corretoras } = await db.from('corretoras').select('*').eq('ativa', true).order('nome');
  const cs = (corretoras ?? []) as Corretora[];
  const c = sp.c && cs.some((x) => x.id === sp.c) ? sp.c : cs[0]?.id;
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : 'avisos';
  const comp = /^\d{4}-\d{2}$/.test(sp.comp ?? '') ? sp.comp! : new Date().toISOString().slice(0, 7);
  const q = (sp.q ?? '').trim();
  const segF = sp.seg && SEGURADORA[sp.seg] ? sp.seg : '';
  const url = (m: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all = { c, aba, comp, q, seg: segF, tipo: sp.tipo, ver: sp.ver, ...m };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    return `/master/corrigir?${u.toString()}`;
  };
  const aqui = url({});
  if (!c) return <div className="page"><p className="empty">Nenhuma corretora cadastrada.</p></div>;

  const { data: empresas } = await db.from('empresas').select('id, razao_social, nome_curto, codigo_interno, ativa').eq('corretora_id', c).order('razao_social');
  const es = (empresas ?? []) as Empresa[];
  const nomeE = (id: string | null) => { const e = es.find((x) => x.id === id); return e ? e.nome_curto || e.razao_social : '—'; };
  const casa = (t: string) => q ? t.toLowerCase().includes(q.toLowerCase()) : true;

  // ---- dados de cada aba ----
  let corpo: React.ReactNode = null;
  if (aba === 'avisos') {
    const ver = sp.ver === 'ignorados' ? 'ignorados' : 'abertos';
    let qy = db.from('conferencias').select('*').eq('corretora_id', c);
    qy = ver === 'ignorados' ? qy.not('ignorada_em', 'is', null) : qy.is('resolvida_em', null);
    const { data: cf } = await qy.order('competencia', { ascending: false }).order('gravidade').limit(500);
    const todos = (cf ?? []) as Conf[];
    const porTipo = new Map<string, number>();
    for (const x of todos) porTipo.set(x.tipo, (porTipo.get(x.tipo) ?? 0) + 1);
    const lista = todos.filter((x) => (!sp.tipo || x.tipo === sp.tipo) && casa(x.mensagem));
    corpo = (
      <section className="card">
        <div className="card-h"><h2>{ver === 'ignorados' ? 'Avisos marcados como normais' : 'O que a Conferência achou e ainda não foi resolvido'}</h2>
          <Link className="hint" href={url({ ver: ver === 'ignorados' ? undefined : 'ignorados', tipo: undefined })}>{ver === 'ignorados' ? 'ver os abertos' : 'ver os marcados como normais'}</Link></div>
        <div className="seg" role="group" aria-label="Tipo de aviso" style={{ marginBottom: '.8rem' }}>
          <Link href={url({ tipo: undefined })} aria-current={(!sp.tipo) ? 'page' : undefined}>Todos ({todos.length})</Link>
          {[...porTipo].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <Link key={t} href={url({ tipo: t })} aria-current={(sp.tipo === t) ? 'page' : undefined}>{CONFERENCIA_TIPO[t] ?? t} ({n})</Link>
          ))}
        </div>
        {lista.length === 0 ? <p className="empty">{ver === 'ignorados' ? 'Nenhum aviso marcado como normal.' : 'Nada em aberto aqui. A Conferência roda sozinha depois de Faturas, Vidas e Comissões.'}</p> : (
          <ul className="rows">
            {lista.map((x) => {
              const num = /fatura (\S+)/.exec(x.mensagem)?.[1];
              const tabela = PELO_ID[x.tipo];
              return (
                <li key={x.id}>
                  <div>
                    <b>{x.mensagem}</b>
                    <small>{competencia(x.competencia)} · {seg(x.seguradora_id)} · <Pill tom={x.gravidade === 'erro' ? 'bad' : 'warn'}>{CONFERENCIA_TIPO[x.tipo] ?? x.tipo}</Pill> · desde {quando(x.primeira_vez)}{x.nota ? ` · nota: ${x.nota}` : ''}</small>
                  </div>
                  <div className="acoes">
                    {ver === 'ignorados' ? (
                      <form action={reabrirAviso}><input type="hidden" name="de" value={aqui} /><input type="hidden" name="id" value={x.id} /><button className="btn ghost sm">Reabrir</button></form>
                    ) : (
                      <>
                        {x.tipo === 'comissao_sem_empresa' && (
                          <form action={ligarEmpresa} className="acoes">
                            <input type="hidden" name="de" value={aqui} /><input type="hidden" name="id" value={x.id} />
                            <select name="empresa_id" required aria-label="Empresa" defaultValue="">
                              <option value="" disabled>Ligar à empresa…</option>
                              {es.filter((e) => e.ativa !== false).map((e) => <option key={e.id} value={e.id}>{e.nome_curto || e.razao_social}</option>)}
                            </select>
                            <button className="btn sm">Ligar</button>
                          </form>
                        )}
                        {num && (x.tipo === 'fatura_duplicada' || tabela === 'faturas') && (
                          <Link className="btn ghost sm" href={url({ aba: 'faturas', comp: x.competencia, seg: x.seguradora_id ?? undefined, q: num, tipo: undefined, ver: undefined })}>Ver fatura</Link>
                        )}
                        {tabela === 'comissao_lancamentos' && (
                          <form action={excluirRegistro}>
                            <input type="hidden" name="de" value={aqui} /><input type="hidden" name="tabela" value={tabela} /><input type="hidden" name="id" value={x.chave} />
                            <input type="hidden" name="resumo" value={x.mensagem} /><input type="hidden" name="motivo" value="Aviso da Conferência" />
                            <button className="btn perigo sm">Excluir lançamento</button>
                          </form>
                        )}
                        <form action={ignorarAviso} className="acoes">
                          <input type="hidden" name="de" value={aqui} /><input type="hidden" name="id" value={x.id} />
                          <input name="nota" placeholder="por quê (opcional)" aria-label="Por que é normal" style={{ maxWidth: 170 }} />
                          <button className="btn ghost sm">É normal</button>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="note">&quot;É normal&quot; tira o aviso e ele não volta (por exemplo, empresa que saiu ou fatura que sai mais tarde). &quot;Ligar à empresa&quot; vale também para os próximos extratos. Excluir guarda o registro em &quot;Excluídos&quot;, de onde dá para desfazer.</p>
      </section>
    );
  } else if (aba === 'faturas') {
    let qy = db.from('faturas').select('id, numero, competencia, seguradora_id, empresa_id, valor_total, vencimento, vidas_informadas, excluido_em')
      .eq('corretora_id', c).eq('competencia', comp);
    if (segF) qy = qy.eq('seguradora_id', segF);
    const { data: fs } = await qy.order('seguradora_id').order('numero').limit(1000);
    type F = { id: string; numero: string; competencia: string; seguradora_id: string; empresa_id: string; valor_total: number | null; vencimento: string | null; vidas_informadas: number | null; excluido_em: string | null };
    const todas = (fs ?? []) as F[];
    const vezes = new Map<string, number>();
    for (const f of todas) if (!f.excluido_em) vezes.set(f.seguradora_id + f.numero, (vezes.get(f.seguradora_id + f.numero) ?? 0) + 1);
    const lista = todas.filter((f) => casa(`${f.numero} ${nomeE(f.empresa_id)}`));
    corpo = (
      <section className="card">
        <div className="card-h"><h2>Faturas de {competencia(comp)}</h2><span className="hint">{lista.length} de {todas.length}</span></div>
        <Filtros c={c} aba={aba} comp={comp} q={q} seg={segF} />
        {lista.length === 0 ? <p className="empty">Nenhuma fatura com esse filtro.</p> : (
          <div className="tbl scroll">
            <table>
              <thead><tr><th>Empresa</th><th>Seguradora</th><th>Fatura</th><th>Vencimento</th><th className="num">Vidas</th><th className="num">Valor</th><th></th></tr></thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} style={f.excluido_em ? { opacity: .5 } : undefined}>
                    <td><b>{nomeE(f.empresa_id)}</b></td><td>{seg(f.seguradora_id)}</td>
                    <td>{f.numero}{(vezes.get(f.seguradora_id + f.numero) ?? 0) > 1 && <> <Pill tom="bad">duplicada</Pill></>}</td>
                    <td>{data(f.vencimento)}</td><td className="num">{f.vidas_informadas ?? '—'}</td><td className="num">{moeda(f.valor_total)}</td>
                    <td>{f.excluido_em ? <Pill tom="idle">Excluída</Pill> : (
                      <form action={excluirRegistro} className="acoes">
                        <input type="hidden" name="de" value={aqui} /><input type="hidden" name="tabela" value="faturas" /><input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="resumo" value={`${nomeE(f.empresa_id)} · ${seg(f.seguradora_id)} · fatura ${f.numero} · ${competencia(f.competencia)} · ${moeda(f.valor_total)}`} />
                        <input name="motivo" placeholder="motivo" aria-label="Motivo" style={{ maxWidth: 130 }} />
                        <button className="btn perigo sm">Excluir</button>
                      </form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  } else if (aba === 'comissoes') {
    let qy = db.from('comissao_lancamentos')
      .select('id, segurado, empresa_id, numero_fatura, parcela, data_lancamento, premio_liquido, taxa, comissao, classe, excluido_em, comissao_pagamentos!inner(competencia, seguradora_id)')
      .eq('corretora_id', c).eq('comissao_pagamentos.competencia', comp);
    if (segF) qy = qy.eq('comissao_pagamentos.seguradora_id', segF);
    const { data: ls } = await qy.order('segurado').limit(1000);
    type L = { id: string; segurado: string | null; empresa_id: string | null; numero_fatura: string | null; parcela: number | null; data_lancamento: string | null; premio_liquido: number | null; taxa: number | null; comissao: number | null; classe: string | null; excluido_em: string | null; comissao_pagamentos: { competencia: string; seguradora_id: string } };
    const todas = (ls ?? []) as unknown as L[];
    const lista = todas.filter((l) => casa(`${l.segurado ?? ''} ${l.numero_fatura ?? ''} ${nomeE(l.empresa_id)}`));
    corpo = (
      <section className="card">
        <div className="card-h"><h2>Lançamentos de comissão de {competencia(comp)}</h2><span className="hint">{lista.length} de {todas.length}</span></div>
        <Filtros c={c} aba={aba} comp={comp} q={q} seg={segF} />
        {lista.length === 0 ? <p className="empty">Nenhum lançamento com esse filtro.</p> : (
          <div className="tbl scroll">
            <table>
              <thead><tr><th>Segurado no extrato</th><th>Empresa</th><th>Seguradora</th><th>Data</th><th className="num">Prêmio</th><th className="num">Taxa</th><th className="num">Comissão</th><th></th></tr></thead>
              <tbody>
                {lista.map((l) => (
                  <tr key={l.id} style={l.excluido_em ? { opacity: .5 } : undefined}>
                    <td><b>{l.segurado ?? '—'}</b><small>{l.numero_fatura ? `fatura ${l.numero_fatura}` : ''}{l.classe ? ` · ${l.classe}` : ''}</small></td>
                    <td>{l.empresa_id ? nomeE(l.empresa_id) : <Pill tom="warn">sem empresa</Pill>}</td>
                    <td>{seg(l.comissao_pagamentos.seguradora_id)}</td><td>{data(l.data_lancamento)}</td>
                    <td className="num">{moeda(l.premio_liquido)}</td><td className="num">{l.taxa != null ? `${l.taxa}%` : '—'}</td><td className="num">{moeda(l.comissao)}</td>
                    <td>{l.excluido_em ? <Pill tom="idle">Excluído</Pill> : (
                      <form action={excluirRegistro} className="acoes">
                        <input type="hidden" name="de" value={aqui} /><input type="hidden" name="tabela" value="comissao_lancamentos" /><input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="resumo" value={`${l.segurado ?? 'Lançamento'} · ${seg(l.comissao_pagamentos.seguradora_id)} · ${competencia(comp)} · ${moeda(l.comissao)}`} />
                        <input name="motivo" placeholder="motivo" aria-label="Motivo" style={{ maxWidth: 130 }} />
                        <button className="btn perigo sm">Excluir</button>
                      </form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">O lançamento excluído sai do banco, da Conferência e da Projeção. A tela de Comissões da corretora ainda mostra o extrato como o agente leu, até ela passar a ler direto do banco.</p>
      </section>
    );
  } else {
    const { data: ex } = await db.from('exclusoes').select('*').eq('corretora_id', c).is('desfeito_em', null).order('excluido_em', { ascending: false }).limit(300);
    const lista = ((ex ?? []) as Exc[]).filter((x) => casa(`${x.resumo ?? ''} ${x.motivo ?? ''}`));
    corpo = (
      <section className="card">
        <div className="card-h"><h2>Excluídos</h2><span className="hint">nada foi apagado: desfazer traz de volta</span></div>
        {lista.length === 0 ? <p className="empty">Nada excluído.</p> : (
          <ul className="rows">
            {lista.map((x) => (
              <li key={x.tabela + x.registro_id}>
                <div><b>{x.resumo ?? (x.tabela === 'faturas' ? 'Fatura' : 'Lançamento de comissão')}</b>
                  <small>{x.tabela === 'faturas' ? 'Fatura' : 'Lançamento de comissão'} · excluído {quando(x.excluido_em)}{x.motivo ? ` · ${x.motivo}` : ''}</small></div>
                <form action={desfazerExclusao}>
                  <input type="hidden" name="de" value={aqui} /><input type="hidden" name="tabela" value={x.tabela} /><input type="hidden" name="id" value={x.registro_id} />
                  <button className="btn ghost sm">Desfazer</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Corrigir dados</h1>
          <p>Resolva os avisos da Conferência e exclua o que veio errado. Nada é apagado de verdade: o que você excluir fica em &quot;Excluídos&quot; e dá para desfazer.</p>
        </div>
        {cs.length > 1 && (
          <form className="acoes" action="/master/corrigir">
            <input type="hidden" name="aba" value={aba} />
            <select name="c" defaultValue={c} aria-label="Corretora">{cs.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            <button className="btn ghost sm">Trocar</button>
          </form>
        )}
      </div>
      <Aviso sp={sp} />
      <nav className="seg" aria-label="O que corrigir" style={{ marginBottom: '1rem' }}>
        {ABAS.map((a) => <Link key={a.id} href={url({ aba: a.id, tipo: undefined, ver: undefined, q: undefined })} aria-current={(aba === a.id) ? 'page' : undefined}>{a.rotulo}</Link>)}
      </nav>
      {corpo}
    </div>
  );
}

function Filtros({ c, aba, comp, q, seg: s }: { c: string; aba: string; comp: string; q: string; seg: string }) {
  return (
    <form className="acoes" action="/master/corrigir" style={{ marginBottom: '.8rem' }}>
      <input type="hidden" name="c" value={c} /><input type="hidden" name="aba" value={aba} />
      <input type="month" name="comp" defaultValue={comp} aria-label="Competência" />
      <select name="seg" defaultValue={s} aria-label="Seguradora"><option value="">Todas as seguradoras</option>
        {Object.entries(SEGURADORA).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <input type="search" name="q" defaultValue={q} placeholder="Empresa ou número" aria-label="Buscar" />
      <button className="btn sm">Filtrar</button>
    </form>
  );
}
