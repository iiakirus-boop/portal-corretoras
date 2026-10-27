import Link from 'next/link';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { ABERTOS, competencia, moeda, num, plural, seg } from '@/lib/formato';
import { somarPor, vidasEmpresaPor, type FaturaUltima, type VidaCarteira } from '@/lib/contas';
import { criarEmpresa } from '@/lib/acoes';
import { Aviso } from '@/components/Aviso';
import type { Empresa, Pedido } from '@/lib/tipos';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function Empresas({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  let q = db.from('empresas').select('*').eq('corretora_id', c).order('razao_social');
  if (sp.q) q = q.ilike('razao_social', `%${sp.q}%`);
  const [{ data: empresas }, { data: faturas }, { data: vidasC }, { data: pedidos }] = await Promise.all([
    q,
    db.from('faturas_ultimas').select('*').eq('corretora_id', c),
    db.from('vidas_carteira').select('*').eq('corretora_id', c),
    db.from('pedidos').select('*').eq('corretora_id', c).in('status', ABERTOS),
  ]);
  const es = (empresas ?? []) as Empresa[];
  const ult = (faturas ?? []) as FaturaUltima[];
  const vidas = vidasEmpresaPor((vidasC ?? []) as VidaCarteira[]);
  const valor = somarPor(ult, (f) => f.empresa_id, (f) => Number(f.valor));
  const ped = somarPor((pedidos ?? []) as Pedido[], (p) => p.empresa_id, () => 1);
  const segs = new Map<string, FaturaUltima[]>();
  for (const f of ult) segs.set(f.empresa_id, [...(segs.get(f.empresa_id) ?? []), f]);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Empresas</h1><p>{plural(es.length, 'empresa', 'empresas')} na carteira. Valor da fatura mais recente de cada seguradora; vidas do último mês faturado, mais entradas e menos saídas.</p></div>
        <form className="acoes" role="search">
          <input className="busca" type="search" enterKeyHint="search" name="q" defaultValue={sp.q} placeholder="Buscar pela razão social" aria-label="Buscar empresa" style={{ width: 260 }} />
          <button className="btn ghost">Buscar</button>
        </form>
      </div>
      <Aviso sp={sp} />
      <div className="tbl">
        <table>
          <thead><tr><th>Empresa</th><th>Seguradoras</th><th>Última fatura</th><th className="num">Vidas</th><th className="num">Valor mensal</th><th className="num">Pedidos abertos</th></tr></thead>
          <tbody>
            {es.length === 0 && <tr><td colSpan={6} className="empty">Nenhuma empresa encontrada.</td></tr>}
            {es.map((e) => {
              const fs = segs.get(e.id) ?? [];
              return (
                <tr key={e.id}>
                  <td><Link href={`/corretora/${c}/empresas/${e.id}`}>{e.razao_social}</Link><small>{[e.codigo_interno, e.cnpj].filter(Boolean).join(', ')}</small></td>
                  <td>{fs.map((f) => seg(f.seguradora_id)).join(', ') || '—'}</td>
                  <td>{fs.length ? competencia(fs.map((f) => f.competencia).sort().pop()!) : '—'}</td>
                  <td className="num">{num(vidas.get(e.id) ?? 0)}</td>
                  <td className="num">{moeda(valor.get(e.id) ?? 0)}</td>
                  <td className="num">{num(ped.get(e.id) ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {admin && (
        <section className="card" style={{ maxWidth: 760 }}>
          <div className="card-h"><h2>Cadastrar empresa</h2><span className="hint">as apólices entram junto com as faturas, pelos robôs</span></div>
          <form action={criarEmpresa} className="form">
            <input type="hidden" name="corretora_id" value={c} />
            <div className="linha">
              <label className="campo">Razão social<input name="razao_social" required /></label>
              <label className="campo">CNPJ<input name="cnpj" inputMode="numeric" /></label>
            </div>
            <div className="linha">
              <label className="campo">Nome curto <small>(usado no nome dos arquivos)</small><input name="nome_curto" placeholder="BOM GRAO" /></label>
              <label className="campo">Código interno<input name="codigo_interno" placeholder="E010" /></label>
            </div>
            <label className="campo">E-mail do gestor na empresa <small>(opcional, recebe convite)</small><input type="email" name="gestor" /></label>
            <div><button className="btn">Cadastrar empresa</button></div>
          </form>
        </section>
      )}
    </div>
  );
}
