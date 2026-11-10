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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cotação</h1>
          <p>{plural(es.length, 'empresa', 'empresas')} com menos de 100 vidas. Abra uma empresa para cotar: a cotação é calculada na hora com as vidas da última fatura, e lá você escolhe as operadoras, troca os planos equivalentes e gera a apresentação.</p>
        </div>
        <form className="acoes" role="search">
          <input className="busca" type="search" enterKeyHint="search" name="q" defaultValue={sp.q} placeholder="Buscar empresa" aria-label="Buscar empresa" style={{ width: 240 }} />
          <button className="btn ghost">Buscar</button>
        </form>
      </div>
      <Aviso sp={sp} />
      <div className="tbl">
        <table>
          <thead><tr><th>Empresa</th><th>Seguradora hoje</th><th>Última fatura</th><th className="num">Vidas</th><th /></tr></thead>
          <tbody>
            {L.length === 0 && <tr><td colSpan={5} className="empty">Nenhuma empresa encontrada.</td></tr>}
            {L.map((e) => (
              <tr key={e.empresa_id}>
                <td><Link href={`/corretora/${c}/cotacao/${e.empresa_id}`}>{e.nome_curto || e.razao_social}</Link><small>{[e.razao_social !== e.nome_curto ? e.razao_social : null, e.codigo_interno].filter(Boolean).join(' · ')}</small></td>
                <td>{e.seguradoras ?? '—'}</td>
                <td>{competencia(e.competencia)}</td>
                <td className="num">{num(e.vidas)}</td>
                <td className="num"><Link className="btn ghost" href={`/corretora/${c}/cotacao/${e.empresa_id}`}>Cotar</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
