// Cliente de demonstração: imita a parte do supabase-js que o site usa (from/select/eq/insert/update/rpc/storage)
// sobre os dados de exemplo em memória, aplicando as mesmas regras de acesso do banco (Row Level Security).
import { criarBanco, DEMO_USUARIOS, type Banco } from './semente';

type Linha = Record<string, any>;
type Resultado<T = any> = { data: T; error: { message: string } | null; count?: number | null };

const g = globalThis as unknown as { __demoBanco?: Banco };
export function bancoDemo(): Banco {
  if (!g.__demoBanco) g.__demoBanco = criarBanco();
  return g.__demoBanco;
}

// ---- regras de acesso (as mesmas do schema.sql) ----
function regras(uid: string | null) {
  const db = bancoDemo();
  const ms = db.membros.filter((m) => m.user_id === uid && m.ativo);
  const master = ms.some((m) => m.papel === 'master');
  const daCorretora = (c: string, soAdmin = false) =>
    ms.some((m) => m.corretora_id === c && !m.empresa_id && (m.papel === 'admin_corretora' || (!soAdmin && m.papel === 'operador_corretora')));
  const daEmpresa = (e: string, papeis = ['gestor_empresa', 'movimentacao_empresa', 'financeiro_empresa']) =>
    ms.some((m) => m.empresa_id === e && papeis.includes(m.papel));
  const ver: Record<string, (r: Linha) => boolean> = {
    seguradoras: () => !!uid,
    corretoras: (r) => daCorretora(r.id) || ms.some((m) => m.corretora_id === r.id),
    corretora_cnpjs: (r) => daCorretora(r.corretora_id),
    corretora_codigos: (r) => daCorretora(r.corretora_id, true),
    empresas: (r) => daCorretora(r.corretora_id) || daEmpresa(r.id),
    apolices: (r) => daCorretora(r.corretora_id) || daEmpresa(r.empresa_id),
    faturas: (r) => daCorretora(r.corretora_id) || daEmpresa(r.empresa_id, ['gestor_empresa', 'financeiro_empresa']),
    vidas: (r) => daCorretora(r.corretora_id) || daEmpresa(r.empresa_id, ['gestor_empresa', 'movimentacao_empresa']),
    documentos: (r) => daCorretora(r.corretora_id) || (r.visivel_empresa && r.tipo !== 'extrato_comissao' && daEmpresa(r.empresa_id)),
    comissao_pagamentos: (r) => daCorretora(r.corretora_id, true),
    comissao_lancamentos: (r) => daCorretora(r.corretora_id, true),
    execucoes: (r) => daCorretora(r.corretora_id),
    pedidos: (r) => daCorretora(r.corretora_id) || daEmpresa(r.empresa_id),
    pedido_eventos: (r) => daCorretora(r.corretora_id) ||
      (r.visivel_empresa && db.pedidos.some((p) => p.id === r.pedido_id && daEmpresa(p.empresa_id))),
    cobranca_fechamentos: (r) => daCorretora(r.corretora_id, true),
    membros: (r) => r.user_id === uid || daCorretora(r.corretora_id, true) || (!!r.empresa_id && daEmpresa(r.empresa_id, ['gestor_empresa'])),
    convites: (r) => daCorretora(r.corretora_id, true) || (!!r.empresa_id && daEmpresa(r.empresa_id, ['gestor_empresa'])),
    ordens_execucao: (r) => daCorretora(r.corretora_id),
    agentes: () => !!uid,
    supervisor_previsao: (r) => daCorretora(r.corretora_id),
    conferencias: (r) => daCorretora(r.corretora_id, r.tipo.startsWith('comissao')),
    rotinas: (r) => !!r.corretora_id && daCorretora(r.corretora_id, true),
    maquinas: () => false,
    login_status: () => false,
  };
  const empresaDa = (e: string) => db.empresas.find((x) => x.id === e)?.corretora_id;
  const inserir: Record<string, (r: Linha) => boolean> = {
    empresas: (r) => daCorretora(r.corretora_id, true),
    apolices: (r) => daCorretora(r.corretora_id, true),
    convites: (r) => r.papel !== 'master' && (daCorretora(r.corretora_id, true) ||
      (['gestor_empresa', 'movimentacao_empresa', 'financeiro_empresa'].includes(r.papel) &&
        daEmpresa(r.empresa_id, ['gestor_empresa']) && r.corretora_id === empresaDa(r.empresa_id))),
    pedidos: (r) => r.solicitante_id === uid && (daCorretora(r.corretora_id) || (r.corretora_id === empresaDa(r.empresa_id) && (
      (daEmpresa(r.empresa_id, ['gestor_empresa']) && r.status === 'recebido') ||
      (daEmpresa(r.empresa_id, ['movimentacao_empresa']) && r.status === 'aguardando_aprovacao_empresa') ||
      (daEmpresa(r.empresa_id, ['financeiro_empresa']) && r.tipo === 'segunda_via' && r.status === 'recebido')))),
    pedido_eventos: (r) => r.autor_id === uid && !r.autor_agente && !r.de_status && !r.para_status &&
      db.pedidos.some((p) => p.id === r.pedido_id && p.corretora_id === r.corretora_id && (daCorretora(p.corretora_id) || (r.visivel_empresa && daEmpresa(p.empresa_id)))),
    membros: (r) => r.papel !== 'master' && daCorretora(r.corretora_id, true),
    documentos: (r) => r.tipo === 'anexo_pedido' && db.pedidos.some((p) => p.id === r.pedido_id && (daCorretora(p.corretora_id) || daEmpresa(p.empresa_id))),
  };
  const atualizar: Record<string, (r: Linha) => boolean> = {
    pedidos: (r) => daCorretora(r.corretora_id),
    empresas: (r) => daCorretora(r.corretora_id, true),
    membros: (r) => r.papel !== 'master' && daCorretora(r.corretora_id, true),
  };
  return {
    master, daEmpresa,
    ver: (t: string, r: Linha) => master || (ver[t] ? ver[t](r) : false),
    inserir: (t: string, r: Linha) => master || (inserir[t] ? inserir[t](r) : false),
    atualizar: (t: string, r: Linha) => master || (atualizar[t] ? atualizar[t](r) : false),
  };
}

