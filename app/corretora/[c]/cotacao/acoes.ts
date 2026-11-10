'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';

// Recalcula a cotação de todas as empresas da corretora (função cot_recalcular, no banco)
export async function recalcularCotacoes(fd: FormData) {
  const c = String(fd.get('corretora_id') ?? '');
  const volta = String(fd.get('volta') ?? `/corretora/${c}/cotacao`);
  const { admin } = await exigirCorretora(c);
  if (!admin) redirect(`${volta}?erro=${encodeURIComponent('Só o administrador recalcula as cotações.')}`);
  const db = await cliente();
  const { data, error } = await db.rpc('cot_recalcular', { c });
  revalidatePath(`/corretora/${c}/cotacao`, 'layout');
  if (error) redirect(`${volta}?erro=${encodeURIComponent('Não deu para recalcular: ' + error.message)}`);
  redirect(`${volta}?ok=${encodeURIComponent(`Cotação recalculada para ${data ?? 0} empresas.`)}`);
}
