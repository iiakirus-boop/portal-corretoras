import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { Inicio, type MovInicio, type FaltaInicio } from '@/components/central/Inicio';
import { ABERTOS, seg } from '@/lib/formato';
import type { VidaCarteira } from '@/lib/contas';
import type { Empresa, EventoPedido, Pedido } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

// O início da corretora: os totais do mês, as movimentações em andamento, quem ainda não teve a fatura do mês gerada
// e a comissão desta semana. Comissão só para administrador.
export default async function InicioCorretora({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  const desde = new Date(Date.now() - 15 * 864e5).toISOString();
  const [d, { data: vc }, { data: emps }, { data: abertos }, { data: recentes }] = await Promise.all([
    docsCentral(db, c, ['faturas', 'tarefas', ...(admin ? ['comissoes', 'agenciamentos', 'implantacoes'] : [])]),
    db.from('vidas_carteira').select('*').eq('corretora_id', c),
    db.from('empresas').select('*').eq('corretora_id', c),
    db.from('pedidos').select('*').eq('corretora_id', c).in('status', ABERTOS).order('atualizado_em', { ascending: false }).limit(100),
    db.from('pedidos').select('*').eq('corretora_id', c).eq('status', 'concluido').gte('atualizado_em', desde).order('atualizado_em', { ascending: false }).limit(30),
  ]);
  const es = new Map(((emps ?? []) as Empresa[]).map((e) => [e.id, e]));
  const nomeE = (id: string) => { const e = es.get(id); return e?.nome_curto ?? e?.razao_social ?? '—'; };

  // movimentações: as abertas e as concluídas nos últimos 15 dias, com a última notícia de cada uma
  const ps = [...((abertos ?? []) as Pedido[]), ...((recentes ?? []) as Pedido[])];
  const { data: evs } = ps.length ? await db.from('pedido_eventos').select('*').in('pedido_id', ps.map((p) => p.id)).order('em', { ascending: false }) : { data: [] };
  const ultimo = new Map<string, EventoPedido>();
  for (const ev of (evs ?? []) as EventoPedido[]) if (ev.mensagem && ev.mensagem !== 'Pedido aberto' && !ultimo.has(ev.pedido_id)) ultimo.set(ev.pedido_id, ev);
  const movs: MovInicio[] = ps.map((p) => ({
    id: p.id, tipo: p.tipo, status: p.status, protocolo: p.protocolo, empresa: nomeE(p.empresa_id),
    pessoa: p.dados?.nome ?? p.dados?.assunto ?? '', carteirinha: p.dados?.carteirinha ?? '', prazo: p.prazo,
    noticia: ultimo.get(p.id)?.mensagem ?? '', em: p.atualizado_em,
  }));

  // vidas da carteira (último mês fechado + entradas e saídas) e quem ainda não teve a fatura do mês mais novo
  const vs = (vc ?? []) as VidaCarteira[];
  const novo = vs.reduce((m, v) => (v.competencia && v.competencia > m ? v.competencia : m), '');
  const faltam: FaltaInicio[] = vs.filter((v) => (v.competencia ?? '') < novo)
    .map((v) => ({ eid: es.get(v.empresa_id)?.codigo_interno ?? v.empresa_id, empresa: nomeE(v.empresa_id), seguradora: seg(v.seguradora_id), vidas: v.vidas }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa));
  const carteira = { vidas: vs.reduce((t, v) => t + v.vidas, 0), empresas: new Set(vs.map((v) => v.empresa_id)).size, contratos: vs.length, novo };

  // "hoje" no fuso de Brasília, igual para o servidor e para o navegador
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return <Inicio c={c} hoje={hoje} admin={admin} carteira={carteira} faltam={faltam} movs={movs}
    d={{ faturas: d.faturas, tarefas: d.tarefas, comissoes: d.comissoes ?? [], agenciamentos: d.agenciamentos ?? [], implantacoes: d.implantacoes ?? [] }} />;
}
