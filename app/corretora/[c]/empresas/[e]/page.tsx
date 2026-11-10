import Link from 'next/link';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { ABERTOS, competencia, data, moeda, num, pagamento, plural, seg, TIPO_PEDIDO } from '@/lib/formato';
import { Aviso } from '@/components/Aviso';
import { Pessoas } from '@/components/Pessoas';
import { Pill, StatusPill } from '@/components/Pill';
import { TabelaFaturas } from '@/components/TabelaFaturas';
import { notFound } from 'next/navigation';
import type { Apolice, Convite, Empresa, Fatura, Membro, Pedido } from '@/lib/tipos';
import { mapaFichas } from '@/lib/central/fichas';
import { PRIORIDADES, ROTULO_COLUNA, type CardQuadro } from '@/lib/quadro';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ficha da empresa' };
type Lanc = { data_lancamento: string | null; comissao: number | null; classe: string | null };

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
    db.from('faturas').select('*').eq('empresa_id', e).is('excluido_em', null).order('competencia', { ascending: false }),
    db.from('pedidos').select('*').eq('empresa_id', e).order('criado_em', { ascending: false }).limit(20),
    db.from('membros').select('*').eq('empresa_id', e).eq('ativo', true),
    db.from('convites').select('*').eq('empresa_id', e),
  ]);
  const fs = (faturas ?? []) as Fatura[];
  const ps = (pedidos ?? []) as Pedido[];
  const de = `/corretora/${c}/empresas/${e}`;

  // ---- tudo da empresa num lugar só: Quadro, envio do faturamento, comissão e cotação ----
  const nomeBusca = (em.nome_curto ?? '').trim();
  const lista = async <T,>(q: PromiseLike<{ data: unknown }>) => (((await q).data ?? []) as T[]);
  const [k1, k2, fichas, lancs] = await Promise.all([
    lista<CardQuadro>(db.from('quadro_cards').select('*').eq('corretora_id', c).eq('arquivado', false).eq('empresa_id', e).limit(50)),
    lista<CardQuadro>(nomeBusca.length >= 4 ? db.from('quadro_cards').select('*').eq('corretora_id', c).eq('arquivado', false).ilike('empresa_nome', `%${nomeBusca}%`).limit(50) : Promise.resolve({ data: [] })),
    mapaFichas(db, c),
    // comissão só o administrador vê (o banco também só entrega para ele)
    admin ? lista<Lanc>(db.from('comissao_lancamentos').select('data_lancamento, comissao, classe').eq('empresa_id', e).is('excluido_em', null).order('data_lancamento', { ascending: false }).limit(1000)) : Promise.resolve([] as Lanc[]),
  ]);
  const cards = [...new Map([...k1, ...k2].map((x) => [x.id, x])).values()]
    .sort((a, b) => Number(a.coluna === 'feito') - Number(b.coluna === 'feito') || a.prioridade - b.prioridade || b.atualizado_em.localeCompare(a.atualizado_em));
  const eids = fichas.porEmpresa[e] ?? [];
  const mesNovo = fs[0] ? String(fs[0].competencia).trim() : null;
  const doMes = mesNovo ? fs.filter((f) => String(f.competencia).trim() === mesNovo) : [];
  const { data: env } = eids.length && mesNovo
    ? await db.from('faturamento_envios').select('situacao, marcado_nome, marcado_em').eq('corretora_id', c).eq('competencia', mesNovo).in('eid', eids).limit(5)
    : { data: [] };
  const envio = ((env ?? []) as { situacao: string; marcado_nome: string | null; marcado_em: string }[]).find((x) => x.situacao !== 'pendente') ?? null;
  const hoje = new Date().toISOString().slice(0, 10);
  const emAberto = fs.filter((f) => !pagamento(f) && f.vencimento && f.vencimento >= hoje);
  const ha12 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const com12 = lancs.filter((l) => (l.data_lancamento ?? '') >= ha12).reduce((t, l) => t + (l.comissao ?? 0), 0);
  const fat12 = fs.filter((f) => String(f.competencia).trim() >= ha12.slice(0, 7)).reduce((t, f) => t + (f.valor_total ?? 0), 0);
  const ultimaCom = lancs[0]?.data_lancamento ?? null;

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
          {eids[0] && <Link href={`/corretora/${c}/faturamento?emp=${encodeURIComponent(eids[0])}`} className="btn ghost">Faturamento</Link>}
          <Link href={`/corretora/${c}/cotacao/${e}`} className="btn ghost">Cotação</Link>
          <Link href={`/empresa/${e}`} className="btn ghost">Ver como a empresa vê</Link>
          <Link href={`/empresa/${e}/pedidos/novo`} className="btn">Abrir pedido</Link>
        </div>
      </div>
      <Aviso sp={sp} />

      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Última fatura{mesNovo ? ` · ${competencia(mesNovo)}` : ''}</span><span className="kpi-v">{mesNovo ? moeda(doMes.reduce((t, f) => t + (f.valor_boleto ?? f.valor_total ?? 0), 0)) : '—'}</span>
          <span className="kpi-s">{mesNovo ? `${plural(doMes.length, 'fatura', 'faturas')} · ${num(doMes.reduce((t, f) => t + (f.vidas_informadas ?? 0), 0))} vidas` : 'nenhuma fatura na base'}</span></div>
        <div className={`kpi${emAberto.length ? ' alerta' : ''}`}><span className="kpi-l">Boletos em aberto</span><span className="kpi-v">{emAberto.length}</span>
          <span className="kpi-s">{emAberto.length ? `${moeda(emAberto.reduce((t, f) => t + (f.valor_boleto ?? f.valor_total ?? 0), 0))} a vencer` : 'nada a vencer'}</span></div>
        <div className="kpi"><span className="kpi-l">Envio ao cliente{mesNovo ? ` · ${competencia(mesNovo)}` : ''}</span>
          <span className="kpi-v" style={{ fontSize: '1.05rem' }}>{!mesNovo ? '—' : envio?.situacao === 'enviado' ? 'Enviado' : envio?.situacao === 'nao_enviar' ? 'Não enviar' : 'Falta enviar'}</span>
          <span className="kpi-s">{envio ? `${envio.marcado_nome ? `por ${envio.marcado_nome}, ` : ''}${data(envio.marcado_em)}` : eids[0] ? 'marque na tela de Faturamento' : 'sem código no Faturamento'}</span></div>
        <div className="kpi"><span className="kpi-l">Quadro da equipe</span><span className="kpi-v">{cards.filter((k) => k.coluna !== 'feito').length}</span>
          <span className="kpi-s">{plural(cards.filter((k) => k.coluna !== 'feito').length, 'card em aberto', 'cards em aberto')} desta empresa</span></div>
        {admin && <div className="kpi"><span className="kpi-l">Comissão em 12 meses</span><span className="kpi-v">{moeda(com12)}</span>
          <span className="kpi-s">{com12 && fat12 ? `${(com12 / fat12 * 100).toFixed(1).replace('.', ',')}% do faturado` : 'sem comissão ligada a esta empresa'}{ultimaCom ? ` · última em ${data(ultimaCom)}` : ''}</span></div>}
      </div>

      {cards.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>No Quadro da equipe</h2><Link href={`/corretora/${c}/quadro`} className="hint">abrir o Quadro</Link></div>
          <ul className="rows">
            {cards.slice(0, 8).map((k) => (
              <li key={k.id}>
                <Link href={`/corretora/${c}/quadro?card=${k.id}`}><b>#{k.numero} · {k.titulo}</b><small>{[k.proximo_passo ? `próximo passo: ${k.proximo_passo}` : null, k.prazo ? `prazo ${data(k.prazo)}` : null].filter(Boolean).join(' · ') || 'sem próximo passo anotado'}</small></Link>
                <span className="acoes">{k.coluna !== 'feito' && k.prioridade <= 2 && <Pill tom={k.prioridade === 1 ? 'bad' : 'warn'}>{PRIORIDADES.find((x) => x.n === k.prioridade)?.rotulo}</Pill>}<Pill tom={k.coluna === 'feito' ? 'idle' : 'info'}>{ROTULO_COLUNA[k.coluna]}</Pill></span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <p className="note">{plural(fs.length, 'fatura registrada', 'faturas registradas')}, total de {moeda(fs.reduce((t, f) => t + (f.valor_total ?? 0), 0))}.</p>
        </section>
      </div>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '.4rem' }}>Pessoas da empresa</h2>
      <Pessoas de={de} corretoraId={c} empresaFixa={e} eu={s.userId} podeRemover={admin}
        membros={(membros ?? []) as Membro[]} convites={(convites ?? []) as Convite[]}
        papeis={['gestor_empresa', 'movimentacao_empresa', 'financeiro_empresa']} />
    </div>
  );
}
