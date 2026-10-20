'use server';
// Tudo que o site grava passa por aqui. Quem decide se pode é o banco (regras de acesso);
// estas funções só montam o pedido e voltam para a tela com a mensagem do resultado.
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cliente, COOKIE_DEMO, destino, exigirSessao, MODO_DEMO, sessao, papeisEmpresa, ehMaster } from './servidor';
import { usuarioDemo } from './demo/cliente';
import type { Papel, StatusPedido, TipoPedido } from './tipos';

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const volta = (para: string, chave: 'ok' | 'erro', msg: string): never => {
  const u = new URL(para, 'http://x');
  u.searchParams.delete('ok'); u.searchParams.delete('erro');
  u.searchParams.set(chave, msg);
  redirect(u.pathname + u.search);
};
const traduzir = (m: string) =>
  /row-level security|permission|sem permissão/i.test(m) ? 'Seu acesso não permite fazer isso.'
  : /duplicate|unique/i.test(m) ? 'Já existe um cadastro igual.'
  : m;

// ---- entrar e sair ----
export async function entrarDemo(f: FormData) {
  const u = usuarioDemo(txt(f, 'usuario'));
  if (!MODO_DEMO || !u) redirect('/entrar');
  (await cookies()).set(COOKIE_DEMO, u.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  const s = await sessao();
  redirect(s ? destino(s) : '/entrar');
}

export async function entrarEmail(f: FormData) {
  const email = txt(f, 'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) volta('/entrar', 'erro', 'Escreva um e-mail válido.');
  const h = await headers();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const db = await cliente();
  const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: `${site}/auth/callback` } });
  if (error) volta('/entrar', 'erro', /rate limit|security purposes/i.test(error.message)
    ? 'Muitos e-mails enviados em pouco tempo. Se você já criou sua senha, entre com ela; se não, tente o link de novo daqui a alguns minutos.'
    : 'Não conseguimos mandar o link agora. Tente de novo em alguns minutos.');
  redirect(`/entrar?enviado=${encodeURIComponent(email)}`);
}

export async function entrarSenha(f: FormData) {
  const email = txt(f, 'email').toLowerCase();
  const senha = String(f.get('senha') ?? '');
  if (!email || !senha) volta('/entrar', 'erro', 'Preencha o e-mail e a senha.');
  const db = await cliente();
  const { error } = await db.auth.signInWithPassword({ email, password: senha });
  if (error) volta('/entrar', 'erro', 'E-mail ou senha incorretos. Se ainda não criou sua senha, peça o link de acesso abaixo.');
  await db.rpc('aceitar_convites');
  const s = await sessao();
  redirect(s ? destino(s) : '/entrar');
}

// Primeiro acesso (depois do link) ou troca de senha
export async function criarSenha(f: FormData) {
  const senha = String(f.get('senha') ?? '');
  const conf = String(f.get('confirmar') ?? '');
  if (senha.length < 8) volta('/conta/senha', 'erro', 'A senha precisa ter pelo menos 8 caracteres.');
  if (senha !== conf) volta('/conta/senha', 'erro', 'As duas senhas não são iguais.');
  const db = await cliente();
  const { error } = await db.auth.updateUser({ password: senha, data: { tem_senha: true } });
  if (error) volta('/conta/senha', 'erro', /same|different/i.test(error.message) ? 'Escolha uma senha diferente da atual.' : /weak|short/i.test(error.message) ? 'Senha fraca. Use letras e números.' : 'Não deu para salvar a senha. Entre de novo pelo link e tente outra vez.');
  const s = await sessao();
  redirect(s ? destino(s) : '/entrar');
}

export async function sair() {
  if (MODO_DEMO) (await cookies()).delete(COOKIE_DEMO);
  else await (await cliente()).auth.signOut();
  redirect('/entrar');
}

