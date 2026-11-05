import Link from 'next/link';
import { cliente } from '@/lib/servidor';
import { AGENTE, competencia, data, MODO_ROTULO, ORDEM_ROTULO, ORDEM_TOM, quando, SEGURADORA, seg } from '@/lib/formato';
import { sinal } from '@/lib/contas';
import { alternarRotina, cancelarOrdem, criarOrdem, ocultarOrdem, repetirOrdem } from '@/lib/acoes';
import { AutoAtualiza } from '@/components/AutoAtualiza';
import { Aviso } from '@/components/Aviso';
import { Pill } from '@/components/Pill';
import type { Agente, Corretora, LoginStatus, Maquina, Ordem, Previsao, Rotina } from '@/lib/tipos';

type P = { searchParams: Promise<Record<string, string | undefined>> };

// Traduz a agenda (cron) mais comum para português; o resto aparece como está
function agenda(c: string) {
  const [min, h, dia, , sem] = c.split(' ');
  if (min.startsWith('*/')) return `a cada ${min.slice(2)} min`;
  const hora = `${h}h${min !== '0' ? min.padStart(2, '0') : ''}`;
  if (dia !== '*') return `todo dia ${dia}, ${hora}`;
  if (sem === '1-5') return `dias úteis, ${hora}`;
  if (sem === '1') return `segundas, ${hora}`;
  return c;
}

const ABAS = [
  { id: 'historico', rotulo: 'Fila e histórico' },
  { id: 'supervisor', rotulo: 'Supervisor' },
  { id: 'rotinas', rotulo: 'Rotinas' },
  { id: 'maquinas', rotulo: 'Máquinas e custo' },
];

type Ultima = Pick<Ordem, 'agente' | 'seguradora_id' | 'status' | 'terminada_em' | 'criada_em' | 'mensagem'>;

