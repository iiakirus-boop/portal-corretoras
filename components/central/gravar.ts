// Gravação nas coleções da Central (central_docs) a partir das telas do portal
import type { Doc } from '@/lib/central/modelo';

// grava na Central (central_docs) pela mesma rota da Central antiga e deixa o registro na linha do tempo
export async function gravar(c: string, op: 'set' | 'update' | 'delete', col: string, doc: string, dados?: Doc | Record<string, unknown>) {
  const r = await fetch(`/api/central/${encodeURIComponent(c)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, col, doc, dados }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'não salvou');
}
export async function registrar(c: string, agente: string, texto: string, now: string) {
  const dia = now.slice(0, 10);
  const j: { dados?: { itens?: unknown[] } } = await fetch(`/api/central/${encodeURIComponent(c)}?col=eventos&doc=${dia}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  await gravar(c, 'set', 'eventos', dia, { dia, itens: [...(j?.dados?.itens || []), { ts: now, agente, texto }] });
}