// ---- master ----
export async function criarCorretora(f: FormData) {
  const de = '/master/corretoras';
  const cnpj = txt(f, 'cnpj').replace(/\D/g, '');
  const nome = txt(f, 'nome');
  if (!nome || cnpj.length !== 14) volta(de, 'erro', 'Preencha o nome e um CNPJ com 14 números.');
  const slug = (txt(f, 'slug') || nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const db = await cliente();
  const { data, error } = await db.from('corretoras')
    .insert({ nome, razao_social: txt(f, 'razao_social') || null, cnpj, slug, cor_primaria: txt(f, 'cor') || null }).select('*').single();
  if (error) volta(de, 'erro', traduzir(error.message));
  await db.from('corretora_cnpjs').insert({ cnpj, corretora_id: data.id, razao_social: txt(f, 'razao_social') || nome, principal: true });
  const admin = txt(f, 'admin').toLowerCase();
  if (admin) await db.from('convites').insert({ email: admin, papel: 'admin_corretora', corretora_id: data.id });
  revalidatePath('/master');
  volta(`/master/corretoras/${data.id}`, 'ok', `${nome} cadastrada.${admin ? ` Convite criado para ${admin}: avise a pessoa para entrar no portal com esse e-mail.` : ''}`);
}

export async function criarOrdem(f: FormData) {
  const de = txt(f, 'de') || '/master/agentes';
  const s = await exigirSessao();
  if (!ehMaster(s)) volta(de, 'erro', 'Só o master pede execuções.');
  const db = await cliente();
  // Pasta ou arquivos no PC (o vigia usa): Faturas Bradesco = pasta dos kits; Comissão = arquivos do extrato, separados por ;
  const local = txt(f, 'local');
  const parametros = !local ? {} : txt(f, 'agente') === 'comissao' ? { arquivos: local.split(';').map((x) => x.trim()).filter(Boolean) } : { entrada: local };
  const { error } = await db.from('ordens_execucao').insert({
    corretora_id: txt(f, 'corretora_id'), agente: txt(f, 'agente'), seguradora_id: txt(f, 'seguradora_id') || null,
    competencia: txt(f, 'competencia') || null, origem: 'manual', criada_por: s.userId, parametros,
  });
  if (error) volta(de, 'erro', traduzir(error.message));
  revalidatePath('/master');
  volta(de, 'ok', 'Pedido de execução colocado na fila. A máquina de operação pega na próxima volta.');
}

// Liga ou pausa uma rotina com horário. Pausada, o agente não abre ordem sozinho; "rodar agora" continua valendo.
export async function alternarRotina(f: FormData) {
  const de = '/master/agentes';
  const s = await exigirSessao();
  if (!ehMaster(s)) volta(de, 'erro', 'Só o master liga e pausa rotinas.');
  const ligar = txt(f, 'ligar') === '1';
  const db = await cliente();
  const { error } = await db.from('rotinas').update({ ativa: ligar }).eq('id', txt(f, 'id'));
  if (error) volta(de, 'erro', traduzir(error.message));
  revalidatePath(de);
  volta(de, 'ok', ligar ? 'Rotina ligada.' : 'Rotina pausada. Ela não roda sozinha até você ligar de novo.');
}

// Tira da fila uma ordem que ainda não começou, ou encerra uma que está esperando você
export async function cancelarOrdem(f: FormData) {
  const de = '/master/agentes';
  const s = await exigirSessao();
  if (!ehMaster(s)) volta(de, 'erro', 'Só o master cancela execuções.');
  const db = await cliente();
  const { error } = await db.from('ordens_execucao').update({ status: 'cancelada', terminada_em: new Date().toISOString(), mensagem: 'Cancelada pelo master' })
    .eq('id', txt(f, 'id')).in('status', ['pendente', 'aguardando_voce']);
  if (error) volta(de, 'erro', traduzir(error.message));
  revalidatePath(de);
  volta(de, 'ok', 'Execução cancelada.');
}

// Coloca de novo na fila uma ordem que deu erro ou que esperava você (depois que você resolveu o login, por exemplo)
export async function repetirOrdem(f: FormData) {
  const de = '/master/agentes';
  const s = await exigirSessao();
  if (!ehMaster(s)) volta(de, 'erro', 'Só o master pede execuções.');
  const db = await cliente();
  const { data: o } = await db.from('ordens_execucao').select('*').eq('id', txt(f, 'id')).maybeSingle();
  if (!o) volta(de, 'erro', 'Execução não encontrada.');
  const { error } = await db.from('ordens_execucao').insert({
    corretora_id: o.corretora_id, agente: o.agente, seguradora_id: o.seguradora_id, competencia: o.competencia, parametros: o.parametros ?? {},
    origem: 'manual', prioridade: 1, ordem_pai_id: o.ordem_pai_id ?? null, criada_por: s.userId,
  });
  if (error) volta(de, 'erro', traduzir(error.message));
  if (o.status === 'aguardando_voce') await db.from('ordens_execucao').update({ status: 'cancelada', mensagem: 'Repetida pelo master' }).eq('id', o.id);
  revalidatePath(de);
  volta(de, 'ok', 'Colocada de novo na fila, na frente das outras.');
}

// ---- corretora ----
export async function criarEmpresa(f: FormData) {
  const c = txt(f, 'corretora_id');
  const de = `/corretora/${c}/empresas`;
  const razao = txt(f, 'razao_social');
  if (!razao) volta(de, 'erro', 'Escreva a razão social da empresa.');
  const db = await cliente();
  const { data, error } = await db.from('empresas').insert({
    corretora_id: c, razao_social: razao, nome_curto: txt(f, 'nome_curto').toUpperCase() || null,
    cnpj: txt(f, 'cnpj') || null, codigo_interno: txt(f, 'codigo_interno') || null,
  }).select('*').single();
  if (error) volta(de, 'erro', traduzir(error.message));
  const gestor = txt(f, 'gestor').toLowerCase();
  if (gestor) await db.from('convites').insert({ email: gestor, papel: 'gestor_empresa', corretora_id: c, empresa_id: data.id });
  revalidatePath(`/corretora/${c}`);
  volta(`/corretora/${c}/empresas/${data.id}`, 'ok', `${razao} cadastrada.${gestor ? ` Convite enviado para ${gestor}.` : ''}`);
}

export async function convidar(f: FormData) {
  const de = txt(f, 'de');
  const email = txt(f, 'email').toLowerCase();
  const papel = txt(f, 'papel') as Papel;
  const empresa = txt(f, 'empresa_id') || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) volta(de, 'erro', 'Escreva um e-mail válido.');
  const daEmpresa = ['gestor_empresa', 'movimentacao_empresa', 'financeiro_empresa'].includes(papel);
  if (daEmpresa && !empresa) volta(de, 'erro', 'Escolha a empresa dessa pessoa.');
  const db = await cliente();
  const { error } = await db.from('convites').insert({ email, papel, corretora_id: txt(f, 'corretora_id'), empresa_id: daEmpresa ? empresa : null });
  if (error) volta(de, 'erro', traduzir(error.message));
  revalidatePath(de);
  volta(de, 'ok', `Convite criado. Quando ${email} entrar no portal com esse e-mail, o acesso já aparece.`);
}

