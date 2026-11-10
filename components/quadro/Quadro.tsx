'use client';
// Quadro de tarefas da equipe (estilo Trello): arrastar os cards entre as colunas, cor pelo tipo de demanda,
// ordem pela prioridade (urgente sempre em cima) e um painel para quem faz a gestão.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { arquivarCard, comentarCard, moverCard, salvarCard } from '@/lib/acoes-quadro';
import {
  COLUNAS, PRIORIDADES, ROTULO_COLUNA, diasDesde, iniciais, nomeCurto, tamanho,
  type ArquivoCard, type CardQuadro, type EmailCard, type Coluna, type EventoCard, type Pessoa, type TipoDemanda,
} from '@/lib/quadro';

type Props = { c: string; equipe: Pessoa[]; tipos: TipoDemanda[]; cards: CardQuadro[]; eventos: EventoCard[]; emails: EmailCard[]; arquivos: ArquivoCard[]; agora: number;
  /** a pessoa da equipe que está olhando (pelo e-mail do login), para "Minhas tarefas" */ eu?: string | null;
  soInicial?: Filtro['so']; cardInicial?: string | null };
type Filtro = { pessoa: string; tipo: string; busca: string; so: '' | 'urgentes' | 'atrasados' | 'parados' };
const PARADO_DIAS = 3;

