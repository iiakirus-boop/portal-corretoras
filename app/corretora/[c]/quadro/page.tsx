import { cliente, exigirCorretora } from '@/lib/servidor';
import { Quadro } from '@/components/quadro/Quadro';
import type { CardQuadro, EventoCard, Pessoa, TipoDemanda } from '@/lib/quadro';

export const dynamic = 'force-dynamic';

// Quadro de tarefas da equipe: cards por coluna, cor pelo tipo de demanda e ordem pela prioridade
export default async function QuadroPage({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  await exigirCorretora(c);
  const db = await cliente();
  const corte = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: equipe }, { data: tipos }, { data: cards }] = await Promise.all([
    db.from('quadro_equipe').select('*').eq('corretora_id', c).eq('ativo', true).order('ordem'),
    db.from('quadro_tipos').select('*').eq('corretora_id', c).eq('ativo', true).order('ordem'),
    db.from('quadro_cards').select('*').eq('corretora_id', c).eq('arquivado', false).order('ordem'),
  ]);
  // os concluídos ficam no quadro por 14 dias
  const cs = ((cards ?? []) as CardQuadro[]).filter((x) => x.coluna !== 'feito' || !x.concluido_em || x.concluido_em >= corte);
  const ids = cs.map((x) => x.id);
  const { data: eventos } = ids.length
    ? await db.from('quadro_eventos').select('*').in('card_id', ids).order('em', { ascending: false }).limit(2000)
    : { data: [] };
  return (
    <Quadro c={c} equipe={(equipe ?? []) as Pessoa[]} tipos={(tipos ?? []) as TipoDemanda[]} cards={cs}
      eventos={(eventos ?? []) as EventoCard[]} agora={Date.now()} />
  );
}
