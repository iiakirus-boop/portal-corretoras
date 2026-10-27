// Leitura e gravação dos documentos da Central de uma corretora (usado por public/central-shim.js).
// No banco de verdade quem barra é a regra de acesso de central_docs; aqui só repetimos a regra para responder claro.
import { NextResponse, type NextRequest } from 'next/server';
import { MODO_DEMO } from '@/lib/servidor';
import { acessoCentral, GRAVA_EQUIPE, SO_ADMIN } from '@/lib/central/acesso';
import { centralDemo } from '@/lib/central/demo';
import { STATUS_PEDIDO, TIPO_PEDIDO } from '@/lib/formato';
import type { Pedido } from '@/lib/tipos';

// Os pedidos do portal aparecem na Central como tarefas do Agente Movimentações (só leitura, id "pedido-...").
// pronto_envio espera o Bruno aprovar; concluído e cancelado saem da fila.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pedidosComoTarefas(db: any, c: string) {
  const { data: peds } = await db.from('pedidos').select('*').eq('corretora_id', c).order('criado_em', { ascending: false }).limit(300);
  const { data: emps } = await db.from('empresas').select('id,codigo_interno,razao_social').eq('corretora_id', c);
  const emp = new Map((emps ?? []).map((e: { id: string }) => [e.id, e]));
  return (peds ?? []).map((p: Pedido) => {
    const e = emp.get(p.empresa_id) as { codigo_interno: string | null; razao_social: string } | undefined;
    const nome = (e?.razao_social ?? '').toUpperCase();
    const coluna = p.status === 'concluido' || p.status === 'cancelado' ? 'concluido' : p.status === 'pronto_envio' ? 'precisa' : 'andamento';
    const quem = p.dados?.nome ?? p.dados?.d_nome ?? '';
    return {
      id: `pedido-${p.id}`,
      dados: {
        agente: 'movimentacoes', tipo: 'movimentacao', coluna, origem: 'portal',
        titulo: `${TIPO_PEDIDO[p.tipo]} · ${nome}`,
        detalhe: `Protocolo ${p.protocolo} · ${STATUS_PEDIDO[p.status]?.rotulo ?? p.status}${quem ? ' · ' + quem : ''}`,
        quem: `Pedido pelo portal${p.prazo ? ' · prazo ' + p.prazo.split('-').reverse().join('/') : ''}`,
        criadaEm: p.criado_em, ...(coluna === 'concluido' ? { concluidaEm: p.atualizado_em } : {}),
        mov: { tipo: TIPO_PEDIDO[p.tipo], eid: e?.codigo_interno ?? p.empresa_id, empresa: nome, beneficiario: quem },
      },
    };
  });
}

// Várias coleções num pedido só: a Central abre com um pedido ao servidor e confere mudanças com mais um por minuto.
// O carimbo é o mesmo do ?carimbo=1 (quantidade + última alteração; em tarefas, também os pedidos do portal).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function variasColecoes(a: any, c: string, cols: string[], comDocs: boolean) {
  const out: Record<string, { carimbo: string; docs: { id: string; dados: unknown }[] }> = {};
  const livres = cols.filter((col) => !(SO_ADMIN.includes(col) && !a.admin));
  for (const col of cols) if (!livres.includes(col)) out[col] = { carimbo: 'sem-acesso', docs: [] };
  if (!livres.length) return out;
  let ped = '';
  if (livres.includes('tarefas')) {
    const { data: p, count: n } = await a.db.from('pedidos').select('atualizado_em', { count: 'exact' })
      .eq('corretora_id', c).order('atualizado_em', { ascending: false }).limit(1);
    ped = `|${n ?? 0}:${p?.[0]?.atualizado_em ?? ''}`;
  }
  if (MODO_DEMO) {
    for (const col of livres) {
      const docs = Object.entries(centralDemo(c)[col] ?? {}).map(([id, dados]) => ({ id, dados } as { id: string; dados: unknown }));
      if (col === 'tarefas') docs.push(...(await pedidosComoTarefas(a.db, c)));
      out[col] = { carimbo: `${docs.length}:${JSON.stringify(docs).length}`, docs: comDocs ? docs : [] };
    }
    return out;
  }
  // o banco entrega no máximo 1000 linhas por vez: busca em páginas até acabar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data: pg, error } = await a.db.from('central_docs').select(comDocs ? 'colecao,doc_id,dados,atualizado_em' : 'colecao,atualizado_em')
      .eq('corretora_id', c).in('colecao', livres).order('colecao').order('doc_id').range(de, de + 999);
    if (error) throw new Error(error.message);
    data.push(...(pg ?? []));
    if (!pg || pg.length < 1000) break;
  }
  for (const col of livres) {
    const rs = data.filter((r: { colecao: string }) => r.colecao === col);
    const ult = rs.reduce((m: string, r: { atualizado_em: string }) => (r.atualizado_em > m ? r.atualizado_em : m), '');
    const docs = comDocs ? rs.map((r: { doc_id: string; dados: unknown }) => ({ id: r.doc_id, dados: r.dados })) : [];
    if (comDocs && col === 'tarefas') docs.push(...(await pedidosComoTarefas(a.db, c)));
    out[col] = { carimbo: `${rs.length}:${ult}${col === 'tarefas' ? ped : ''}`, docs };
  }
  return out;
}