const hojeISO = (agora: number) => new Date(agora - 3 * 3600000).toISOString().slice(0, 10); // dia em Brasília
const dataCurta = (d: string) => { const [, m, dia] = d.split('-'); return `${dia}/${m}`; };
const quandoLongo = (iso: string) => {
  const d = new Date(iso), o = { timeZone: 'America/Sao_Paulo' } as const;
  return `${d.toLocaleDateString('pt-BR', { ...o, day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { ...o, hour: '2-digit', minute: '2-digit' })}`;
};
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function Quadro({ c, equipe, tipos, cards, eventos, emails, arquivos, agora, eu = null, soInicial = '', cardInicial = null }: Props) {
  const router = useRouter();
  const [lista, setLista] = useState(cards);
  useEffect(() => setLista(cards), [cards]);
  const [f, setF] = useState<Filtro>({ pessoa: '', tipo: '', busca: '', so: soInicial });
  const [aberto, setAberto] = useState<string | null>(cardInicial); // id do card, 'novo' ou null
  const [novoEm, setNovoEm] = useState<Coluna>('entrada');
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Coluna | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = hojeISO(agora);
  const pessoa = (id: string | null) => equipe.find((p) => p.id === id) ?? null;
  const tipo = (id: string | null) => tipos.find((t) => t.id === id) ?? null;
  const atrasado = (x: CardQuadro) => x.coluna !== 'feito' && !!x.prazo && x.prazo < hoje;
  const parado = (x: CardQuadro) => x.coluna !== 'feito' && diasDesde(x.coluna_desde, agora) >= PARADO_DIAS;

  const visiveis = useMemo(() => {
    const b = f.busca.trim().toLowerCase();
    return lista.filter((x) =>
      (!f.pessoa || (f.pessoa === '-' ? !x.responsavel_id : x.responsavel_id === f.pessoa || x.apoio_id === f.pessoa)) &&
      (!f.tipo || x.tipo_id === f.tipo) &&
      (!f.so || (f.so === 'urgentes' ? x.prioridade === 1 && x.coluna !== 'feito' : f.so === 'atrasados' ? atrasado(x) : parado(x))) &&
      (!b || `#${x.numero} ${x.titulo} ${x.empresa_nome ?? ''} ${x.seguradora ?? ''} ${x.descricao ?? ''}`.toLowerCase().includes(b)));
  }, [lista, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const daColuna = (col: Coluna) => visiveis.filter((x) => x.coluna === col).sort((a, b) => a.prioridade - b.prioridade || a.ordem - b.ordem);

  // painel da gestão: só o que não está feito
  const abertos = lista.filter((x) => x.coluna !== 'feito');
  const porPessoa = equipe.map((p) => ({ p, n: abertos.filter((x) => x.responsavel_id === p.id).length, urg: abertos.filter((x) => x.responsavel_id === p.id && x.prioridade === 1).length }));
  const semDono = abertos.filter((x) => !x.responsavel_id).length;
  const maxN = Math.max(1, ...porPessoa.map((x) => x.n), semDono);

  async function soltar(col: Coluna, antesDe: string | null) {
    const id = arrastando;
    setArrastando(null); setSobre(null);
    if (!id) return;
    const card = lista.find((x) => x.id === id);
    if (!card) return;
    const fila = lista.filter((x) => x.coluna === col && x.id !== id).sort((a, b) => a.prioridade - b.prioridade || a.ordem - b.ordem);
    let ordem: number;
    const i = antesDe ? fila.findIndex((x) => x.id === antesDe) : -1;
    if (i < 0) ordem = (fila.at(-1)?.ordem ?? agora / 1000) + 1;
    else ordem = i === 0 ? fila[0].ordem - 1 : (fila[i - 1].ordem + fila[i].ordem) / 2;
    if (card.coluna === col && card.ordem === ordem) return;
    const antes = lista;
    setLista(lista.map((x) => (x.id === id ? { ...x, coluna: col, ordem, coluna_desde: x.coluna === col ? x.coluna_desde : new Date().toISOString() } : x)));
    const r = await moverCard(c, id, col, ordem);
    if (r.erro) { setLista(antes); setErro(r.erro); return; }
    router.refresh();
  }

  const filtrado = !!(f.pessoa || f.tipo || f.busca || f.so);
  const cardAberto = aberto && aberto !== 'novo' ? lista.find((x) => x.id === aberto) ?? null : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Quadro da equipe</h1>
          <p>Arraste os cards entre as colunas. A cor mostra o tipo de demanda e o urgente fica sempre em cima. Clique num card para ver o histórico e mudar responsável, prazo ou prioridade.</p>
        </div>
        <div className="acoes"><button className="btn" onClick={() => { setNovoEm('entrada'); setAberto('novo'); }}>+ Novo card</button></div>
      </div>

      {erro && <p className="msg erro" role="alert">{erro} <button className="lnk" onClick={() => setErro(null)}>Fechar</button></p>}

      <section className="qd-painel" aria-label="Resumo do quadro">
        <div className="qd-kpis">
          <button className={`qd-kpi${f.so === '' && !filtrado ? ' on' : ''}`} onClick={() => setF({ pessoa: '', tipo: '', busca: '', so: '' })}>
            <span>Em aberto</span><b>{abertos.length}</b></button>
          <button className={`qd-kpi urg${f.so === 'urgentes' ? ' on' : ''}`} onClick={() => setF({ ...f, so: f.so === 'urgentes' ? '' : 'urgentes' })}>
            <span>Urgentes</span><b>{abertos.filter((x) => x.prioridade === 1).length}</b></button>
          <button className={`qd-kpi atr${f.so === 'atrasados' ? ' on' : ''}`} onClick={() => setF({ ...f, so: f.so === 'atrasados' ? '' : 'atrasados' })}>
            <span>Prazo vencido</span><b>{abertos.filter(atrasado).length}</b></button>
          <button className={`qd-kpi par${f.so === 'parados' ? ' on' : ''}`} onClick={() => setF({ ...f, so: f.so === 'parados' ? '' : 'parados' })}>
            <span>Parados há {PARADO_DIAS}+ dias</span><b>{abertos.filter(parado).length}</b></button>
        </div>
        <div className="qd-pessoas" aria-label="Cards em aberto por pessoa">
          {porPessoa.map(({ p, n, urg }) => (
            <button key={p.id} className={`qd-pes${f.pessoa === p.id ? ' on' : ''}`} onClick={() => setF({ ...f, pessoa: f.pessoa === p.id ? '' : p.id })} title={p.funcao ?? undefined}>
              <span className="qd-av">{iniciais(p)}</span>
              <span className="qd-pes-n">{nomeCurto(p)}</span>
              <span className="qd-bar"><i style={{ width: `${(n / maxN) * 100}%` }} /></span>
              <span className="qd-pes-v">{n}{urg > 0 && <em> · {urg} urg.</em>}</span>
            </button>
          ))}
          {semDono > 0 && (
            <button className={`qd-pes${f.pessoa === '-' ? ' on' : ''}`} onClick={() => setF({ ...f, pessoa: f.pessoa === '-' ? '' : '-' })}>
              <span className="qd-av vazio">?</span><span className="qd-pes-n">Sem responsável</span>
              <span className="qd-bar"><i style={{ width: `${(semDono / maxN) * 100}%` }} /></span><span className="qd-pes-v">{semDono}</span>
            </button>
          )}
        </div>
      </section>

      <div className="qd-filtros acoes">
        {eu && <button className={`btn sm${f.pessoa === eu ? '' : ' ghost'}`} aria-pressed={f.pessoa === eu} onClick={() => setF({ ...f, pessoa: f.pessoa === eu ? '' : eu })}>Minhas tarefas ({abertos.filter((x) => x.responsavel_id === eu || x.apoio_id === eu).length})</button>}
        <input type="search" placeholder="Buscar empresa, assunto ou nº" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} aria-label="Buscar" />
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} aria-label="Tipo de demanda">
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <select value={f.pessoa} onChange={(e) => setF({ ...f, pessoa: e.target.value })} aria-label="Pessoa">
          <option value="">Toda a equipe</option>
          {equipe.map((p) => <option key={p.id} value={p.id}>{nomeCurto(p)}</option>)}
          <option value="-">Sem responsável</option>
        </select>
        {filtrado && <button className="btn sm ghost" onClick={() => setF({ pessoa: '', tipo: '', busca: '', so: '' })}>Limpar filtros</button>}
      </div>

      <ul className="qd-leg" aria-label="Cores dos tipos de demanda">
        {tipos.map((t) => (
          <li key={t.id}><button className={f.tipo === t.id ? 'on' : ''} onClick={() => setF({ ...f, tipo: f.tipo === t.id ? '' : t.id })}>
            <i style={{ background: t.cor }} />{t.nome}</button></li>
        ))}
      </ul>

      <div className="qd-board">
        {COLUNAS.map((col) => {
          const cs = daColuna(col.id);
          return (
            <section key={col.id} className={`qd-col${sobre === col.id ? ' sobre' : ''}`} aria-label={col.rotulo}
              onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSobre(col.id); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null); }}
              onDrop={(e) => { e.preventDefault(); soltar(col.id, null); }}>
              <header className="qd-col-h">
                <div><h2>{col.rotulo}</h2><p>{col.dica}</p></div>
                <span className="qd-n">{cs.length}</span>
              </header>
              <div className="qd-cards">
                {cs.map((x) => {
                  const t = tipo(x.tipo_id), resp = pessoa(x.responsavel_id), pr = PRIORIDADES.find((p) => p.n === x.prioridade)!;
                  const dias = diasDesde(x.coluna_desde, agora);
                  return (
                    <article key={x.id} className={`qd-card${arrastando === x.id ? ' arrastando' : ''}`} style={{ ['--tipo' as string]: t?.cor ?? 'var(--line)' }}
                      draggable onDragStart={(e) => { setArrastando(x.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.id); }}
                      onDragEnd={() => { setArrastando(null); setSobre(null); }}
                      onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSobre(col.id); } }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); soltar(col.id, x.id); }}>
                      <button className="qd-card-b" onClick={() => setAberto(x.id)}>
                        <span className="qd-card-top">
                          <span className="qd-tipo"><i />{t?.nome ?? 'Sem tipo'}</span>
                          <span className="qd-num">#{x.numero}</span>
                        </span>
                        <span className="qd-tit">{x.titulo}</span>
                        {(x.empresa_nome || x.seguradora) && <span className="qd-meta">{[x.empresa_nome, x.seguradora].filter(Boolean).join(' · ')}</span>}
                        {x.proximo_passo && x.coluna !== 'feito' && <span className="qd-prox">Próximo: {x.proximo_passo}</span>}
                        <span className="qd-pe">
                          <span className={`qd-pr ${pr.classe}`}>{pr.rotulo}</span>
                          {x.prazo && x.coluna !== 'feito' && (
                            <span className={`qd-prazo${x.prazo < hoje ? ' venc' : x.prazo === hoje ? ' hoje' : ''}`}>{x.prazo < hoje ? 'Venceu ' : x.prazo === hoje ? 'Hoje ' : 'Até '}{dataCurta(x.prazo)}</span>
                          )}
                          {x.coluna !== 'feito' && dias >= PARADO_DIAS && <span className="qd-parado">parado {dias} d</span>}
                          {x.origem === 'email' && <span className="qd-orig" title="Criado pelo e-mail">e-mail</span>}
                          {(() => {
                            const ne = emails.filter((m) => m.card_id === x.id).length, na = arquivos.filter((a) => a.card_id === x.id && a.tipo === 'anexo').length;
                            return (ne > 0 || na > 0) && <span className="qd-cont" title={`${ne} e-mail(s) e ${na} anexo(s)`}>{ne > 0 && `✉ ${ne}`}{ne > 0 && na > 0 && ' · '}{na > 0 && `📎 ${na}`}</span>;
                          })()}
                          <span className="qd-av sm" title={nomeCurto(resp)}>{iniciais(resp)}</span>
                        </span>
                      </button>
                    </article>
                  );
                })}
                {cs.length === 0 && <p className="qd-vazio">{arrastando ? 'Solte aqui' : 'Nenhum card'}</p>}
              </div>
              {col.id !== 'feito' && <button className="qd-add" onClick={() => { setNovoEm(col.id); setAberto('novo'); }}>+ Adicionar card</button>}
            </section>
          );
        })}
      </div>

      {aberto && (
        <Detalhe key={aberto} c={c} card={cardAberto} colunaNova={novoEm} equipe={equipe} tipos={tipos}
          eventos={cardAberto ? eventos.filter((e) => e.card_id === cardAberto.id) : []}
          emails={cardAberto ? emails.filter((e) => e.card_id === cardAberto.id) : []}
          arquivos={cardAberto ? arquivos.filter((a) => a.card_id === cardAberto.id) : []}
          fechar={() => setAberto(null)} />
      )}
    </div>
  );
}

