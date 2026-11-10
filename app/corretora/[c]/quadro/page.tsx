import { cliente, exigirCorretora } from '@/lib/servidor';
import { Quadro } from '@/components/quadro/Quadro';
import type { ArquivoCard, CardQuadro, EmailCard, EventoCard, Pessoa, TipoDemanda } from '@/lib/quadro';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Quadro' };

// Quadro de tarefas da equipe: cards por coluna, cor pelo tipo de demanda e ordem pela prioridade
export default async function QuadroPage({ params, searchParams }: { params: Promise<{ c: string }>; searchParams: Promise<{ so?: string; card?: string }> }) {
  const { c } = await params;
  const sp = await searchParams;
  const { s } = await exigirCorretora(c);
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
  const vazio = { data: [] };
  const [{ data: eventos }, { data: emails }, { data: arquivos }] = ids.length
    ? await Promise.all([
      db.from('quadro_eventos').select('*').in('card_id', ids).order('em', { ascending: false }).limit(2000),
      db.from('quadro_emails').select('id, card_id, mensagem_id, em, de, para, cc, assunto, trecho').in('card_id', ids).order('em', { ascending: false }).limit(2000),
      // o conteúdo do arquivo não vem aqui: só nome e tamanho (o download é por /quadro-arquivo/<id>)
      db.from('quadro_arquivos').select('id, card_id, email_id, tipo, nome, tamanho').in('card_id', ids).limit(4000),
    ])
    : [vazio, vazio, vazio];
  // quem está olhando: a pessoa da equipe com o mesmo e-mail do login (para o botão "Minhas tarefas")
  const eq = (equipe ?? []) as Pessoa[];
  const eu = eq.find((p) => p.email && p.email.toLowerCase() === s.email.toLowerCase())?.id ?? null;
  const so = sp.so === 'urgentes' || sp.so === 'atrasados' || sp.so === 'parados' ? sp.so : '';
  return (
    <Quadro eu={eu} soInicial={so} cardInicial={sp.card && cs.some((x) => x.id === sp.card) ? sp.card : null} c={c} equipe={(equipe ?? []) as Pessoa[]} tipos={(tipos ?? []) as TipoDemanda[]} cards={cs}
      eventos={(eventos ?? []) as EventoCard[]} emails={(emails ?? []) as EmailCard[]} arquivos={(arquivos ?? []) as ArquivoCard[]} agora={Date.now()} />
  );
}
