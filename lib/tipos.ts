// Tipos usados pelas telas. Espelham as tabelas do banco (plataforma/banco/schema.sql).

export type Papel =
  | 'master'
  | 'admin_corretora'
  | 'operador_corretora'
  | 'gestor_empresa'
  | 'movimentacao_empresa'
  | 'financeiro_empresa';

export type Membro = {
  id: string;
  user_id: string;
  papel: Papel;
  corretora_id: string | null;
  empresa_id: string | null;
  ativo: boolean;
  email?: string | null;
};

export type Sessao = {
  userId: string;
  email: string;
  nome: string;
  membros: Membro[];
};

export type Corretora = {
  id: string;
  nome: string;
  razao_social: string | null;
  cnpj: string;
  slug: string;
  cor_primaria: string | null;
  logo_url: string | null;
  ativa: boolean;
  contrato: Record<string, unknown>;
  criado_em: string;
};

export type CodigoSeguradora = {
  id: string;
  seguradora_id: string;
  codigo: string;
  rotulo: string | null;
  cnpj_login: string | null;
  ativo: boolean;
};

export type Empresa = {
  id: string;
  corretora_id: string;
  codigo_interno: string | null;
  razao_social: string;
  nome_curto: string | null;
  cnpj: string | null;
  ativa: boolean;
};

export type Apolice = {
  id: string;
  empresa_id: string;
  seguradora_id: string;
  produto: 'saude' | 'dental';
  codigo_estipulante: string | null;
  apolice: string | null;
  dia_vencimento: number | null;
  mes_aniversario: number | null;
  dia_corte_movimentacao: number | null;
  ativa: boolean;
};

export type Fatura = {
  id: string;
  corretora_id: string;
  empresa_id: string;
  seguradora_id: string;
  competencia: string;
  numero: string;
  vencimento: string | null;
  valor_total: number | null;
  valor_boleto: number | null;
  vidas_informadas: number | null;
  data_pagamento: string | null;
  conferencia_valor: string | null;
  fatura_doc_id: string | null;
  boleto_doc_id: string | null;
};

export type Vida = {
  id: string;
  empresa_id: string;
  seguradora_id: string;
  competencia: string;
  familia: string | null;
  nome: string;
  nascimento: string | null;
  sexo: string | null;
  parentesco: string | null;
  titular: boolean | null;
  plano: string | null;
  situacao: string | null;
  movimento: string | null;
  valor_total: number | null;
  idade?: number | null;
  premio_base?: number | null;
  pro_rata?: number | null;
  copart_total?: number | null;
};

export type Documento = {
  id: string;
  empresa_id: string | null;
  pedido_id: string | null;
  tipo: string;
  competencia: string | null;
  nome_arquivo: string;
  caminho_storage: string;
  criado_em: string;
};

export type TipoPedido = 'inclusao' | 'exclusao' | 'troca_plano' | 'segunda_via' | 'atualizacao_extra' | 'duvida';
export type StatusPedido =
  | 'aguardando_aprovacao_empresa'
  | 'recebido'
  | 'conferindo'
  | 'pendencia_cliente'
  | 'pronto_envio'
  | 'enviado_seguradora'
  | 'concluido'
  | 'cancelado';

export type Pedido = {
  id: string;
  protocolo: string;
  corretora_id: string;
  empresa_id: string;
  tipo: TipoPedido;
  status: StatusPedido;
  dados: Record<string, string>;
  prazo: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type EventoPedido = {
  id: number;
  pedido_id: string;
  em: string;
  autor_agente: string | null;
  de_status: StatusPedido | null;
  para_status: StatusPedido | null;
  mensagem: string | null;
  visivel_empresa: boolean;
};

export type PagamentoComissao = {
  id: string;
  corretora_id: string;
  seguradora_id: string;
  ordem: string;
  competencia: string;
  data_pagamento: string | null;
  bruta: number | null;
  a_pagar: number | null;
};

export type LancamentoComissao = {
  id: string;
  pagamento_id: string;
  empresa_id: string | null;
  numero_fatura: string | null;
  taxa: number | null;
  comissao: number | null;
  classe: 'vitalicio' | 'agenciamento' | 'bonus' | 'estorno' | 'outros';
};

export type Maquina = { id: string; nome: string; descricao: string | null; ultimo_sinal: string | null; ativa: boolean };

export type LoginStatus = {
  corretora_id: string;
  seguradora_id: string;
  codigo: string;
  ativa: boolean;
  verificado_em: string;
  ativa_desde: string | null;
};

export type Ordem = {
  id: string;
  corretora_id: string;
  agente: string;
  seguradora_id: string | null;
  competencia: string | null;
  origem: string;
  prioridade: number;
  status: 'pendente' | 'em_execucao' | 'concluida' | 'erro' | 'cancelada' | 'aguardando_voce';
  criada_em: string;
  iniciada_em?: string | null;
  terminada_em: string | null;
  mensagem: string | null;
  sessao_url?: string | null; // a sessão do Claude que executou (para ver passo a passo)
  ordem_pai_id?: string | null;
  modo?: 'codigo' | 'claude' | 'misto' | null; // como rodou: código (sem tokens) ou com o Claude
  tokens_entrada?: number | null;
  tokens_saida?: number | null;
  custo_usd?: number | null;
};

// Cadastro dos agentes (tabela agentes) e o calendário que o supervisor aprendeu (view supervisor_previsao)
export type Agente = {
  id: string;
  agente: string;
  seguradora_id: string | null;
  cobre: string[];
  nome: string;
  onde: 'nuvem' | 'pc';
  automatico: boolean;
  como: string | null;
  situacao: 'ativo' | 'rascunho' | 'pausado';
  criado_por: string;
};

export type Previsao = {
  corretora_id: string;
  agente: string;
  seguradora_id: string | null;
  competencia: string;
  esperado_em: string;
  atrasado: boolean;
  motivo: string;
};

// O que o Agente Conferência achou numa competência (tabela conferencias)
export type Conferencia = {
  id: string;
  corretora_id: string;
  competencia: string;
  seguradora_id: string | null;
  empresa_id: string | null;
  tipo: string;
  gravidade: 'erro' | 'aviso';
  mensagem: string;
  primeira_vez: string;
  ultima_vez: string;
  resolvida_em: string | null;
};

export type Rotina = {
  id: string;
  corretora_id: string | null;
  nome: string;
  agente: string;
  agenda: string;
  ativa: boolean;
  seguradora_id?: string | null;
  ultima_execucao?: string | null;
  proxima_execucao: string | null;
};

export type Convite = {
  id: string;
  email: string;
  papel: Papel;
  corretora_id: string;
  empresa_id: string | null;
  criado_em: string;
  aceito_em: string | null;
};
