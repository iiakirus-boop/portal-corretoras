import { redirect } from 'next/navigation';
import { destino, sessao } from '@/lib/servidor';

export default async function Inicio() {
  const s = await sessao();
  redirect(s ? destino(s) : '/entrar');
}
