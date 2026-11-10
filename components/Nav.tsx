'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from './Menu';

export type LinkNav = { href: string; rotulo: string; exato?: boolean; dica?: string };
// um item da barra é um link direto ou um grupo (abre uma lista com os links)
export type ItemNav = LinkNav | { rotulo: string; itens: LinkNav[] };

const ehAtivo = (atual: string, l: LinkNav) => (l.exato ? atual === l.href : atual === l.href || atual.startsWith(l.href + '/'));

function Ligacao({ l, ativo, className }: { l: LinkNav; ativo: boolean; className?: string }) {
  const conteudo = l.dica ? <><span>{l.rotulo}</span><small>{l.dica}</small></> : l.rotulo;
  // a Central é uma página à parte (rota de servidor), então vai por link comum
  return l.href.startsWith('/central/') ? (
    <a href={l.href} className={className}>{conteudo}</a>
  ) : (
    <Link href={l.href} className={className} aria-current={ativo ? 'page' : undefined}>{conteudo}</Link>
  );
}

export function Nav({ links }: { links: ItemNav[] }) {
  const atual = usePathname();
  return (
    <nav className="nav" aria-label="Seções">
      {links.map((item) => {
        if (!('itens' in item)) return <Ligacao key={item.href} l={item} ativo={ehAtivo(atual, item)} className="nav-item" />;
        if (item.itens.length === 1) {
          const l = item.itens[0];
          return <Ligacao key={l.href} l={{ ...l, dica: undefined }} ativo={ehAtivo(atual, l)} className="nav-item" />;
        }
        const ativoNoGrupo = item.itens.some((l) => ehAtivo(atual, l));
        return (
          <Menu key={item.rotulo} rotulo={item.rotulo} ativo={ativoNoGrupo}>
            {item.itens.map((l) => <Ligacao key={l.href} l={l} ativo={ehAtivo(atual, l)} />)}
          </Menu>
        );
      })}
    </nav>
  );
}
