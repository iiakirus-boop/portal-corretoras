import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { Inicio } from '@/components/central/Inicio';

export const dynamic = 'force-dynamic';

// O início da corretora: a Visão geral da Central de Agentes, como tela do portal. Comissão só para administrador.
export default async function InicioCorretora({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  const d = await docsCentral(db, c, ['faturas', 'tarefas', 'agentes', ...(admin ? ['comissoes', 'agenciamentos', 'implantacoes'] : [])]);
  // "hoje" no fuso de Brasília, igual para o servidor e para o navegador
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return <Inicio c={c} hoje={hoje} admin={admin} d={{ faturas: d.faturas, tarefas: d.tarefas, agentes: d.agentes, comissoes: d.comissoes ?? [], agenciamentos: d.agenciamentos ?? [], implantacoes: d.implantacoes ?? [] }} />;
}
