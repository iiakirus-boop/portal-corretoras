import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { Faturamento } from '@/components/central/Faturamento';

export const dynamic = 'force-dynamic';

// O Faturamento da Central de Agentes, como tela do portal: mesmos dados (central_docs) e as mesmas contas (lib/central/modelo.ts)
export default async function FaturamentoPage({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  // comissão só para administrador da corretora (a Central também não entrega comissão ao operador)
  const d = await docsCentral(db, c, admin ? ['faturas', 'comissoes'] : ['faturas']);
  return <Faturamento c={c} faturas={d.faturas} comissoes={admin ? d.comissoes : null} />;
}
