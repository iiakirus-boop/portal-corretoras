'use server';
// Gravações do quadro de tarefas. Quem pode é o banco que decide (regras de acesso: só quem é da corretora).
// Cada função devolve { erro } para a tela mostrar, em vez de trocar de página.
import { revalidatePath } from 'next/cache';
import { cliente, exigirCorretora } from './servidor';
import { CAMPOS_CARD, COLUNAS, type Coluna } from './quadro';

type R = { erro?: string; id?: string };
const traduzir = (m: string) => (/row-level security|permission/i.test(m) ? 'Seu acesso não permite fazer isso.' : m);
const colunaOk = (c: unknown): c is Coluna => COLUNAS.some((x) => x.id === c);

function limpar(dados: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_CARD) {
    if (!(k in dados)) continue;
    let v = dados[k];
    if (typeof v === 'string') v = v.trim();
    if (v === '') v = null;
    if (k === 'prioridade') v = Math.min(4, Math.max(1, Number(v) || 3));
    if (k === 'coluna' && !colunaOk(v)) continue;
    out[k] = v;
  }
  return out;
}

export async function moverCard(c: string, id: string, coluna: Coluna, ordem: number): Promise<R> {
  await exigirCorretora(c);
  if (!colunaOk(coluna)) return { erro: 'Coluna inválida.' };
  const db = await cliente();
  const { data, error } = await db.from('quadro_cards').update({ coluna, ordem }).eq('id', id).eq('corretora_id', c).select('id');
  if (error) return { erro: traduzir(error.message) };
  if (!data?.length) return { erro: 'Seu acesso não permite mexer neste card.' };
  revalidatePath(`/corretora/${c}/quadro`);
  return {};
}

export async function salvarCard(c: string, id: string | null, dados: Record<string, unknown>): Promise<R> {
  const { s } = await exigirCorretora(c);
  const campos = limpar(dados);
  if (!id && !campos.titulo) return { erro: 'Escreva o título do card.' };
  if (id && 'titulo' in campos && !campos.titulo) return { erro: 'O título não pode ficar vazio.' };
  const db = await cliente();
  if (id) {
    const { data, error } = await db.from('quadro_cards').update(campos).eq('id', id).eq('corretora_id', c).select('id');
    if (error) return { erro: traduzir(error.message) };
    if (!data?.length) return { erro: 'Seu acesso não permite mexer neste card.' };
    revalidatePath(`/corretora/${c}/quadro`);
    return { id };
  }
  const { data, error } = await db.from('quadro_cards')
    .insert({ ...campos, corretora_id: c, origem: 'manual', criado_por: s.userId, ordem: Date.now() / 1000 }).select('id');
  if (error) return { erro: traduzir(error.message) };
  revalidatePath(`/corretora/${c}/quadro`);
  return { id: data?.[0]?.id };
}

export async function arquivarCard(c: string, id: string): Promise<R> {
  await exigirCorretora(c);
  const db = await cliente();
  const { error } = await db.from('quadro_cards').update({ arquivado: true }).eq('id', id).eq('corretora_id', c);
  if (error) return { erro: traduzir(error.message) };
  revalidatePath(`/corretora/${c}/quadro`);
  return {};
}

export async function comentarCard(c: string, card: string, texto: string): Promise<R> {
  const { s } = await exigirCorretora(c);
  const t = texto.trim();
  if (!t) return { erro: 'Escreva o comentário.' };
  const db = await cliente();
  const { error } = await db.from('quadro_eventos').insert({ card_id: card, corretora_id: c, autor_id: s.userId, autor_nome: s.nome, tipo: 'comentario', texto: t.slice(0, 4000) });
  if (error) return { erro: traduzir(error.message) };
  revalidatePath(`/corretora/${c}/quadro`);
  return {};
}
