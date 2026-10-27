// Tipos do modelo da Projeção gerado a partir da Central (projecao.gen.js)
/* eslint-disable @typescript-eslint/no-explicit-any */
type D = Record<string, any>;
export type Credito = D & { tipo: string; data: Date; valor: number; op: string; empresa: string; eid: string; kind: string; atraso?: boolean };
export type Modelo = D & { hoje: Date; com: Credito[] };
export function projAll(fat: D[], comMerged: D[], o?: { agcfg?: D; imps?: D[]; hoje?: Date }): Modelo | null;
export function mergeCom(list: D[]): D[];
export function isAg(i: D): boolean;
