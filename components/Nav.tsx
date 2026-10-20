'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav({ links }: { links: { href: string; rotulo: string; exato?: boolean }[] }) {
  const atual = usePathname();
  return (
    <nav className="nav" aria-label="Seções">
      {links.map((l) => {
        const ativo = l.exato ? atual === l.href : atual === l.href || atual.startsWith(l.href + '/');
        return (
          // a Central é uma página à parte (rota de servidor), então vai por link comum
          l.href.startsWith('/central/') ? (
            <a key={l.href} href={l.href}>{l.rotulo}</a>
          ) : (
            <Link key={l.href} href={l.href} aria-current={ativo ? 'page' : undefined}>
              {l.rotulo}
            </Link>
          )
        );
      })}
    </nav>
  );
}
