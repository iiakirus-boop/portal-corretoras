import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { carregarPedido } from '@/lib/pedido';
import { Aviso } from '@/components/Aviso';
import { PedidoDetalhe } from '@/components/PedidoDetalhe';

type P = { params: Promise<{ c: string; p: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function PedidoCorretora({ params, searchParams }: P) {
  const { c, p } = await params;
  const sp = await searchParams;
  await exigirCorretora(c);
  const r = await carregarPedido(await cliente(), p);
  if (!r || r.pedido.corretora_id !== c) notFound();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href={`/corretora/${c}/pedidos`} className="voltar">Pedidos</Link>
          <h1>Pedido {r.pedido.protocolo}</h1>
        </div>
        <Link href={`/corretora/${c}/empresas/${r.pedido.empresa_id}`} className="btn ghost">Ficha da empresa</Link>
      </div>
      <Aviso sp={sp} />
      <PedidoDetalhe {...r} lado="corretora" de={`/corretora/${c}/pedidos/${p}`} />
    </div>
  );
}
