import 'server-only';
import type { Cliente } from './servidor';
import { docsCentral } from './central/dados';

export type AvisoTopo = { rotulo: string; dica: string; n: number; href: string };

// O que precisa de alguém da corretora agora, num lugar só (o sininho da barra de cima):
// tarefas das Pendências, pedidos novos, cards do Quadro com prazo vencido e cards urgentes.
// Cada consulta que falhar vira zero: o sininho nunca derruba a tela.
export async function avisosCorretora(db: Cliente, c: string): Promise<AvisoTopo[]> {
  const base = `/corretora/${c}`;
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // dia em Brasília
  const [tarefas, pedidos, cards] = await Promise.all([
    docsCentral(db, c, ['tarefas']).then((d) => d.tarefas.filter((t) => t.coluna === 'precisa').length).catch(() => 0),
    db.from('pedidos').select('id').eq('corretora_id', c).eq('status', 'recebido').limit(500).then((r: { data: unknown[] | null }) => r.data?.length ?? 0, () => 0),
    db.from('quadro_cards').select('id, coluna, prazo, prioridade').eq('corretora_id', c).eq('arquivado', false).limit(2000)
      .then((r: { data: { coluna: string; prazo: string | null; prioridade: number }[] | null }) => (r.data ?? []).filter((x) => x.coluna !== 'feito'), () => []),
  ]);
  const vencidos = cards.filter((x: { prazo: string | null }) => x.prazo && x.prazo < hoje).length;
  const urgentes = cards.filter((x: { prioridade: number }) => x.prioridade === 1).length;
  return [
    { rotulo: 'Pendências com você', dica: 'O que os agentes deixaram para alguém decidir', n: tarefas, href: `${base}/pendencias` },
    { rotulo: 'Pedidos novos', dica: 'Chegaram das empresas e ninguém começou', n: pedidos, href: `${base}/pedidos` },
    { rotulo: 'Cards com prazo vencido', dica: 'No Quadro da equipe', n: vencidos, href: `${base}/quadro?so=atrasados` },
    { rotulo: 'Cards urgentes', dica: 'No Quadro da equipe', n: urgentes, href: `${base}/quadro?so=urgentes` },
  ];
}
