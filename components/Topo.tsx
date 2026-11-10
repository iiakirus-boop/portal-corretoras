import Link from 'next/link';
import { Nav, type ItemNav, type LinkNav } from './Nav';
import { Menu } from './Menu';
import { sair } from '@/lib/acoes';
import { Sino, type AvisoSino } from './Sino';

type Props = {
  master?: boolean;
  nome: string;
  sub?: string;
  cor?: string | null;
  inicio: string;
  links: ItemNav[];
  /** links que ficam no menu do nome da pessoa (canto direito), antes de "Trocar senha" e "Sair" */
  conta?: LinkNav[];
  usuario: string;
  papel: string;
  /** endereço da busca geral (uma caixa só para empresa, pessoa, fatura e card) */
  busca?: string;
  /** o que precisa da pessoa agora: vira o sininho */
  avisos?: AvisoSino[];
};

const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function Topo({ master, nome, sub, cor, inicio, links, conta = [], usuario, papel, busca, avisos }: Props) {
  return (
    <header className={`top${master ? ' master' : ''}`} style={!master && cor ? ({ ['--marca' as string]: cor } as React.CSSProperties) : undefined}>
      <div className="wrap">
        <a href={inicio} className="brand">
          <span className="logo" aria-hidden>{master ? 'M' : iniciais(nome)}</span>
          <span className="brand-txt" title={sub ? `${nome} · ${sub}` : nome}>
            <span className="brand-name">{nome}</span>
            {sub && <span className="brand-sub" style={{ display: 'block' }}>{sub}</span>}
          </span>
        </a>
        <Nav links={links} />
        <div className="quem">
          {busca && (
            <>
              <form action={busca} method="get" className="top-busca" role="search">
                <input type="search" name="q" placeholder="Buscar empresa, pessoa, fatura…" aria-label="Buscar em tudo" enterKeyHint="search" />
              </form>
              <Link href={busca} className="top-lupa" aria-label="Buscar em tudo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              </Link>
            </>
          )}
          {avisos && <Sino avisos={avisos} />}
          <Menu classe="conta-btn" alinhar="direita" rotulo={
            <>
              <span className="conta-ini" aria-hidden>{iniciais(usuario) || '?'}</span>
              <span className="quem-txt"><b>{usuario}</b>{papel}</span>
            </>
          }>
            <div className="menu-quem"><b>{usuario}</b><span>{papel}</span></div>
            {conta.map((l) => <Link key={l.href} href={l.href}>{l.rotulo}</Link>)}
            <Link href="/conta/senha">Trocar senha</Link>
            <form action={sair}>
              <button className="menu-sair">Sair</button>
            </form>
          </Menu>
        </div>
      </div>
    </header>
  );
}
