import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topo } from '@/components/Topo';
import { cliente, exigirCorretora, papeisCorretora } from '@/lib/servidor';
import { PAPEL } from '@/lib/formato';

export default async function CorretoraLayout({ children, params }: { children: React.ReactNode; params: Promise<{ c: string }> }) {
  const { c } = await params;
  const { s, master, admin } = await exigirCorretora(c);
  const db = await cliente();
  const { data: cor } = await db.from('corretoras').select('*').eq('id', c).maybeSingle();
  if (!cor) notFound();
  const base = `/corretora/${c}`;
  const papel = master ? 'Master' : PAPEL[papeisCorretora(s, c).includes('admin_corretora') ? 'admin_corretora' : 'operador_corretora'];
  const links = [
    // mesmo menu da Central: as quatro abas dela, depois as telas do portal
    { href: `/central/${c}#inicio`, rotulo: 'Início' },
    { href: `/central/${c}#faturamento`, rotulo: 'Faturamento' },
    ...(admin ? [{ href: `/central/${c}#comissoes`, rotulo: 'Comissões' }, { href: `/central/${c}#projecao`, rotulo: 'Projeção' }] : []),
    { href: `${base}/empresas`, rotulo: 'Empresas' },
    { href: `${base}/pedidos`, rotulo: 'Pedidos' },
    ...(admin ? [{ href: `${base}/usuarios`, rotulo: 'Equipe e acessos' }] : []),
  ];
  return (
    <>
      <Topo nome={cor.nome} sub="Portal da corretora" cor={cor.cor_primaria} inicio={`/central/${c}`} links={links} usuario={s.nome} papel={papel} />
      {master && (
        <div className="faixa-master"><div className="wrap">Você está vendo o painel da {cor.nome} como master. <Link href={`/master/corretoras/${c}`}>Voltar ao master</Link></div></div>
      )}
      <main className="wrap">{children}</main>
    </>
  );
}
