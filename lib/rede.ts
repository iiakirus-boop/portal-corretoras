// Rede credenciada da apresentação: os principais hospitais da região da empresa, como no slide "Rede Credenciada"
// das propostas (hospital, bairro/cidade e o atendimento em cada plano, separados por região).
import { operadora, type Cotacao } from '@/lib/cotacao';
import { mesmaCidade, regioesDaEmpresa } from '@/lib/regiao';

export type RedeTabela = { colunas: string[]; secoes: { regiao: string; linhas: { nome: string; bairro: string; at: string[] }[] }[] };
type Linha = { prestador_id: number; nome: string; regiao: string; bairro: string | null; atend: string[]; peso: number };

// "H¹,PSA,…" -> "H,PS": tira as notas de rodapé das tabelas e deixa só H (internação), M (maternidade) e PS (pronto-socorro)
const ORDEM = ['H', 'M', 'PS'];
export function atendimento(a: string) {
  const t = new Set(a.split(',').map((x) => x.replace(/[¹²³*…]/g, '').trim()).map((x) => (x === 'PSA' || x === 'PSI' ? 'PS' : x)).filter((x) => ORDEM.includes(x)));
  return ORDEM.filter((x) => t.has(x)).join(',') || '—';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function redeDaRegiao(db: any, cot: Cotacao, maxLinhas = 30): Promise<RedeTabela | null> {
  const cols: { k: number; op: string; plano: string }[] = [];
  const colunas: string[] = [];
  const atuais = [...new Map(cot.grupos.filter((g) => !g.fora && g.operadora && g.plano).map((g) => [`${g.operadora}|${g.plano}`, g])).values()];
  if (atuais.length) {
    for (const g of atuais) cols.push({ k: 0, op: g.operadora!, plano: g.plano! });
    colunas.push(`HOJE · ${[...new Set(atuais.map((g) => operadora(g.operadora)))].join(' / ')}\n${[...new Set(atuais.map((g) => g.plano))].join(' / ')}`);
  }
  for (const o of cot.opcoes.filter((x) => x.completa).slice(0, 4)) {
    const k = colunas.length;
    const planos = [...new Set(o.linhas.map((l) => l.plano))];
    for (const pl of planos) cols.push({ k, op: o.operadora, plano: pl });
    colunas.push(`${operadora(o.operadora)}\n${planos.join(' / ')}`);
  }
  if (!cols.length) return null;
  const { regioes, cidade } = regioesDaEmpresa(cot.municipio);
  const { data } = await db.rpc('cot_rede_principais', { cols, regioes });
  let ls = (data ?? []) as Linha[];
  if (cidade && regioes[0] === 'Interior') ls = ls.filter((l) => mesmaCidade(l.bairro, cidade));
  if (!ls.length) return null;
  // por região, na ordem de proximidade; cada região leva uma parte das linhas
  const porReg = regioes.map((r) => ({ regiao: r, ls: ls.filter((l) => l.regiao === r) })).filter((x) => x.ls.length);
  const cota = Math.max(4, Math.floor((maxLinhas - porReg.length) / porReg.length));
  let resto = maxLinhas;
  const secoes: RedeTabela['secoes'] = [];
  for (const { regiao, ls: rl } of porReg) {
    if (resto < 3) break;
    const n = Math.min(rl.length, porReg.length === 1 ? resto - 1 : cota, resto - 1);
    secoes.push({ regiao, linhas: rl.slice(0, n).map((l) => ({ nome: l.nome, bairro: l.bairro ?? '', at: l.atend.map((a) => (a ? atendimento(a) : '—')) })) });
    resto -= n + 1;
  }
  return { colunas, secoes };
}
