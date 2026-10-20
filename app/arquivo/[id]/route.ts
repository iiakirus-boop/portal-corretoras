// Baixar um documento: confere o acesso (a regra do banco só devolve o que a pessoa pode ver),
// registra o download e manda para um link temporário de 60 segundos.
import { NextResponse, type NextRequest } from 'next/server';
import { cliente, MODO_DEMO, sessao } from '@/lib/servidor';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await sessao();
  if (!s) return NextResponse.redirect(new URL('/entrar', req.url));
  const db = await cliente();
  const { data: doc } = await db.from('documentos').select('*').eq('id', id).maybeSingle();
  if (!doc) return new NextResponse('Arquivo não encontrado ou sem acesso.', { status: 404 });
  const { data, error } = await db.storage.from('documentos').createSignedUrl(doc.caminho_storage, 60, { download: doc.nome_arquivo });
  if (error || !data) return new NextResponse('O arquivo ainda não foi enviado para o portal.', { status: 404 });
  if (!MODO_DEMO) await db.from('downloads').insert({ documento_id: id, user_id: s.userId });
  return NextResponse.redirect(new URL(data.signedUrl, req.url));
}
