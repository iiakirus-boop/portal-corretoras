// Cotação: nomes, tipos do resultado da função cot_cotacao (banco) e leitura dos parâmetros da tela.
export const OPERADORA: Record<string, string> = {
  amil: 'Amil', bradesco: 'Bradesco Saúde', hapvida: 'Hapvida', new_leader: 'New Leader', notredame: 'NotreDame Intermédica',
  porto: 'Porto Saúde', porto_bairro: 'Porto Bairro', sagrada: 'Sagrada Família', santa: 'Santa Helena', sul_america: 'SulAmérica',
};
export const operadora = (k: string | null | undefined) => (k ? OPERADORA[k] ?? k : '—');

// categoria de mercado do plano (tabela cot_categorias)
export const CATEGORIA = ['', 'Mínimo', 'Básico', 'Mediano', 'Muito bom', 'Executivo', 'Ultra premium'];

// as 10 faixas etárias da ANS, na ordem das tabelas
export const FAIXAS = ['0 a 18', '19 a 23', '24 a 28', '29 a 33', '34 a 38', '39 a 43', '44 a 48', '49 a 53', '54 a 58', '59 ou +'];
export const IOF = 0.0238;

export type GrupoCot = {
  i: number; seguradora: string; plano_atual: string | null; operadora: string | null; plano: string | null; acomodacao: string;
  faixas: number[]; vidas: number; valor: number; sem_equivalente: boolean; copart: boolean; fora: boolean;
};
export type LinhaCot = {
  grupo: number;
  origem: { seguradora: string; operadora: string | null; plano: string | null; acomodacao: string; plano_atual: string | null };
  plano: string; acomodacao: string; cobertura: number | null; faltam: string[] | null; escolha: 'automatico' | 'manual'; fora_criterio: boolean;
  tabela: { id: number; titulo: string; condicoes: string; copart?: boolean };
  faixas: number[]; valores: number[]; total: number;
};
export type OpcaoCot = {
  operadora: string; completa: boolean; total: number; iof?: number; total_iof?: number; economia?: number; cobertura?: number;
  linhas: LinhaCot[]; faltando: number[];
};
export type Cotacao = {
  empresa_id: string; status: string | null; vidas: number; titulares: number; custo_atual: number; competencia: string | null;
  mei: boolean | null; simples: boolean | null; municipio: string | null; situacao_cnpj: string | null; copart: boolean;
  grupos: GrupoCot[]; opcoes: OpcaoCot[]; automatico: boolean; operadoras: string[]; calculado_em: string;
};

export const pctCob = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const somaFx = (f: number[]) => f.reduce((a, b) => a + b, 0);

// Escolhas da tela, que viajam na URL (a tela e o PDF calculam igual):
//   op=porto&op=amil      operadoras escolhidas (sem nenhuma: automático)
//   t=porto:0:Ouro Mais I|Quarto   plano escolhido à mão para o grupo 0 na Porto
//   fora=1                grupo 1 fora da cotação
export type Escolhas = { ops: string[] | null; trocas: Record<string, Record<string, string>>; fora: number[] };
type SP = Record<string, string | string[] | undefined>;
const lista = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function lerEscolhas(sp: SP): Escolhas {
  const ops = lista(sp.op).filter(Boolean);
  const trocas: Escolhas['trocas'] = {};
  for (const t of lista(sp.t)) {
    const [op, i, ...resto] = t.split(':');
    const plano = resto.join(':');
    if (!op || !i || !plano) continue;
    (trocas[op] ??= {})[i] = plano;
  }
  const fora = lista(sp.fora).map(Number).filter((n) => Number.isInteger(n));
  return { ops: ops.length ? ops : null, trocas, fora };
}

export function queryEscolhas(es: Escolhas) {
  const q = new URLSearchParams();
  for (const o of es.ops ?? []) q.append('op', o);
  for (const [op, m] of Object.entries(es.trocas)) for (const [i, p] of Object.entries(m)) q.append('t', `${op}:${i}:${p}`);
  for (const f of es.fora) q.append('fora', String(f));
  return q.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function calcularCotacao(db: any, e: string, es: Escolhas) {
  const { data, error } = await db.rpc('cot_cotacao', { e, ops: es.ops, trocas: es.trocas, fora: es.fora });
  return { cot: (data ?? null) as Cotacao | null, erro: error?.message as string | undefined };
}
