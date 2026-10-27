import { Nav } from './Nav';
import { sair } from '@/lib/acoes';

type Props = {
  master?: boolean;
  nome: string;
  sub?: string;
  cor?: string | null;
  inicio: string;
  links: { href: string; rotulo: string; exato?: boolean }[];
  usuario: string;
  papel: string;
};

const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function Topo({ master, nome, sub, cor, inicio, links, usuario, papel }: Props) {
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
          <span className="quem-txt">
            <b>{usuario}</b>
            {papel}
          </span>
          <form action={sair}>
            <button className="sair">Sair</button>
          </form>
        </div>
      </div>
    </header>
  );
}
