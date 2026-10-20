import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { cliente, COOKIE_DEMO, MODO_DEMO } from '@/lib/servidor';

export async function GET(req: Request) {
  if (MODO_DEMO) (await cookies()).delete(COOKIE_DEMO);
  else await (await cliente()).auth.signOut();
  return NextResponse.redirect(new URL('/entrar', req.url));
}
