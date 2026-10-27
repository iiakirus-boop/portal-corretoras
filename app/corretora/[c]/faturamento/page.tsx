import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { Faturamento } from '@/components/central/Faturamento';

export const dynamic = 'force-dynamic';

// O Faturamento da Central de Agentes, como tela do portal: mesmos dados (central_docs) e as mesmas contas (lib/central/modelo.ts)
export default async function FaturamentoPage({ params, searchParams }: { params: Promise<{ c: string }>; searchParams: Promise<{ emp?: string }> }) {
  const { c } = await params;
  const { emp } = await searchParams;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  // comissão só para administrador da corretora (a Central também não entrega comissão ao operador)
  const d = await docsCentral(db, c, admin ? ['faturas', 'comissoes'] : ['faturas']);
  return <Faturamento c={c} faturas={d.faturas} comissoes={admin ? d.comissoes : null} inicial={emp ?? null} />;
}
