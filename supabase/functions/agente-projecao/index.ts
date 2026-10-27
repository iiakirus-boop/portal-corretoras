// Agente Projeção na nuvem. Roda o MESMO modelo da página Projeção da Central (public/modelo-projecao.js do site, gerado do central.html)
// com as faturas e comissões que estão no banco, e guarda a rodada em central_docs/projecoes, como o motor_projecao.js do PC.
// Chamado de hora em hora pelo pg_cron. A cada chamada:
//   1. atende as ordens pendentes do agente 'projecao' (pedidas no master ou disparadas depois de uma comissão);
//   2. se a rotina "Projeção diária" estiver ligada e ainda não houve rodada hoje (a partir das 7h de Brasília), faz a do dia.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Baixa o modelo publicado pelo site a cada rodada: a conta da nuvem acompanha qualquer mudança na Central
const SITE = Deno.env.get('SITE_URL') ?? 'https://portal-corretoras.vercel.app';
// deno-lint-ignore no-explicit-any
let M_: any;
async function carregarModelo() {
  const r = await fetch(`${SITE}/modelo-projecao.js`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`não baixou o modelo da Projeção do site (${r.status})`);
  new Function(await r.text())();
  // deno-lint-ignore no-explicit-any
  M_ = (globalThis as any).modeloProjecao;
  if (!M_?.projAll) throw new Error('modelo da Projeção veio incompleto');
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const r2 = (v: number) => Math.round(v * 100) / 100;
const MAQUINA = 'Nuvem (Supabase)';

// Data e hora de Brasília (UTC−3, sem horário de verão)
function agoraBR() {
  const d = new Date(Date.now() - 3 * 3600e3);
  return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
}

async function docs(corretora: string, colecao: string) {
  const { data, error } = await db.from('central_docs').select('doc_id, dados').eq('corretora_id', corretora).eq('colecao', colecao);
  if (error) throw new Error(`lendo ${colecao}: ${error.message}`);
  return data ?? [];
}

// Mesma conta do motor_projecao.js do PC
async function projetar(corretora: string, gatilho: string) {
  const fat = (await docs(corretora, 'faturas')).map((d) => d.dados);
  const com = (await docs(corretora, 'comissoes')).map((d) => d.dados);
  const agcfg: Record<string, unknown> = {};
  for (const d of await docs(corretora, 'agenciamentos')) agcfg[d.doc_id] = d.dados;
  const imps = (await docs(corretora, 'implantacoes')).map((d) => d.dados);
  if (!M_) await carregarModelo();
  // deno-lint-ignore no-explicit-any
  const M: any = M_.projAll(fat, M_.mergeCom(com), { agcfg, imps, hoje: new Date(agoraBR().dia + 'T12:00:00Z') });
  if (!M) return null;
  const T = M.hoje, cm = M_.ckey(T), meses = [0, 1, 2, 3].map((k) => M_.addMonth(cm, k));
  // deno-lint-ignore no-explicit-any
  type I = any;
  const linhas: I[] = [];
  meses.forEach((m) => {
    const it = M.com.filter((x: I) => M_.ckey(x.data) === m);
    const segs = M_.famsIn(M_.uniq(M.com.map((x: I) => M_.fam(x.op))));
    segs.forEach((f: string) => ['ag', 'vit'].forEach((k) => {
      const L = it.filter((x: I) => M_.fam(x.op) === f && x.kind === k);
      const real = M_.sum(L.filter((x: I) => x.tipo === 'real'), (x: I) => x.valor), prev = M_.sum(L.filter((x: I) => x.tipo === 'prev'), (x: I) => x.valor), proj = M_.sum(L.filter((x: I) => x.tipo === 'proj'), (x: I) => x.valor);
      if (real + prev + proj > 0) linhas.push({ comp: m, seg: f, kind: k, real: r2(real), prev: r2(prev), proj: r2(proj), total: r2(real + prev + proj), n: L.length });
    }));
  });
  const top: Record<string, number> = {};
  M.com.filter((x: I) => x.tipo !== 'real' && M_.ckey(x.data) > cm).forEach((x: I) => { const k = x.empresa + '|' + M_.fam(x.op) + '|' + x.kind; top[k] = (top[k] || 0) + x.valor; });
  const empresas = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => { const [empresa, seg, kind] = k.split('|'); return { empresa, seg, kind, valor: r2(v) }; });
  // cada crédito previsto desta semana e da próxima, com a data: a tela de Comissões confere, semana a semana,
  // o que caiu contra a última rodada feita antes da semana começar (e mostra as empresas que faltaram)
  const w0 = new Date(T.getTime() - ((T.getUTCDay() + 6) % 7) * 864e5), w1 = new Date(w0.getTime() + 14 * 864e5);
  const itens = M.com.filter((x: I) => x.tipo !== 'real' && x.data >= w0 && x.data < w1).sort((a: I, b: I) => a.data - b.data)
    .map((x: I) => ({ data: x.data.toISOString().slice(0, 10), empresa: x.empresa, eid: x.eid || '', op: x.op, kind: x.kind, valor: r2(x.valor), tipo: x.tipo, ...(x.atraso ? { atraso: true } : {}) }));
  const agora = new Date();
  const foto = {
    id: cm + '_' + new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, ''), geradoEm: agora.toISOString(), gatilho, mesAtual: cm, horizonte: meses[3], ultCompFaturas: M.ultComp,
    meses: meses.map((m) => {
      const L = linhas.filter((l) => l.comp === m); const porSeg: Record<string, { ag: number; vit: number; total: number }> = {};
      L.forEach((l) => { const o = porSeg[l.seg] = porSeg[l.seg] || { ag: 0, vit: 0, total: 0 }; o[l.kind as 'ag' | 'vit'] = r2(o[l.kind as 'ag' | 'vit'] + l.total); o.total = r2(o.total + l.total); });
      return { comp: m, total: r2(M_.sum(L, (l: I) => l.total)), ag: r2(M_.sum(L.filter((l) => l.kind === 'ag'), (l: I) => l.total)), vit: r2(M_.sum(L.filter((l) => l.kind === 'vit'), (l: I) => l.total)), real: r2(M_.sum(L, (l: I) => l.real)), porSeg };
    }),
    linhas, empresas, agenciamentos: M.ag.map((A: I) => ({ eid: A.eid, nome: A.nome, restantes: A.restantes, recebidas: A.rec.length + A.assum, imp: !!A.im })),
    atrasos: M.com.filter((x: I) => x.atraso).map((x: I) => ({ empresa: x.empresa, seg: M_.fam(x.op), kind: x.kind, valor: r2(x.valor), quando: x.quando })),
    itens,
    implantacoesNovas: (M.novas || []).length, extraSemFatura: M.extraN, origem: 'nuvem',
  };
  const { error } = await db.from('central_docs').upsert({ corretora_id: corretora, colecao: 'projecoes', doc_id: foto.id, dados: foto, atualizado_em: agora.toISOString() });
  if (error) throw new Error(`gravando a rodada: ${error.message}`);
  const atr = M_.sum(foto.atrasos, (x: I) => x.valor);
  const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Rodada ${foto.id}: ${foto.meses.map((m) => `${m.comp} R$ ${brl(m.total)}`).join(', ')}` + (foto.atrasos.length ? `. ${foto.atrasos.length} créditos em atraso (R$ ${brl(atr)}).` : '.');
}

async function rodarOrdem(o: { id: string; corretora_id: string; mensagem?: string | null; origem?: string }, maq: string | null) {
  await db.from('ordens_execucao').update({ status: 'em_execucao', iniciada_em: new Date().toISOString(), maquina_id: maq }).eq('id', o.id);
  try {
    const msg = await projetar(o.corretora_id, o.origem === 'encadeamento' ? (o.mensagem ?? 'Após comissão') : o.origem === 'rotina' ? 'Projeção diária' : 'Pedido no painel');
    await db.from('ordens_execucao').update({ status: 'concluida', terminada_em: new Date().toISOString(), mensagem: msg ?? 'Sem faturas ou comissões no banco para projetar.' }).eq('id', o.id);
    return msg;
  } catch (e) {
    await db.from('ordens_execucao').update({ status: 'erro', terminada_em: new Date().toISOString(), mensagem: String((e as Error).message ?? e) }).eq('id', o.id);
    return null;
  }
}

Deno.serve(async () => {
  const feito: string[] = [];
  const { data: m } = await db.from('maquinas').upsert({ nome: MAQUINA, descricao: 'Agentes que rodam na nuvem, sem depender do PC', ultimo_sinal: new Date().toISOString() }, { onConflict: 'nome' }).select('id').single();
  const maq = m?.id ?? null;

  // 1. ordens pendentes
  const { data: ordens } = await db.from('ordens_execucao').select('id, corretora_id, mensagem, origem').eq('agente', 'projecao').eq('status', 'pendente').order('criada_em');
  const atendidas = new Set<string>();
  for (const o of ordens ?? []) {
    // várias ordens da mesma corretora na fila: uma rodada atende todas
    if (atendidas.has(o.corretora_id)) {
      await db.from('ordens_execucao').update({ status: 'concluida', terminada_em: new Date().toISOString(), mensagem: 'Atendida junto com a rodada anterior.' }).eq('id', o.id);
      continue;
    }
    await rodarOrdem(o, maq);
    atendidas.add(o.corretora_id);
    feito.push(`ordem ${o.id}`);
  }

  // 2. rodada diária
  const { dia, hora } = agoraBR();
  const { data: rotinas } = await db.from('rotinas').select('id, corretora_id').eq('agente', 'projecao').eq('ativa', true);
  if (hora >= 7) {
    for (const r of rotinas ?? []) {
      if (!r.corretora_id || atendidas.has(r.corretora_id)) continue;
      const { count } = await db.from('ordens_execucao').select('id', { count: 'exact', head: true })
        .eq('corretora_id', r.corretora_id).eq('agente', 'projecao').eq('rotina_id', r.id).gte('criada_em', `${dia}T03:00:00Z`);
      if (count) continue;
      const { data: o } = await db.from('ordens_execucao').insert({ corretora_id: r.corretora_id, agente: 'projecao', origem: 'rotina', rotina_id: r.id, status: 'pendente', mensagem: 'Projeção diária' })
        .select('id, corretora_id, mensagem, origem').single();
      if (o) { await rodarOrdem({ ...o, origem: 'rotina' }, maq); feito.push(`rotina ${r.id}`); }
      await db.from('rotinas').update({ ultima_execucao: new Date().toISOString() }).eq('id', r.id);
    }
  }
  return new Response(JSON.stringify({ ok: true, feito }), { headers: { 'Content-Type': 'application/json' } });
});
