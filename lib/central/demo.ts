// Documentos da Central no modo demonstração. Saem dos mesmos dados fictícios do resto do portal,
// no formato que a Central usa (faturas e comissões por mês e seguradora, agentes, tarefas, eventos).
// Para conferir com dados de verdade só no seu computador: CENTRAL_DEMO_DIR=<pasta com coleção/doc.json>.
import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { bancoDemo } from '../demo/cliente';

type Docs = Record<string, Record<string, any>>; // colecao -> doc_id -> dados
const g = globalThis as unknown as { __centralDemo?: Record<string, Docs> };

const OP: Record<string, [string, string]> = {
  porto_saude: ['porto', 'Porto Saúde'], bradesco_saude: ['bradesco', 'Bradesco Saúde'], amil: ['amil', 'Amil'],
  hapvida: ['hapvida', 'Hapvida'], sulamerica: ['sulamerica', 'SulAmérica'],
};
const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function daPasta(dir: string): Docs {
  const out: Docs = {};
  for (const col of fs.readdirSync(dir)) {
    const p = path.join(dir, col);
    if (!fs.statSync(p).isDirectory()) continue;
    out[col] = {};
    for (const f of fs.readdirSync(p)) if (f.endsWith('.json')) out[col][f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8'));
  }
  return out;
}

function gerar(c: string): Docs {
  const db = bancoDemo();
  const emp = new Map(db.empresas.filter((e) => e.corretora_id === c).map((e) => [e.id, e]));
  const out: Docs = { faturas: {}, comissoes: {}, agentes: {}, tarefas: {}, eventos: {}, projecoes: {}, implantacoes: {}, agenciamentos: {} };
  for (const f of db.faturas.filter((x) => x.corretora_id === c)) {
    const [k, nome] = OP[f.seguradora_id];
    const id = `${f.competencia}_${k}`;
    const d = (out.faturas[id] ??= { comp: f.competencia, operadora: nome, parcial: false, atualizadoEm: '2026-10-20T08:00:00-03:00', itens: [], pendentes: [] });
    const e = emp.get(f.empresa_id)!;
    d.itens.push({ eid: e.codigo_interno, empresa: e.razao_social.toUpperCase(), titulo: f.numero, valor: f.valor_total, venc: br(f.vencimento),
      vidas: f.vidas_informadas, ativos: f.vidas_informadas, boleto: f.data_pagamento ? 'Pago' : 'Em aberto', confValor: f.conferencia_valor, confVidas: 'OK', subs: 1 });
  }
  for (const p of db.comissao_pagamentos.filter((x) => x.corretora_id === c)) {
    const [k, nome] = OP[p.seguradora_id];
    const id = `${p.competencia}_${k}`;
    const d = (out.comissoes[id] ??= { comp: p.competencia, operadora: nome, atualizadoEm: '2026-10-20T08:00:00-03:00', itens: [], ordens: [], extras: [], pendentes: [], faturasMes: 0, obs: '' });
    const lans = db.comissao_lancamentos.filter((l) => l.pagamento_id === p.id);
    for (const l of lans) {
      const f = db.faturas.find((x) => x.numero === l.numero_fatura)!;
      const e = emp.get(l.empresa_id)!;
      d.itens.push({ eid: e.codigo_interno, empresa: e.razao_social.toUpperCase(), titulo: l.numero_fatura, compFat: f.competencia, venc: br(f.vencimento),
        valorFat: f.valor_total, premio: f.valor_total, premioEsp: f.valor_total, comFat: l.comissao, comissao: l.comissao, taxa: l.taxa, taxaFixa: 0,
        parcela: l.classe === 'agenciamento' ? 1 : 12, copart: 0, conf: 'OK', op: p.ordem });
    }
    d.ordens.push({ op: p.ordem, data: br(p.data_pagamento), dataISO: p.data_pagamento, empresa: nome, bruto: p.bruta, debcred: 0, debitos: '', apagar: p.a_pagar, lanc: lans.length, conf: 'OK' });
    d.faturasMes = d.itens.length;
  }
  const ag: [string, string, string, string, number][] = [
    ['faturas', 'Agente Faturas', 'Busca faturas, boletos e vidas nos portais', 'Porto, Hapvida e SulAmérica de out/26 gravadas.', 1],
    ['vidas', 'Agente Vidas', 'Separa as vidas de cada fatura e confere entradas e saídas', 'Vidas de out/26 conferidas.', 2],
    ['comissoes', 'Agente Comissão', 'Baixa os extratos e bate com o faturamento de cada empresa', 'Extratos de out/26 conferidos.', 3],
    ['projecao', 'Agente Projeção', 'Projeta quanto de comissão cai em cada semana', 'Projeção refeita depois da comissão.', 4],
    ['movimentacoes', 'Agente Movimentações', 'Confere e envia inclusões e exclusões', 'Aguardando pedidos.', 5],
  ];
  for (const [id, nome, papel, atividade, ordem] of ag) out.agentes[id] = { nome, papel, atividade, ordem, status: 'em_dia', pct: 100 };
  out.tarefas['t-login-porto'] = { agente: 'faturas', coluna: 'precisa', titulo: 'Entrar no portal da Porto', detalhe: 'O login caiu durante a busca de outubro. Entre no portal para o agente continuar.',
    quem: 'Porto Saúde', acao: 'Já entrei', criadaEm: '2026-10-20T07:40:00Z', textoAoResolver: 'teve o login da Porto refeito pela equipe.' };
  out.tarefas['t-div-01'] = { agente: 'comissoes', coluna: 'andamento', titulo: 'Conferir comissão da Serra Azul', detalhe: 'A taxa do extrato não bate com a do contrato.',
    quem: 'E002 · Bradesco Saúde', criadaEm: '2026-10-19T15:00:00Z' };
  out.eventos['2026-10-20'] = { dia: '2026-10-20', itens: [
    { ts: '2026-10-20T07:05:00-03:00', agente: 'faturas', texto: 'gravou as faturas de outubro da Hapvida.' },
    { ts: '2026-10-20T07:12:00-03:00', agente: 'vidas', texto: 'conferiu as vidas das faturas novas.' },
  ] };
  return out;
}

export function centralDemo(c: string): Docs {
  g.__centralDemo ??= {};
  if (!g.__centralDemo[c]) {
    const dir = process.env.CENTRAL_DEMO_DIR;
    g.__centralDemo[c] = dir && c === 'c-shaddai' ? daPasta(dir) : gerar(c);
  }
  return g.__centralDemo[c];
}
