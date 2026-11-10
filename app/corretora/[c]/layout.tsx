import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topo } from '@/components/Topo';
import type { ItemNav } from '@/components/Nav';
import { cliente, exigirCorretora, papeisCorretora } from '@/lib/servidor';
import { PAPEL } from '@/lib/formato';
import { avisosCorretora } from '@/lib/avisos';
import type { Metadata } from 'next';

// o nome da corretora aparece na aba do navegador, junto com o nome da tela
export async function generateMetadata({ params }: { params: Promise<{ c: string }> }): Promise<Metadata> {
  const { c } = await params;
  const db = await cliente();
  const { data } = await db.from('corretoras').select('nome').eq('id', c).maybeSingle();
  const nome = data?.nome ?? 'Portal da corretora';
  return { title: { template: `%s · ${nome}`, default: nome } };
}

export default async function CorretoraLayout({ children, params }: { children: React.ReactNode; params: Promise<{ c: string }> }) {
  const { c } = await params;
  const { s, master, admin } = await exigirCorretora(c);
  const db = await cliente();
  const { data: cor } = await db.from('corretoras').select('*').eq('id', c).maybeSingle();
  if (!cor) notFound();
  const avisos = await avisosCorretora(db, c);
  const base = `/corretora/${c}`;
  const papel = master ? 'Master' : PAPEL[papeisCorretora(s, c).includes('admin_corretora') ? 'admin_corretora' : 'operador_corretora'];
  // Barra de cima enxuta: só as telas do dia a dia ficam soltas; o resto entra em menus.
  // "Equipe e acessos" vai para o menu do nome da pessoa (canto direito).
  const links: ItemNav[] = [
    { href: base, rotulo: 'Início', exato: true },
    { href: `${base}/quadro`, rotulo: 'Quadro' },
    { href: `${base}/faturamento`, rotulo: 'Faturamento' },
    { href: `${base}/cotacao`, rotulo: 'Cotação' },
    { rotulo: 'Empresas', itens: [
      { href: `${base}/empresas`, rotulo: 'Empresas', dica: 'Carteira, vidas e faturas por empresa' },
      { href: `${base}/pedidos`, rotulo: 'Pedidos', dica: 'Inclusões, exclusões e outros pedidos' },
      { href: `${base}/pendencias`, rotulo: 'Pendências', dica: 'O que os agentes deixaram para conferir' },
    ] },
    ...(admin ? [{ rotulo: 'Financeiro', itens: [
      { href: `${base}/comissoes`, rotulo: 'Comissões', dica: 'Comissão recebida e a receber' },
      { href: `${base}/projecao`, rotulo: 'Projeção', dica: 'O que vai cair nos próximos meses' },
    ] }] : []),
  ];
  const conta = admin ? [{ href: `${base}/usuarios`, rotulo: 'Equipe e acessos' }] : [];
  return (
    <>
      <Topo nome={cor.nome} sub="Portal da corretora" cor={cor.cor_primaria} inicio={base} links={links} conta={conta} usuario={s.nome} papel={papel} busca={`${base}/buscar`} avisos={avisos} />
      {master && (
        <div className="faixa-master"><div className="wrap">Você está vendo o painel da {cor.nome} como master. <Link href={`/master/corretoras/${c}`}>Voltar ao master</Link></div></div>
      )}
      <main className="wrap">{children}</main>
    </>
  );
}
