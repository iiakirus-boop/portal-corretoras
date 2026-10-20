import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { moeda } from '@/lib/formato';
import { TabelaFaturas } from '@/components/TabelaFaturas';
import type { Fatura } from '@/lib/tipos';

export default async function Faturas({ params }: { params: Promise<{ e: string }> }) {
  const { e } = await params;
  const x = await exigirEmpresa(e);
  if (!x.veFaturas) redirect(`/empresa/${e}`);
  const db = await cliente();
  const { data } = await db.from('faturas').select('*').eq('empresa_id', e).order('competencia', { ascending: false });
  const fs = (data ?? []) as Fatura[];
  const ano = new Date().getFullYear().toString();
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Faturas e boletos</h1><p>Total faturado em {ano}: {moeda(fs.filter((f) => f.competencia.startsWith(ano)).reduce((t, f) => t + (f.valor_total ?? 0), 0))}. O boleto some da lista depois de pago; a fatura continua disponível.</p></div>
        <Link href={`/empresa/${e}/pedidos/novo?tipo=segunda_via`} className="btn ghost">Pedir 2ª via</Link>
      </div>
      <TabelaFaturas faturas={fs} conferencia={x.daCorretora || x.master} />
    </div>
  );
}