export async function desativarMembro(f: FormData) {
  const de = txt(f, 'de');
  const db = await cliente();
  const { data, error } = await db.from('membros').update({ ativo: false }).eq('id', txt(f, 'id')).select('*');
  if (error || !data?.length) volta(de, 'erro', 'Seu acesso não permite tirar essa pessoa.');
  revalidatePath(de);
  volta(de, 'ok', 'Acesso removido.');
}

export async function mudarStatus(f: FormData) {
  const de = txt(f, 'de');
  const id = txt(f, 'pedido_id');
  const status = txt(f, 'status') as StatusPedido;
  const mensagem = txt(f, 'mensagem');
  const db = await cliente();
  const { data, error } = await db.from('pedidos').update({ status }).eq('id', id).select('*');
  if (error || !data?.length) volta(de, 'erro', traduzir(error?.message ?? 'sem permissão'));
  if (mensagem) await comentarNo(db, data[0], mensagem, true);
  revalidatePath(de);
  volta(de, 'ok', 'Situação do pedido atualizada.');
}

async function comentarNo(db: any, pedido: { id: string; corretora_id: string }, mensagem: string, visivel: boolean) {
  const s = await exigirSessao();
  return db.from('pedido_eventos').insert({ pedido_id: pedido.id, corretora_id: pedido.corretora_id, autor_id: s.userId, mensagem, visivel_empresa: visivel });
}