let novoId = 1000;
const gerarId = () => `demo-${(++novoId).toString(16)}`;
const agora = () => new Date().toISOString();

function aoInserir(tabela: string, r: Linha, uid: string | null) {
  const db = bancoDemo();
  void db;
  if (tabela === 'pedidos') {
    const n = db.pedidos.length + 1;
    r.protocolo ??= `202610-${String(n).padStart(5, '0')}`;
    r.status ??= 'recebido';
    r.criado_em ??= agora(); r.atualizado_em ??= agora();
  }
  if (tabela === 'convites') { r.criado_em ??= agora(); r.aceito_em ??= null; r.convidado_por ??= uid; }
  if (tabela === 'empresas') { r.ativa ??= true; r.criado_em ??= agora(); }
  if (tabela === 'corretoras') { r.ativa ??= true; r.criado_em ??= agora(); r.contrato ??= {}; }
  if (tabela === 'pedido_eventos') { r.id = db.pedido_eventos.length + 1; r.em ??= agora(); r.autor_agente ??= null; r.de_status ??= null; r.para_status ??= null; r.visivel_empresa ??= true; }
  if (tabela === 'documentos') { r.criado_em ??= agora(); r.visivel_empresa ??= true; }
  if (tabela === 'ordens_execucao') { r.status ??= 'pendente'; r.criada_em ??= agora(); r.prioridade ??= 5; r.origem ??= 'manual'; }
}

function aoAtualizar(tabela: string, antes: Linha, depois: Linha, uid: string | null) {
  const db = bancoDemo();
  if (tabela === 'pedidos' && antes.status !== depois.status) {
    depois.atualizado_em = agora();
    db.pedido_eventos.push({ id: db.pedido_eventos.length + 1, pedido_id: depois.id, corretora_id: depois.corretora_id, em: agora(), autor_id: uid,
      autor_agente: null, de_status: antes.status, para_status: depois.status, mensagem: null, visivel_empresa: true });
  }
}

