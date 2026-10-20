// Previsão do próximo boleto: último boleto + movimentações pedidas depois dele.
// Pagamento não é registrado para todas as seguradoras, então "não pago" não serve para achar o próximo boleto.
import { faixaDe } from './contas';
import { idadeVida } from './formato';
import type { Fatura, Pedido, Vida } from './tipos';

export type Previsao = {
  seguradora_id: string;
  real: boolean; // true = boleto já emitido com vencimento futuro
  competencia: string; // AAAA-MM do boleto previsto (ou do real)
  vencimento: string | null;
  valor: number;
  base: number; // valor do último boleto
  baseCompetencia: string;
  inclusoes: number;
  exclusoes: number;
  ajuste: number; // + inclusões − exclusões
  estimado: boolean; // algum preço saiu da média por vida, sem faixa
};

const n = (v: unknown) => (v == null ? 0 : Number(v));
const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

function somaMes(d: string, meses: number) {
  const [a, m, dia] = d.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dia ?? 1, ult)).padStart(2, '0')}`;
}

function moda(vals: number[]) {
  const c = new Map<number, number>();
  for (const v of vals) if (v > 0) c.set(Math.round(v * 100) / 100, (c.get(Math.round(v * 100) / 100) ?? 0) + 1);
  let melhor: number | null = null, q = 0;
  for (const [v, k] of c) if (k > q) { melhor = v; q = k; }
  return melhor;
}

const precoVida = (v: Vida) => n(v.premio_base) || n(v.valor_total);

// Preço por faixa etária (moda do prêmio no plano principal); taxa média vira o mesmo preço em todas as faixas
function tabela(vidas: Vida[]) {
  const planos = new Map<string, number>();
  for (const v of vidas) planos.set(v.plano ?? '', (planos.get(v.plano ?? '') ?? 0) + 1);
  const principal = [...planos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const porFaixa = new Map<number, number[]>();
  for (const v of vidas) {
    const i = idadeVida(v);
    if ((v.plano ?? '') !== principal || i == null) continue;
    const f = faixaDe(i);
    porFaixa.set(f, [...(porFaixa.get(f) ?? []), precoVida(v)]);
  }
  const faixa = new Map<number, number>();
  for (const [f, vs] of porFaixa) { const m = moda(vs); if (m) faixa.set(f, m); }
  return { faixa, geral: moda(vidas.filter((v) => (v.plano ?? '') === principal).map(precoVida)) };
}

function idadeDe(nasc: string | undefined) {
  if (!nasc) return null;
  const m = nasc.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? nasc.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [a, mes, d] = m[1].length === 4 ? [+m[1], +m[2], +m[3]] : [+m[3], +m[2], +m[1]];
  const h = new Date();
  let i = h.getFullYear() - a;
  if (h.getMonth() + 1 < mes || (h.getMonth() + 1 === mes && h.getDate() < d)) i--;
  return i >= 0 && i < 120 ? i : null;
}

export function preverBoletos(faturas: Fatura[], vidas: Vida[], pedidos: (Pedido & { apolice_id?: string | null })[], apolices: { id: string; seguradora_id: string }[], hoje: string): Previsao[] {
  const segs = [...new Set(faturas.map((f) => f.seguradora_id))];
  const segApolice = new Map(apolices.map((a) => [a.id, a.seguradora_id]));
  const out: Previsao[] = [];
  for (const s of segs) {
    const fs = faturas.filter((f) => f.seguradora_id === s);
    const comp = fs.reduce((m, f) => (f.competencia > m ? f.competencia : m), '');
    const ult = fs.filter((f) => f.competencia === comp);
    const venc = ult.map((f) => f.vencimento).filter(Boolean).sort()[0] ?? null;
    const base = ult.reduce((t, f) => t + n(f.valor_boleto ?? f.valor_total), 0);
    // Seguradora sem fatura há mais de dois meses: contrato provavelmente encerrado ou ainda não buscado
    if (venc && venc < somaMes(hoje, -2)) continue;
    if (venc && venc >= hoje) {
      out.push({ seguradora_id: s, real: true, competencia: comp, vencimento: venc, valor: base, base, baseCompetencia: comp, inclusoes: 0, exclusoes: 0, ajuste: 0, estimado: false });
      continue;
    }
    // Movimentações pedidas depois do último boleto (as anteriores já vieram nele)
    const desde = venc ?? `${comp}-01`;
    const unicaSeg = segs.length === 1;
    const movs = pedidos.filter((p) => (p.tipo === 'inclusao' || p.tipo === 'exclusao') && p.status !== 'cancelado' && p.criado_em.slice(0, 10) >= desde
      && (p.apolice_id ? segApolice.get(p.apolice_id) === s : unicaSeg));
    const vs = vidas.filter((v) => v.seguradora_id === s && v.competencia === comp);
    const t = tabela(vs);
    const media = ult.reduce((q, f) => q + n(f.vidas_informadas), 0) ? base / ult.reduce((q, f) => q + n(f.vidas_informadas), 0) : 0;
    let ajuste = 0, inc = 0, exc = 0, estimado = false;
    for (const p of movs) {
      if (p.tipo === 'inclusao') {
        const i = idadeDe(p.dados.nascimento);
        let v = i != null ? t.faixa.get(faixaDe(i)) : undefined;
        if (v == null) { v = t.geral ?? media; estimado = true; }
        ajuste += v; inc++;
      } else {
        const alvo = vs.find((x) => norm(x.nome) === norm(p.dados.nome));
        let v = alvo ? precoVida(alvo) : 0;
        if (!v) { v = t.geral ?? media; estimado = true; }
        ajuste -= v; exc++;
      }
    }
    let prox = venc ? somaMes(venc, 1) : null;
    while (prox && prox < hoje) prox = somaMes(prox, 1);
    out.push({ seguradora_id: s, real: false, competencia: prox ? prox.slice(0, 7) : somaMes(`${comp}-01`, 1).slice(0, 7), vencimento: prox, valor: Math.max(base + ajuste, 0), base, baseCompetencia: comp, inclusoes: inc, exclusoes: exc, ajuste, estimado });
  }
  return out.sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? ''));
}
