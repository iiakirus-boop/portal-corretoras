import { redirect } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { Projecao } from '@/components/central/Projecao';

export const dynamic = 'force-dynamic';

// A Projeção da Central de Agentes, como tela do portal: mesmos dados (central_docs) e a mesma conta. Só administrador.
export default async function ProjecaoPage({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const { s, admin } = await exigirCorretora(c);
  if (!admin) redirect(`/corretora/${c}/faturamento`);
  const db = await cliente();
  const d = await docsCentral(db, c, ['faturas', 'comissoes', 'agenciamentos', 'implantacoes', 'projecoes']);
  // "hoje" no fuso de Brasília, igual para o servidor e para o navegador
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return <Projecao c={c} hoje={hoje} usuario={s.userId} d={{ faturas: d.faturas, comissoes: d.comissoes, agenciamentos: d.agenciamentos, implantacoes: d.implantacoes, projecoes: d.projecoes }} />;
}
