'use client';
// Barras empilhadas por seguradora (o barsSVG da Central): clique ou Enter troca o mês, o balão mostra cada seguradora
import { useEffect, useRef, useState } from 'react';
import { FCOL, brl, kfmt } from '@/lib/central/modelo';

export type Coluna = { key: string; label: string; sub?: string; title?: string; vals: Record<string, number>; extra?: React.ReactNode };

export function Barras({ colunas, chaves, sel, onClick, aria, h = 220 }: {
  colunas: Coluna[]; chaves: string[]; sel?: string; onClick?: (k: string) => void; aria: string; h?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [larg, setLarg] = useState(600);
  const [tip, setTip] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setLarg(Math.round(el.clientWidth || 600)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // com muitos meses o gráfico rola de lado: abre mostrando os mais recentes
  useEffect(() => { const el = box.current; if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth; }, [colunas.length, larg]);

  if (!colunas.length) return <p className="empty">Sem dados ainda.</p>;
  const H = h, top = 24, subs = colunas.some((b) => b.sub), bot = subs ? 40 : 26, PADL = 48, n = colunas.length;
  const W = Math.max(larg, PADL + n * 40);
  const tot = (b: Coluna) => chaves.reduce((s, k) => s + (b.vals[k] || 0), 0);
  const max = Math.max(1, ...colunas.map(tot)) * 1.12;
  const r = max / 4, p = Math.pow(10, Math.floor(Math.log10(r))), step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= r)!;
  const ymax = Math.ceil(max / step) * step, Y = (v: number) => top + (H - top - bot) * (1 - v / ymax);
  const cw = (W - PADL) / n, bw = Math.min(42, cw * 0.62), cx = (i: number) => PADL + cw * (i + 0.5), small = cw < 52;
  const ticks: number[] = []; for (let t = 0; t <= ymax + 1e-6; t += step) ticks.push(t);
  const b = tip == null ? null : colunas[tip];

  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }} role="img" aria-label={aria}>
        {ticks.map((t) => (
          <g key={t}><line className="grid-l" x1={PADL - 4} x2={W} y1={Y(t)} y2={Y(t)} /><text className="ax" x={0} y={Y(t) + 4}>{t ? kfmt(t) : '0'}</text></g>
        ))}
        {colunas.map((c, i) => {
          let y0 = Y(0);
          const tv = tot(c), ativo = c.key === sel;
          const ir = () => onClick?.(c.key);
          return (
            <g key={c.key} className={'bg' + (ativo ? ' sel' : '')} tabIndex={0} role="button" aria-label={`${c.title || c.label}: R$ ${brl(tv)}`}
              onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(i)} onBlur={() => setTip(null)}
              onClick={ir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } }}>
              <rect className="hit" x={cx(i) - cw * 0.47} y={top - 20} width={cw * 0.94} height={H - top - bot + 20} rx={6} />
              {chaves.map((k) => {
                const v = c.vals[k] || 0; if (v <= 0) return null;
                const hh = Math.max(1, Y(0) - Y(v)), y = y0 - hh; y0 = y;
                return <rect key={k} x={cx(i) - bw / 2} y={y} width={bw} height={hh} fill={FCOL[k] || 'var(--accent)'} stroke="var(--surface)" strokeWidth={1} />;
              })}
              {tv > 0 && <text className="val" x={cx(i)} y={Y(tv) - 6} textAnchor="middle" style={{ fontSize: small ? 10 : 11.5 }}>{kfmt(tv)}</text>}
              <text className="ax" x={cx(i)} y={H - bot + 15} textAnchor="middle" style={{ fontWeight: ativo ? 800 : 600, fill: 'var(--fg)', fontSize: small ? 10 : 11 }}>{c.label}</text>
              {subs && c.sub && <text className="sub" x={cx(i)} y={H - bot + 30} textAnchor="middle">{c.sub}</text>}
            </g>
          );
        })}
      </svg>
      {b && tip != null && (
        <div className="tip" style={{ left: Math.min(Math.max(cx(tip), 90), W - 90), top: Math.max(40, Y(tot(b)) - 8) }}>
          <b>{b.title || b.label}</b>
          {chaves.filter((k) => b.vals[k] > 0).map((k) => <span key={k}><br /><i style={{ background: FCOL[k] }} />{k}: R$ <b>{brl(b.vals[k])}</b></span>)}
          {chaves.length > 1 && <><br />Total: R$ <b>{brl(tot(b))}</b></>}
          {b.extra && <><br />{b.extra}</>}
        </div>
      )}
    </div>
  );
}
