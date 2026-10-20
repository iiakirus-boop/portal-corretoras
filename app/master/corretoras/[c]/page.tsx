import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cliente, exigirSessao } from '@/lib/servidor';
import { cnpj, competencia, data, moeda, num, seg } from '@/lib/formato';
import { mensalidade, somarPor, ultimas, vidasAtivas, type Contrato } from '@/lib/contas';
import { Aviso } from '@/components/Aviso';
import { Pessoas } from '@/components/Pessoas';
import { Pill } from '@/components/Pill';
import type { CodigoSeguradora, Convite, Corretora, Empresa, Fatura, Membro } from '@/lib/tipos';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function CorretoraMaster({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  const s = await exigirSessao();
  const db = await cliente();
  const { data: cor } = await db.from('corretoras').select('*').eq('id', c).maybeSingle();
  if (!cor) notFound();
  const k = cor as Corretora;
  const [{ data: cnpjs }, { data: codigos }, { data: empresas }, { data: faturas }, { data: membros }, { data: convites }] = await Promise.all([
    db.from('corretora_cnpjs').select('*').eq('corretora_id', c),
    db.from('corretora_codigos').select('*').eq('corretora_id', c),
    db.from('empresas').select('*').eq('corretora_id', c).order('razao_social'),
    db.from('faturas').select('*').eq('corretora_id', c),
    db.from('membros').select('*').eq('corretora_id', c).eq('ativo', true),
    db.from('convites').select('*').eq('corretora_id', c),
  ]);
  const es = (empresas ?? []) as Empresa[];
  const fs = (faturas ?? []) as Fatura[];
  const ult = ultimas(fs);
  const vidasE = somarPor(ult, (f) => f.empresa_id, (f) => f.vidas_informadas ?? 0);
  const segsE = new Map<string, string[]>();
  for (const f of ult) segsE.set(f.empresa_id, [...(segsE.get(f.empresa_id) ?? []), seg(f.seguradora_id)]);
  const ultimaComp = fs.reduce((m, f) => (f.competencia > m ? f.competencia : m), '');
  const vidas = vidasAtivas(fs);
  const contrato = (k.contrato ?? {}) as Contrato;
  const preco = mensalidade(vidas, contrato);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link href="/master/corretoras" className="voltar">Corretoras</Link>
          <h1>{k.nome}</h1>
          <p>{k.razao_social} ({cnpj(k.cnpj)})</p>
        </div>
        <a href={`/central/${c}`} className="btn">Abrir a Central desta corretora</a>
      </div>
      <Aviso sp={sp} />

      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Empresas ativas</span><span className="kpi-v">{num(es.filter((e) => e.ativa).length)}</span></div>
        <div className="kpi"><span className="kpi-l">Vidas ativas</span><span className="kpi-v">{num(vidas)}</span><span className="kpi-s">última competência: {competencia(ultimaComp || null)}</span></div>
        <div className="kpi"><span className="kpi-l">Mensalidade da plataforma</span><span className="kpi-v">{preco ? moeda(preco.valor) : '—'}</span><span className="kpi-s">{preco ? `${moeda(preco.porVida)} por vida${preco.minimoAplicado ? ', valor mínimo' : ''}` : contrato.observacao ?? 'sem preço combinado'}</span></div>
        <div className="kpi"><span className="kpi-l">Desde</span><span className="kpi-v">{data(k.criado_em)}</span><span className="kpi-s">{k.slug}</span></div>
      </div>

      <div className="grid g2">
        <section className="card">
          <div className="card-h"><h2>Códigos nas seguradoras</h2><span className="hint">os robôs entram por estes códigos</span></div>
          <ul className="rows">
            {((codigos ?? []) as CodigoSeguradora[]).map((x) => (
              <li key={x.id}><div><b>{seg(x.seguradora_id)} {x.codigo}</b><small>{x.rotulo}</small></div>{x.ativo ? <Pill tom="ok">Ativo</Pill> : <Pill tom="idle">Parado</Pill>}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <div className="card-h"><h2>CNPJs da corretora</h2></div>
          <ul className="rows">
            {((cnpjs ?? []) as { cnpj: string; razao_social: string | null; principal: boolean }[]).map((x) => (
              <li key={x.cnpj}><div><b>{cnpj(x.cnpj)}</b><small>{x.razao_social}</small></div>{x.principal && <Pill tom="info">Principal</Pill>}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Empresas da carteira</h2><Link href={`/corretora/${c}/empresas`} className="hint">gerenciar no painel da corretora</Link></div>
        {es.length === 0 ? <p className="empty">Nenhuma empresa cadastrada.</p> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Empresa</th><th>Seguradoras</th><th className="num">Vidas</th></tr></thead>
              <tbody>
                {es.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/corretora/${c}/empresas/${e.id}`}>{e.razao_social}</Link><small>{e.codigo_interno} {e.cnpj}</small></td>
                    <td>{(segsE.get(e.id) ?? []).join(', ') || '—'}</td>
                    <td className="num">{num(vidasE.get(e.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Pessoas de={`/master/corretoras/${c}`} corretoraId={c} eu={s.userId} podeRemover
        membros={((membros ?? []) as Membro[]).filter((m) => !m.empresa_id)}
        convites={((convites ?? []) as Convite[]).filter((x) => !x.empresa_id)}
        papeis={['admin_corretora', 'operador_corretora']} />
    </div>
  );
}
