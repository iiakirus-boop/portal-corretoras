'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Botão que abre uma lista por baixo (os menus da barra de cima).
// A lista fica "fixa" na tela, calculada a partir do botão, para não ser cortada
// pela barra (que rola de lado no celular). Fecha ao clicar fora, no Esc ou ao trocar de página.
export function Menu({ rotulo, ativo, alinhar = 'esquerda', classe = 'nav-item', children }: {
  rotulo: React.ReactNode;
  ativo?: boolean;
  alinhar?: 'esquerda' | 'direita';
  classe?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const atual = usePathname();

  useEffect(() => setAberto(false), [atual]);

  useLayoutEffect(() => {
    if (!aberto || !botao.current) return;
    const calcular = () => {
      const r = botao.current!.getBoundingClientRect();
      const largura = Math.min(260, window.innerWidth - 16);
      let left = alinhar === 'direita' ? r.right - largura : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - largura - 8));
      setPos({ top: r.bottom, left, width: largura });
    };
    calcular();
    window.addEventListener('resize', calcular);
    window.addEventListener('scroll', calcular, true);
    const fora = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!botao.current?.contains(t) && !lista.current?.contains(t)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('resize', calcular);
      window.removeEventListener('scroll', calcular, true);
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto, alinhar]);

  return (
    <>
      <button ref={botao} type="button" className={classe} aria-expanded={aberto} aria-haspopup="true"
        data-ativo={ativo ? '' : undefined} onClick={() => setAberto((a) => !a)}>
        {rotulo}
        <svg className="seta" width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {aberto && (
        <div ref={lista} className="menu-lista" style={pos} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setAberto(false); }}>
          {children}
        </div>
      )}
    </>
  );
}
