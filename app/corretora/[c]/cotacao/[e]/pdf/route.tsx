import { renderToBuffer } from '@react-pdf/renderer';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { calcularCotacao, lerEscolhas } from '@/lib/cotacao';
import { cnpj } from '@/lib/formato';
import { marcaDa } from '@/lib/marca';
import { Apresentacao } from '@/lib/pdf/apresentacao';
import { redeDaRegiao } from '@/lib/rede';
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

  // rede credenciada: principais hospitais da região da empresa, com o atendimento no plano de hoje e em cada proposta
  const rede = await redeDaRegiao(db, cot);

  let buf: Buffer;
  try {
    buf = await renderToBuffer(
      <Apresentacao d={{
        marca: marcaDa(c, cor?.nome),
        empresa: { razao: em.razao_social, curta: em.nome_curto || em.razao_social, cnpj: em.cnpj ? cnpj(em.cnpj) : null },
        cot, rede, data: new Date().toISOString(),
      }} />,
    );
  } catch (err) {
    console.error('pdf da cotação', err);
    return new Response(`Não deu para montar o PDF: ${(err as Error).message ?? err}`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const nome = `Proposta_${(em.nome_curto || em.razao_social).replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"`, 'Cache-Control': 'no-store' },
  });
}
