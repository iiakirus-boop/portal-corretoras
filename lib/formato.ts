// Formatação no padrão brasileiro e nomes amigáveis.
import type { Papel, StatusPedido, TipoPedido } from './tipos';

const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = new Intl.NumberFormat('pt-BR');

export const moeda = (v: number | null | undefined) => (v == null ? '—' : moedaFmt.format(v));
export const num = (v: number | null | undefined) => (v == null ? '—' : numFmt.format(v));
// "1 empresa", "3 empresas": nada de "empresa(s)"
export const plural = (n: number, um: string, varios: string) => `${numFmt.format(n)} ${n === 1 ? um : varios}`;

export function data(v: string | null | undefined) {
  if (!v) return '—';
  const [a, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const competencia = (c: string | null | undefined) => (c ? `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}` : '—');

export function quando(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'agora';
  if (diff < 60) return `há ${Math.round(diff)} min`;
  if (diff < 60 * 24) return `há ${Math.round(diff / 60)} h`;
  return data(iso);
}

export const cnpj = (c: string | null | undefined) =>
  c && /^\d{14}$/.test(c) ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c ?? '—';

// Idade da vida: pela data de nascimento; sem ela (Porto, Amil, Santa Helena), a idade que veio na fatura
export const idadeVida = (v: { nascimento: string | null; idade?: number | null }) => idade(v.nascimento) ?? v.idade ?? null;

// Valor da vida no mês: o total da fatura quando vem; senão, prêmio + pró-rata + coparticipação
export function valorVida(v: { valor_total: number | null; premio_base?: number | null; pro_rata?: number | null; copart_total?: number | null }) {
  if (v.valor_total) return v.valor_total;
  const p = [v.premio_base, v.pro_rata, v.copart_total].filter((x): x is number => x != null);
  return p.length ? Math.round(p.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

export function idade(nasc: string | null) {
  if (!nasc) return null;
  const n = new Date(nasc), h = new Date();
  let i = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) i--;
  return i;
}

export const PAPEL: Record<Papel, string> = {
  master: 'Master',
  admin_corretora: 'Administrador da corretora',
  operador_corretora: 'Operador da corretora',
  gestor_empresa: 'Gestor da empresa',
  movimentacao_empresa: 'Movimentação',
  financeiro_empresa: 'Financeiro',
};

export const TIPO_PEDIDO: Record<TipoPedido, string> = {
  inclusao: 'Inclusão de vida',
  exclusao: 'Exclusão de vida',
  troca_plano: 'Troca de plano',
  segunda_via: '2ª via de boleto',
  atualizacao_extra: 'Atualização fora do horário',
  duvida: 'Dúvida',
};

export const STATUS_PEDIDO: Record<StatusPedido, { rotulo: string; tom: 'warn' | 'info' | 'ok' | 'idle' | 'bad' }> = {
  aguardando_aprovacao_empresa: { rotulo: 'Esperando o gestor aprovar', tom: 'warn' },
  recebido: { rotulo: 'Recebido', tom: 'info' },
  conferindo: { rotulo: 'Conferindo', tom: 'info' },
  pendencia_cliente: { rotulo: 'Falta algo da empresa', tom: 'warn' },
  pronto_envio: { rotulo: 'Pronto para enviar', tom: 'info' },
  enviado_seguradora: { rotulo: 'Na seguradora', tom: 'info' },
  concluido: { rotulo: 'Concluído', tom: 'ok' },
  cancelado: { rotulo: 'Cancelado', tom: 'idle' },
};

// Próximos passos que a corretora pode dar em cada situação do pedido
export const PROXIMOS: Partial<Record<StatusPedido, StatusPedido[]>> = {
  recebido: ['conferindo', 'pendencia_cliente', 'cancelado'],
  conferindo: ['pronto_envio', 'pendencia_cliente', 'cancelado'],
  pendencia_cliente: ['conferindo', 'cancelado'],
  pronto_envio: ['enviado_seguradora', 'pendencia_cliente'],
  enviado_seguradora: ['concluido', 'pendencia_cliente'],
};

export const ACAO_STATUS: Partial<Record<StatusPedido, string>> = {
  conferindo: 'Começar a conferir',
  pendencia_cliente: 'Pedir algo à empresa',
  pronto_envio: 'Marcar como pronto',
  enviado_seguradora: 'Enviar à seguradora',
  concluido: 'Concluir',
  cancelado: 'Cancelar pedido',
};

export const ABERTOS: StatusPedido[] = ['aguardando_aprovacao_empresa', 'recebido', 'conferindo', 'pendencia_cliente', 'pronto_envio', 'enviado_seguradora'];

export const SEGURADORA: Record<string, string> = {
  porto_saude: 'Porto Saúde', porto_odonto: 'Porto Odonto', bradesco_saude: 'Bradesco Saúde', bradesco_dental: 'Bradesco Dental',
  amil: 'Amil', amil_dental: 'Amil Dental', santa_helena: 'Santa Helena', hapvida: 'Hapvida', sulamerica: 'SulAmérica',
};
export const seg = (id: string | null | undefined) => (id ? SEGURADORA[id] ?? id : '—');

export const AGENTE: Record<string, string> = {
  faturas: 'Faturas', comissao: 'Comissões', vidas: 'Vidas', projecao: 'Projeção', mantem_vivo: 'Mantém logins ativos', pedido: 'Movimentação',
};

export const ORDEM_TOM = { pendente: 'idle', em_execucao: 'info', concluida: 'ok', erro: 'bad', cancelada: 'idle', aguardando_voce: 'warn' } as const;
export const ORDEM_ROTULO = { pendente: 'Na fila', em_execucao: 'Rodando', concluida: 'Concluída', erro: 'Erro', cancelada: 'Cancelada', aguardando_voce: 'Esperando você' };
