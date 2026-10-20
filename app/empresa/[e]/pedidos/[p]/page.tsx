import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { carregarPedido } from '@/lib/pedido';
import { Aviso } from '@/components/Aviso';
import { PedidoDetalhe } from '@/components/PedidoDetalhe';

type P = { params: Promise<{ e: string; p: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function PedidoEmpresa({ params, searchParams }: P) {
  const { e, p } = await params;
  const sp = await searchParams;
  const x = await exigirEmpresa(e);
  const r = await carregarPedido(await cliente(), p);
  if (!r || r.pedido.empresa_id !== e) notFound();
  // a empresa não vê notas internas da corretora (o banco já filtra; aqui vale para quem é da corretora olhando como empresa)
  const eventos = r.eventos.filter((ev) => ev.visivel_empresa);
  return (
    <div className="page">
      <div className="page-head">
        <div><Link href={`/empresa/${e}/pedidos`} className="voltar">Pedidos</Link><h1>Pedido {r.pedido.protocolo}</h1></div>
      </div>
      <Aviso sp={sp} />
      <PedidoDetalhe {...r} eventos={eventos} lado="empresa" de={`/empresa/${e}/pedidos/${p}`}
        podeAprovar={x.papeis.includes('gestor_empresa')} />
    </div>
  );
}
