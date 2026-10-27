// As contas da Central de Agentes (lib/central/central.html), em TypeScript, para as telas do portal
// mostrarem exatamente os mesmos números. Ao mudar uma regra lá, mudar aqui também.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any> & { id: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Item = Record<string, any> & { comp: string; operadora: string; eid: string; empresa: string };

export const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const int = (n: unknown) => Number(n || 0).toLocaleString('pt-BR');
export const vidas = (n: unknown) => int(n) + (Number(n) === 1 ? ' vida' : ' vidas');
export const pct = (n: number, d = 1) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesLabel = (c?: string | null) => { if (!c) return '—'; const [a, m] = c.split('-'); return MES[+m - 1] + '/' + a.slice(2); };
export const kfmt = (v: number) => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(2).replace('.', ',') + ' mi' : a >= 1e3 ? Math.round(v / 1000) + ' mil' : String(Math.round(v)); };
export const sum = <T,>(a: T[], f: (x: T) => unknown) => a.reduce((s, x) => s + (+(f(x) as number) || 0), 0);
export const uniq = <T,>(a: T[]) => [...new Set(a)];
export const pdate = (s?: string | null) => { if (!s) return null; const p = String(s).split('/'); return p.length === 3 ? new Date(Date.UTC(+p[2], +p[1] - 1, +p[0])) : null; };
export const today = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
export const addMonth = (c: string, k: number) => { let [a, m] = c.split('-').map(Number); m += k; while (m > 12) { m -= 12; a++; } while (m < 1) { m += 12; a--; } return a + '-' + String(m).padStart(2, '0'); };
export const ckey = (d: Date) => d.toISOString().slice(0, 7);

// seguradoras: ordem e cor fixas (a cor segue a seguradora, nunca a posição)
export const FAMS = ['Porto', 'Bradesco', 'Amil', 'Santa Helena', 'Hapvida', 'SulAmérica'];
export const FCOL: Record<string, string> = { Porto: 'var(--s1)', Bradesco: 'var(--s2)', Amil: 'var(--s3)', 'Santa Helena': 'var(--s4)', Hapvida: 'var(--s5)', SulAmérica: 'var(--s6)', Outras: 'var(--faint)', 'A cair': 'var(--faint)' };
export const fam = (op: unknown) => { const o = String(op || ''); return /porto/i.test(o) ? 'Porto' : /bradesco/i.test(o) ? 'Bradesco' : /amil/i.test(o) ? 'Amil' : /santa/i.test(o) ? 'Santa Helena' : /hapvida/i.test(o) ? 'Hapvida' : /sul/i.test(o) ? 'SulAmérica' : 'Outras'; };
export const famsIn = (list: string[]) => FAMS.filter((f) => list.includes(f));
const PALAVRAS = ['LTDA', 'ME', 'EPP', 'EIRELI', 'DE', 'DO', 'DA', 'DOS', 'E', 'S', 'A', 'CIA', 'SA', 'LIMITADA', 'MEI'];
export const norm = (t: unknown) => {
  const s = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
  return s.split(/\s+/).filter((x) => x && !/^\d+$/.test(x) && !PALAVRAS.includes(x)).slice(0, 2).join(' ');
};

export const fatItems = (list: Doc[]): Item[] => list.flatMap((d) => (d.itens || []).map((r: Record<string, unknown>) => ({ comp: d.comp, operadora: d.operadora, ...r }) as Item));
export const aberto = (r: Record<string, unknown>) => /aberto|Boleto OK/i.test(String(r.boleto || ''));

export type Linha = {
  eid: string; nome: string; ops: Set<string>; valor: number; vidas: number; itens: Item[]; venc: Date | null;
  ab: boolean; div: boolean; subs: number; pend: boolean; prev?: number | null; d: number | null; fam: string;
};

// uma linha por empresa no mês, com a variação contra o mês anterior
export function empRows(faturas: Doc[], mes: string) {
  const it = fatItems(faturas), m = it.filter((r) => r.comp === mes), comps = uniq(it.map((r) => r.comp)).sort(), pm = comps[comps.indexOf(mes) - 1];
  const g: Record<string, Linha> = {};
  m.forEach((r) => {
    const e = (g[r.eid] ??= { eid: r.eid, nome: r.empresa, ops: new Set(), valor: 0, vidas: 0, itens: [], venc: null, ab: false, div: false, subs: 1, pend: false, d: null, fam: '' });
    if ((+r.subs || 1) > e.subs) e.subs = +r.subs;
    if (r.grupoPendente) e.pend = true;
    e.ops.add(r.operadora); e.valor += +r.valor || 0; e.vidas += +(r.ativos ?? r.vidas) || 0; e.itens.push(r);
    const d = pdate(r.venc); if (d && (!e.venc || d < e.venc)) e.venc = d;
    if (aberto(r)) e.ab = true;
    if (r.confValor && r.confValor !== 'OK' && r.confValor !== 'Sem vidas') e.div = true;
  });
  const pv: Record<string, number> = {};
  if (pm) it.filter((r) => r.comp === pm).forEach((r) => { pv[r.eid] = (pv[r.eid] || 0) + (+r.valor || 0); });
  Object.values(g).forEach((e) => { e.prev = pm ? (pv[e.eid] ?? null) : undefined; e.d = e.prev == null ? null : e.valor - e.prev; e.fam = fam([...e.ops][0]); });
  return { rows: Object.values(g), pm, comps };
}

// itens de comissão juntados por competência do extrato (a Central faz o mesmo em mergeCom)
export const comissaoItens = (com: Doc[]) => com.flatMap((c) => (c.itens || []).map((i: Item) => ({ ext: c.comp, ...i })));

// lançamento de agenciamento (contrato novo) ou vitalício
export const isAg = (i: Record<string, unknown>) => (i.tipo ? i.tipo === 'AN' : Number(i.taxa) > 50);

export const FAIXAS: [number, number, string][] = [[0, 18, '0–18'], [19, 23, '19–23'], [24, 28, '24–28'], [29, 33, '29–33'], [34, 38, '34–38'], [39, 43, '39–43'], [44, 48, '44–48'], [49, 53, '49–53'], [54, 58, '54–58'], [59, 200, '59+']];
