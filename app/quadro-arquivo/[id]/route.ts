// Baixar um anexo ou o e-mail inteiro de um card do quadro. O banco só devolve o arquivo para quem é da corretora.
import { NextResponse, type NextRequest } from 'next/server';
import { cliente, MODO_DEMO, sessao } from '@/lib/servidor';

// o Supabase devolve bytea como texto "\x0a1b..."
function bytes(v: unknown): Uint8Array {
  const s = String(v ?? '');
  if (!s.startsWith('\\x')) return new Uint8Array();
  const hex = s.slice(2), out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await sessao();
  if (!s) return NextResponse.redirect(new URL('/entrar', req.url));
  if (MODO_DEMO) return new NextResponse('No modo demonstração os arquivos não existem de verdade.', { status: 404 });
  const db = await cliente();
  const { data, error } = await db.rpc('quadro_arquivo_baixar', { p_id: id });
  const a = (data ?? [])[0] as { nome: string; tipo_mime: string | null; conteudo: string } | undefined;
  if (error || !a) return new NextResponse('Arquivo não encontrado ou sem acesso.', { status: 404 });
  const corpo = bytes(a.conteudo);
  const inline = /^(application\/pdf|image\/)/.test(a.tipo_mime ?? '');
  return new NextResponse(Buffer.from(corpo), {
    headers: {
      'content-type': a.tipo_mime || 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      'cache-control': 'private, no-store',
    },
  });
}
