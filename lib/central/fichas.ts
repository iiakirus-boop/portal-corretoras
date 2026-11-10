import 'server-only';
import type { Cliente } from '../servidor';

// Liga o código da empresa nas telas da Central (E015, C021...) ao cadastro de empresas, nos dois sentidos.
// O código vem da tabela central_eid (apólice -> código); sem ela (modo demonstração), vale o código interno da empresa.
export async function mapaFichas(db: Cliente, c: string): Promise<{ porEid: Record<string, string>; porEmpresa: Record<string, string[]> }> {
  const porEid: Record<string, string> = {}, porEmpresa: Record<string, string[]> = {};
  const liga = (eid: string, emp: string) => {
    if (!eid || !emp) return;
    porEid[eid] ??= emp;
    if (!(porEmpresa[emp] ??= []).includes(eid)) porEmpresa[emp].push(eid);
  };
  const [{ data: emps }, { data: aps }, ce] = await Promise.all([
    db.from('empresas').select('id, codigo_interno').eq('corretora_id', c),
    db.from('apolices').select('id, empresa_id').eq('corretora_id', c),
    db.from('central_eid').select('chave, eid').eq('corretora_id', c).limit(5000),
  ]);
  const apolice = new Map(((aps ?? []) as { id: string; empresa_id: string }[]).map((a) => [a.id, a.empresa_id]));
  for (const r of ((ce?.data ?? []) as { chave: string; eid: string }[])) liga(r.eid, apolice.get(String(r.chave).split('|')[0]) ?? '');
  for (const e of (emps ?? []) as { id: string; codigo_interno: string | null }[]) if (e.codigo_interno && !porEid[e.codigo_interno]) liga(e.codigo_interno, e.id);
  return { porEid, porEmpresa };
}
