import { redirect } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { Aviso } from '@/components/Aviso';
import { Pessoas } from '@/components/Pessoas';
import type { Convite, Empresa, Membro } from '@/lib/tipos';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function Usuarios({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  const { s, admin } = await exigirCorretora(c);
  if (!admin) redirect(`/corretora/${c}`);
  const db = await cliente();
  const [{ data: membros }, { data: convites }, { data: empresas }] = await Promise.all([
    db.from('membros').select('*').eq('corretora_id', c).eq('ativo', true),
    db.from('convites').select('*').eq('corretora_id', c).order('criado_em', { ascending: false }),
    db.from('empresas').select('*').eq('corretora_id', c).order('razao_social'),
  ]);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Equipe e acessos</h1><p>Sua equipe e as pessoas das empresas. Cada uma só vê o que o papel dela permite.</p></div>
      </div>
      <Aviso sp={sp} />
      <Pessoas de={`/corretora/${c}/usuarios`} corretoraId={c} eu={s.userId} podeRemover
        membros={(membros ?? []) as Membro[]} convites={(convites ?? []) as Convite[]} empresas={(empresas ?? []) as Empresa[]}
        papeis={['operador_corretora', 'admin_corretora', 'gestor_empresa', 'movimentacao_empresa', 'financeiro_empresa']} />
    </div>
  );
}
