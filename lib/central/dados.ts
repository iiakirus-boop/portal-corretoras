import 'server-only';
import { MODO_DEMO, type Cliente } from '../servidor';
import { centralDemo } from './demo';
import { pedidosComoTarefas } from './pedidos';
import { type Doc, aberto } from './modelo';

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
  if (out.faturas?.length && !MODO_DEMO) await marcarPagamentos(db, c, out.faturas);
  // os pedidos do portal entram como tarefas do Agente Movimentações, como na Central
  if (out.tarefas) out.tarefas.push(...(await pedidosComoTarefas(db, c)).map((t: { id: string; dados: object }) => ({ ...t.dados, id: t.id })));
  return out;
}

export async function docCentral(db: Cliente, c: string, col: string, id: string): Promise<Doc | null> {
  if (MODO_DEMO) { const d = centralDemo(c)[col]?.[id]; return d ? { ...(d as object), id } : null; }
  const { data } = await db.from('central_docs').select('dados').eq('corretora_id', c).eq('colecao', col).eq('doc_id', id).maybeSingle();
  return data ? { ...(data.dados ?? {}), id } : null;
}

// O "boleto" de cada fatura na Central é o que o agente viu no portal no dia em que baixou a fatura. Se a empresa pagou
// depois, o banco sabe (baixa em data_pagamento, ou a comissão daquela fatura caiu: pago_pela_comissao) e a tela tem de
// mostrar Pago. Cada item ganha pagoEm (aaaa-mm-dd) e pagoVia ('baixa' | 'comissao' | 'portal').
export type Pg = { numero: string; competencia: string; data_pagamento: string | null; pago_pela_comissao: string | null };
async function marcarPagamentos(db: Cliente, c: string, faturas: Doc[]) {
  const L: Pg[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('faturas').select('numero,competencia,data_pagamento,pago_pela_comissao')
      .eq('corretora_id', c).or('data_pagamento.not.is.null,pago_pela_comissao.not.is.null').order('id').range(de, de + 999);
    if (error) return; // sem acesso à tabela: fica o que o agente leu
    L.push(...((data ?? []) as Pg[]));
    if (!data || data.length < 1000) break;
  }
  aplicarPagamentos(faturas, L);
}

export function aplicarPagamentos(faturas: Doc[], L: Pg[]) {
  const pg = new Map(L.map((r) => [r.numero + '|' + String(r.competencia).trim(), r]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marca = (r: Record<string, any>, comp: string) => {
    if (!r || !r.titulo) return;
    const b = pg.get(String(r.titulo) + '|' + comp);
    if (b?.data_pagamento) { r.pagoEm = b.data_pagamento; r.pagoVia = 'baixa'; }
    else if (b?.pago_pela_comissao) { r.pagoEm = b.pago_pela_comissao; r.pagoVia = 'comissao'; }
    else if (/pago/i.test(String(r.boleto || '')) && !aberto(r)) { r.pagoVia = 'portal'; return; }
    else return;
    r.boleto = 'Pago';
  };
  for (const d of faturas) for (const r of d.itens || []) { marca(r, d.comp); for (const s of r.subsDet || []) marca(s, d.comp); }
}
