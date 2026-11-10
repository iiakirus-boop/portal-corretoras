import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { competencia, num, plural } from '@/lib/formato';
import { Aviso } from '@/components/Aviso';

export const dynamic = 'force-dynamic';

type P = { params: Promise<{ c: string }>; searchParams: Promise<Record<string, string | undefined>> };
type EmpCot = { empresa_id: string; razao_social: string; nome_curto: string | null; codigo_interno: string | null; vidas: number; competencia: string | null; seguradoras: string | null };

// Aba Cotação: as empresas com menos de 100 vidas. Nada fica pré-calculado: a cotação é feita na hora, ao abrir a empresa.
export default async function CotacaoLista({ params, searchParams }: P) {
  const { c } = await params;
  const sp = await searchParams;
  await exigirCorretora(c);
  const db = await cliente();
  const { data } = await db.from('cot_empresas').select('*').eq('corretora_id', c).lt('vidas', 100).order('razao_social');
  const es = (data ?? []) as EmpCot[];
  // vindo do Faturamento: ?cod=C021 abre a cotação daquela empresa
  if (sp.cod) {
    const e = es.find((x) => x.codigo_interno === sp.cod);
    if (e) redirect(`/corretora/${c}/cotacao/${e.empresa_id}`);
  }
  const q = (sp.q ?? '').trim().toUpperCase();
  const L = q ? es.filter((e) => e.razao_social.toUpperCase().includes(q) || (e.nome_curto ?? '').toUpperCase().includes(q) || e.codigo_interno === q) : es;

  // separação por seguradora de hoje (empresa com mais de uma aparece em cada uma)
  const segsDe = (e: EmpCot) => (e.seguradoras ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const todas = [...new Set(es.flatMap(segsDe))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sel = sp.s && todas.includes(sp.s) ? sp.s : null;
  const grupos = (sel ? [sel] : todas)
    .map((seg) => ({ seg, lista: L.filter((e) => segsDe(e).includes(seg)) }))
    .filter((g) => g.lista.length);
  const semSeg = sel ? [] : L.filter((e) => !segsDe(e).length);
  if (semSeg.length) grupos.push({ seg: 'Sem seguradora', lista: semSeg });
  const link = (s?: string) => { const u = new URLSearchParams(); if (sp.q) u.set('q', sp.q); if (s) u.set('s', s); const t = u.toString(); return `/corretora/${c}/cotacao${t ? `?${t}` : ''}`; };
  const contar = (seg: string) => es.filter((e) => segsDe(e).includes(seg)).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cotação</h1>
          <p>{plural(es.length, 'empresa', 'empresas')} com menos de 100 vidas, separadas pela seguradora de hoje. Abra uma empresa para cotar: a cotação é calculada na hora com as vidas da última fatura, e lá você escolhe as operadoras, troca os planos equivalentes e gera a apresentação.</p>
        </div>
        <form className="acoes" role="search">
          {sel && <input type="hidden" name="s" value={sel} />}
          <input className="busca" type="search" enterKeyHint="search" name="q" defaultValue={sp.q} placeholder="Buscar empresa" aria-label="Buscar empresa" style={{ width: 240 }} />
          <button className="btn ghost">Buscar</button>
        </form>
      </div>
      <div className="chips" role="group" aria-label="Seguradora" style={{ marginBottom: '1rem' }}>
        <Link className={`chip${sel ? '' : ' on'}`} href={link()}>Todas · {es.length}</Link>
        {todas.map((s) => <Link key={s} className={`chip${sel === s ? ' on' : ''}`} href={link(s)}>{s} · {contar(s)}</Link>)}
      </div>
      <Aviso sp={sp} />
      {grupos.length === 0 && <div className="tbl"><table><tbody><tr><td className="empty">Nenhuma empresa encontrada.</td></tr></tbody></table></div>}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {grupos.map(({ seg, lista }) => (
          <details key={seg} className="fold" open>
            <summary><h2>{seg}</h2><span className="hint">{plural(lista.length, 'empresa', 'empresas')} · {num(lista.reduce((a, e) => a + e.vidas, 0))} vidas</span></summary>
            <div className="fb">
              <div className="tbl">
                <table>
                  <thead><tr><th>Empresa</th><th>Última fatura</th><th className="num">Vidas</th><th /></tr></thead>
                  <tbody>
                    {lista.map((e) => (
                      <tr key={e.empresa_id}>
                        <td><Link href={`/corretora/${c}/cotacao/${e.empresa_id}`}>{e.nome_curto || e.razao_social}</Link><small>{[e.razao_social !== e.nome_curto ? e.razao_social : null, e.codigo_interno, segsDe(e).length > 1 ? `também ${segsDe(e).filter((x) => x !== seg).join(', ')}` : null].filter(Boolean).join(' · ')}</small></td>
                        <td>{competencia(e.competencia)}</td>
                        <td className="num">{num(e.vidas)}</td>
                        <td className="num"><Link className="btn ghost" href={`/corretora/${c}/cotacao/${e.empresa_id}`}>Cotar</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
