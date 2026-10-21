// Contas usadas em mais de uma tela.
import type { Fatura } from './tipos';

// Fatura mais recente de cada empresa em cada seguradora
export function ultimas(faturas: Fatura[]) {
  const m = new Map<string, Fatura>();
  for (const f of faturas) {
    const k = `${f.empresa_id}|${f.seguradora_id}`;
    const a = m.get(k);
    if (!a || f.competencia > a.competencia) m.set(k, f);
  }
  return [...m.values()];
}

// Linha da view faturas_ultimas: a fatura mais recente de cada empresa/seguradora, já somada
export type FaturaUltima = { corretora_id: string; empresa_id: string; seguradora_id: string; competencia: string; vidas: number; valor: number; vencimento: string | null; faturas: number; comp_carteira: string };
// Vidas da carteira = soma do mês mais recente de cada corretora (mesma conta da Central); empresas sem fatura nesse mês ficam fora
export const vidasCarteira = (us: FaturaUltima[]) => us.reduce((t, u) => t + (u.competencia === u.comp_carteira ? u.vidas : 0), 0);
export const vidasCarteiraPor = (us: FaturaUltima[]) => somarPor(us.filter((u) => u.competencia === u.comp_carteira), (u) => u.corretora_id, (u) => u.vidas);

// Vidas ativas = vidas da fatura mais recente de cada empresa/seguradora
export const vidasAtivas = (faturas: Fatura[]) => ultimas(faturas).reduce((t, f) => t + (f.vidas_informadas ?? 0), 0);

export function somarPor<T>(lista: T[], chave: (x: T) => string, valor: (x: T) => number) {
  const m = new Map<string, number>();
  for (const x of lista) m.set(chave(x), (m.get(chave(x)) ?? 0) + valor(x));
  return m;
}

export const hoje = () => new Date().toISOString().slice(0, 10);

// Máquina "no ar" se mandou sinal nos últimos 10 minutos
export function sinal(ultimo: string | null) {
  if (!ultimo) return 'nunca' as const;
  return Date.now() - new Date(ultimo).getTime() < 10 * 60000 ? ('on' as const) : ('off' as const);
}

// Faixas etárias da ANS
export const FAIXAS = ['0–18', '19–23', '24–28', '29–33', '34–38', '39–43', '44–48', '49–53', '54–58', '59+'];
export function faixaDe(idade: number) {
  if (idade <= 18) return 0;
  if (idade >= 59) return 9;
  return Math.floor((idade - 19) / 5) + 1;
}

// Preço da plataforma: preço por vida da faixa em que o total cai, respeitando o mínimo
export type Contrato = { faixas?: { ate: number | null; valor: number }[]; minimo?: number; implantacao?: number; piloto?: string; observacao?: string };
export function mensalidade(vidas: number, c: Contrato) {
  if (!c.faixas?.length) return null;
  const faixa = c.faixas.find((f) => f.ate == null || vidas <= f.ate) ?? c.faixas[c.faixas.length - 1];
  return { porVida: faixa.valor, valor: Math.max(vidas * faixa.valor, c.minimo ?? 0), minimoAplicado: vidas * faixa.valor < (c.minimo ?? 0) };
}

// Próxima data de corte para movimentação (dia do mês da apólice)
export function proximoCorte(dia: number | null) {
  if (!dia) return null;
  const h = new Date();
  let d = new Date(h.getFullYear(), h.getMonth(), dia);
  if (d < new Date(h.getFullYear(), h.getMonth(), h.getDate())) d = new Date(h.getFullYear(), h.getMonth() + 1, dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
