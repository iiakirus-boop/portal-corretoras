import Link from 'next/link';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { ABERTOS, competencia, data, moeda, num, seg, TIPO_PEDIDO } from '@/lib/formato';
import { Aviso } from '@/components/Aviso';
import { Pessoas } from '@/components/Pessoas';
import { Pill, StatusPill } from '@/components/Pill';
import { TabelaFaturas } from '@/components/TabelaFaturas';
import { notFound } from 'next/navigation';
import type { Apolice, Convite, Empresa, Fatura, Membro, Pedido } from '@/lib/tipos';

type P = { params: Promise<{ c: string; e: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function FichaEmpresa({ params, searchParams }: P) {
  const { c, e } = await params;
  const sp = await searchParams;
  const { s, admin } = await exigirCorretora(c);
  const db = await cliente();
  const { data: emp } = await db.from('empresas').select('*').eq('id', e).eq('corretora_id', c).maybeSingle();
  if (!emp) notFound();
  const em = emp as Empresa;
  const [{ data: apolices }, { data: faturas }, { data: pedidos }, { data: membros }, { data: convites }] = await Promise.all([
    db.from('apolices').select('*').eq('empresa_id', e),
    db.from('faturas').select('*').eq('empresa_id', e).order('competencia', { ascending: false }),
    db.from('pedidos').select('*').eq('empresa_id', e).order('criado_em', { ascending: false }).limit(20),
    db.from('membros').select('*').eq('empresa_id', e).eq('ativo', true),
    db.from('convites').select('*').eq('empresa_id', e),
  ]);
  const fs = (faturas ?? []) as Fatura[];
  const ps = (pedidos ?? []) as Pedido[];
  const de = `/corretora/${c}/empresas/${e}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href={`/corretora/${c}/empresas`} className="voltar">Empresas</Link>
          <h1>{em.razao_social}</h1>
          <div className="facts" style={{ marginTop: '.5rem' }}>
            {em.cnpj && <span>CNPJ <b>{em.cnpj}</b></span>}
            {em.codigo_interno && <span>Código <b>{em.codigo_interno}</b></span>}
            {em.nome_curto && <span>Nos arquivos <b>{em.nome_curto}</b></span>}
            <span>{em.ativa ? 'Ativa' : 'Inativa'}</span>
          </div>
        </div>
        <div className="acoes">
          <Link href={`/empresa/${e}`} className="btn ghost">Ver como a empresa vê</Link>
          <Link href={`/empresa/${e}/pedidos/novo`} className="btn">Abrir pedido</Link>
        </div>
      </div>
      <Aviso sp={sp} />

      <section className="card">
        <div className="card-h"><h2>Apólices</h2></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Seguradora</th><th>Produto</th><th>Código estipulante</th><th>Apólice</th><th className="num">Vencimento</th><th className="num">Corte da movimentação</th><th>Aniversário</th></tr></thead>
            <tbody>
              {((apolices ?? []) as Apolice[]).map((a) => (
                <tr key={a.id}><td><b>{seg(a.seguradora_id)}</b></td><td>{a.produto === 'dental' ? 'Dental' : 'Saúde'}</td><td>{a.codigo_estipulante ?? '—'}</td><td>{a.apolice ?? '—'}</td>
                  <td className="num">dia {a.dia_vencimento ?? '—'}</td><td className="num">dia {a.dia_corte_movimentacao ?? '—'}</td>
                  <td>{a.mes_aniversario ? competencia(`2026-${String(a.mes_aniversario).padStart(2, '0')}`).slice(0, 3) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid g32">
        <section className="card">
          <div className="card-h"><h2>Faturas</h2><Link href={`/empresa/${e}/vidas`} className="hint">ver vidas</Link></div>
          <TabelaFaturas faturas={fs.slice(0, 12)} conferencia />
        </section>
        <section className="card">
          <div className="card-h"><h2>Pedidos</h2></div>
          {ps.length === 0 ? <p className="empty">Nenhum pedido desta empresa.</p> : (
            <ul className="rows">
              {ps.map((p) => (
                <li key={p.id}>
                  <Link href={`/corretora/${c}/pedidos/${p.id}`}><b>{TIPO_PEDIDO[p.tipo]}</b><small>{p.dados.nome ?? p.dados.assunto ?? ''} {p.protocolo}, {data(p.criado_em)}</small></Link>
                  {ABERTOS.includes(p.status) ? <StatusPill status={p.status} /> : <Pill tom="idle">{p.status === 'concluido' ? 'Concluído' : 'Cancelado'}</Pill>}
                </li>
              ))}
            </ul>
          )}
          <p className="note">{num(fs.length)} faturas registradas, total de {moeda(fs.reduce((t, f) => t + (f.valor_total ?? 0), 0))}.</p>
        </section>
      </div>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '.4rem' }}>Pessoas da empresa</h2>
      <Pessoas de={de} corretoraId={c} empresaFixa={e} eu={s.userId} podeRemover={admin}
        membros={(membros ?? []) as Membro[]} convites={(convites ?? []) as Convite[]}
        papeis={['gestor_empresa', 'movimentacao_empresa', 'financeiro_empresa']} />
    </div>
  );
}
