import 'server-only';
import { MODO_DEMO, type Cliente } from '../servidor';
import { centralDemo } from './demo';
import { pedidosComoTarefas } from './pedidos';
import type { Doc } from './modelo';

// Documentos da Central (tabela central_docs) de várias coleções de uma vez, já separados por coleção.
// O banco entrega no máximo 1000 linhas por vez: busca em páginas até acabar.
export async function docsCentral(db: Cliente, c: string, cols: string[]): Promise<Record<string, Doc[]>> {
  const out: Record<string, Doc[]> = Object.fromEntries(cols.map((col) => [col, []]));
  if (MODO_DEMO) {
    for (const col of cols) out[col] = Object.entries(centralDemo(c)[col] ?? {}).map(([id, dados]) => ({ ...(dados as object), id }));
  } else for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('central_docs').select('colecao,doc_id,dados')
      .eq('corretora_id', c).in('colecao', cols).order('colecao').order('doc_id').range(de, de + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out[r.colecao].push({ ...(r.dados ?? {}), id: r.doc_id });
    if (!data || data.length < 1000) break;
  }
  // os pedidos do portal entram como tarefas do Agente Movimentações, como na Central
  if (out.tarefas) out.tarefas.push(...(await pedidosComoTarefas(db, c)).map((t: { id: string; dados: object }) => ({ ...t.dados, id: t.id })));
  return out;
}

export async function docCentral(db: Cliente, c: string, col: string, id: string): Promise<Doc | null> {
  if (MODO_DEMO) { const d = centralDemo(c)[col]?.[id]; return d ? { ...(d as object), id } : null; }
  const { data } = await db.from('central_docs').select('dados').eq('corretora_id', c).eq('colecao', col).eq('doc_id', id).maybeSingle();
  return data ? { ...(data.dados ?? {}), id } : null;
}