export default async function Agentes({ searchParams }: P) {
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : 'historico';
  const aqui = `/master/agentes${aba !== 'historico' ? `?aba=${aba}` : ''}`;
  const db = await cliente();
  const mes = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: maquinas }, { data: rotinas }, { data: ordens }, { data: corretoras }, { data: rodadas }, { count: nAvisos }, { data: agentes }, { data: previsao }, { data: logins }, { data: ultimas }] = await Promise.all([
    db.from('maquinas').select('*').order('nome'),
    db.from('rotinas').select('*').order('nome'),
    db.from('ordens_execucao').select('*').is('oculta_em', null).order('criada_em', { ascending: false }).limit(100),
    db.from('corretoras').select('*').eq('ativa', true).order('nome'),
    // custo dos últimos 30 dias: só o que terminou
    db.from('ordens_execucao').select('agente, modo, tokens_entrada, tokens_saida, custo_usd').in('status', ['concluida', 'erro']).gte('terminada_em', mes),
    db.from('conferencias').select('id', { count: 'exact', head: true }).is('resolvida_em', null),
    db.from('agentes').select('*').order('agente').order('nome'),
    db.from('supervisor_previsao').select('*').order('esperado_em'),
    db.from('login_status').select('*'),
    // a última rodada de cada agente de seguradora (para o quadro do topo)
    db.from('ordens_execucao').select('agente, seguradora_id, status, terminada_em, criada_em, mensagem').is('oculta_em', null)
      .in('agente', ['faturas', 'comissao']).not('seguradora_id', 'is', null).neq('status', 'cancelada').order('criada_em', { ascending: false }).limit(300),
  ]);
  const cs = (corretoras ?? []) as Corretora[];
  const nomeC = (id: string | null) => (id ? cs.find((c) => c.id === id)?.nome ?? '—' : 'Todas');
  // mesma regra do Supervisor: até o dia 19 é a fatura do mês atual; do dia 20 em diante, a do mês seguinte
  const hoje = new Date(Date.now() - 3 * 36e5); // horário de Brasília
  const comp = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + (hoje.getUTCDate() >= 20 ? 1 : 0), 1)).toISOString().slice(0, 7);
  const os = (ordens ?? []) as Ordem[];
  const rodando = os.filter((o) => o.status === 'em_execucao');
  const fila = os.filter((o) => o.status === 'pendente');
  const esperando = os.filter((o) => o.status === 'aguardando_voce');
  const ontem = Date.now() - 864e5;
  const erros = os.filter((o) => o.status === 'erro' && new Date(o.terminada_em ?? o.criada_em).getTime() > ontem);
  const titulo = (o: Ordem) => `${AGENTE[o.agente] ?? o.agente}${o.seguradora_id ? ' · ' + seg(o.seguradora_id) : ''}${o.competencia ? ' · ' + o.competencia : ''}`;
  // Código roda sem tokens; o Claude só entra onde o código não resolve
  const rs = (rodadas ?? []) as Pick<Ordem, 'agente' | 'modo' | 'tokens_entrada' | 'tokens_saida' | 'custo_usd'>[];
  const emCodigo = rs.filter((r) => r.modo === 'codigo').length;
  const comClaude = rs.filter((r) => r.modo === 'claude' || r.modo === 'misto');
  const custo = rs.reduce((t, r) => t + Number(r.custo_usd ?? 0), 0);
  const tokens = rs.reduce((t, r) => t + (r.tokens_entrada ?? 0) + (r.tokens_saida ?? 0), 0);
  const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const como = (o: Ordem) => o.modo ? `${MODO_ROTULO[o.modo]}${o.custo_usd != null && o.modo !== 'codigo' ? ' · ' + usd(Number(o.custo_usd)) : ''}` : '—';
  const ags = (agentes ?? []) as Agente[];
  const pv = ((previsao ?? []) as Previsao[]).sort((a, b) => Number(b.atrasado) - Number(a.atrasado));
  const ls = (logins ?? []) as LoginStatus[];
  const ul = (ultimas ?? []) as Ultima[];
  const ms = (maquinas ?? []) as Maquina[];
  const pc = ms.find((m) => !/nuvem/i.test(m.nome));
  // corretora padrão do pedido: a que mais aparece na fila (a de verdade, não a demonstração)
  const vezes = (id: string) => os.filter((o) => o.corretora_id === id).length;
  const padrao = [...cs].sort((a, b) => vezes(b.id) - vezes(a.id))[0];
  const sessao = (o: Ordem) => o.sessao_url ? <a className="btn ghost sm" href={o.sessao_url} target="_blank" rel="noreferrer">Ver passo a passo</a> : null;

  // ---- quadro por seguradora: verde (em dia), amarelo (atenção), vermelho (parou), cinza (pausado) ----
  const segs = [...new Set(ags.filter((a) => a.seguradora_id && (a.agente === 'faturas' || a.agente === 'comissao')).map((a) => a.seguradora_id!))];
  const quadro = segs.map((s) => {
    const meus = ags.filter((a) => a.seguradora_id === s && (a.agente === 'faturas' || a.agente === 'comissao'));
    const ativos = meus.filter((a) => a.situacao === 'ativo');
    const ult = (ag: string) => ul.find((o) => o.agente === ag && o.seguradora_id === s);
    const okEm = (ag: string) => ul.find((o) => o.agente === ag && o.seguradora_id === s && o.status === 'concluida')?.terminada_em ?? null;
    const lgs = ls.filter((l) => l.seguradora_id === s);
    const caiu = lgs.length > 0 && !lgs.some((l) => l.ativa);
    const atrasado = pv.filter((p) => p.seguradora_id === s && p.atrasado);
    const parou = ativos.map((a) => ult(a.agente)).filter((o) => o && (o.status === 'erro' || o.status === 'aguardando_voce')) as Ultima[];
    const cor = ativos.length === 0 ? 'parado' : parou.length ? 'vermelho' : caiu || atrasado.length ? 'amarelo' : 'verde';
    const estado = cor === 'parado' ? 'Pausado' : cor === 'vermelho' ? `Parou: ${parou.map((o) => AGENTE[o.agente]).join(' e ')}`
      : caiu ? 'Login caído (entra sozinho na próxima vez)' : atrasado.length ? `Atrasado: ${atrasado.map((p) => AGENTE[p.agente] ?? p.agente).join(' e ')}` : 'Em dia';
    return { s, cor, estado, fat: okEm('faturas'), com: okEm('comissao'), lgs, motivo: parou[0]?.mensagem };
  }).sort((a, b) => ['vermelho', 'amarelo', 'verde', 'parado'].indexOf(a.cor) - ['vermelho', 'amarelo', 'verde', 'parado'].indexOf(b.cor));

  const precisa = [...esperando, ...erros];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Agentes</h1>
          <p>Peça o faturamento logo abaixo. O quadro mostra, por seguradora, se está tudo em dia.</p>
        </div>
      </div>
      <AutoAtualiza />
      <Aviso sp={sp} />

      <section className="card pedir">
        <div className="card-h"><h2>Solicitar faturamento</h2>
          <span className="hint">o PC pega em até 2 minutos · Faturas dispara Vidas e Comissões dispara Projeção sozinhos</span></div>
        <form action={criarOrdem} className="pedir-f">
          <input type="hidden" name="de" value={aqui} />
          {cs.length > 1 ? (
            <label className="campo">Corretora
              <select name="corretora_id" required defaultValue={padrao?.id}>{cs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            </label>
          ) : <input type="hidden" name="corretora_id" value={padrao?.id ?? ''} />}
          <label className="campo">Seguradora
            <select name="seguradora_id" required defaultValue=""><option value="" disabled>Escolha…</option>
              {Object.entries(SEGURADORA).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </label>
          <label className="campo">O quê
            <select name="agente" required defaultValue="faturas">
              <option value="faturas">Faturas (boletos e vidas)</option>
              <option value="comissao">Comissão</option>
            </select>
          </label>
          <label className="campo">Competência<input type="month" name="competencia" defaultValue={comp} /></label>
          <button className="btn">Solicitar</button>
        </form>
        <details className="mais">
          <summary>Rodar outro agente (Vidas, Projeção, Conferência)</summary>
          <form action={criarOrdem} className="pedir-f">
            <input type="hidden" name="de" value={aqui} />
            {cs.length > 1 ? (
              <label className="campo">Corretora
                <select name="corretora_id" required defaultValue={padrao?.id}>{cs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </label>
            ) : <input type="hidden" name="corretora_id" value={padrao?.id ?? ''} />}
            <label className="campo">Agente
              <select name="agente" required defaultValue="vidas">
                {['vidas', 'projecao', 'conferencia'].map((a) => <option key={a} value={a}>{AGENTE[a]}</option>)}
              </select>
            </label>
            <label className="campo">Seguradora
              <select name="seguradora_id" defaultValue=""><option value="">Todas</option>
                {Object.entries(SEGURADORA).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
            <label className="campo">Competência<input type="month" name="competencia" defaultValue={comp} /></label>
            <button className="btn ghost">Colocar na fila</button>
          </form>
        </details>
      </section>

      <section className="card">
        <div className="card-h"><h2>Seguradoras</h2>
          <span className="hint">
            {rodando.length ? `${rodando.length} rodando agora · ` : ''}{fila.length ? `${fila.length} na fila · ` : ''}
            PC {pc ? (sinal(pc.ultimo_sinal) === 'on' ? 'ligado' : 'sem sinal desde ' + (pc.ultimo_sinal ? quando(pc.ultimo_sinal) : 'sempre')) : '—'}
          </span></div>
        <div className="saude">
          {quadro.map((q) => (
            <div key={q.s} className={q.cor === 'verde' ? '' : q.cor}>
              <b>{seg(q.s)}</b>
              <span className="estado" style={{ color: q.cor === 'vermelho' ? 'var(--bad-fg)' : q.cor === 'amarelo' ? 'var(--warn-fg)' : q.cor === 'parado' ? 'var(--muted)' : 'var(--ok-fg)' }}>{q.estado}</span>
              <small>Faturas: {q.fat ? quando(q.fat) : 'nunca'} · Comissão: {q.com ? quando(q.com) : 'nunca'}</small>
              {q.lgs.length > 0 && <small>Login: {q.lgs.filter((l) => l.ativa).length} de {q.lgs.length} ativo{q.lgs.length > 1 ? 's' : ''}</small>}
              {q.motivo && <small title={q.motivo}>{q.motivo.length > 90 ? q.motivo.slice(0, 90) + '…' : q.motivo}</small>}
              {padrao && (
                <div className="acoes atalho">
                  {(['faturas', 'comissao'] as const).map((ag) => (
                    <form key={ag} action={criarOrdem}>
                      <input type="hidden" name="de" value={aqui} /><input type="hidden" name="corretora_id" value={padrao.id} />
                      <input type="hidden" name="seguradora_id" value={q.s} /><input type="hidden" name="agente" value={ag} /><input type="hidden" name="competencia" value={comp} />
                      <button className="btn ghost sm">{ag === 'faturas' ? 'Baixar faturas' : 'Baixar comissão'}</button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="note">Verde: em dia. Amarelo: login caído ou atraso (o Supervisor põe na fila sozinho). Vermelho: deu erro ou espera você. Cinza: pausado.{cs.length > 1 && padrao ? ` Os botões dos quadros pedem para ${padrao.nome}, competência ${competencia(comp)}.` : ` Os botões pedem a competência ${competencia(comp)}.`}
          {nAvisos ? <> A Conferência tem <Link href="/master/corrigir">{nAvisos} avisos em aberto</Link>.</> : null}</p>
      </section>

      {(precisa.length > 0 || rodando.length > 0) && (
        <section className="card">
          <div className="card-h"><h2>O que precisa de você</h2><span className="hint">atualiza sozinho a cada 30 segundos</span></div>
          <ul className="rows">
            {[...precisa, ...rodando].map((o) => (
              <li key={o.id}>
                <div><b>{titulo(o)}</b><small>{nomeC(o.corretora_id)} · {o.mensagem ?? '—'} · {quando(o.iniciada_em ?? o.criada_em)}</small></div>
                <div className="acoes" style={{ justifyContent: 'flex-end' }}>
                  <Pill tom={ORDEM_TOM[o.status]} vivo={o.status === 'em_execucao'}>{ORDEM_ROTULO[o.status]}</Pill>
                  {sessao(o)}
                  {o.status !== 'em_execucao' && (
                    <form action={repetirOrdem}><input type="hidden" name="id" value={o.id} /><button className="btn ghost sm">{o.status === 'erro' ? 'Tentar de novo' : 'Já resolvi, continuar'}</button></form>
                  )}
                  {o.status !== 'em_execucao' && (
                    <form action={ocultarOrdem}><input type="hidden" name="de" value={aqui} /><input type="hidden" name="id" value={o.id} /><button className="btn ghost sm">Tirar do histórico</button></form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="seg" aria-label="Mais detalhes">
        {ABAS.map((a) => <Link key={a.id} href={`/master/agentes${a.id === 'historico' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}>{a.rotulo}</Link>)}
      </nav>

      {aba === 'historico' && (
        <section className="card">
          <div className="card-h"><h2>Fila e histórico</h2><span className="hint">últimas 100 · &quot;Tirar&quot; só esconde daqui, não desfaz o que a rodada gravou</span></div>
          <div className="tbl scroll">
            <table>
              <thead><tr><th>Agente</th><th>Competência</th><th>Situação</th><th>Quando</th><th>Mensagem</th><th></th></tr></thead>
              <tbody>
                {os.map((o) => (
                  <tr key={o.id}>
                    <td><b>{AGENTE[o.agente] ?? o.agente}</b><small>{seg(o.seguradora_id)}{cs.length > 1 ? ` · ${nomeC(o.corretora_id)}` : ''} · {o.origem} · {como(o)}</small></td>
                    <td>{o.competencia ? competencia(o.competencia) : '—'}</td>
                    <td><Pill tom={ORDEM_TOM[o.status]} vivo={o.status === 'em_execucao'}>{ORDEM_ROTULO[o.status]}</Pill></td>
                    <td>{quando(o.criada_em)}</td><td>{o.mensagem ?? '—'}</td>
                    <td><div className="acoes">{sessao(o)}
                      {o.status === 'pendente' && (
                        <form action={cancelarOrdem}><input type="hidden" name="id" value={o.id} /><button className="btn ghost sm">Tirar da fila</button></form>
                      )}
                      {o.status !== 'pendente' && o.status !== 'em_execucao' && (
                        <form action={ocultarOrdem}><input type="hidden" name="de" value={aqui} /><input type="hidden" name="id" value={o.id} /><button className="btn ghost sm">Tirar</button></form>
                      )}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {aba === 'supervisor' && (
        <section className="card">
          <div className="card-h"><h2>O que o Supervisor está vigiando</h2>
            <span className="hint">a cada 30 min, das 7h às 20h · o que atrasar vai sozinho para a fila</span></div>
          {pv.length === 0 ? <p className="note">Ainda sem histórico suficiente para prever as próximas faturas e comissões.</p> : (
            <div className="tbl scroll">
              <table>
                <thead><tr><th>Agente</th><th>Seguradora</th><th>Competência</th><th>Esperado em</th><th>Situação</th><th>Por quê</th></tr></thead>
                <tbody>
                  {pv.map((p) => (
                    <tr key={`${p.corretora_id}-${p.agente}-${p.seguradora_id}-${p.competencia}`}>
                      <td><b>{AGENTE[p.agente] ?? p.agente}</b></td><td>{seg(p.seguradora_id)}</td><td>{p.competencia}</td>
                      <td>{data(p.esperado_em)}</td><td>{p.atrasado ? <Pill tom="warn">Atrasado</Pill> : <Pill tom="ok">Em dia</Pill>}</td><td>{p.motivo}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ags.length > 0 && (
            <details className="fold" style={{ marginTop: '1rem' }}>
              <summary><h2>Agentes cadastrados</h2><span className="hint">{ags.length}</span></summary>
              <div className="tbl scroll">
                <table>
                  <thead><tr><th>Agente</th><th>Onde roda</th><th>Sozinho?</th><th>De onde vêm os dados</th><th>Situação</th></tr></thead>
                  <tbody>
                    {ags.map((a) => (
                      <tr key={a.id}><td><b>{a.nome}</b>{a.cobre?.length ? <small> · também {a.cobre.map(seg).join(', ')}</small> : null}</td>
                        <td>{a.onde === 'nuvem' ? 'Nuvem' : 'PC'}</td><td>{a.automatico ? 'Sim' : 'Precisa de alguém'}</td><td>{a.como ?? '—'}</td>
                        <td>{a.situacao === 'ativo' ? <Pill tom="ok">Ativo</Pill> : a.situacao === 'rascunho' ? <Pill tom="warn">Rascunho{a.criado_por === 'supervisor' ? ' (criado pelo supervisor)' : ''}</Pill> : <Pill tom="idle">Pausado</Pill>}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      )}

      {aba === 'rotinas' && (
        <section className="card">
          <div className="card-h"><h2>Rotinas com horário</h2></div>
          <div className="tbl">
            <table>
              <thead><tr><th>Rotina</th><th>Agente</th><th>Quando roda</th><th>Última vez</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {((rotinas ?? []) as Rotina[]).map((r) => (
                  <tr key={r.id}><td><b>{r.nome}</b><small>{nomeC(r.corretora_id)}</small></td><td>{AGENTE[r.agente] ?? r.agente}</td><td>{agenda(r.agenda)}</td>
                    <td>{r.ultima_execucao ? quando(r.ultima_execucao) : '—'}</td>
                    <td>{r.ativa ? <Pill tom="ok">Ligada</Pill> : <Pill tom="idle">Pausada</Pill>}</td>
                    <td>
                      <form action={alternarRotina}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="ligar" value={r.ativa ? '0' : '1'} />
                        <button className="btn ghost sm">{r.ativa ? 'Pausar' : 'Ligar'}</button></form>
                    </td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {aba === 'maquinas' && (
        <section className="card">
          <div className="card-h"><h2>Máquinas e custo</h2></div>
          <ul className="rows">
            {ms.map((m) => {
              const st = sinal(m.ultimo_sinal);
              return (
                <li key={m.id}>
                  <div><b>{m.nome}</b><small>{m.descricao}</small></div>
                  <span className={`sinal ${st === 'on' ? '' : st}`}><i />{st === 'nunca' ? 'nunca ligou' : quando(m.ultimo_sinal!)}</span>
                </li>
              );
            })}
            <li>
              <div><b>Custo em 30 dias: {custo ? usd(custo) : 'US$ 0'}</b>
                <small>{emCodigo} {emCodigo === 1 ? 'rodada' : 'rodadas'} em código (sem tokens) · {comClaude.length} com o Claude{tokens ? ` · ${tokens.toLocaleString('pt-BR')} tokens` : ''}</small></div>
            </li>
          </ul>
        </section>
      )}

    </div>
  );
}
