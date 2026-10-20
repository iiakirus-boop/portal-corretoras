// Volta do link enviado por e-mail: abre a sessão e transforma convites pendentes em acesso.
import { NextResponse, type NextRequest } from 'next/server';
import { cliente, MODO_DEMO } from '@/lib/servidor';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (MODO_DEMO || !code) return NextResponse.redirect(new URL('/entrar', url));
  const db = await cliente();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/entrar?erro=O+link+expirou.+Peça+um+novo.', url));
  await db.rpc('aceitar_convites');
  // Quem ainda não tem senha cria uma agora, para não depender do link nas próximas vezes
  const { data } = await db.auth.getUser();
  if (!data.user?.user_metadata?.tem_senha) return NextResponse.redirect(new URL('/conta/senha?primeira=1', url));
  return NextResponse.redirect(new URL('/', url));
}
