// Acesso ao banco pelo servidor do site. Com as variáveis do Supabase usa o banco de verdade;
// sem elas, usa os dados de exemplo (modo demonstração). As telas não sabem a diferença.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { clienteDemo, usuarioDemo } from './demo/cliente';
import type { Membro, Papel, Sessao } from './tipos';

export const MODO_DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const COOKIE_DEMO = 'demo_usuario';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cliente = any;

export async function cliente(): Promise<Cliente> {
  const jar = await cookies();
  if (MODO_DEMO) return clienteDemo(jar.get(COOKIE_DEMO)?.value ?? null);
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // chamado de um Server Component: o middleware já renova a sessão
        }
      },
    },
  });
}

export async function sessao(): Promise<Sessao | null> {
  const db = await cliente();
  if (MODO_DEMO) {
    const jar = await cookies();
    const u = usuarioDemo(jar.get(COOKIE_DEMO)?.value);
    if (!u) return null;
    const { data } = await db.from('membros').select('*').eq('user_id', u.id);
    return { userId: u.id, email: u.email, nome: u.nome, membros: (data ?? []) as Membro[] };
  }
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await db.from('membros').select('*').eq('user_id', auth.user.id).eq('ativo', true);
  const email = auth.user.email ?? '';
  return { userId: auth.user.id, email, nome: email.split('@')[0], membros: (data ?? []) as Membro[] };
}

export async function exigirSessao(): Promise<Sessao> {
  const s = await sessao();
  if (!s) redirect('/entrar');
  return s;
}

export const ehMaster = (s: Sessao) => s.membros.some((m) => m.papel === 'master');
export const papeisCorretora = (s: Sessao, c: string) =>
  s.membros.filter((m) => m.corretora_id === c && !m.empresa_id).map((m) => m.papel);
export const papeisEmpresa = (s: Sessao, e: string) => s.membros.filter((m) => m.empresa_id === e).map((m) => m.papel);

// Para onde cada pessoa vai depois de entrar
export function destino(s: Sessao): string {
  if (ehMaster(s)) return '/master';
  const c = s.membros.find((m) => m.papel === 'admin_corretora' || m.papel === 'operador_corretora');
  if (c) return `/central/${c.corretora_id}`;
  const e = s.membros.find((m) => m.empresa_id);
  if (e) return `/empresa/${e.empresa_id}`;
  return '/sem-acesso';
}

// Garante acesso à área da corretora (master entra em qualquer uma)
export async function exigirCorretora(c: string) {
  const s = await exigirSessao();
  const papeis = papeisCorretora(s, c);
  const master = ehMaster(s);
  if (!master && papeis.length === 0) redirect(destino(s));
  const admin = master || papeis.includes('admin_corretora' as Papel);
  return { s, master, admin };
}

export async function exigirEmpresa(e: string) {
  const s = await exigirSessao();
  const master = ehMaster(s);
  const papeis = papeisEmpresa(s, e);
  const db = await cliente();
  const { data: emp } = await db.from('empresas').select('*').eq('id', e).maybeSingle();
  if (!emp) redirect(destino(s));
  const daCorretora = papeisCorretora(s, emp.corretora_id).length > 0;
  if (!master && !daCorretora && papeis.length === 0) redirect(destino(s));
  const total = master || daCorretora;
  return {
    s, emp, master, daCorretora,
    gestor: total || papeis.includes('gestor_empresa'),
    veFaturas: total || papeis.includes('gestor_empresa') || papeis.includes('financeiro_empresa'),
    veVidas: total || papeis.includes('gestor_empresa') || papeis.includes('movimentacao_empresa'),
    movimenta: total || papeis.includes('gestor_empresa') || papeis.includes('movimentacao_empresa'),
    soFinanceiro: !total && papeis.length === 1 && papeis[0] === 'financeiro_empresa',
    papeis,
  };
}
