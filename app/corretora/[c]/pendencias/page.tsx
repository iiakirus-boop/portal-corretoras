import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { Pendencias } from '@/components/central/Pendencias';

export const dynamic = 'force-dynamic';

// As Pendências da Central de Agentes, como tela do portal. Quem é da corretora marca tarefa como resolvida, como na Central.
export default async function PendenciasPage({ params, searchParams }: { params: Promise<{ c: string }>; searchParams: Promise<{ agente?: string }> }) {
  const { c } = await params;
  const { agente } = await searchParams;
  const { s, master, admin } = await exigirCorretora(c);
  const db = await cliente();
  const d = await docsCentral(db, c, ['faturas', 'tarefas', 'agentes', 'eventos', ...(admin ? ['comissoes'] : [])]);
  const podeEditar = master || admin || s.membros.some((m) => m.corretora_id === c && !m.empresa_id);
  // nome de quem marcou cada tarefa: o e-mail dos membros da corretora
  const { data: membros } = await db.from('membros').select('*').eq('corretora_id', c);
  const nomes = Object.fromEntries(((membros ?? []) as { user_id: string; email: string | null }[]).filter((m) => m.email).map((m) => [m.user_id, String(m.email).split('@')[0]]));
  return <Pendencias c={c} podeEditar={podeEditar} usuario={s.userId} nomes={nomes} agente={agente ?? null}
    d={{ faturas: d.faturas, tarefas: d.tarefas, agentes: d.agentes.sort((a, b) => (+a.ordem || 99) - (+b.ordem || 99)), eventos: d.eventos, comissoes: d.comissoes ?? [] }} />;
}