function Detalhe({ c, card, colunaNova, equipe, tipos, eventos, emails, arquivos, fechar }: {
  c: string; card: CardQuadro | null; colunaNova: Coluna; equipe: Pessoa[]; tipos: TipoDemanda[]; eventos: EventoCard[];
  emails: EmailCard[]; arquivos: ArquivoCard[]; fechar: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState({
    titulo: card?.titulo ?? '', tipo_id: card?.tipo_id ?? '', coluna: card?.coluna ?? colunaNova, prioridade: String(card?.prioridade ?? 3),
    responsavel_id: card?.responsavel_id ?? '', apoio_id: card?.apoio_id ?? '', empresa_nome: card?.empresa_nome ?? '', seguradora: card?.seguradora ?? '',
    prazo: card?.prazo ?? '', proximo_passo: card?.proximo_passo ?? '', descricao: card?.descricao ?? '', resumo: card?.resumo ?? '',
  });
  const [coment, setComent] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [fechar]);

  const muda = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setV((o) => {
      const n = { ...o, [k]: val };
      // tipo escolhido e ninguém responsável ainda: já sugere quem cuida desse tipo
      if (k === 'tipo_id' && !o.responsavel_id) n.responsavel_id = tipos.find((t) => t.id === val)?.responsavel_padrao ?? '';
      return n;
    });
  };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(null);
    const r = await salvarCard(c, card?.id ?? null, { ...v, prioridade: Number(v.prioridade) });
    setSalvando(false);
    if (r.erro) { setErro(r.erro); return; }
    router.refresh(); fechar();
  }
  async function comentar() {
    if (!card) return;
    setSalvando(true); setErro(null);
    const r = await comentarCard(c, card.id, coment);
    setSalvando(false);
    if (r.erro) { setErro(r.erro); return; }
    setComent(''); router.refresh();
  }
  async function arquivar() {
    if (!card) return;
    setSalvando(true);
    const r = await arquivarCard(c, card.id);
    setSalvando(false);
    if (r.erro) { setErro(r.erro); return; }
    router.refresh(); fechar();
  }
  const tipoSel = tipos.find((t) => t.id === v.tipo_id);

  return (
    <div className="qd-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="qd-modal" role="dialog" aria-modal="true" aria-label={card ? `Card #${card.numero}` : 'Novo card'} style={{ ['--tipo' as string]: tipoSel?.cor ?? 'var(--line)' }}>
        <header className="qd-modal-h">
          <div>
            <span className="hint">{card ? `Card #${card.numero} · ${ROTULO_COLUNA[card.coluna]}` : 'Novo card'}</span>
            <h2>{card ? card.titulo : 'O que precisa ser feito?'}</h2>
          </div>
          <button className="btn sm ghost" onClick={fechar} aria-label="Fechar">Fechar</button>
        </header>
        {card?.origem === 'exemplo' && <p className="msg aviso">Card de exemplo montado a partir dos e-mails. Confira com a equipe se ainda está pendente.</p>}
        {card?.email_assunto && <p className="hint">E-mail: {card.email_assunto}</p>}
        {erro && <p className="msg erro" role="alert">{erro}</p>}

        {card && (card.resumo || emails.length > 0 || arquivos.length > 0) && (
          <Conversa card={card} emails={emails} arquivos={arquivos} />
        )}

        <form className="form" onSubmit={salvar}>
          <label className="campo">Título<input value={v.titulo} onChange={muda('titulo')} placeholder="Empresa: o que é" required autoFocus={!card} /></label>
          <div className="linha">
            <label className="campo">Tipo de demanda
              <select value={v.tipo_id} onChange={muda('tipo_id')}>
                <option value="">Sem tipo</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </label>
            <label className="campo">Prioridade
              <select value={v.prioridade} onChange={muda('prioridade')}>
                {PRIORIDADES.map((p) => <option key={p.n} value={p.n}>{p.rotulo}</option>)}
              </select>
            </label>
            <label className="campo">Coluna
              <select value={v.coluna} onChange={muda('coluna')}>
                {COLUNAS.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
              </select>
            </label>
          </div>
          <div className="linha">
            <label className="campo">Responsável
              <select value={v.responsavel_id} onChange={muda('responsavel_id')}>
                <option value="">Ninguém ainda</option>
                {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label className="campo">Apoio
              <select value={v.apoio_id} onChange={muda('apoio_id')}>
                <option value="">Ninguém</option>
                {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label className="campo">Prazo<input type="date" value={v.prazo} onChange={muda('prazo')} /></label>
          </div>
          <div className="linha">
            <label className="campo">Empresa<input value={v.empresa_nome} onChange={muda('empresa_nome')} /></label>
            <label className="campo">Seguradora<input value={v.seguradora} onChange={muda('seguradora')} /></label>
          </div>
          <label className="campo">Próximo passo<input value={v.proximo_passo} onChange={muda('proximo_passo')} placeholder="O que falta fazer agora" /></label>
          <label className="campo">Detalhes<textarea value={v.descricao} onChange={muda('descricao')} /></label>
          <details className="dobra qd-ed-resumo" open={!card?.resumo && !!card && emails.length > 0}>
            <summary className="lnk">{card?.resumo ? 'Corrigir o resumo da conversa' : 'Escrever um resumo da conversa'}</summary>
            <label className="campo">Resumo da conversa<small>O Claude escreve e atualiza pelos e-mails. Se corrigir aqui, vale a sua versão até o próximo e-mail.</small>
              <textarea value={v.resumo} onChange={muda('resumo')} rows={6} /></label>
          </details>
          <div className="acoes">
            <button className="btn" disabled={salvando}>{card ? 'Salvar' : 'Criar card'}</button>
            {card && <button type="button" className="btn perigo" disabled={salvando} onClick={arquivar}>Tirar do quadro</button>}
          </div>
        </form>

        {card && (
          <section className="qd-hist" aria-label="Histórico">
            <h3>Histórico</h3>
            <div className="qd-coment">
              <textarea value={coment} onChange={(e) => setComent(e.target.value)} placeholder="Escreva um comentário" aria-label="Comentário" />
              <button className="btn sm" type="button" disabled={salvando || !coment.trim()} onClick={comentar}>Comentar</button>
            </div>
            <ul>
              {eventos.map((e) => (
                <li key={e.id} className={`qd-ev ${e.tipo}`}>
                  <span className="qd-ev-q">{quando(e.em)}{e.autor_nome ? ` · ${e.autor_nome}` : ''}</span>
                  <span>{e.texto}</span>
                </li>
              ))}
              {eventos.length === 0 && <li className="empty">Nada ainda.</li>}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

// Resumo do que foi conversado, os e-mails do assunto (com o e-mail inteiro para conferir) e os anexos
function Conversa({ card, emails, arquivos }: { card: CardQuadro; emails: EmailCard[]; arquivos: ArquivoCard[] }) {
  const doEmail = (id: string | null) => arquivos.filter((a) => a.email_id === id);
  const soltos = arquivos.filter((a) => !a.email_id || !emails.some((m) => m.id === a.email_id));
  const anexos = arquivos.filter((a) => a.tipo === 'anexo');
  const recebido = (id: string | null) => { const em = emails.find((m) => m.id === id)?.em; return em ? quandoLongo(em).slice(0, 10) : null; };
  const link = (a: ArquivoCard) => (
    <a key={a.id} className={`qd-arq ${a.tipo}`} href={`/quadro-arquivo/${a.id}`} target="_blank" rel="noopener">
      <span aria-hidden="true">{a.tipo === 'email' ? '✉' : '📎'}</span>{a.tipo === 'email' ? 'E-mail completo' : a.nome}
      {a.tipo === 'anexo' && recebido(a.email_id) && <small>recebido {recebido(a.email_id)}</small>}
      {a.tamanho != null && <small>{tamanho(a.tamanho)}</small>}
    </a>
  );
  return (
    <section className="qd-conv" aria-label="Conversa por e-mail">
      {card.resumo && (
        <div className="qd-resumo">
          <h3>Resumo da conversa</h3>
          <p>{card.resumo}</p>
          {card.resumo_em && <span className="hint">Atualizado em {quando(card.resumo_em)}</span>}
        </div>
      )}
      {anexos.length > 0 && (
        <div>
          <h3>Anexos ({anexos.length})</h3>
          <div className="qd-arqs">{anexos.map(link)}</div>
        </div>
      )}
      {emails.length > 0 && (
        <details className="dobra qd-emails">
          <summary><h3>E-mails do assunto ({emails.length}) <span className="lnk">ver</span></h3>
            {emails.some((m) => m.em) && (() => {
              const ds = emails.map((m) => m.em).filter(Boolean).sort() as string[];
              return <span className="hint">Do primeiro, em {quandoLongo(ds[0])}, ao último, em {quandoLongo(ds[ds.length - 1])}</span>;
            })()}
          </summary>
          <ul>
            {emails.map((m) => (
              <li key={m.id}>
                <div className="qd-em-h">
                  <b>{m.de ?? 'Sem remetente'}</b>
                  {m.em && <span className="qd-em-d">Recebido em {quandoLongo(m.em)}</span>}
                </div>
                {m.assunto && <span className="qd-em-a">{m.assunto}</span>}
                {(m.para || m.cc) && <span className="hint">Para: {m.para}{m.cc ? ` · Cc: ${m.cc}` : ''}</span>}
                {m.trecho && <p className="qd-em-t">{m.trecho}</p>}
                {doEmail(m.id).length > 0 && <div className="qd-arqs">{doEmail(m.id).map(link)}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {soltos.filter((a) => a.tipo === 'email').length > 0 && <div className="qd-arqs">{soltos.filter((a) => a.tipo === 'email').map(link)}</div>}
    </section>
  );
}