export async function comentar(f: FormData) {
  const de = txt(f, 'de');
  const mensagem = txt(f, 'mensagem');
  if (!mensagem) volta(de, 'erro', 'Escreva a mensagem.');
  const db = await cliente();
  const { data: p } = await db.from('pedidos').select('*').eq('id', txt(f, 'pedido_id')).maybeSingle();
  if (!p) volta(de, 'erro', 'Pedido não encontrado.');
  const { error } = await comentarNo(db, p, mensagem, txt(f, 'interna') !== 'sim');
  if (error) volta(de, 'erro', traduzir(error.message));
  await anexar(db, p, f.get('anexo'));
  revalidatePath(de);
  volta(de, 'ok', 'Mensagem registrada no pedido.');
}

// Guarda o arquivo no storage (pasta anexos/<pedido>, a regra do banco exige esse formato) e registra como anexo do pedido
async function anexar(db: any, p: { id: string; corretora_id: string; empresa_id: string }, arq: FormDataEntryValue | null) {
  if (!(arq instanceof File) || arq.size === 0) return;
  const s = await exigirSessao();
  const caminho = `anexos/${p.id}/${Date.now()}-${arq.name.replace(/[^\w.\-]+/g, '_')}`;
  const up = await db.storage.from('documentos').upload(caminho, arq);
  if (!up.error) await db.from('documentos').insert({ corretora_id: p.corretora_id, empresa_id: p.empresa_id, pedido_id: p.id, tipo: 'anexo_pedido',
    caminho_storage: caminho, nome_arquivo: arq.name, enviado_por: s.userId });
}

// ---- empresa ----
export async function abrirPedido(f: FormData) {
  const e = txt(f, 'empresa_id');
  const tipo = txt(f, 'tipo') as TipoPedido;
  const base = txt(f, 'base') || `/empresa/${e}`;
  const de = `${base}/pedidos/novo?tipo=${tipo}`;
  const s = await exigirSessao();
  const db = await cliente();
  const { data: emp } = await db.from('empresas').select('*').eq('id', e).maybeSingle();
  if (!emp) volta(de, 'erro', 'Empresa não encontrada.');
  const dados: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith('d_') && String(v).trim()) dados[k.slice(2)] = String(v).trim();
  if (Object.keys(dados).length === 0) volta(de, 'erro', 'Preencha os campos do pedido.');
  const papeis = papeisEmpresa(s, e);
  const daCasa = ehMaster(s) || s.membros.some((m) => m.corretora_id === emp.corretora_id && !m.empresa_id);
  const status: StatusPedido = !daCasa && !papeis.includes('gestor_empresa') && papeis.includes('movimentacao_empresa') && tipo !== 'segunda_via'
    ? 'aguardando_aprovacao_empresa' : 'recebido';
  const { data, error } = await db.from('pedidos').insert({
    corretora_id: emp.corretora_id, empresa_id: e, apolice_id: txt(f, 'apolice_id') || null, tipo, status, dados,
    prazo: txt(f, 'prazo') || null, solicitante_id: s.userId,
  }).select('*').single();
  if (error) volta(de, 'erro', traduzir(error.message));
  await anexar(db, data, f.get('anexo'));
  revalidatePath(base);
  volta(`${base}/pedidos/${data.id}`, 'ok', status === 'aguardando_aprovacao_empresa'
    ? `Pedido ${data.protocolo} aberto. Ele vai para a corretora assim que o gestor da empresa aprovar.`
    : `Pedido ${data.protocolo} enviado para a corretora.`);
}

export async function aprovarPedido(f: FormData) {
  const de = txt(f, 'de');
  const db = await cliente();
  const { error } = await db.rpc('aprovar_pedido_empresa', { p: txt(f, 'pedido_id') });
  if (error) volta(de, 'erro', traduzir(error.message));
  revalidatePath(de);
  volta(de, 'ok', 'Pedido aprovado e enviado para a corretora.');
}
