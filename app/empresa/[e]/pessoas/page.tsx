import { redirect } from 'next/navigation';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { Aviso } from '@/components/Aviso';
import { Pessoas } from '@/components/Pessoas';
import type { Convite, Membro } from '@/lib/tipos';

type P = { params: Promise<{ e: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function PessoasEmpresa({ params, searchParams }: P) {
  const { e } = await params;
  const sp = await searchParams;
  const x = await exigirEmpresa(e);
  if (!x.gestor) redirect(`/empresa/${e}`);
  const db = await cliente();
  const [{ data: membros }, { data: convites }] = await Promise.all([
    db.from('membros').select('*').eq('empresa_id', e).eq('ativo', true),
    db.from('convites').select('*').eq('empresa_id', e),
  ]);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Pessoas</h1><p>Quem da empresa usa o portal. Convide o RH para cuidar das vidas e o financeiro para os boletos.</p></div>
      </div>
      <Aviso sp={sp} />
      <Pessoas de={`/empresa/${e}/pessoas`} corretoraId={x.emp.corretora_id} empresaFixa={e} eu={x.s.userId}
        podeRemover={x.daCorretora || x.master}
        membros={(membros ?? []) as Membro[]} convites={(convites ?? []) as Convite[]}
        papeis={['movimentacao_empresa', 'financeiro_empresa', 'gestor_empresa']} />
    </div>
  );
}
