import Link from 'next/link';
import { Topo } from '@/components/Topo';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { PAPEL } from '@/lib/formato';

export default async function EmpresaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ e: string }> }) {
  const { e } = await params;
  const x = await exigirEmpresa(e);
  const db = await cliente();
  const { data: cor } = await db.from('corretoras').select('*').eq('id', x.emp.corretora_id).maybeSingle();
  const base = `/empresa/${e}`;
  const papel = x.master ? 'Master' : x.daCorretora ? `Equipe ${cor?.nome ?? 'da corretora'}` : PAPEL[x.papeis[0]];
  const links = [
    { href: base, rotulo: 'Início', exato: true },
    ...(x.veFaturas ? [{ href: `${base}/faturas`, rotulo: 'Faturas e boletos' }] : []),
    ...(x.veVidas ? [{ href: `${base}/vidas`, rotulo: 'Vidas' }] : []),
    { href: `${base}/pedidos`, rotulo: 'Pedidos' },
    ...(x.gestor ? [{ href: `${base}/pessoas`, rotulo: 'Pessoas' }] : []),
  ];
  return (
    <>
      <Topo nome={x.emp.nome_curto ?? x.emp.razao_social} sub={cor ? `Atendida por ${cor.nome}` : undefined} cor={cor?.cor_primaria}
        inicio={base} links={links} usuario={x.s.nome} papel={papel} />
      {(x.master || x.daCorretora) && (
        <div className="faixa-master"><div className="wrap">Você está vendo o portal como a empresa vê. <Link href={`/corretora/${x.emp.corretora_id}/empresas/${e}`}>Voltar à ficha da empresa</Link></div></div>
      )}
      <main className="wrap">{children}</main>
    </>
  );
}
