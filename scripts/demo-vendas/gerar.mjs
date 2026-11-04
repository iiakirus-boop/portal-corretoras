// Gera a corretora de demonstração (conta de vendas) com dados 100% fictícios, no mesmo formato que os agentes gravam.
// Não grava nada no banco: só escreve os arquivos SQL na pasta de saída.
//
//   node scripts/demo-vendas/gerar.mjs <pasta de saída>
//
// Sai:
//   demo_vendas_carga.sql    tudo da corretora de demonstração (corretora, empresas, apólices, faturas, vidas,
//                            comissões, documentos da Central, projeções, pedidos, conferências e convites)
//   demo_vendas_remover.sql  apaga só o que é da corretora de demonstração (para refazer ou desligar)
//   resumo.json              números para conferir
//
// Repetível: a mesma semente gera sempre os mesmos dados e os mesmos ids; a carga usa "on conflict do nothing".
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SAIDA = process.argv[2] || 'demo-vendas-saida';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');

// ---------- configuração ----------
// Dia da "foto" (dados até aqui). Padrão: hoje em Brasília. Tudo (meses, vencimentos, pedidos, tarefas) anda junto com essa data,
// então para atualizar a demonstração antes de uma apresentação basta gerar de novo e recarregar (remover + carga).
const HOJE = process.env.DEMO_HOJE || new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const M0 = HOJE.slice(0, 7), ANO = Number(HOJE.slice(0, 4));
const m = (k) => addM(M0, k);                      // mês relativo ao mês da foto
const COMPS = Array.from({ length: 10 }, (_, i) => m(i - 9));
const COMPS_VIDAS_TABELA = [m(-2), m(-1), m(0)];   // vidas linha a linha no banco (telas da empresa)
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesNome = (c) => MESES[Number(c.slice(5)) - 1];
const mesNum = (c) => `${c.slice(5)}/${c.slice(0, 4)}`;
const NS = 'demo-vendas-aurora';
const CORRETORA = {
  nome: 'Aurora Benefícios', razao_social: 'Aurora Benefícios Corretora de Seguros LTDA (demonstração)',
  cnpj: '11444777000161', // CNPJ de exemplo usado em documentação; não é de empresa real
  slug: 'aurora-demo', cor_primaria: '#1F4E5F',
};
// e-mails dos logins de demonstração: apelidos (+) do Gmail do Bruno, para os links de primeiro acesso chegarem na caixa dele
const EMAIL_BASE = process.env.DEMO_EMAIL_BASE || 'bruno.passos.santossweet@gmail.com';
const [EU, DOM] = EMAIL_BASE.split('@');
const apelido = (s) => `${EU}+${s}@${DOM}`.toLowerCase();

