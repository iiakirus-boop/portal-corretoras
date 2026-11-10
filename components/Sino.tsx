'use client';
import Link from 'next/link';
import { Menu } from './Menu';

export type AvisoSino = { rotulo: string; dica: string; n: number; href: string };

// Sininho da barra de cima: um lugar só para "o que precisa de você" (pendências, pedidos, cards do Quadro).
export function Sino({ avisos }: { avisos: AvisoSino[] }) {
  const total = avisos.reduce((t, a) => t + a.n, 0);
  const com = avisos.filter((a) => a.n > 0);
  return (
    <Menu classe="sino-btn" alinhar="direita" rotulo={
      <>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span className="sr">{total ? `${total} coisas precisam de você` : 'Nada precisa de você agora'}</span>
        {total > 0 && <span className="sino-n" aria-hidden>{total > 99 ? '99+' : total}</span>}
      </>
    }>
      <div className="menu-quem"><b>Precisa de você</b><span>{total ? 'Clique para ir direto' : 'Nada pendente agora'}</span></div>
      {com.map((a) => (
        <Link key={a.href} href={a.href} className="sino-item"><span className="sino-l"><span>{a.rotulo}</span><small>{a.dica}</small></span><b>{a.n}</b></Link>
      ))}
    </Menu>
  );
}
