// Cotação automática: os nomes e os tipos do resultado que a função cot_cotar (banco) devolve.
export const OPERADORA: Record<string, string> = {
  amil: 'Amil', bradesco: 'Bradesco', hapvida: 'Hapvida', new_leader: 'New Leader', notredame: 'NotreDame',
  porto: 'Porto', porto_bairro: 'Porto Bairro', sagrada: 'Sagrada Família', santa: 'Santa Helena', sul_america: 'SulAmérica',
};
export const operadora = (k: string | null | undefined) => (k ? OPERADORA[k] ?? k : '—');

// as 10 faixas etárias da ANS, na ordem das tabelas
export const FAIXAS = ['0 a 18', '19 a 23', '24 a 28', '29 a 33', '34 a 38', '39 a 43', '44 a 48', '49 a 53', '54 a 58', '59 ou +'];

export type GrupoCot = { seguradora: string; operadora: string | null; plano: string | null; acomodacao: string; faixas: number[]; valor: number; sem_equivalente: boolean };
export type LinhaCot = {
  origem: { seguradora: string; operadora: string; plano: string; acomodacao: string };
  plano: string; acomodacao: string; cobertura: number; faltam: string[] | null;
  tabela: { id: number; titulo: string; condicoes: string };
  faixas: number[]; valores: number[]; total: number;
};
export type OpcaoCot = { operadora: string; total: number; iof: number; total_iof: number; economia: number; cobertura: number; linhas: LinhaCot[] };
export type Cotacao = {
  empresa_id: string; status: string; vidas: number; titulares: number; custo_atual: number; competencia: string | null;
  mei: boolean | null; simples: boolean | null; municipio: string | null; situacao_cnpj: string | null; copart: boolean;
  grupos: GrupoCot[]; opcoes: OpcaoCot[]; calculado_em: string;
};
export type ResultadoCot = { empresa_id: string; corretora_id: string; calculado_em: string; status: string; vidas: number | null; custo_atual: number | null; melhor_economia: number | null; resultado: Cotacao };

export const pctCob = (v: number) => `${Math.round(v * 100)}%`;
export const somaFx = (f: number[]) => f.reduce((a, b) => a + b, 0);

// pill de cada situação
export function tomStatus(s: string) {
  if (s === 'com opções') return 'p-ok';
  if (s.startsWith('sem opção')) return 'p-idle';
  if (s.startsWith('100 vidas') || s.startsWith('sem vidas')) return 'p-idle';
  return 'p-warn';
}