// ---------- utilidades ----------
const uuid = (...p) => { const h = crypto.createHash('md5').update(NS + '|' + p.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`; };
let semente = 20261103;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const r2 = (v) => Math.round(v * 100) / 100;
const D = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const addD = (d, n) => new Date(d.getTime() + n * 864e5);
const br = (s) => s.split('-').reverse().join('/');
function addM(c, k) { let [a, m] = c.split('-').map(Number); m += k; while (m > 12) { m -= 12; a++; } while (m < 1) { m += 12; a--; } return `${a}-${String(m).padStart(2, '0')}`; }
const mdiff = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const util = (d) => { const w = d.getUTCDay(); return w === 6 ? addD(d, 2) : w === 0 ? addD(d, 1) : d; };
const T0 = D(HOJE);
const dia = (k, h = '10:00:00Z') => `${iso(addD(T0, k))}T${h}`; // dia relativo à foto, com hora

const NOMES_F = ['ANA', 'BEATRIZ', 'CAMILA', 'DANIELA', 'ELISA', 'FERNANDA', 'GABRIELA', 'HELOÍSA', 'ISADORA', 'JÚLIA', 'LARISSA', 'MARIANA', 'NATÁLIA',
  'OLÍVIA', 'PRISCILA', 'RAQUEL', 'SOFIA', 'TALITA', 'VALENTINA', 'YASMIN', 'LETÍCIA', 'CLARA', 'MELISSA', 'ALICE', 'LAURA', 'MANUELA', 'CECÍLIA'];
const NOMES_M = ['ARTHUR', 'BERNARDO', 'CAIO', 'DAVI', 'ENZO', 'FELIPE', 'GUILHERME', 'HEITOR', 'IGOR', 'JOAQUIM', 'LEONARDO', 'MATEUS', 'NICOLAS',
  'OTÁVIO', 'PEDRO', 'RAFAEL', 'SAMUEL', 'TEODORO', 'VICENTE', 'WESLEY', 'GABRIEL', 'MIGUEL', 'LUCAS', 'HENRIQUE', 'BENÍCIO', 'RENATO', 'MÁRCIO'];
const SOBRENOMES = ['ALMEIDA', 'AZEVEDO', 'BARROS', 'CAMPOS', 'CARVALHO', 'CASTRO', 'CORREIA', 'DUARTE', 'FARIAS', 'FONSECA', 'FREITAS', 'GUIMARÃES',
  'LOPES', 'MACHADO', 'MONTEIRO', 'MOURA', 'NOGUEIRA', 'PEIXOTO', 'PINTO', 'QUEIROZ', 'RAMOS', 'REIS', 'SALES', 'SAMPAIO', 'TAVARES', 'VASCONCELOS', 'XAVIER'];
const FAIXAS = ['0–18', '19–23', '24–28', '29–33', '34–38', '39–43', '44–48', '49–53', '54–58', '59+'];
const FATOR = [1, 1.18, 1.36, 1.55, 1.72, 1.95, 2.3, 2.85, 3.5, 6.0];
const faixa = (id) => (id <= 18 ? 0 : id >= 59 ? 9 : Math.min(9, Math.floor((id - 19) / 5) + 1));

// seguradoras: como cada uma paga a comissão (dias e prazo depois do pagamento do boleto)
const SEG = {
  porto_saude: { k: 'porto', nome: 'Porto Saúde', ticket: 780, ordem: 'Porto · Saúde', semana: [4], lag: 2, vit: [3, 4, 5], plano: ['PORTO PRATA PME', 'PORTO OURO PME'] },
  bradesco_saude: { k: 'bradesco', nome: 'Bradesco Saúde', ticket: 930, ordem: 'Bradesco Saúde S.A.', semana: [1, 3, 5], lag: 1, vit: [2, 3], plano: ['NACIONAL FLEX ENF', 'NACIONAL FLEX APT', 'TOP NACIONAL APT'] },
  amil: { k: 'amil', nome: 'Amil', ticket: 640, ordem: 'Amil · AMIL', semana: [2], lag: 6, vit: [3, 4], plano: ['AMIL S380 QC', 'AMIL S450 QP'] },
  hapvida: { k: 'hapvida', nome: 'Hapvida', ticket: 290, ordem: 'Hapvida · MPE (suplemento)', cada: 4, lag: 24, vit: [3], plano: ['NOSSO PLANO ENF', 'NOSSO PLANO APT'] },
  sulamerica: { k: 'sulamerica', nome: 'SulAmérica', ticket: 860, ordem: 'SulAmérica · CIA', mes: [10, 25], lag: 3, vit: [2, 3], plano: ['EXECUTIVO ENF', 'ESPECIAL 100 APT'] },
};
const NUM_ORDEM = { porto_saude: 58900000, bradesco_saude: 15700000, amil: 77100000, hapvida: 4500000, sulamerica: 95120000 };

// próxima data em que a seguradora paga comissão, a partir de d
function proxPagto(seg, d) {
  const s = SEG[seg];
  for (let x = d, i = 0; i < 40; i++, x = addD(x, 1)) {
    if (s.semana && s.semana.includes(x.getUTCDay())) return x;
    if (s.mes && s.mes.includes(x.getUTCDate())) return util(x);
    if (s.cada && Math.round((x - D('2026-01-02')) / 864e5) % s.cada === 0 && x.getUTCDay() % 6 !== 0) return x;
  }
  return d;
}

// ---------- carteira fictícia ----------
// [razão social, nome curto, [[seguradora, vidas, dia de vencimento, início do contrato (agenciamento) ou null]]]
const CARTEIRA = [
  ['Padaria Trigo de Ouro Ltda', 'TRIGO DE OURO', [['porto_saude', 18, 10, null]]],
  ['Metalúrgica Vale do Aço Ltda', 'VALE DO AÇO', [['bradesco_saude', 146, 5, null]]],
  ['Clínica Odontológica Sorriso Pleno Ltda', 'SORRISO PLENO', [['sulamerica', 12, 15, null]]],
  ['Transportadora Caminho Certo Ltda', 'CAMINHO CERTO', [['hapvida', 92, 10, null]]],
  ['Colégio Novo Saber Ltda', 'NOVO SABER', [['amil', 41, 20, null]]],
  ['Construtora Alicerce Forte Ltda', 'ALICERCE FORTE', [['porto_saude', 34, 15, null], ['hapvida', 56, 20, null]]],
  ['Escritório Contábil Balanço Exato Ltda', 'BALANÇO EXATO', [['porto_saude', 9, 5, null]]],
  ['Supermercado Bom Preço da Vila Ltda', 'BOM PREÇO', [['hapvida', 128, 5, null]]],
  ['Laboratório Bioanálise Central Ltda', 'BIOANÁLISE', [['bradesco_saude', 27, 10, null]]],
  ['Agência Criativa Ponto Azul Ltda', 'PONTO AZUL', [['sulamerica', 16, 20, null]]],
  ['Indústria de Plásticos Polimax Ltda', 'POLIMAX', [['bradesco_saude', 63, 15, null]]],
  ['Restaurante Sabor da Terra Ltda', 'SABOR DA TERRA', [['amil', 22, 10, null]]],
  ['Auto Peças Roda Viva Ltda', 'RODA VIVA', [['porto_saude', 14, 25, null]]],
  ['Nuvem Clara Tecnologia Ltda', 'NUVEM CLARA', [['sulamerica', 38, 10, m(-2)]]],
  ['Farmácia Saúde Já Ltda', 'SAÚDE JÁ', [['hapvida', 19, 15, null]]],
  ['Hotel Mar Azul Ltda', 'MAR AZUL', [['amil', 31, 5, null]]],
  ['Gráfica Impressão Viva Ltda', 'IMPRESSÃO VIVA', [['porto_saude', 26, 20, m(-3)]]],
  ['Distribuidora Grão Dourado Ltda', 'GRÃO DOURADO', [['bradesco_saude', 44, 20, null]]],
  ['Academia Corpo em Movimento Ltda', 'CORPO EM MOVIMENTO', [['hapvida', 11, 25, null]]],
  ['Lima & Prado Advogados Associados', 'LIMA & PRADO', [['porto_saude', 7, 15, null]]],
  ['Engenharia Ponte Alta Ltda', 'PONTE ALTA', [['bradesco_saude', 21, 10, m(-1)]]],
  ['Pet Shop Amigo Fiel Ltda', 'AMIGO FIEL', [['amil', 6, 15, null]]],
  ['Cerâmica Terra Nobre Ltda', 'TERRA NOBRE', [['hapvida', 57, 5, m(0)]]],
  ['Imobiliária Chave Mestra Ltda', 'CHAVE MESTRA', [['sulamerica', 10, 28, null]]],
];
// situações combinadas para a demonstração mostrar o que o sistema pega
const BOLETO_ATRASADO = new Set([`SABOR DA TERRA|${m(-1)}`, `CORPO EM MOVIMENTO|${m(-1)}`]); // não pagos
const PAGO_COM_ATRASO = { [`BOM PREÇO|${m(-1)}`]: 9 };     // pago 9 dias depois do vencimento
const VIDAS_DIVERGE = new Set([`ALICERCE FORTE|hapvida|${m(-1)}`]); // fatura diz uma vida a mais que a lista
const TAXA_DIVERGE = { [`POLIMAX|${m(-2)}`]: 1.5 };          // seguradora pagou 1,5% e o contrato é 2%

// CNPJ fictício: dígitos verificadores trocados de propósito, para nunca coincidir com empresa real
function cnpjFicticio() {
  const b = Array.from({ length: 12 }, (_, i) => (i < 8 ? entre(0, 9) : [0, 0, 0, 1][i - 8]));
  const dv = (arr, pesos) => { const s = arr.reduce((t, x, i) => t + x * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), d2 = dv([...b, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const n = [...b, (d1 + 1) % 10, (d2 + 3) % 10].join('');
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

// ---------- geração ----------
const CID = uuid('corretora');
const T = { empresas: [], apolices: [], faturas: [], vidas: [], comissao_pagamentos: [], comissao_lancamentos: [], pedidos: [], pedido_eventos: [], conferencias: [], convites: [], rotinas: [] };
const CD = {}; // central_docs: colecao -> doc_id -> dados
const put = (col, id, dados) => ((CD[col] ??= {})[id] = dados);

let pessoaSeq = 0;
function novaFamilia(seg, ano0, plano) {
  const sobrenome = pick(SOBRENOMES), fam = String(entre(10000000, 99999999));
  const tsex = rnd() < 0.5 ? 'F' : 'M', tid = entre(22, 63);
  const p = [{ fam, dep: 0, td: 'T', par: 'Titular', sexo: tsex, idade: tid, sobrenome }];
  const r = rnd();
  if (r < 0.4) {
    p.push({ fam, dep: 1, td: 'D', par: 'Cônjuge', sexo: tsex === 'F' ? 'M' : 'F', idade: Math.max(19, tid + entre(-5, 5)), sobrenome });
    for (let k = 0, nk = entre(0, 2); k < nk; k++) p.push({ fam, dep: p.length, td: 'D', par: 'Filho(a)', sexo: rnd() < 0.5 ? 'F' : 'M', idade: entre(0, Math.min(21, Math.max(0, tid - 20))), sobrenome });
  } else if (r < 0.55) p.push({ fam, dep: 1, td: 'D', par: 'Filho(a)', sexo: rnd() < 0.5 ? 'F' : 'M', idade: entre(0, 17), sobrenome });
  return p.map((x) => {
    const nome = `${pick(x.sexo === 'F' ? NOMES_F : NOMES_M)} ${pick(SOBRENOMES)} ${x.sobrenome}`;
    const nasc = `${ANO - x.idade}-${String(entre(1, 12)).padStart(2, '0')}-${String(entre(1, 28)).padStart(2, '0')}`;
    return { ...x, id: ++pessoaSeq, nome, nasc, plano, adesao: ano0 };
  });
}
const idadeEm = (nasc, comp) => { const [a, m] = comp.split('-').map(Number), [na, nm] = nasc.split('-').map(Number); return a - na - (m < nm ? 1 : 0); };

const fatDocs = {};  // comp_k -> doc faturas (estado atual)
const fatLista = []; // todas as faturas com datas (para refazer a Central em qualquer dia)
const lancLista = []; // comissões (uma por fatura paga)

// cada empresa e cada contrato tem sua própria semente: o cadastro sai igual em qualquer data da foto
const semear = (...p) => { semente = parseInt(crypto.createHash('md5').update(p.join('|')).digest('hex').slice(0, 8), 16) % 2147483646 + 1; };
CARTEIRA.forEach(([razao, curto, contratos], n) => {
  const eid = `E${String(n + 1).padStart(3, '0')}`;
  semear(NS, eid); const empresaId = uuid('empresa', eid), cnpj = cnpjFicticio();
  T.empresas.push({ id: empresaId, corretora_id: CID, codigo_interno: eid, razao_social: razao, nome_curto: curto, cnpj, ativa: true, observacoes: 'Empresa fictícia (demonstração)' });
  contratos.forEach(([seg, alvo, dia, inicio], ci) => {
    semear(NS, eid, seg);
    const S = SEG[seg], apId = uuid('apolice', eid, seg);
    const vit = pick(S.vit), parc0 = inicio ? 0 : entre(8, 40); // parcela da comissão no primeiro mês para contratos antigos
    T.apolices.push({ id: apId, corretora_id: CID, empresa_id: empresaId, seguradora_id: seg, produto: 'saude', codigo_estipulante: String(entre(1000000, 9999999)),
      apolice: String(entre(100000, 999999)), contrato: null, dia_vencimento: dia, inicio_vigencia: inicio ? `${inicio}-01` : `${ANO - entre(1, 4)}-${String(entre(1, 12)).padStart(2, '0')}-01`,
      mes_aniversario: inicio ? Number(inicio.slice(5)) : entre(1, 12), dia_corte_movimentacao: Math.max(1, dia - 10 < 1 ? 20 : dia - 10), ativa: true,
      regra_comissao: { vitalicio_pct: vit, agenciamento_parcelas: 3, agenciamento_pct: 100 }, observacoes: null });
    // carteira de vidas: começa um pouco abaixo e anda com entradas e saídas
    const plano = pick(S.plano);
    let pessoas = [];
    const comp0 = inicio || COMPS[0];
    const inicial = inicio ? alvo : Math.max(3, alvo - entre(1, Math.ceil(alvo * 0.08)));
    while (pessoas.length < inicial) pessoas.push(...novaFamilia(seg, inicio ? `${inicio}-01` : `${ANO - entre(1, 5)}-${String(entre(1, 12)).padStart(2, '0')}-01`, plano));
    pessoas = pessoas.slice(0, inicial);
    const hist = {}, dist = {}, mov = [];
    let antes = null, nomesAntes = null;
    const base = S.ticket / 2.1;
    COMPS.filter((c) => c >= comp0).forEach((comp, i) => {
      if (i > 0) { // movimentação do mês
        const sai = rnd() < 0.55 ? entre(1, Math.max(1, Math.ceil(pessoas.length * 0.03))) : 0;
        for (let k = 0; k < sai && pessoas.length > 3; k++) {
          const t = pick(pessoas.filter((p) => p.td === 'T'));
          pessoas = pessoas.filter((p) => p.fam !== t.fam);
        }
        const falta = alvo - pessoas.length + entre(-1, 2);
        if (falta > 0) { let novos = []; while (novos.length < falta) novos.push(...novaFamilia(seg, `${comp}-01`, plano)); pessoas.push(...novos.slice(0, falta)); }
      }
      const venc = `${comp}-${String(dia).padStart(2, '0')}`, emissao = iso(addD(D(venc), -24));
      if (emissao > HOJE) return; // ainda não saiu
      const vidasVal = pessoas.map((p) => ({ p, idade: idadeEm(p.nasc, comp), valor: r2(base * FATOR[faixa(idadeEm(p.nasc, comp))] * (/APT|OURO|S450|TOP|ESPECIAL/.test(plano) ? 1.25 : 1)) }));
      const valor = r2(vidasVal.reduce((s, x) => s + x.valor, 0));
      const chaveE = `${curto}|${comp}`;
      const atraso = PAGO_COM_ATRASO[chaveE] ?? entre(-4, 1);
      const pagoEm = BOLETO_ATRASADO.has(chaveE) ? null : iso(addD(D(venc), atraso));
      const numero = String(entre(600000000, 699999999));
      const vidasInf = vidasVal.length + (VIDAS_DIVERGE.has(`${curto}|${S.k}|${comp}`) ? 1 : 0);
      const fid = uuid('fatura', eid, seg, comp);
      const f = { id: fid, corretora_id: CID, empresa_id: empresaId, apolice_id: apId, seguradora_id: seg, competencia: comp, numero, emissao, vencimento: venc,
        cobertura_inicio: `${comp}-01`, cobertura_fim: iso(addD(D(`${addM(comp, 1)}-01`), -1)), valor_total: valor, valor_boleto: valor,
        vidas_informadas: vidasInf, vidas_extraidas: vidasVal.length, soma_vidas: valor,
        data_pagamento: pagoEm && pagoEm <= HOJE ? pagoEm : null, valor_pago: pagoEm && pagoEm <= HOJE ? valor : null,
        conferencia_valor: 'OK', conferencia_vidas: vidasInf === vidasVal.length ? 'OK' : 'Divergência', conferencia_boleto: 'OK', observacoes: 'Fatura fictícia (demonstração)' };
      T.faturas.push(f);
      fatLista.push({ comp, seg, eid, empresa: razao.toUpperCase(), titulo: numero, valor, vidas: vidasInf, ativos: vidasVal.length, venc, emissao, pagoEm, conf: f.conferencia_vidas });
      // vidas linha a linha (últimos meses), para as telas da empresa
      if (COMPS_VIDAS_TABELA.includes(comp)) for (const x of vidasVal) T.vidas.push({ id: uuid('vida', fid, x.p.id), corretora_id: CID, empresa_id: empresaId, fatura_id: fid, seguradora_id: seg, competencia: comp,
        familia: x.p.fam, dependente_num: x.p.dep, nome: x.p.nome, cpf: null, nascimento: x.p.nasc, sexo: x.p.sexo, parentesco: x.p.par, titular: x.p.td === 'T',
        plano_codigo: null, plano: x.p.plano, matricula: String(x.p.id).padStart(6, '0'), situacao: 'Ativo', adesao: x.p.adesao, exclusao: null,
        premio_base: x.valor, pro_rata: 0, copart_total: 0, valor_total: x.valor, movimento: nomesAntes && !nomesAntes.has(x.p.nome) ? 'Inclusão' : null, subestipulante: null, observacoes: null, idade: x.idade });
      // Agente Vidas (Central): histórico e distribuição por faixa
      const nomesAgora = new Set(vidasVal.map((x) => x.p.nome));
      const entN = nomesAntes ? [...nomesAgora].filter((x) => !nomesAntes.has(x)).sort() : [], saiN = nomesAntes ? [...nomesAntes].filter((x) => !nomesAgora.has(x)).sort() : [];
      hist[comp] = { ativos: vidasVal.length, incl: entN.length, excl: saiN.length, valor };
      const fT = Array(10).fill(0), fD = Array(10).fill(0), sx = { TM: Array(11).fill(0), TF: Array(11).fill(0), TN: Array(11).fill(0), DM: Array(11).fill(0), DF: Array(11).fill(0), DN: Array(11).fill(0) };
      for (const x of vidasVal) { const fx = faixa(x.idade); (x.p.td === 'T' ? fT : fD)[fx]++; sx[x.p.td + x.p.sexo][fx]++; }
      const ids = vidasVal.map((x) => x.idade);
      const nT = vidasVal.filter((x) => x.p.td === 'T').length;
      dist[comp] = { D: vidasVal.length - nT, T: nT, at: vidasVal.length, fD, fT, sx, st: vidasInf === vidasVal.length ? '✅ OK' : '⚠️ Fatura informa ' + vidasInf + ' vidas e a lista tem ' + vidasVal.length,
        inf: vidasInf, max: Math.max(...ids), min: Math.min(...ids), sem: 0, acao: vidasInf === vidasVal.length ? '' : 'conferir com a seguradora', media: r2(ids.reduce((a, b) => a + b, 0) / ids.length * 10 / 100 * 10) / 1,
        planos: [[plano, nT, vidasVal.length - nT, valor]] };
      dist[comp].media = Math.round(ids.reduce((a, b) => a + b, 0) / ids.length * 10) / 10;
      if (antes != null) mov.push({ de: addM(comp, -1), comp, ent: entN.length, sai: saiN.length, entN, saiN, agora: vidasVal.length, antes, obs: '' });
      antes = vidasVal.length; nomesAntes = nomesAgora;
      // comissão desta fatura
      if (!pagoEm) return;
      const parcela = inicio ? mdiff(inicio, comp) + 1 : parc0 + mdiff(COMPS[0], comp);
      const ag = inicio && parcela <= 3;
      const taxa = ag ? 100 : TAXA_DIVERGE[chaveE] ?? vit;
      const premio = r2(valor / 1.0238);
      const dataCom = proxPagto(seg, addD(D(pagoEm), S.lag));
      lancLista.push({ seg, eid, empresaId, apId, fid, empresa: razao.toUpperCase(), titulo: numero, compFat: comp, venc, valorFat: valor, premio, premioEsp: r2(valor / 1.0238),
        taxa, tipo: ag ? 'AN' : 'CO', parcela, comissao: r2(premio * taxa / 100), data: iso(dataCom), conf: TAXA_DIVERGE[chaveE] ? 'Divergência' : 'OK', taxaContrato: vit });
    });
    // documentos do Agente Vidas (a empresa com dois contratos fica com o maior na Central, como hoje)
    if (ci === 0 || alvo > (CD.vidasdist?.[eid]?.at ?? 0)) {
      const ult = Object.keys(dist).sort().pop();
      put('vidasdist', eid, { op: S.nome, eid, ult, nome: curto, comps: dist, faixas: FAIXAS, mov, atualizadoEm: `${HOJE}T07:10:00` , at: alvo });
      put('vidas', eid, { eid, cnpj, comp: ult, diaVenc: dia, hist, atualizadoEm: `${HOJE}T07:10:00-03:00`,
        vidas: pessoas.map((p) => ({ n: p.nome, id: p.id, op: S.nome, pr: 0, td: p.td, cop: 0, fam: p.fam, fat: '', par: p.par, sit: 'Ativo', sub: '', tot: 0, ades: p.adesao, excl: null, nasc: p.nasc, plano: p.plano, premio: 0 })) });
    }
  });
});
for (const d of Object.values(CD.vidasdist ?? {})) delete d.at;

// ---------- comissões: ordens de pagamento por seguradora e dia ----------
const ordens = {}; // seg|data -> ordem
for (const l of lancLista) {
  if (l.data > HOJE || l.data < `${COMPS[1]}-01`) continue; // extratos de comissão importados desde o 2º mês
  const k = l.seg + '|' + l.data;
  const o = (ordens[k] ??= { seg: l.seg, data: l.data, op: String(NUM_ORDEM[l.seg] + Object.keys(ordens).length * 37 + entre(1, 30)), itens: [] });
  o.itens.push(l);
}
for (const o of Object.values(ordens)) {
  const pid = uuid('pagamento', o.seg, o.op), bruta = r2(o.itens.reduce((s, x) => s + x.comissao, 0));
  T.comissao_pagamentos.push({ id: pid, corretora_id: CID, seguradora_id: o.seg, ordem: o.op, competencia: o.data.slice(0, 7), data_pagamento: o.data, bruta, inss: 0, irrf: 0, iss: 0,
    liquido: bruta, debito_credito: 0, a_pagar: bruta, descricao_debitos: null, conferencia: o.itens.some((x) => x.conf !== 'OK') ? 'Divergência' : 'OK', observacoes: 'Extrato fictício (demonstração)' });
  for (const l of o.itens) T.comissao_lancamentos.push({ id: uuid('lancamento', l.fid), corretora_id: CID, pagamento_id: pid, empresa_id: l.empresaId, apolice_id: l.apId, fatura_id: l.fid,
    segurado: l.empresa, codigo_estipulante: null, numero_fatura: l.titulo, parcela: l.parcela, data_lancamento: o.data, premio_liquido: l.premio, taxa: l.taxa, comissao: l.comissao,
    tipo_original: l.tipo === 'AN' ? 'AN - Agenciamento' : 'CO - Comissão (vitalício)', classe: l.tipo === 'AN' ? 'agenciamento' : 'vitalicio', premio_esperado: l.premioEsp,
    comissao_calculada: r2(l.premioEsp * (l.tipo === 'AN' ? 100 : l.taxaContrato) / 100), conferencia: l.conf, observacoes: null });
}

// ---------- documentos da Central num dia qualquer (para a foto de hoje e as rodadas antigas da Projeção) ----------
function centralEm(dia, comPagamentosDoDia) {
  const fat = {}, com = {};
  for (const f of fatLista) {
    if (f.emissao > dia) continue;
    const S = SEG[f.seg], id = `${f.comp}_${S.k}`;
    const d = (fat[id] ??= { comp: f.comp, operadora: S.nome, parcial: false, atualizadoEm: `${dia}T07:05:00-03:00`, itens: [], pendentes: [] });
    const pago = f.pagoEm && (comPagamentosDoDia ? f.pagoEm <= dia : f.pagoEm < dia);
    d.itens.push({ eid: f.eid, subs: 1, venc: br(f.venc), valor: f.valor, vidas: f.vidas, ativos: f.ativos, boleto: pago ? 'Pago' : 'Em aberto', titulo: f.titulo, empresa: f.empresa,
      confValor: 'OK', confVidas: f.conf });
  }
  const ords = Object.values(ordens).filter((o) => (comPagamentosDoDia ? o.data <= dia : o.data < dia)).sort((a, b) => a.data.localeCompare(b.data));
  for (const o of ords) {
    const S = SEG[o.seg], id = `${o.data.slice(0, 7)}_${S.k}`;
    const d = (com[id] ??= { obs: `${S.nome}: extratos fictícios da demonstração. Agenciamento = taxa acima de 50%; vitalício = até 10%.`, comp: o.data.slice(0, 7), itens: [], extras: [], ordens: [], pendentes: [],
      operadora: S.nome, faturasMes: 0, atualizadoEm: `${dia}T07:20:00-03:00` });
    const bruto = r2(o.itens.reduce((s, x) => s + x.comissao, 0));
    d.ordens.push({ op: o.op, conf: 'OK', data: br(o.data), lanc: o.itens.length, bruto, apagar: bruto, dataISO: o.data, debcred: 0, debitos: '', empresa: S.ordem });
    for (const l of o.itens) d.itens.push({ op: o.op, eid: l.eid, conf: l.conf, taxa: l.taxa, tipo: l.tipo, venc: br(l.venc), comFat: l.valorFat, copart: 0, premio: l.premio, titulo: l.titulo,
      compFat: l.compFat, empresa: l.empresa, parcela: l.parcela, comissao: l.comissao, taxaFixa: 0, valorFat: l.valorFat, premioEsp: l.premioEsp });
    d.faturasMes = d.itens.length;
  }
  return { fat, com };
}

// ---------- Projeção: a mesma conta do Agente Projeção da nuvem (supabase/functions/agente-projecao) ----------
const tmp = path.join(SAIDA, '.modelo-projecao.mjs');
fs.mkdirSync(SAIDA, { recursive: true });
fs.writeFileSync(tmp, fs.readFileSync(path.join(RAIZ, 'lib/central/projecao.gen.js'), 'utf8'));
const M_ = await import(pathToFileURL(path.resolve(tmp)).href);
fs.unlinkSync(tmp);

const IMPLANTACAO_TERRA = { id: 'IMP-20261015-demo', empresa: 'CERÂMICA TERRA NOBRE LTDA', eid: 'E023', operadora: 'Hapvida', inicio: m(0), diaVenc: 5, valor: fatLista.find((f) => f.eid === 'E023' && f.comp === m(0))?.valor ?? 16000, vidas: 57,
  agPct: 300, vitPct: 3, status: 'Implantada', obs: 'Contrato novo: 3 parcelas de agenciamento de 100% (empresa fictícia).', atualizadoEm: dia(-19, '14:00:00Z'), por: 'Demonstração',
  criadaEm: dia(-19, '14:00:00Z'), origem: 'Portal' };
const IMPLANTACAO = { id: 'IMP-20261028-demo', empresa: 'VERDE CAMPO ALIMENTOS LTDA', eid: '', operadora: 'Bradesco Saúde', inicio: m(1), diaVenc: 10, valor: 38500, vidas: 42,
  agPct: 200, vitPct: 3, status: 'Prevista', obs: `Proposta assinada; contrato começa em ${mesNome(m(1))} (empresa fictícia).`, atualizadoEm: dia(-6, '17:00:00Z'), por: 'Demonstração',
  criadaEm: dia(-6, '17:00:00Z'), origem: 'Portal' };

function projetar(dia, gatilho) {
  const { fat, com } = centralEm(dia, false);
  const imps = [...(dia >= IMPLANTACAO_TERRA.criadaEm.slice(0, 10) ? [IMPLANTACAO_TERRA] : []), ...(dia >= IMPLANTACAO.criadaEm.slice(0, 10) ? [IMPLANTACAO] : [])];
  const M = M_.projAll(Object.values(fat), M_.mergeCom(Object.values(com)), { agcfg: {}, imps, hoje: new Date(dia + 'T12:00:00Z') });
  if (!M) return null;
  const Tt = M.hoje, cm = M_.ckey(Tt), meses = [0, 1, 2, 3].map((k) => M_.addMonth(cm, k));
  const linhas = [];
  meses.forEach((m) => {
    const it = M.com.filter((x) => M_.ckey(x.data) === m);
    const segs = M_.famsIn(M_.uniq(M.com.map((x) => M_.fam(x.op))));
    segs.forEach((f) => ['ag', 'vit'].forEach((k) => {
      const L = it.filter((x) => M_.fam(x.op) === f && x.kind === k);
      const real = M_.sum(L.filter((x) => x.tipo === 'real'), (x) => x.valor), prev = M_.sum(L.filter((x) => x.tipo === 'prev'), (x) => x.valor), proj = M_.sum(L.filter((x) => x.tipo === 'proj'), (x) => x.valor);
      if (real + prev + proj > 0) linhas.push({ comp: m, seg: f, kind: k, real: r2(real), prev: r2(prev), proj: r2(proj), total: r2(real + prev + proj), n: L.length });
    }));
  });
  const top = {};
  M.com.filter((x) => x.tipo !== 'real' && M_.ckey(x.data) > cm).forEach((x) => { const k = x.empresa + '|' + M_.fam(x.op) + '|' + x.kind; top[k] = (top[k] || 0) + x.valor; });
  const empresas = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => { const [empresa, seg, kind] = k.split('|'); return { empresa, seg, kind, valor: r2(v) }; });
  const w0 = new Date(Tt.getTime() - ((Tt.getUTCDay() + 6) % 7) * 864e5), w1 = new Date(w0.getTime() + 14 * 864e5);
  const itens = M.com.filter((x) => x.tipo !== 'real' && x.data >= w0 && x.data < w1).sort((a, b) => a.data - b.data)
    .map((x) => ({ data: x.data.toISOString().slice(0, 10), empresa: x.empresa, eid: x.eid || '', op: x.op, kind: x.kind, valor: r2(x.valor), tipo: x.tipo, ...(x.atraso ? { atraso: true } : {}) }));
  const geradoEm = `${dia}T10:07:00.000Z`;
  return {
    id: cm + '_' + dia.replace(/-/g, '') + '0707', geradoEm, gatilho, mesAtual: cm, horizonte: meses[3], ultCompFaturas: M.ultComp,
    meses: meses.map((m) => {
      const L = linhas.filter((l) => l.comp === m); const porSeg = {};
      L.forEach((l) => { const o = (porSeg[l.seg] = porSeg[l.seg] || { ag: 0, vit: 0, total: 0 }); o[l.kind] = r2(o[l.kind] + l.total); o.total = r2(o.total + l.total); });
      return { comp: m, total: r2(M_.sum(L, (l) => l.total)), ag: r2(M_.sum(L.filter((l) => l.kind === 'ag'), (l) => l.total)), vit: r2(M_.sum(L.filter((l) => l.kind === 'vit'), (l) => l.total)), real: r2(M_.sum(L, (l) => l.real)), porSeg };
    }),
    linhas, empresas, agenciamentos: M.ag.map((A) => ({ eid: A.eid, nome: A.nome, restantes: A.restantes, recebidas: A.rec.length + A.assum, imp: !!A.im })),
    atrasos: M.com.filter((x) => x.atraso).map((x) => ({ empresa: x.empresa, seg: M_.fam(x.op), kind: x.kind, valor: r2(x.valor), quando: x.quando })),
    itens, implantacoesNovas: (M.novas || []).length, extraSemFatura: M.extraN, origem: 'nuvem',
  };
}
// uma rodada por dia, às 7h, de 31/08 até hoje (como a rotina "Projeção diária")
for (let d = addD(D(`${m(-2)}-01`), -1); iso(d) <= HOJE; d = addD(d, 1)) {
  const foto = projetar(iso(d), 'Projeção diária');
  if (foto) put('projecoes', foto.id, foto);
}

// estado atual da Central (com os pagamentos de hoje)
const atual = centralEm(HOJE, true);
for (const [id, d] of Object.entries(atual.fat)) put('faturas', id, d);
for (const [id, d] of Object.entries(atual.com)) put('comissoes', id, d);
put('implantacoes', IMPLANTACAO.id, IMPLANTACAO);
put('implantacoes', IMPLANTACAO_TERRA.id, IMPLANTACAO_TERRA);

// ---------- agentes, tarefas e eventos da Central ----------
const nFat = (comp) => fatLista.filter((f) => f.comp === comp).length;
const vidasMes = (comp) => fatLista.filter((f) => f.comp === comp).reduce((s, f) => s + f.ativos, 0);
const comMes = (comp) => T.comissao_pagamentos.filter((p) => p.competencia === comp).reduce((s, p) => s + p.bruta, 0);
const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fotoHoje = Object.values(CD.projecoes).sort((a, b) => a.geradoEm.localeCompare(b.geradoEm)).pop();
const faltam = T.apolices.filter((a) => !fatLista.some((f) => f.comp === m(0) && f.eid === T.empresas.find((e) => e.id === a.empresa_id).codigo_interno && f.seg === a.seguradora_id));
const dd = (c, d) => `${String(d).padStart(2, '0')}/${c.slice(5)}`; // dia/mês
const AG = {
  faturas: ['Agente Faturas', 1, 'Baixa faturas, boletos e vidas do portal e grava na base', `${mesNum(m(0))}: ${nFat(m(0))} faturas gravadas; ${CARTEIRA.length} empresas na carteira.` +
    (faltam.length ? ` ${faltam.length === 1 ? 'Falta 1 fatura, que sai' : `Faltam ${faltam.length} faturas, que saem`} nos próximos dias.` : ' Todas as faturas do mês já saíram.')],
  vidas: ['Agente Vidas', 2, 'Mantém a base de vidas ativas a partir dos faturados', `${vidasMes(m(0)).toLocaleString('pt-BR')} vidas em ${mesNum(m(0))}${faltam.length ? ' (parcial)' : ''} · ${vidasMes(m(-1)).toLocaleString('pt-BR')} em ${m(-1).slice(5)} · ${vidasMes(m(-2)).toLocaleString('pt-BR')} em ${m(-2).slice(5)}`],
  movimentacoes: ['Agente Movimentações', 3, 'Valida inclusões e exclusões e aponta pendências', 'Conferindo os pedidos do portal.'],
  comissoes: ['Agente Comissão', 4, 'Baixa o analítico de comissões e bate com o faturamento de cada empresa', `${mesNum(m(-1))}: R$ ${fmt(comMes(m(-1)))} recebidos em ${T.comissao_pagamentos.filter((p) => p.competencia === m(-1)).length} pagamentos. 1 taxa abaixo do contrato em ${mesNome(m(-2))} (Polimax).`],
  projecao: ['Agente Projeção', 6, 'Projeta a comissão dos próximos 3 meses, separando agenciamento e vitalício, e compara com o que entrou',
    `Rodada de ${br(HOJE).slice(0, 5)}: ${fotoHoje.meses.slice(0, 3).map((x) => `${x.comp.slice(5)}/${x.comp.slice(2, 4)} R$ ${fmt(x.total)}`).join(' · ')}.`],
};
for (const [id, [nome, ordem, papel, atividade]] of Object.entries(AG)) put('agentes', id, { pct: 100, nome, ordem, papel, status: 'em_dia', atividade });
const venc = (eid) => T.apolices.find((a) => a.empresa_id === T.empresas.find((e) => e.codigo_interno === eid).id).dia_vencimento;
const TAREFAS = {
  't-boleto-sabor': { agente: 'faturas', coluna: 'precisa', titulo: `Boleto de ${mesNome(m(-1))} em aberto: Sabor da Terra`, detalhe: `Venceu em ${dd(m(-1), venc('E012'))} e não consta pagamento. A comissão de ${mesNome(m(-1))} dessa empresa não cai até o boleto ser pago.`,
    quem: 'E012 · Amil', acao: 'Marcar como verificado', criadaEm: `${m(-1)}-${String(venc('E012') + 4).padStart(2, '0')}T10:00:00Z` },
  't-boleto-corpo': { agente: 'faturas', coluna: 'precisa', titulo: `Boleto de ${mesNome(m(-1))} em aberto: Corpo em Movimento`, detalhe: `Venceu em ${dd(m(-1), venc('E019'))} e não consta pagamento. Avisar o financeiro da empresa.`,
    quem: 'E019 · Hapvida', acao: 'Marcar como verificado', criadaEm: `${m(-1)}-${String(venc('E019') + 3).padStart(2, '0')}T10:00:00Z` },
  't-vidas-alicerce': { agente: 'vidas', coluna: 'precisa', titulo: 'Vidas não batem: Alicerce Forte (Hapvida)', detalhe: `A fatura de ${mesNome(m(-1))} informa uma vida a mais do que a lista de beneficiários.`,
    quem: 'E006 · Hapvida', acao: 'Marcar como verificado', criadaEm: `${m(-1)}-21T13:00:00Z` },
  't-taxa-polimax': { agente: 'comissoes', coluna: 'andamento', titulo: 'Taxa abaixo do contrato: Polimax', detalhe: `A comissão de ${mesNome(m(-2))} veio com 1,5% e o contrato é de 2%. Diferença pedida à seguradora.`,
    quem: 'E011 · Bradesco Saúde', criadaEm: `${m(-1)}-09T15:00:00Z` },
  't-done-fat': { agente: 'faturas', coluna: 'concluido', titulo: `Faturas ${mesNum(m(-1))} de todas as seguradoras`, detalhe: `${nFat(m(-1))} faturas gravadas, com boleto e lista de vidas.`, quem: 'Todas as seguradoras', criadaEm: `${m(-1)}-06T10:00:00Z`, concluidaEm: `${m(-1)}-06T10:20:00Z` },
  't-done-com': { agente: 'comissoes', coluna: 'concluido', titulo: `Comissões ${mesNum(m(-1))} conferidas`, detalhe: `As comissões de ${mesNome(m(-1))} batem com a fatura (prêmio sem IOF × taxa).`, quem: 'Todas as seguradoras', criadaEm: `${m(0)}-01T10:00:00Z`, concluidaEm: `${m(0)}-01T10:30:00Z` },
};
for (const [id, t] of Object.entries(TAREFAS)) put('tarefas', id, t);
put('eventos', HOJE, { dia: HOJE, itens: [
  { ts: `${HOJE}T10:05:00Z`, agente: 'faturas', texto: `conferiu as faturas de ${mesNum(m(0))}: ${nFat(m(0))} gravadas, valores e vidas batem.` },
  { ts: `${HOJE}T10:07:00Z`, agente: 'projecao', texto: 'refez a projeção dos próximos 3 meses.' },
  { ts: `${HOJE}T10:10:00Z`, agente: 'vidas', texto: `atualizou a distribuição de vidas com as entradas e saídas de ${mesNome(m(0))}.` },
  { ts: `${HOJE}T10:20:00Z`, agente: 'comissoes', texto: 'importou os extratos de comissão de hoje e conferiu com as faturas.' },
] });

// ---------- pedidos, conferências, logins ----------
const emp = (eid) => T.empresas.find((e) => e.codigo_interno === eid);
const trigo = emp('E001'), vale = emp('E002');
const prox1 = `${m(1)}-01`;
const PEDIDOS = [
  [trigo, 'inclusao', 'recebido', { nome: 'MARINA AZEVEDO CAMPOS', cpf: '000.000.000-00', nascimento: '1995-03-12', parentesco: 'Titular', plano: 'PORTO PRATA PME', inicio: prox1 }, dia(0, '12:40:00Z')],
  [trigo, 'exclusao', 'pendencia_cliente', { nome: 'OTÁVIO REIS MOURA', motivo: 'Desligamento', data: iso(addD(T0, -3)) }, dia(-4, '19:10:00Z')],
  [trigo, 'segunda_via', 'concluido', { competencia: m(-1), observacao: 'Boleto não chegou por e-mail' }, dia(-26, '14:00:00Z')],
  [trigo, 'inclusao', 'aguardando_aprovacao_empresa', { nome: 'HEITOR AZEVEDO CAMPOS', nascimento: '2021-07-30', parentesco: 'Filho(a)', titular: 'MARINA AZEVEDO CAMPOS', plano: 'PORTO PRATA PME', inicio: prox1 }, dia(0, '13:15:00Z')],
  [vale, 'troca_plano', 'pronto_envio', { nome: 'LUCAS DUARTE PINTO', plano_atual: 'NACIONAL FLEX ENF', plano_novo: 'NACIONAL FLEX APT', inicio: prox1 }, dia(-1, '17:00:00Z')],
  [vale, 'exclusao', 'enviado_seguradora', { nome: 'PRISCILA SAMPAIO LOPES', motivo: 'Pedido de demissão', data: iso(addD(T0, -6)) }, dia(-6, '12:00:00Z')],
];
PEDIDOS.forEach(([e, tipo, status, dados, em], i) => {
  const id = uuid('pedido', i);
  T.pedidos.push({ id, protocolo: `DEMO-${String(i + 1).padStart(4, '0')}`, corretora_id: CID, empresa_id: e.id, apolice_id: T.apolices.find((a) => a.empresa_id === e.id).id, tipo, status, dados,
    prazo: iso(addD(T0, 17)), criado_em: em, atualizado_em: em });
  const msg = { pendencia_cliente: 'Falta a carta de desligamento assinada. Anexe o documento para seguirmos com a exclusão.',
    concluido: 'Segunda via enviada. O boleto novo está em Faturas e boletos.', enviado_seguradora: 'Exclusão enviada à seguradora. Protocolo 118734 (fictício).',
    pronto_envio: 'Documentos conferidos. Pronto para enviar à seguradora.' }[status];
  if (msg) T.pedido_eventos.push({ pedido_id: id, corretora_id: CID, em: new Date(new Date(em).getTime() + 3 * 3600e3).toISOString(), autor_agente: 'Agente Movimentações', de_status: 'recebido', para_status: status, mensagem: msg, visivel_empresa: true });
});
const CONF = [
  [m(-1), 'hapvida', 'E006', 'vidas_divergem', 'aviso', `ALICERCE FORTE: a fatura de ${mesNome(m(-1))} diz uma vida a mais do que a lista`, null, null],
  [m(-1), 'amil', 'E012', 'boleto_em_aberto', 'aviso', `SABOR DA TERRA: boleto de ${mesNome(m(-1))} venceu em ${dd(m(-1), venc('E012'))} e não foi pago`, null, null],
  [m(-2), 'bradesco_saude', 'E011', 'taxa_diverge', 'erro', `POLIMAX: comissão de ${mesNome(m(-2))} paga a 1,5%; o contrato é de 2%`, 2, 1.5],
];
for (const [comp, seg, eid, tipo, gravidade, mensagem, esperado, encontrado] of CONF)
  T.conferencias.push({ id: uuid('conf', tipo, eid), corretora_id: CID, competencia: comp, seguradora_id: seg, empresa_id: emp(eid).id, tipo, gravidade, chave: `${eid}-${comp}`, mensagem, esperado, encontrado,
    primeira_vez: `${HOJE}T10:30:00Z`, ultima_vez: `${HOJE}T10:30:00Z` });
const LOGINS = [
  ['demo-admin', 'admin_corretora', null, 'Administradora da corretora: vê tudo, inclusive comissões e projeção'],
  ['demo-operador', 'operador_corretora', null, 'Operador da corretora: empresas, faturas e pedidos, sem comissão'],
  ['demo-empresa', 'gestor_empresa', trigo.id, 'Gestora da Padaria Trigo de Ouro: faturas, vidas e pedidos da empresa'],
  ['demo-financeiro', 'financeiro_empresa', trigo.id, 'Financeiro da Padaria Trigo de Ouro: faturas, boletos e 2ª via'],
];
for (const [ap, papel, empresa_id] of LOGINS) T.convites.push({ id: uuid('convite', ap), email: apelido(ap), papel, corretora_id: CID, empresa_id });

// ---------- SQL ----------
const lit = (v) => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v)
  : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`;
function inserts(tabela, linhas, conflito = 'on conflict do nothing', lote = 200) {
  if (!linhas.length) return '';
  const cols = Object.keys(linhas[0]);
  let out = '';
  for (let i = 0; i < linhas.length; i += lote)
    out += `insert into ${tabela} (${cols.join(', ')}) values\n` + linhas.slice(i, i + lote).map((l) => '  (' + cols.map((c) => lit(l[c])).join(', ') + ')').join(',\n') + `\n${conflito};\n`;
  return out;
}
const docsLinhas = Object.entries(CD).flatMap(([colecao, ds]) => Object.entries(ds).map(([doc_id, dados]) => ({ corretora_id: CID, colecao, doc_id, dados, atualizado_em: `${HOJE}T10:30:00Z` })));
const config = { demo: true, observacao: 'Conta de demonstração para vendas. Dados fictícios; nenhum agente de portal roda para ela.' };
const sql = `-- Corretora de demonstração "${CORRETORA.nome}" (conta de vendas). DADOS 100% FICTÍCIOS.
-- Gerado por scripts/demo-vendas/gerar.mjs em ${new Date().toISOString().slice(0, 10)} (foto de ${br(HOJE)}).
-- Só insere; não apaga nem altera nada que já existe (on conflict do nothing). Rodar de novo não duplica.
-- Para desfazer: demo_vendas_remover.sql (apaga só o que tem corretora_id = ${CID}).
begin;

insert into corretoras (id, nome, razao_social, cnpj, slug, cor_primaria, ativa, contrato, config_agentes) values
  (${lit(CID)}, ${lit(CORRETORA.nome)}, ${lit(CORRETORA.razao_social)}, ${lit(CORRETORA.cnpj)}, ${lit(CORRETORA.slug)}, ${lit(CORRETORA.cor_primaria)}, true,
   ${lit({ demo: true, observacao: 'conta de demonstração, sem mensalidade' })}, ${lit(config)})
on conflict do nothing;
insert into corretora_cnpjs (cnpj, corretora_id, razao_social, principal) values (${lit(CORRETORA.cnpj)}, ${lit(CID)}, ${lit(CORRETORA.razao_social)}, true) on conflict do nothing;

${inserts('empresas', T.empresas)}
${inserts('apolices', T.apolices)}
${inserts('faturas', T.faturas)}
${inserts('vidas', T.vidas, 'on conflict do nothing', 400)}
${inserts('comissao_pagamentos', T.comissao_pagamentos)}
${inserts('comissao_lancamentos', T.comissao_lancamentos)}
${inserts('central_docs', docsLinhas, 'on conflict do nothing', 20)}
-- pedidos: o próprio banco grava o evento "Pedido aberto" de cada um
${inserts('pedidos', T.pedidos)}
insert into pedido_eventos (pedido_id, corretora_id, em, autor_agente, de_status, para_status, mensagem, visivel_empresa)
select v.pedido_id::uuid, v.corretora_id::uuid, v.em::timestamptz, v.autor_agente, v.de_status::status_pedido, v.para_status::status_pedido, v.mensagem, v.visivel_empresa
  from (values
${T.pedido_eventos.map((e) => `    (${[e.pedido_id, e.corretora_id, e.em, e.autor_agente, e.de_status, e.para_status, e.mensagem].map(lit).join(', ')}, true)`).join(',\n')}
  ) v(pedido_id, corretora_id, em, autor_agente, de_status, para_status, mensagem, visivel_empresa)
 where not exists (select 1 from pedido_eventos x where x.pedido_id = v.pedido_id::uuid and x.mensagem = v.mensagem);
${inserts('conferencias', T.conferencias)}
${inserts('convites', T.convites)}
commit;
`;
const remover = `-- Remove a corretora de demonstração "${CORRETORA.nome}" e tudo que é dela. Não toca em nenhuma outra corretora.
begin;
${['downloads where documento_id in (select id from documentos where corretora_id = $C)', 'documentos', 'pedido_eventos', 'pedidos', 'conferencias', 'ordens_execucao', 'rotinas', 'projecao_itens', 'projecao_rodadas',
  'exclusoes', 'apelidos_empresa', 'faturas_situacao_portal', 'central_eid', 'cobranca_fechamentos', 'execucoes', 'central_docs', 'comissao_lancamentos', 'comissao_pagamentos', 'vidas', 'faturas', 'subestipulantes', 'apolices', 'convites', 'membros', 'empresas', 'corretora_codigos', 'corretora_cnpjs', 'corretoras']
  .map((t) => t.includes(' where ') ? `delete from ${t.replace('$C', `'${CID}'`)};` : `delete from ${t} where ${t === 'corretoras' ? 'id' : 'corretora_id'} = '${CID}';`).join('\n')}
commit;
`;
fs.writeFileSync(path.join(SAIDA, 'demo_vendas_carga.sql'), sql);
// A mesma carga em JSON (sem os convites, que têm e-mails), para o banco buscar por endereço (pg_net) quando o SQL
// é grande demais para colar: demo_vendas_carga_via_url.sql lê o JSON de net._http_response e insere na mesma ordem.
const ORDEM = [
  ['corretoras', [{ id: CID, nome: CORRETORA.nome, razao_social: CORRETORA.razao_social, cnpj: CORRETORA.cnpj, slug: CORRETORA.slug, cor_primaria: CORRETORA.cor_primaria,
    ativa: true, contrato: { demo: true, observacao: 'conta de demonstração, sem mensalidade' }, config_agentes: config }]],
  ['corretora_cnpjs', [{ cnpj: CORRETORA.cnpj, corretora_id: CID, razao_social: CORRETORA.razao_social, principal: true }]],
  ['empresas', T.empresas], ['apolices', T.apolices], ['faturas', T.faturas], ['vidas', T.vidas], ['comissao_pagamentos', T.comissao_pagamentos],
  ['comissao_lancamentos', T.comissao_lancamentos], ['central_docs', docsLinhas], ['pedidos', T.pedidos], ['conferencias', T.conferencias],
];
fs.writeFileSync(path.join(SAIDA, 'demo_vendas_carga.json'), JSON.stringify(Object.fromEntries([...ORDEM, ['pedido_eventos', T.pedido_eventos]])));
const viaUrl = `-- Carga da demonstração a partir do JSON buscado pelo banco. Antes: select net.http_get('<endereço do demo_vendas_carga.json>');
-- e troque :ID pelo número que voltou. Só insere (on conflict do nothing).
begin;
create temporary table _demo on commit drop as select content::jsonb as j from net._http_response where id = :ID and status_code = 200;
${ORDEM.map(([t, linhas]) => { const cols = Object.keys(linhas[0]).join(', ');
  return `insert into ${t} (${cols}) select ${cols} from jsonb_populate_recordset(null::${t}, (select j->'${t}' from _demo)) on conflict do nothing;`; }).join('\n')}
insert into pedido_eventos (pedido_id, corretora_id, em, autor_agente, de_status, para_status, mensagem, visivel_empresa)
select v.pedido_id, v.corretora_id, v.em, v.autor_agente, v.de_status, v.para_status, v.mensagem, v.visivel_empresa
  from jsonb_populate_recordset(null::pedido_eventos, (select j->'pedido_eventos' from _demo)) v
 where not exists (select 1 from pedido_eventos x where x.pedido_id = v.pedido_id and x.mensagem = v.mensagem);
${inserts('convites', T.convites)}commit;
`;
fs.writeFileSync(path.join(SAIDA, 'demo_vendas_carga_via_url.sql'), viaUrl);
// cópia dos documentos da Central em pastas, para ver as telas no modo demonstração do site sem banco:
//   CENTRAL_DEMO_DIR=<saída>/central npm run dev   (entra como a administradora da Shaddai no seletor de perfil)
for (const [col, ds] of Object.entries(CD)) {
  fs.mkdirSync(path.join(SAIDA, 'central', col), { recursive: true });
  for (const [id, dados] of Object.entries(ds)) fs.writeFileSync(path.join(SAIDA, 'central', col, id + '.json'), JSON.stringify(dados));
}
fs.writeFileSync(path.join(SAIDA, 'demo_vendas_remover.sql'), remover);
const atualizar = `-- Atualiza a demonstração "${CORRETORA.nome}" para a data desta geração (${br(HOJE)}): apaga só os dados que andam com o tempo
-- (faturas, vidas, comissões, Central, pedidos, conferências) e carrega de novo. Corretora, empresas, contratos e logins ficam.
begin;
${['pedido_eventos', 'pedidos', 'conferencias', 'ordens_execucao', 'exclusoes', 'faturas_situacao_portal', 'central_docs', 'comissao_lancamentos', 'comissao_pagamentos', 'vidas', 'faturas']
  .map((t) => `delete from ${t} where corretora_id = '${CID}';`).join('\n')}
commit;
`;
fs.writeFileSync(path.join(SAIDA, 'demo_vendas_atualizar_antes_da_carga.sql'), atualizar);

const resumo = {
  corretora: { id: CID, ...CORRETORA }, empresas: T.empresas.length, contratos: T.apolices.length, faturas: T.faturas.length, vidas_linhas: T.vidas.length,
  vidas_por_mes: Object.fromEntries(COMPS.map((c) => [c, vidasMes(c)])),
  faturamento_por_mes: Object.fromEntries(COMPS.map((c) => [c, r2(fatLista.filter((f) => f.comp === c).reduce((s, f) => s + f.valor, 0))])),
  comissao_recebida_por_mes: Object.fromEntries(COMPS.map((c) => [c, r2(comMes(c))])),
  pagamentos_comissao: T.comissao_pagamentos.length, lancamentos: T.comissao_lancamentos.length,
  central_docs: Object.fromEntries(Object.entries(CD).map(([k, v]) => [k, Object.keys(v).length])),
  projecao_hoje: fotoHoje.meses.map((m) => ({ mes: m.comp, total: m.total, ja_caiu: m.real, porSeg: m.porSeg })),
  boletos_em_aberto: fatLista.filter((f) => !f.pagoEm || f.pagoEm > HOJE).map((f) => `${f.empresa} ${f.comp} venc ${br(f.venc)}`),
  logins: LOGINS.map(([ap, papel, , desc]) => ({ email: apelido(ap), papel, desc })),
  tamanho_sql_kb: Math.round(sql.length / 1024),
};
fs.writeFileSync(path.join(SAIDA, 'resumo.json'), JSON.stringify(resumo, null, 2));
console.log(JSON.stringify({ ...resumo, projecao_hoje: resumo.projecao_hoje.map((m) => [m.mes, m.total, m.ja_caiu]) }, null, 1));