class Consulta implements PromiseLike<Resultado> {
  private filtros: ((r: Linha) => boolean)[] = [];
  private ordem: [string, boolean][] = [];
  private lim?: number;
  private modo: 'select' | 'insert' | 'update' = 'select';
  private valores?: Linha | Linha[];
  private unico: 'single' | 'maybe' | null = null;
  private contar = false;
  private soContagem = false;
  constructor(private tabela: string, private uid: string | null) {}

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
    if (opts?.count) this.contar = true;
    if (opts?.head) this.soContagem = true;
    return this;
  }
  insert(v: Linha | Linha[]) { this.modo = 'insert'; this.valores = v; return this; }
  update(v: Linha) { this.modo = 'update'; this.valores = v; return this; }
  eq(c: string, v: any) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filtros.push((r) => r[c] !== v); return this; }
  in(c: string, vs: any[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] >= v); return this; }
  lte(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] <= v); return this; }
  is(c: string, v: null) { this.filtros.push((r) => r[c] == v); return this; }
  not(c: string, op: 'is', v: null) { this.filtros.push((r) => r[c] != v); return this; }
  ilike(c: string, padrao: string) {
    const p = padrao.replace(/%/g, '').toLowerCase();
    this.filtros.push((r) => String(r[c] ?? '').toLowerCase().includes(p)); return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.ordem.push([c, o?.ascending !== false]); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.unico = 'single'; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }

  private executar(): Resultado {
    const db = bancoDemo();
    const rg = regras(this.uid);
    const tab = db[this.tabela];
    if (!tab) return { data: null, error: { message: `tabela ${this.tabela} não existe` } };
    if (this.modo === 'insert') {
      const linhas = (Array.isArray(this.valores) ? this.valores : [this.valores!]).map((v) => ({ id: gerarId(), ...v }));
      for (const r of linhas) {
        aoInserir(this.tabela, r, this.uid);
        if (!rg.inserir(this.tabela, r)) return { data: null, error: { message: 'new row violates row-level security policy' } };
      }
      tab.push(...linhas);
      if (this.tabela === 'pedidos')
        for (const r of linhas)
          db.pedido_eventos.push({ id: db.pedido_eventos.length + 1, pedido_id: r.id, corretora_id: r.corretora_id, em: agora(), autor_id: this.uid,
            autor_agente: null, de_status: null, para_status: r.status, mensagem: 'Pedido aberto', visivel_empresa: true });
      return this.fim(linhas);
    }
    let linhas = tab.filter((r) => rg.ver(this.tabela, r)).filter((r) => this.filtros.every((f) => f(r)));
    if (this.modo === 'update') {
      const alvo = linhas.filter((r) => rg.atualizar(this.tabela, r));
      for (const r of alvo) {
        const antes = { ...r };
        Object.assign(r, this.valores);
        aoAtualizar(this.tabela, antes, r, this.uid);
      }
      return this.fim(alvo);
    }
    for (const [c, asc] of [...this.ordem].reverse())
      linhas = [...linhas].sort((a, b) => (a[c] === b[c] ? 0 : (a[c] ?? '') > (b[c] ?? '') ? (asc ? 1 : -1) : asc ? -1 : 1));
    const total = linhas.length;
    if (this.lim != null) linhas = linhas.slice(0, this.lim);
    const res = this.fim(linhas);
    if (this.contar) res.count = total;
    if (this.soContagem) res.data = null;
    return res;
  }
  private fim(linhas: Linha[]): Resultado {
    const copia = linhas.map((l) => structuredClone(l));
    if (this.unico === 'single') return copia.length === 1 ? { data: copia[0], error: null } : { data: null, error: { message: 'nenhum ou vários registros' } };
    if (this.unico === 'maybe') return { data: copia[0] ?? null, error: null };
    return { data: copia, error: null };
  }
  then<A = Resultado, B = never>(ok?: ((v: Resultado) => A | PromiseLike<A>) | null, erro?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.executar()).then(ok, erro);
  }
}

export function clienteDemo(uid: string | null) {
  return {
    from: (t: string) => new Consulta(t, uid),
    async rpc(nome: string, args: Record<string, any>): Promise<Resultado> {
      const db = bancoDemo();
      if (nome === 'aprovar_pedido_empresa') {
        const p = db.pedidos.find((x) => x.id === args.p);
        if (!p || !regras(uid).daEmpresa(p.empresa_id, ['gestor_empresa'])) return { data: null, error: { message: 'sem permissão' } };
        if (p.status !== 'aguardando_aprovacao_empresa') return { data: null, error: { message: 'pedido não está aguardando aprovação' } };
        p.status = 'recebido'; p.aprovado_empresa_por = uid; p.atualizado_em = agora();
        db.pedido_eventos.push({ id: db.pedido_eventos.length + 1, pedido_id: p.id, corretora_id: p.corretora_id, em: agora(), autor_id: uid,
          autor_agente: null, de_status: 'aguardando_aprovacao_empresa', para_status: 'recebido', mensagem: 'Aprovado pelo gestor da empresa', visivel_empresa: true });
        return { data: null, error: null };
      }
      if (nome === 'aceitar_convites') return { data: 0, error: null };
      return { data: null, error: { message: `função ${nome} não existe no modo demonstração` } };
    },
    storage: {
      from: (_bucket: string) => ({
        async createSignedUrl(caminho: string, _seg: number) {
          return { data: { signedUrl: `/demo-arquivo?c=${encodeURIComponent(caminho)}` }, error: null };
        },
        async upload(caminho: string, _arquivo: Blob) {
          return { data: { path: caminho }, error: null };
        },
      }),
    },
  };
}

export function usuarioDemo(id: string | undefined) {
  return DEMO_USUARIOS.find((u) => u.id === id) ?? null;
}
