import 'server-only';
import { STATUS_PEDIDO, TIPO_PEDIDO } from '../formato';
import type { Pedido } from '../tipos';

// Os pedidos do portal aparecem na Central como tarefas do Agente Movimentações (só leitura, id "pedido-...").
// pronto_envio espera o Bruno aprovar; concluído e cancelado saem da fila.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pedidosComoTarefas(db: any, c: string) {
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
