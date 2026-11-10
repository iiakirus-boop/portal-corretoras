// Quadro de tarefas da equipe (cards estilo Trello): tipos e rótulos usados na tela e nas ações
export type Coluna = 'entrada' | 'a_fazer' | 'fazendo' | 'aguardando_seguradora' | 'aguardando_cliente' | 'feito';

export const COLUNAS: { id: Coluna; rotulo: string; dica: string }[] = [
  { id: 'entrada', rotulo: 'Entrada', dica: 'Chegou e ainda não foi triado' },
  { id: 'a_fazer', rotulo: 'A fazer', dica: 'Já tem responsável e prioridade' },
  { id: 'fazendo', rotulo: 'Fazendo', dica: 'Alguém está cuidando agora' },
  { id: 'aguardando_seguradora', rotulo: 'Aguardando seguradora', dica: 'Depende da operadora responder' },
  { id: 'aguardando_cliente', rotulo: 'Aguardando cliente', dica: 'Depende da empresa responder ou mandar algo' },
  { id: 'feito', rotulo: 'Feito', dica: 'Concluídos nos últimos 14 dias' },
];
export const ROTULO_COLUNA = Object.fromEntries(COLUNAS.map((c) => [c.id, c.rotulo])) as Record<Coluna, string>;

export const PRIORIDADES: { n: 1 | 2 | 3 | 4; rotulo: string; classe: string }[] = [
  { n: 1, rotulo: 'Urgente', classe: 'pr-1' },
  { n: 2, rotulo: 'Alta', classe: 'pr-2' },
  { n: 3, rotulo: 'Normal', classe: 'pr-3' },
  { n: 4, rotulo: 'Baixa', classe: 'pr-4' },
];

export type Pessoa = { id: string; nome: string; apelido: string | null; email: string | null; funcao: string | null; ativo: boolean; ordem: number };
export type TipoDemanda = { id: string; nome: string; cor: string; descricao: string | null; responsavel_padrao: string | null; ativo: boolean; ordem: number };
export type CardQuadro = {
  id: string; numero: number; corretora_id: string; titulo: string; descricao: string | null; tipo_id: string | null;
  coluna: Coluna; prioridade: number; responsavel_id: string | null; apoio_id: string | null; proximo_passo: string | null;
  empresa_id: string | null; empresa_nome: string | null; seguradora: string | null; prazo: string | null;
  origem: 'manual' | 'email' | 'agente' | 'exemplo'; email_assunto: string | null; ordem: number; arquivado: boolean;
  criado_em: string; atualizado_em: string; coluna_desde: string; concluido_em: string | null;
  resumo?: string | null; resumo_em?: string | null;
};
export type EventoCard = { id: number; card_id: string; em: string; autor_id: string | null; autor_nome: string | null; tipo: string; texto: string | null };

export type EmailCard = { id: string; card_id: string; mensagem_id: string; em: string | null; de: string | null; para: string | null; cc: string | null; assunto: string | null; trecho: string | null };
export type ArquivoCard = { id: string; card_id: string; email_id: string | null; tipo: 'email' | 'anexo'; nome: string; tamanho: number | null };

// campos que a tela pode gravar num card
export const CAMPOS_CARD = ['titulo', 'descricao', 'tipo_id', 'coluna', 'prioridade', 'responsavel_id', 'apoio_id', 'proximo_passo',
  'empresa_nome', 'seguradora', 'prazo', 'resumo'] as const;

export const iniciais = (p?: Pessoa | null) => (p ? (p.apelido || p.nome).split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() : '?');
export const nomeCurto = (p?: Pessoa | null) => (p ? p.apelido || p.nome.split(' ')[0] : 'Sem responsável');

// dias corridos desde uma data (para "parado há X dias")
export const diasDesde = (iso: string, agora = Date.now()) => Math.floor((agora - new Date(iso).getTime()) / 86400000);

export const tamanho = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
