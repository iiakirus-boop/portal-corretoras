import type { Metadata } from 'next';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { docsCentral } from '@/lib/central/dados';
import { mapaFichas } from '@/lib/central/fichas';
import { Faturamento } from '@/components/central/Faturamento';
import type { Envio } from '@/lib/acoes-faturamento';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Faturamento' };

// O Faturamento da Central de Agentes, como tela do portal: mesmos dados (central_docs) e as mesmas contas (lib/central/modelo.ts)
export default async function FaturamentoPage({ params, searchParams }: { params: Promise<{ c: string }>; searchParams: Promise<{ emp?: string }> }) {
  const { c } = await params;
  const { emp } = await searchParams;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  // comissão só para administrador da corretora (a Central também não entrega comissão ao operador)
  const [d, { data: envios }, fichas] = await Promise.all([
    docsCentral(db, c, admin ? ['faturas', 'comissoes'] : ['faturas']),
    db.from('faturamento_envios').select('competencia, eid, situacao, marcado_nome, marcado_em').eq('corretora_id', c).limit(5000),
    mapaFichas(db, c),
  ]);
  return (
      <Faturamento c={c} faturas={d.faturas} comissoes={admin ? d.comissoes : null} inicial={emp ?? null}
        envios={((envios ?? []) as Envio[]).map((x) => ({ ...x, competencia: String(x.competencia).trim() }))} fichas={fichas.porEid} />
  );
}
