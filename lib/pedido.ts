import 'server-only';
import type { Cliente } from './servidor';
import type { Documento, EventoPedido, Membro, Pedido } from './tipos';

// Carrega o pedido com eventos, anexos e o nome de quem escreveu (pelo e-mail dos membros que a pessoa enxerga)
export async function carregarPedido(db: Cliente, id: string) {
  const { data: p } = await db.from('pedidos').select('*').eq('id', id).maybeSingle();
  if (!p) return null;
  const [{ data: ev }, { data: docs }, { data: emp }, { data: mem }] = await Promise.all([
    db.from('pedido_eventos').select('*').eq('pedido_id', id).order('em'),
    db.from('documentos').select('*').eq('pedido_id', id),
    db.from('empresas').select('*').eq('id', p.empresa_id).maybeSingle(),
    db.from('membros').select('*').eq('corretora_id', p.corretora_id),
  ]);
  const nomes: Record<string, string> = {};
  for (const m of (mem ?? []) as Membro[]) if (m.email) nomes[m.user_id] = m.email.split('@')[0].replace(/^\w/, (x) => x.toUpperCase());
  return {
    pedido: p as Pedido,
    eventos: (ev ?? []) as EventoPedido[],
    anexos: (docs ?? []) as Documento[],
    empresa: (emp?.nome_curto ?? emp?.razao_social ?? '—') as string,
    nomes,
  };
}
