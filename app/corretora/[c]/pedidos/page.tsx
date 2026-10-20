import Link from 'next/link';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { ABERTOS, data, quando, STATUS_PEDIDO, TIPO_PEDIDO } from '@/lib/formato';
import { hoje } from '@/lib/contas';
import { StatusPill } from '@/components/Pill';
import type { Empresa, Pedido, StatusPedido } from '@/lib/tipos';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function PedidosCorretora({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  await exigirCorretora(c);
  const db = await cliente();
  const filtro = sp.ver ?? 'abertos';
  let q = db.from('pedidos').select('*').eq('corretora_id', c);
  if (filtro === 'abertos') q = q.in('status', ABERTOS).order('prazo');
  else if (filtro in STATUS_PEDIDO) q = q.eq('status', filtro).order('atualizado_em', { ascending: false });
  else q = q.order('criado_em', { ascending: false }).limit(200);
  const [{ data: pedidos }, { data: empresas }] = await Promise.all([q, db.from('empresas').select('*').eq('corretora_id', c)]);
  const ps = (pedidos ?? []) as Pedido[];
  const es = (empresas ?? []) as Empresa[];
  const nomeE = (id: string) => { const e = es.find((x) => x.id === id); return e?.nome_curto ?? e?.razao_social ?? '—'; };
  const h = hoje();
  const filtros: [string, string][] = [['abertos', 'Em andamento'], ['pendencia_cliente', 'Esperando a empresa'], ['concluido', 'Concluídos'], ['todos', 'Todos']];

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Pedidos</h1><p>Inclusões, exclusões, trocas de plano e 2ª via pedidas pelas empresas. Os prazos são as datas de corte das seguradoras.</p></div>
        <nav className="acoes" aria-label="Filtrar pedidos">
          {filtros.map(([v, r]) => <Link key={v} href={`?ver=${v}`} className={`btn sm${filtro === v ? '' : ' ghost'}`} aria-current={filtro === v ? 'page' : undefined}>{r}</Link>)}
        </nav>
      </div>
      <div className="tbl">
        <table>
          <thead><tr><th>Pedido</th><th>Empresa</th><th>Pessoa</th><th>Situação</th><th>Prazo</th><th>Última mudança</th></tr></thead>
          <tbody>
            {ps.length === 0 && <tr><td colSpan={6} className="empty">Nenhum pedido neste filtro.</td></tr>}
            {ps.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/corretora/${c}/pedidos/${p.id}`}>{TIPO_PEDIDO[p.tipo]}</Link><small>{p.protocolo}</small></td>
                <td>{nomeE(p.empresa_id)}</td>
                <td>{p.dados.nome ?? p.dados.assunto ?? '—'}</td>
                <td><StatusPill status={p.status as StatusPedido} /></td>
                <td style={p.prazo && p.prazo < h && ABERTOS.includes(p.status) ? { color: 'var(--bad-fg)', fontWeight: 800 } : undefined}>{data(p.prazo)}</td>
                <td>{quando(p.atualizado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
