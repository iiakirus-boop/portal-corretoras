import Link from 'next/link';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { ABERTOS, competencia, data, moeda, num, seg, TIPO_PEDIDO } from '@/lib/formato';
import { hoje, ultimas, vidasAtivas } from '@/lib/contas';
import { preverBoletos } from '@/lib/previsao';
import { StatusPill } from '@/components/Pill';
import type { Fatura, Pedido, Vida } from '@/lib/tipos';

export default async function InicioEmpresa({ params }: { params: Promise<{ e: string }> }) {
  const { e } = await params;
  const x = await exigirEmpresa(e);
  const db = await cliente();
  const desde = new Date(Date.now() - 120 * 86400000).toISOString();
  const [{ data: faturas }, { data: pedidos }, { data: movs }, { data: apolices }] = await Promise.all([
    x.veFaturas || x.veVidas ? db.from('faturas').select('*').eq('empresa_id', e).order('competencia', { ascending: false }) : Promise.resolve({ data: [] }),
    db.from('pedidos').select('*').eq('empresa_id', e).in('status', ABERTOS).order('criado_em', { ascending: false }),
    db.from('pedidos').select('*').eq('empresa_id', e).in('tipo', ['inclusao', 'exclusao']).neq('status', 'cancelado').gte('criado_em', desde),
    db.from('apolices').select('id, seguradora_id').eq('empresa_id', e),
  ]);
  const fs = (faturas ?? []) as Fatura[];
  const ps = (pedidos ?? []) as Pedido[];
  const base = `/empresa/${e}`;
  const h = hoje();
  const ult = ultimas(fs);
  const comVoce = ps.filter((p) => p.status === 'pendencia_cliente' || (x.gestor && p.status === 'aguardando_aprovacao_empresa'));
  // Próximo boleto = último boleto de cada seguradora + inclusões − exclusões pedidas depois dele
  let vs: Vida[] = [];
  if (x.veFaturas && ult.length) {
    const { data } = await db.from('vidas').select('seguradora_id, competencia, nome, nascimento, idade, plano, premio_base, valor_total, pro_rata, copart_total')
      .eq('empresa_id', e).in('competencia', [...new Set(ult.map((f) => f.competencia))]);
    vs = (data ?? []) as Vida[];
  }
  const previsoes = x.veFaturas ? preverBoletos(fs, vs, (movs ?? []) as Pedido[], apolices ?? [], h) : [];
  const proximo = previsoes[0];
  const detalhe = (p: NonNullable<typeof proximo>) => {
    if (p.real) return `${seg(p.seguradora_id)}, vence ${data(p.vencimento)}`;
    const mov = [p.inclusoes ? `+${p.inclusoes} inclus${p.inclusoes > 1 ? 'ões' : 'ão'}` : '', p.exclusoes ? `−${p.exclusoes} exclus${p.exclusoes > 1 ? 'ões' : 'ão'}` : ''].filter(Boolean).join(' ');
    return `previsão: boleto de ${competencia(p.baseCompetencia)} ${moeda(p.base)}${mov ? ` ${mov}` : ', sem movimentações'}; ${seg(p.seguradora_id)}, vence ${data(p.vencimento)}`;
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{x.emp.razao_social}</h1><p>Plano de saúde da empresa: boletos, quem está no plano e pedidos à corretora.</p></div>
        {!x.soFinanceiro && <Link href={`${base}/pedidos/novo`} className="btn">Fazer um pedido</Link>}
        {x.soFinanceiro && <Link href={`${base}/pedidos/novo?tipo=segunda_via`} className="btn">Pedir 2ª via de boleto</Link>}
      </div>

      {comVoce.length > 0 && (
        <section className="card" style={{ borderColor: 'var(--warn-fg)' }}>
          <div className="card-h"><h2>Precisa de você</h2></div>
          <ul className="rows">
            {comVoce.map((p) => (
              <li key={p.id}>
                <Link href={`${base}/pedidos/${p.id}`}><b>{TIPO_PEDIDO[p.tipo]}: {p.dados.nome ?? p.dados.assunto ?? p.protocolo}</b>
                  <small>{p.status === 'pendencia_cliente' ? 'A corretora pediu uma informação ou documento.' : 'Pedido da equipe esperando sua aprovação.'}</small></Link>
                <StatusPill status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="kpis">
        {x.veFaturas && (
          <Link href={`${base}/faturas`} className="kpi">
            <span className="kpi-l">{proximo && !proximo.real ? 'Próximo boleto (previsão)' : 'Próximo boleto'}</span>
            <span className="kpi-v">{proximo ? moeda(proximo.valor) : '—'}</span>
            <span className="kpi-s">{proximo ? detalhe(proximo) : 'sem fatura recente'}</span>
          </Link>
        )}
        {x.veVidas && (
          <Link href={`${base}/vidas`} className="kpi"><span className="kpi-l">Pessoas no plano</span><span className="kpi-v">{num(vidasAtivas(fs))}</span>
            <span className="kpi-s">{ult.map((f) => `${seg(f.seguradora_id)} ${competencia(f.competencia)}`).join(', ') || 'sem fatura ainda'}</span></Link>
        )}
        <Link href={`${base}/pedidos`} className="kpi"><span className="kpi-l">Pedidos em andamento</span><span className="kpi-v">{num(ps.length)}</span><span className="kpi-s">com a corretora ou na seguradora</span></Link>
      </div>

      <div className="grid g2">
        {x.veFaturas && (
          <section className="card">
            <div className="card-h"><h2>Últimas faturas</h2><Link href={`${base}/faturas`} className="hint">ver todas</Link></div>
            <ul className="rows">
              {fs.slice(0, 5).map((f) => (
                <li key={f.id}>
                  <div><b>{competencia(f.competencia)}, {seg(f.seguradora_id)}</b><small>{f.data_pagamento ? `paga em ${data(f.data_pagamento)}` : `${f.vencimento && f.vencimento < h ? 'venceu' : 'vence'} ${data(f.vencimento)}`}</small></div>
                  <span className="r">{moeda(f.valor_boleto ?? f.valor_total)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card">
          <div className="card-h"><h2>Pedidos em andamento</h2><Link href={`${base}/pedidos`} className="hint">ver todos</Link></div>
          {ps.length === 0 ? <p className="empty">Nenhum pedido em andamento. Para incluir ou excluir alguém do plano, faça um pedido.</p> : (
            <ul className="rows">
              {ps.slice(0, 6).map((p) => (
                <li key={p.id}><Link href={`${base}/pedidos/${p.id}`}><b>{TIPO_PEDIDO[p.tipo]}</b><small>{p.dados.nome ?? p.dados.assunto ?? ''} {p.protocolo}</small></Link><StatusPill status={p.status} /></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
