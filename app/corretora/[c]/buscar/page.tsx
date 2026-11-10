import type { Metadata } from 'next';
import Link from 'next/link';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { competencia, moeda, seg, TIPO_PEDIDO } from '@/lib/formato';
import { ROTULO_COLUNA, type CardQuadro } from '@/lib/quadro';
import type { Empresa, Fatura, Pedido } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Buscar' };

type P = { params: Promise<{ c: string }>; searchParams: Promise<{ q?: string }> };
type Vida = { empresa_id: string; nome: string; competencia: string; seguradora_id: string; titular: boolean | null; situacao: string | null };

// Busca geral: uma caixa só para achar empresa, pessoa, fatura, pedido ou card do Quadro.
// Cada pessoa só encontra o que o acesso dela já deixa ver (quem decide é o banco).
export default async function Buscar({ params, searchParams }: P) {
  const { c } = await params;
  const q = ((await searchParams).q ?? '').trim().slice(0, 80);
  await exigirCorretora(c);
  const db = await cliente();
  const base = `/corretora/${c}`;
  const curto = q.length < 2;
  const como = `%${q.replace(/[%_]/g, ' ')}%`;
  const digitos = q.replace(/\D/g, '');
  const numero = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
  const lista = async <T,>(p: PromiseLike<{ data: unknown }>) => (((await p).data ?? []) as T[]);
  const nada = Promise.resolve({ data: [] });

  const [e1, e2, e3, v1, v2, f1, p1, k1, k2, k3] = curto ? [[], [], [], [], [], [], [], [], [], []] as never[] : await Promise.all([
    lista<Empresa>(db.from('empresas').select('*').eq('corretora_id', c).ilike('razao_social', como).limit(20)),
    lista<Empresa>(db.from('empresas').select('*').eq('corretora_id', c).ilike('nome_curto', como).limit(20)),
    lista<Empresa>(digitos.length >= 4 ? db.from('empresas').select('*').eq('corretora_id', c).ilike('cnpj', `%${digitos}%`).limit(20) : nada),
    lista<Vida>(q.length >= 3 && !numero ? db.from('vidas').select('empresa_id, nome, competencia, seguradora_id, titular, situacao').eq('corretora_id', c).ilike('nome', como).order('competencia', { ascending: false }).limit(300) : nada),
    lista<Vida>(digitos.length === 11 ? db.from('vidas').select('empresa_id, nome, competencia, seguradora_id, titular, situacao').eq('corretora_id', c).ilike('cpf', `%${digitos}%`).order('competencia', { ascending: false }).limit(50) : nada),
    lista<Fatura>(digitos.length >= 4 ? db.from('faturas').select('*').eq('corretora_id', c).ilike('numero', `%${digitos}%`).is('excluido_em', null).order('competencia', { ascending: false }).limit(20) : nada),
    lista<Pedido>(db.from('pedidos').select('*').eq('corretora_id', c).ilike('protocolo', como).limit(15)),
    lista<CardQuadro>(db.from('quadro_cards').select('*').eq('corretora_id', c).eq('arquivado', false).ilike('titulo', como).limit(20)),
    lista<CardQuadro>(db.from('quadro_cards').select('*').eq('corretora_id', c).eq('arquivado', false).ilike('empresa_nome', como).limit(20)),
    lista<CardQuadro>(numero != null ? db.from('quadro_cards').select('*').eq('corretora_id', c).eq('numero', numero).limit(5) : nada),
  ]);
  const unicos = <T extends { id: string }>(...ls: T[][]) => [...new Map(ls.flat().map((x) => [x.id, x])).values()];
  const empresas = unicos(e1, e2, e3).sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.razao_social.localeCompare(b.razao_social)).slice(0, 25);
  const cards = unicos(k3, k1, k2).slice(0, 20);
  // a mesma pessoa aparece em vários meses: fica só a linha mais nova de cada pessoa em cada empresa
  const pessoas = [...new Map([...v2, ...v1].map((v) => [`${v.empresa_id}|${v.nome}`, v])).values()].slice(0, 40);
  const idsE = [...new Set([...pessoas.map((v) => v.empresa_id), ...f1.map((f) => f.empresa_id), ...p1.map((p) => p.empresa_id)])].filter(Boolean);
  const nomes = idsE.length ? await lista<Empresa>(db.from('empresas').select('*').in('id', idsE)) : [];
  const nomeE = (id: string) => { const e = nomes.find((x) => x.id === id) ?? empresas.find((x) => x.id === id); return e ? e.nome_curto || e.razao_social : '—'; };
  const total = empresas.length + pessoas.length + f1.length + p1.length + cards.length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Buscar</h1>
          <p>Uma busca só para empresa (nome, CNPJ), pessoa do plano (nome ou CPF), número de fatura, protocolo de pedido e card do Quadro.</p>
        </div>
      </div>
      <form className="busca-g" method="get" role="search">
        <input className="busca" type="search" name="q" defaultValue={q} placeholder="Digite o que procura" aria-label="Buscar em tudo" autoFocus enterKeyHint="search" />
        <button className="btn">Buscar</button>
      </form>

      {curto ? <p className="empty">Digite pelo menos 2 letras ou números.</p>
        : total === 0 ? <p className="empty">Nada encontrado para &quot;{q}&quot;. Tente só uma parte do nome, sem acento.</p> : (
        <div className="achados" style={{ display: 'grid', gap: '1rem' }}>
          {empresas.length > 0 && (
            <section className="card"><h2>Empresas ({empresas.length})</h2>
              <ul className="rows">{empresas.map((e) => (
                <li key={e.id}><Link href={`${base}/empresas/${e.id}`}><b>{e.nome_curto || e.razao_social}</b><small>{[e.razao_social, e.cnpj ? `CNPJ ${e.cnpj}` : null, e.codigo_interno, e.ativa ? null : 'inativa'].filter(Boolean).join(' · ')}</small></Link><span className="hint">abrir ficha</span></li>
              ))}</ul>
            </section>
          )}
          {pessoas.length > 0 && (
            <section className="card"><h2>Pessoas nos planos ({pessoas.length}{pessoas.length === 40 ? '+' : ''})</h2>
              <ul className="rows">{pessoas.map((v, i) => (
                <li key={i}><Link href={`/empresa/${v.empresa_id}/vidas?q=${encodeURIComponent(v.nome)}`}><b>{v.nome}</b><small>{nomeE(v.empresa_id)} · {seg(v.seguradora_id)} · {v.titular ? 'titular' : 'dependente'} · última fatura em que aparece: {competencia(String(v.competencia).trim())}{v.situacao && /exclu/i.test(v.situacao) ? ' · excluído' : ''}</small></Link><span className="hint">ver na empresa</span></li>
              ))}</ul>
            </section>
          )}
          {f1.length > 0 && (
            <section className="card"><h2>Faturas ({f1.length})</h2>
              <ul className="rows">{f1.map((f) => (
                <li key={f.id}><Link href={`${base}/empresas/${f.empresa_id}`}><b>nº {f.numero} · {nomeE(f.empresa_id)}</b><small>{competencia(String(f.competencia).trim())} · {seg(f.seguradora_id)}</small></Link><span className="r">{moeda(f.valor_boleto ?? f.valor_total)}</span></li>
              ))}</ul>
            </section>
          )}
          {p1.length > 0 && (
            <section className="card"><h2>Pedidos ({p1.length})</h2>
              <ul className="rows">{p1.map((p) => (
                <li key={p.id}><Link href={`${base}/pedidos/${p.id}`}><b>{p.protocolo} · {TIPO_PEDIDO[p.tipo]}</b><small>{nomeE(p.empresa_id)}{p.dados?.nome ? ` · ${p.dados.nome}` : ''}</small></Link><span className="hint">abrir pedido</span></li>
              ))}</ul>
            </section>
          )}
          {cards.length > 0 && (
            <section className="card"><h2>Cards do Quadro ({cards.length})</h2>
              <ul className="rows">{cards.map((k) => (
                <li key={k.id}><Link href={`${base}/quadro?card=${k.id}`}><b>#{k.numero} · {k.titulo}</b><small>{[k.empresa_nome, ROTULO_COLUNA[k.coluna]].filter(Boolean).join(' · ')}</small></Link><span className="hint">abrir card</span></li>
              ))}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
