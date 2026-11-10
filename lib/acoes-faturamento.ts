'use server';
// Controle de envio do faturamento (substitui as cores da planilha mensal): marca, por empresa e mês,
// se o faturamento já foi enviado ao cliente, se não é para enviar, ou desfaz a marca.
import { revalidatePath } from 'next/cache';
import { cliente, exigirCorretora } from './servidor';

export type SituacaoEnvio = 'enviado' | 'nao_enviar' | 'pendente';
export type Envio = { competencia: string; eid: string; situacao: SituacaoEnvio; marcado_nome: string | null; marcado_em: string };

export async function marcarEnvio(c: string, competencia: string, eid: string, situacao: SituacaoEnvio): Promise<{ erro?: string; envio?: Envio }> {
  const { s } = await exigirCorretora(c);
  if (!/^\d{4}-\d{2}$/.test(competencia) || !eid || !['enviado', 'nao_enviar', 'pendente'].includes(situacao)) return { erro: 'Pedido inválido.' };
  const db = await cliente();
  const linha = { situacao, marcado_por: s.userId, marcado_nome: s.nome, marcado_em: new Date().toISOString() };
  const { data: ja } = await db.from('faturamento_envios').select('id').eq('corretora_id', c).eq('competencia', competencia).eq('eid', eid).maybeSingle();
  const { error } = ja
    ? await db.from('faturamento_envios').update(linha).eq('id', ja.id)
    : await db.from('faturamento_envios').insert({ corretora_id: c, competencia, eid, ...linha });
  if (error) return { erro: /row-level security|permission/i.test(error.message) ? 'Seu acesso não permite fazer isso.' : error.message };
  revalidatePath(`/corretora/${c}/faturamento`);
  return { envio: { competencia, eid, situacao, marcado_nome: linha.marcado_nome, marcado_em: linha.marcado_em } };
}
