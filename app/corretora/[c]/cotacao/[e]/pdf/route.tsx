import { renderToBuffer } from '@react-pdf/renderer';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { calcularCotacao, lerEscolhas } from '@/lib/cotacao';
import { cnpj } from '@/lib/formato';
import { marcaDa } from '@/lib/marca';
import { Apresentacao, type Rede } from '@/lib/pdf/apresentacao';
import type { Empresa } from '@/lib/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ c: string; e: string }> };

// Apresentação da cotação em PDF, montada na hora com as mesmas escolhas da tela (operadoras, planos, grupos fora)
export async function GET(req: Request, { params }: Ctx) {
  const { c, e } = await params;
  await exigirCorretora(c);
  const db = await cliente();
  const [{ data: emp }, { data: cor }] = await Promise.all([
    db.from('empresas').select('*').eq('id', e).eq('corretora_id', c).maybeSingle(),
    db.from('corretoras').select('id,nome').eq('id', c).maybeSingle(),
  ]);
  if (!emp) return new Response('Empresa não encontrada', { status: 404 });
  const em = emp as Empresa;
  const sp: Record<string, string[]> = {};
  new URL(req.url).searchParams.forEach((v, k) => { (sp[k] ??= []).push(v); });
  const { cot, erro } = await calcularCotacao(db, e, lerEscolhas(sp));
  if (!cot) return new Response(`Não deu para calcular a cotação: ${erro ?? ''}`, { status: 500 });

  // rede: hospitais do plano de hoje que continuam no plano proposto, por operadora
  const hosp = async (op: string, plano: string) => {
    const { data } = await db.from('cot_rede').select('prestador_id, atendimento, cot_prestadores(nome)').eq('operadora', op).eq('plano', plano);
    const m = new Map<number, string>();
    for (const r of (data ?? []) as { prestador_id: number; atendimento: string; cot_prestadores: { nome: string } | null }[])
      if (/(^|,)H/.test(r.atendimento)) m.set(r.prestador_id, r.cot_prestadores?.nome ?? '');
    return m;
  };
  const rede: Rede[] = [];
  for (const o of cot.opcoes.filter((x) => x.completa).slice(0, 4)) {
    const hoje = new Map<number, string>(), nova = new Set<number>();
    for (const l of o.linhas) {
      if (l.origem.operadora && l.origem.plano) for (const [id, n] of await hosp(l.origem.operadora, l.origem.plano)) hoje.set(id, n);
      for (const id of (await hosp(o.operadora, l.plano)).keys()) nova.add(id);
    }
    if (!hoje.size) continue;
    const comuns = [...hoje].filter(([id]) => nova.has(id)).map(([, n]) => n).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const faltam = [...hoje].filter(([id]) => !nova.has(id)).map(([, n]) => n).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    rede.push({ operadora: o.operadora, comuns, total: hoje.size, faltam });
  }

  const buf = await renderToBuffer(
    <Apresentacao d={{
      marca: marcaDa(c, cor?.nome),
      empresa: { razao: em.razao_social, curta: em.nome_curto || em.razao_social, cnpj: em.cnpj ? cnpj(em.cnpj) : null },
      cot, rede, data: new Date().toISOString(),
    }} />,
  );
  const nome = `Proposta_${(em.nome_curto || em.razao_social).replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"`, 'Cache-Control': 'no-store' },
  });
}
