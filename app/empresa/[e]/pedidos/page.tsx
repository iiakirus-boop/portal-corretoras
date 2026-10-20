import Link from 'next/link';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { data, quando, TIPO_PEDIDO } from '@/lib/formato';
import { Aviso } from '@/components/Aviso';
import { StatusPill } from '@/components/Pill';
import type { Pedido } from '@/lib/tipos';

type P = { params: Promise<{ e: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function PedidosEmpresa({ params, searchParams }: P) {
  const { e } = await params;
  const sp = await searchParams;
  const x = await exigirEmpresa(e);
  const db = await cliente();
  const { data: linhas } = await db.from('pedidos').select('*').eq('empresa_id', e).order('criado_em', { ascending: false }).limit(200);
  const ps = (linhas ?? []) as Pedido[];
  const base = `/empresa/${e}`;
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Pedidos</h1><p>Tudo o que a empresa pediu à corretora, com a situação de cada um.</p></div>
        <Link href={`${base}/pedidos/novo${x.soFinanceiro ? '?tipo=segunda_via' : ''}`} className="btn">Fazer um pedido</Link>
      </div>
      <Aviso sp={sp} />
      <div className="tbl">
        <table>
          <thead><tr><th>Pedido</th><th>Pessoa ou assunto</th><th>Situação</th><th>Aberto</th><th>Última mudança</th></tr></thead>
          <tbody>
            {ps.length === 0 && <tr><td colSpan={5} className="empty">Nenhum pedido ainda.</td></tr>}
            {ps.map((p) => (
              <tr key={p.id}>
                <td><Link href={`${base}/pedidos/${p.id}`}>{TIPO_PEDIDO[p.tipo]}</Link><small>{p.protocolo}</small></td>
                <td>{p.dados.nome ?? p.dados.assunto ?? (p.dados.competencia ? `Boleto de ${p.dados.competencia}` : '—')}</td>
                <td><StatusPill status={p.status} /></td>
                <td>{data(p.criado_em)}</td>
                <td>{quando(p.atualizado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
