// Dados de exemplo do modo demonstração. Tudo fictício, exceto o nome e o CNPJ da Shaddai.
// O formato é o mesmo das tabelas do banco, para as telas funcionarem igual nos dois modos.

type Linha = Record<string, any>;
export type Banco = Record<string, Linha[]>;

let seq = 0;
const uid = (p: string) => `${p}-${(++seq).toString(16).padStart(8, '0')}`;

// gerador simples e repetível
let semente = 42;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const entre = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const NOMES = ['Ana', 'Bruna', 'Carla', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Larissa', 'Mariana',
  'Natália', 'Patrícia', 'Renata', 'Sabrina', 'Tatiane', 'Vanessa', 'André', 'Bruno', 'Caio', 'Diego', 'Eduardo', 'Felipe', 'Gustavo',
  'Henrique', 'Igor', 'João', 'Lucas', 'Marcelo', 'Nicolas', 'Otávio', 'Paulo', 'Rafael', 'Samuel', 'Thiago', 'Vinícius', 'Wagner'];
const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Costa', 'Dias', 'Ferreira', 'Gomes', 'Lima', 'Martins', 'Mendes', 'Moreira',
  'Nascimento', 'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira'];

export const DEMO_USUARIOS = [
  { id: 'u-bruno', email: 'bruno@plataforma.demo', nome: 'Bruno', descricao: 'Master: vê e gerencia todas as corretoras' },
  { id: 'u-ana', email: 'ana@shaddai.demo', nome: 'Ana', descricao: 'Administradora da Shaddai: tudo da corretora, inclusive comissão' },
  { id: 'u-carlos', email: 'carlos@shaddai.demo', nome: 'Carlos', descricao: 'Operador da Shaddai: empresas e pedidos, sem comissão' },
  { id: 'u-paula', email: 'paula@padariabomgrao.demo', nome: 'Paula', descricao: 'Gestora da Padaria Bom Grão: faturas, vidas e pedidos' },
  { id: 'u-rafael', email: 'rafael@padariabomgrao.demo', nome: 'Rafael', descricao: 'Movimentação da Padaria Bom Grão: vidas e pedidos (vão para aprovação)' },
  { id: 'u-lucia', email: 'lucia@padariabomgrao.demo', nome: 'Lúcia', descricao: 'Financeiro da Padaria Bom Grão: faturas, boletos e 2ª via' },
  { id: 'u-marcos', email: 'marcos@vertice.demo', nome: 'Marcos', descricao: 'Administrador da Vértice Seguros (outra corretora)' },
];

