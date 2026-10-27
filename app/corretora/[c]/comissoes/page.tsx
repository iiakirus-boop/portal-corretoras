import { redirect } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { Comissoes } from '@/components/central/Comissoes';

export const dynamic = 'force-dynamic';

// As Comissões da Central de Agentes, como tela do portal: mesmos dados (central_docs) e a mesma Projeção. Só administrador.
export default async function ComissoesPage({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const { admin } = await exigirCorretora(c);
  if (!admin) redirect(`/corretora/${c}/faturamento`);
  const db = await cliente();
  const d = await docsCentral(db, c, ['faturas', 'comissoes', 'agenciamentos', 'implantacoes', 'projecoes']);
  // "hoje" no fuso de Brasília, igual para o servidor e para o navegador
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return <Comissoes c={c} hoje={hoje} d={{ faturas: d.faturas, comissoes: d.comissoes, agenciamentos: d.agenciamentos, implantacoes: d.implantacoes, projecoes: d.projecoes }} />;
}
