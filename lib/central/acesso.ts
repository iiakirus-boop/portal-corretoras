import 'server-only';
import { cliente, ehMaster, papeisCorretora, sessao } from '../servidor';

// Comissão e projeção só para administrador da corretora (e master), como no banco (central_so_admin)
export const SO_ADMIN = ['comissoes', 'projecoes', 'agenciamentos', 'implantacoes'];
export const GRAVA_EQUIPE = ['tarefas', 'eventos'];

export async function acessoCentral(c: string) {
  const s = await sessao();
  if (!s) return null;
  const master = ehMaster(s);
  const papeis = papeisCorretora(s, c);
  if (!master && papeis.length === 0) return { s, ok: false as const };
  const db = await cliente();
  const { data: cor } = await db.from('corretoras').select('*').eq('id', c).maybeSingle();
  if (!cor) return { s, ok: false as const };
  return { s, ok: true as const, master, admin: master || papeis.includes('admin_corretora'), cor, db };
}