export function criarBanco(): Banco {
  seq = 0; semente = 42;
  const db: Banco = {
    seguradoras: [
      { id: 'porto_saude', nome: 'Porto Saúde', grupo: 'Porto' },
      { id: 'bradesco_saude', nome: 'Bradesco Saúde', grupo: 'Bradesco' },
      { id: 'amil', nome: 'Amil', grupo: 'Amil' },
      { id: 'hapvida', nome: 'Hapvida / NotreDame', grupo: 'Hapvida' },
      { id: 'sulamerica', nome: 'SulAmérica', grupo: 'SulAmérica' },
    ],
    corretoras: [], corretora_cnpjs: [], corretora_codigos: [], empresas: [], apolices: [], membros: [], convites: [],
    faturas: [], vidas: [], documentos: [], pedidos: [], pedido_eventos: [], comissao_pagamentos: [], comissao_lancamentos: [],
    maquinas: [], rotinas: [], ordens_execucao: [], conferencias: [], sessoes_portal: [], login_status: [], execucoes: [], cobranca_fechamentos: [],
  };
  const agora = new Date('2026-10-20T09:00:00-03:00');
  const iso = (d: Date) => d.toISOString();
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const menosMin = (m: number) => new Date(agora.getTime() - m * 60000);

  const shaddai = { id: 'c-shaddai', nome: 'Shaddai', razao_social: 'Shaddai Corretora de Seguros LTDA', cnpj: '02195141000132',
    slug: 'shaddai', cor_primaria: '#0F2A44', logo_url: null, ativa: true, contrato: { observacao: 'corretora da casa' }, criado_em: '2026-10-19T12:00:00Z' };
  const vertice = { id: 'c-vertice', nome: 'Vértice Seguros', razao_social: 'Vértice Corretora de Seguros LTDA', cnpj: '11222333000181',
    slug: 'vertice', cor_primaria: '#3B2F6B', logo_url: null, ativa: true,
    contrato: { faixas: [{ ate: 2000, valor: 1.5 }, { ate: 5000, valor: 1.2 }, { ate: null, valor: 1.0 }], minimo: 990, implantacao: 4000, piloto: '50% por 3 meses' },
    criado_em: '2026-10-20T08:00:00Z' };
  db.corretoras.push(shaddai, vertice);
  db.corretora_cnpjs.push({ cnpj: shaddai.cnpj, corretora_id: shaddai.id, razao_social: shaddai.razao_social, principal: true },
    { cnpj: vertice.cnpj, corretora_id: vertice.id, razao_social: vertice.razao_social, principal: true });
  for (const [seg, cod, rot] of [['porto_saude', 'BA6QXJ', 'Portal Corretor Online'], ['hapvida', '045K', 'Shaddai Proventus 0001-23'],
    ['hapvida', '045L', 'Shaddai Proventus 0002-04'], ['hapvida', '02JZ', 'Shaddai Corretora de Seguros'], ['sulamerica', '9512', 'CIA SAÚDE (9512)']])
    db.corretora_codigos.push({ id: uid('cod'), corretora_id: shaddai.id, seguradora_id: seg, codigo: cod, rotulo: rot, cnpj_login: shaddai.cnpj, ativo: true });
  db.corretora_codigos.push({ id: uid('cod'), corretora_id: vertice.id, seguradora_id: 'amil', codigo: '771203', rotulo: 'Vértice Amil', cnpj_login: vertice.cnpj, ativo: true });

  const empresas: [string, string, string, string[], number][] = [
    ['c-shaddai', 'Padaria Bom Grão Ltda', 'BOM GRAO', ['porto_saude'], 38],
    ['c-shaddai', 'Metalúrgica Serra Azul S.A.', 'SERRA AZUL', ['bradesco_saude'], 112],
    ['c-shaddai', 'Clínica Vida Plena Ltda', 'VIDA PLENA', ['sulamerica'], 21],
    ['c-shaddai', 'Transportes Rota Sul Ltda', 'ROTA SUL', ['hapvida'], 64],
    ['c-shaddai', 'Escola Pequeno Saber', 'PEQUENO SABER', ['amil'], 17],
    ['c-shaddai', 'Construtora Pedra Firme Ltda', 'PEDRA FIRME', ['porto_saude', 'hapvida'], 47],
    ['c-shaddai', 'Estúdio Linha Reta Arquitetura', 'LINHA RETA', ['sulamerica'], 9],
    ['c-vertice', 'Mercado Bairro Novo Ltda', 'BAIRRO NOVO', ['amil'], 26],
    ['c-vertice', 'Oficina Torque Certo', 'TORQUE CERTO', ['amil'], 8],
  ];
  const comps = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  let n = 0;
  for (const [cid, razao, curto, segs, vidasBase] of empresas) {
    const e = { id: n === 0 ? 'e-bomgrao' : uid('emp'), corretora_id: cid, codigo_interno: `E${String(++n).padStart(3, '0')}`, razao_social: razao,
      nome_curto: curto, cnpj: `${entre(10, 99)}.${entre(100, 999)}.${entre(100, 999)}/0001-${entre(10, 99)}`, ativa: true, observacoes: null };
    db.empresas.push(e);
    segs.forEach((seg, k) => {
      const ap = { id: uid('apo'), corretora_id: cid, empresa_id: e.id, seguradora_id: seg, produto: 'saude', codigo_estipulante: String(entre(10000000, 99999999)),
        apolice: String(entre(100000, 999999)), dia_vencimento: pick([5, 10, 15, 20]), mes_aniversario: entre(1, 12),
        dia_corte_movimentacao: pick([20, 25, 28]), ativa: true, regra_comissao: {} };
      db.apolices.push(ap);
      const vidas = Math.max(3, Math.round(vidasBase / segs.length));
      let qtd = vidas - entre(2, 5);
      comps.forEach((comp, i) => {
        qtd = Math.max(3, qtd + entre(-1, 2));
        const valor = Math.round(qtd * (seg === 'hapvida' ? 310 : seg === 'amil' ? 520 : 640) * (1 + rnd() * 0.08) * 100) / 100;
        const venc = `${comp}-${String(ap.dia_vencimento).padStart(2, '0')}`;
        const pago = i < comps.length - 1 || ap.dia_vencimento < 20;
        const f = { id: uid('fat'), corretora_id: cid, empresa_id: e.id, apolice_id: ap.id, seguradora_id: seg, competencia: comp,
          numero: String(entre(100000000, 999999999)), vencimento: venc, valor_total: valor, valor_boleto: valor, vidas_informadas: qtd,
          data_pagamento: pago ? venc : null, conferencia_valor: rnd() < 0.08 ? 'Divergência' : 'OK', fatura_doc_id: null as string | null, boleto_doc_id: null as string | null };
        const docF = { id: uid('doc'), corretora_id: cid, empresa_id: e.id, pedido_id: null, tipo: 'fatura_pdf', competencia: comp,
          nome_arquivo: `${curto} FATURA ${comp.slice(5)}-${comp.slice(2, 4)}.pdf`, caminho_storage: `${cid}/${e.id}/fatura/${comp}/${f.numero}.pdf`,
          visivel_empresa: true, criado_em: `${comp}-02T10:00:00Z` };
        const docB = { ...docF, id: uid('doc'), tipo: 'boleto_pdf', nome_arquivo: `${curto} BOLETO ${comp.slice(5)}-${comp.slice(2, 4)}.pdf`,
          caminho_storage: `${cid}/${e.id}/boleto/${comp}/${f.numero}.pdf` };
        f.fatura_doc_id = docF.id; f.boleto_doc_id = docB.id;
        db.documentos.push(docF, docB);
        db.faturas.push(f);
        if (i === comps.length - 1 || i === comps.length - 2) {
          // vidas das duas últimas competências
          let fam = 0;
          for (let v = 0; v < qtd; ) {
            fam++;
            const sobrenome = pick(SOBRENOMES);
            const deps = Math.min(qtd - v - 1, rnd() < 0.45 ? entre(1, 3) : 0);
            for (let d = 0; d <= deps; d++, v++) {
              const titular = d === 0;
              const idade = titular ? entre(22, 62) : d === 1 && rnd() < 0.6 ? entre(22, 60) : entre(0, 21);
              db.vidas.push({ id: uid('vid'), corretora_id: cid, empresa_id: e.id, fatura_id: f.id, seguradora_id: seg, competencia: comp,
                familia: `${f.numero.slice(0, 5)}${String(fam).padStart(3, '0')}`, dependente_num: d, nome: `${pick(NOMES)} ${sobrenome}`.toUpperCase(),
                nascimento: `${2026 - idade}-${String(entre(1, 12)).padStart(2, '0')}-${String(entre(1, 28)).padStart(2, '0')}`,
                sexo: rnd() < 0.5 ? 'F' : 'M', parentesco: titular ? 'Titular' : idade > 21 ? 'Cônjuge' : 'Filho(a)', titular,
                plano: pick(['Enfermaria', 'Apartamento']), situacao: 'Ativo', movimento: i === comps.length - 1 && rnd() < 0.05 ? 'Inclusão' : '-',
                valor_total: Math.round((valor / qtd) * 100) / 100 });
            }
          }
        }
        // comissão
        if (i < comps.length - 1) {
          const ordem = `${seg.slice(0, 3).toUpperCase()}-${entre(200000, 299999)}`;
          const taxa = k === 0 && i === 0 && rnd() < 0.3 ? 100 : pick([2, 3, 5]);
          const com = Math.round(valor * taxa) / 100;
          const pag = { id: uid('pag'), corretora_id: cid, seguradora_id: seg, ordem, competencia: comps[i + 1],
            data_pagamento: `${comps[i + 1]}-${String(entre(3, 27)).padStart(2, '0')}`, bruta: com, a_pagar: com };
          db.comissao_pagamentos.push(pag);
          db.comissao_lancamentos.push({ id: uid('lan'), corretora_id: cid, pagamento_id: pag.id, empresa_id: e.id, numero_fatura: f.numero,
            taxa, comissao: com, classe: taxa > 50 ? 'agenciamento' : 'vitalicio' });
        }
      });
    });
  }

  // pedidos
  const bomgrao = db.empresas[0];
  const pedidos: [string, string, string, Record<string, string>, number][] = [
    ['inclusao', 'recebido', 'u-paula', { nome: 'MARINA COSTA LIMA', cpf: '123.456.789-09', nascimento: '1994-03-12', parentesco: 'Titular', plano: 'Apartamento', inicio: '2026-11-01' }, 60],
    ['exclusao', 'pendencia_cliente', 'u-paula', { nome: 'JOÃO PEREIRA SANTOS', motivo: 'Desligamento', data: '2026-10-31' }, 2900],
    ['segunda_via', 'concluido', 'u-lucia', { competencia: '2026-09', observacao: 'Boleto venceu, precisamos de novo' }, 9000],
    ['inclusao', 'aguardando_aprovacao_empresa', 'u-rafael', { nome: 'PEDRO ALMEIDA ROCHA', cpf: '987.654.321-00', nascimento: '2019-07-30', parentesco: 'Filho(a)', titular: 'CARLA ALMEIDA ROCHA', plano: 'Enfermaria', inicio: '2026-11-01' }, 30],
  ];
  pedidos.forEach(([tipo, status, quem, dados, minAtras], i) => {
    const p = { id: uid('ped'), protocolo: `202610-${String(i + 1).padStart(5, '0')}`, corretora_id: bomgrao.corretora_id, empresa_id: bomgrao.id,
      apolice_id: null, tipo, status, dados, prazo: '2026-10-25', solicitante_id: quem, criado_em: iso(menosMin(minAtras)), atualizado_em: iso(menosMin(minAtras / 3)) };
    db.pedidos.push(p);
    db.pedido_eventos.push({ id: db.pedido_eventos.length + 1, pedido_id: p.id, corretora_id: p.corretora_id, em: p.criado_em, autor_id: quem,
      autor_agente: null, de_status: null, para_status: status === 'aguardando_aprovacao_empresa' ? status : 'recebido', mensagem: 'Pedido aberto', visivel_empresa: true });
    if (status === 'pendencia_cliente')
      db.pedido_eventos.push({ id: db.pedido_eventos.length + 1, pedido_id: p.id, corretora_id: p.corretora_id, em: iso(menosMin(1200)), autor_id: null,
        autor_agente: 'Agente Movimentação', de_status: 'conferindo', para_status: 'pendencia_cliente',
        mensagem: 'Falta a carta de desligamento assinada. Anexe o documento para seguirmos com a exclusão.', visivel_empresa: true });
    if (status === 'concluido')
      db.pedido_eventos.push({ id: db.pedido_eventos.length + 1, pedido_id: p.id, corretora_id: p.corretora_id, em: iso(menosMin(8000)), autor_id: 'u-ana',
        autor_agente: null, de_status: 'recebido', para_status: 'concluido', mensagem: 'Novo boleto disponível em Documentos.', visivel_empresa: true });
  });
  const serra = db.empresas[1];
  db.pedidos.push({ id: uid('ped'), protocolo: '202610-00005', corretora_id: serra.corretora_id, empresa_id: serra.id, apolice_id: null,
    tipo: 'troca_plano', status: 'pronto_envio', dados: { nome: 'LUCAS MENDES DIAS', plano_atual: 'Enfermaria', plano_novo: 'Apartamento', inicio: '2026-11-01' },
    prazo: '2026-10-22', solicitante_id: null, criado_em: iso(menosMin(1500)), atualizado_em: iso(menosMin(200)) });

  // membros
  const email = (u: string) => DEMO_USUARIOS.find((x) => x.id === u)!.email;
  db.membros.push(
    { id: uid('mem'), user_id: 'u-bruno', email: email('u-bruno'), papel: 'master', corretora_id: null, empresa_id: null, ativo: true },
    { id: uid('mem'), user_id: 'u-ana', email: email('u-ana'), papel: 'admin_corretora', corretora_id: 'c-shaddai', empresa_id: null, ativo: true },
    { id: uid('mem'), user_id: 'u-carlos', email: email('u-carlos'), papel: 'operador_corretora', corretora_id: 'c-shaddai', empresa_id: null, ativo: true },
    { id: uid('mem'), user_id: 'u-paula', email: email('u-paula'), papel: 'gestor_empresa', corretora_id: 'c-shaddai', empresa_id: 'e-bomgrao', ativo: true },
    { id: uid('mem'), user_id: 'u-rafael', email: email('u-rafael'), papel: 'movimentacao_empresa', corretora_id: 'c-shaddai', empresa_id: 'e-bomgrao', ativo: true },
    { id: uid('mem'), user_id: 'u-lucia', email: email('u-lucia'), papel: 'financeiro_empresa', corretora_id: 'c-shaddai', empresa_id: 'e-bomgrao', ativo: true },
    { id: uid('mem'), user_id: 'u-marcos', email: email('u-marcos'), papel: 'admin_corretora', corretora_id: 'c-vertice', empresa_id: null, ativo: true },
  );
  db.convites.push({ id: uid('cvt'), email: 'gerente@serraazul.demo', papel: 'gestor_empresa', corretora_id: 'c-shaddai', empresa_id: serra.id,
    convidado_por: 'u-ana', criado_em: iso(menosMin(400)), aceito_em: null });

  // operação: máquinas, logins, rotinas, ordens
  db.maquinas.push({ id: 'm-pc', nome: 'PC do Bruno', descricao: 'Máquina de operação nos testes', ultimo_sinal: iso(menosMin(2)), versao: '0.1', ativa: true },
    { id: 'm-nuvem', nome: 'Máquina na nuvem', descricao: 'Windows na nuvem (ainda não ligada)', ultimo_sinal: null, versao: null, ativa: true });
  const sts: [string, boolean, number][] = [['BA6QXJ', false, 95], ['045K', true, 300], ['045L', true, 300], ['02JZ', true, 40], ['9512', true, 600]];
  for (const [cod, ativa, desde] of sts) {
    const c = db.corretora_codigos.find((x) => x.codigo === cod)!;
    db.login_status.push({ corretora_id: c.corretora_id, seguradora_id: c.seguradora_id, codigo: cod, ativa, verificado_em: iso(menosMin(entre(1, 14))),
      ativa_desde: ativa ? iso(menosMin(desde)) : null });
  }
  for (const [nome, agente, agenda, seg] of [['Faturas Porto (dia 5, 8h)', 'faturas', '0 8 5 * *', 'porto_saude'], ['Faturas Hapvida (dias úteis, 7h)', 'faturas', '0 7 * * 1-5', 'hapvida'],
    ['Comissões (segundas, 9h)', 'comissao', '0 9 * * 1', null], ['Mantém logins ativos (a cada 15 min)', 'mantem_vivo', '*/15 * * * *', null]])
    db.rotinas.push({ id: uid('rot'), corretora_id: agente === 'mantem_vivo' ? null : 'c-shaddai', nome, agente, seguradora_id: seg, agenda, ativa: true,
      maquina_id: null, proxima_execucao: null });
  const ords: [string, string | null, string, string, number, string | null][] = [
    ['faturas', 'hapvida', 'concluida', 'rotina', 180, '250 faturas lidas, 0 erros'], ['vidas', null, 'concluida', 'encadeamento', 170, 'Vidas conferidas'],
    ['faturas', 'porto_saude', 'aguardando_voce', 'manual', 90, 'Login da Porto caiu: entre no portal para continuar'],
    ['pedido', null, 'pendente', 'pedido', 25, 'Inclusão MARINA COSTA LIMA'], ['comissao', 'bradesco_saude', 'erro', 'rotina', 1500, 'Arquivo do extrato não encontrado'],
    ['faturas', 'sulamerica', 'em_execucao', 'rotina', 6, 'Lendo 14 boletos da SulAmérica'],
  ];
  for (const [agente, seg, status, origem, min, msg] of ords)
    db.ordens_execucao.push({ id: uid('ord'), corretora_id: 'c-shaddai', agente, seguradora_id: seg, competencia: '2026-10', origem, prioridade: origem === 'pedido' ? 1 : 5,
      status, criada_em: iso(menosMin(min)), iniciada_em: status === 'pendente' ? null : iso(menosMin(min - 1)),
      terminada_em: status === 'concluida' || status === 'erro' ? iso(menosMin(min - 8)) : null, mensagem: msg,
      // demonstração: o endereço real é o da sessão do Claude que rodou a ordem
      sessao_url: status === 'pendente' ? null : 'https://claude.ai/code', modo: status === 'concluida' || status === 'erro' ? 'claude' : null });
  db.ordens_execucao.push({ id: uid('ord'), corretora_id: 'c-shaddai', agente: 'conferencia', seguradora_id: null, competencia: '2026-10', origem: 'encadeamento',
    prioridade: 3, status: 'concluida', criada_em: iso(menosMin(160)), iniciada_em: iso(menosMin(160)), terminada_em: iso(menosMin(160)),
    mensagem: 'Conferência 2026-10: 0 erros e 3 avisos (3 novos).', sessao_url: null, modo: 'codigo', custo_usd: 0 });
  const confs: [string, string, 'erro' | 'aviso', string][] = [
    ['hapvida', 'vidas_divergem', 'aviso', 'ALFA LOGÍSTICA: a fatura 88231 diz 42 vidas e a lista tem 41'],
    ['porto_saude', 'fatura_faltando', 'aviso', 'BETA ENGENHARIA: tinha fatura em 2026-09 e ainda não tem nesta competência'],
    ['amil', 'comissao_sem_empresa', 'aviso', 'GAMA SERVIÇOS LTDA: 2 lançamentos de comissão (R$ 1.204,70) sem empresa cadastrada'],
  ];
  for (const [seguradora_id, tipo, gravidade, mensagem] of confs)
    db.conferencias.push({ id: uid('conf'), corretora_id: 'c-shaddai', competencia: '2026-10', seguradora_id, empresa_id: null, tipo, gravidade, mensagem,
      primeira_vez: iso(menosMin(160)), ultima_vez: iso(menosMin(160)), resolvida_em: null });
  return db;
}