const nega = (erro: string, status = 403) => NextResponse.json({ erro }, { status });
const COL = /^[a-z_]+$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const a = await acessoCentral(c);
  if (!a) return nega('entre de novo', 401);
  if (!a.ok) return nega('sem acesso a esta corretora');
  const u = req.nextUrl.searchParams;
  const pessoas = u.get('pessoas');
  if (pessoas) {
    // nomes de quem marcou tarefa: pelo e-mail dos membros que a pessoa enxerga
    const { data } = await a.db.from('membros').select('*').eq('corretora_id', c);
    const out: Record<string, { name: string }> = {};
    for (const m of data ?? []) if (pessoas.split(',').includes(m.user_id) && m.email) out[m.user_id] = { name: m.email.split('@')[0] };
    return NextResponse.json({ pessoas: out });
  }
  const lote = u.get('lote'), carimbos = u.get('carimbos');
  if (lote != null || carimbos != null) {
    const cols = (lote ?? carimbos ?? '').split(',').filter((x) => COL.test(x)).slice(0, 20);
    let r;
    try { r = await variasColecoes(a, c, cols, lote != null); } catch (e) { return nega((e as Error).message, 500); }
    return NextResponse.json(lote != null ? { cols: r } : { carimbos: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.carimbo])) });
  }
  const col = u.get('col') ?? '';
  if (!COL.test(col)) return nega('coleção inválida', 400);
  if (SO_ADMIN.includes(col) && !a.admin) return NextResponse.json({ docs: [], carimbo: 'sem-acesso', dados: null });
  const doc = u.get('doc');

  if (MODO_DEMO) {
    const d = centralDemo(c)[col] ?? {};
    if (doc != null) return NextResponse.json({ dados: d[doc] ?? null });
    const docs = Object.entries(d).map(([id, dados]) => ({ id, dados } as { id: string; dados: unknown }));
    if (col === 'tarefas') docs.push(...(await pedidosComoTarefas(a.db, c)));
    return NextResponse.json(u.get('carimbo') ? { carimbo: `${docs.length}:${JSON.stringify(docs).length}` } : { docs, carimbo: `${docs.length}:${JSON.stringify(docs).length}` });
  }

  if (doc != null) {
    const { data } = await a.db.from('central_docs').select('dados').eq('corretora_id', c).eq('colecao', col).eq('doc_id', doc).maybeSingle();
    return NextResponse.json({ dados: data?.dados ?? null });
  }
  if (u.get('carimbo')) {
    // carimbo = quantidade + última alteração: a tela só baixa a coleção de novo se mudou
    const { data, count } = await a.db.from('central_docs').select('atualizado_em', { count: 'exact' })
      .eq('corretora_id', c).eq('colecao', col).order('atualizado_em', { ascending: false }).limit(1);
    let carimbo = `${count ?? 0}:${data?.[0]?.atualizado_em ?? ''}`;
    if (col === 'tarefas') {
      const { data: p, count: n } = await a.db.from('pedidos').select('atualizado_em', { count: 'exact' })
        .eq('corretora_id', c).order('atualizado_em', { ascending: false }).limit(1);
      carimbo += `|${n ?? 0}:${p?.[0]?.atualizado_em ?? ''}`;
    }
    return NextResponse.json({ carimbo });
  }
  const { data, error } = await a.db.from('central_docs').select('doc_id,dados,atualizado_em').eq('corretora_id', c).eq('colecao', col);
  if (error) return nega(error.message, 500);
  const docs = (data ?? []).map((r: { doc_id: string; dados: unknown }) => ({ id: r.doc_id, dados: r.dados }));
  const ult = (data ?? []).reduce((m: string, r: { atualizado_em: string }) => (r.atualizado_em > m ? r.atualizado_em : m), '');
  if (col === 'tarefas') docs.push(...(await pedidosComoTarefas(a.db, c)));
  return NextResponse.json({ docs, carimbo: `${docs.length}:${ult}` });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const a = await acessoCentral(c);
  if (!a) return nega('entre de novo', 401);
  if (!a.ok) return nega('sem acesso a esta corretora');
  const { op, col, doc, dados } = (await req.json()) as { op: 'set' | 'update' | 'delete'; col: string; doc: string; dados?: Record<string, unknown> };
  if (!COL.test(col) || !doc) return nega('pedido inválido', 400);
  if (doc.startsWith('pedido-')) return nega('Este pedido veio do portal. Mude a situação dele na tela de Pedidos.');
  const pode = a.master || (GRAVA_EQUIPE.includes(col) && !SO_ADMIN.includes(col)) || (a.admin && ['implantacoes', 'agenciamentos'].includes(col));
  if (!pode || (op === 'delete' && !a.admin)) return nega('Seu acesso não permite alterar isso.');

  if (MODO_DEMO) {
    const t = (centralDemo(c)[col] ??= {});
    if (op === 'delete') delete t[doc];
    else t[doc] = op === 'update' ? { ...(t[doc] ?? {}), ...dados } : dados;
    return NextResponse.json({ ok: true });
  }
  if (op === 'delete') {
    const { error } = await a.db.from('central_docs').delete().eq('corretora_id', c).eq('colecao', col).eq('doc_id', doc);
    return error ? nega(error.message) : NextResponse.json({ ok: true });
  }
  let novo = dados ?? {};
  if (op === 'update') {
    const { data } = await a.db.from('central_docs').select('dados').eq('corretora_id', c).eq('colecao', col).eq('doc_id', doc).maybeSingle();
    novo = { ...(data?.dados ?? {}), ...novo };
  }
  const { error } = await a.db.from('central_docs')
    .upsert({ corretora_id: c, colecao: col, doc_id: doc, dados: novo, atualizado_em: new Date().toISOString(), atualizado_por: a.s.userId });
  return error ? nega(error.message) : NextResponse.json({ ok: true });
}
