import { cliente } from '@/lib/servidor';
import { AGENTE, CONFERENCIA_TIPO, data, MODO_ROTULO, ORDEM_ROTULO, ORDEM_TOM, quando, SEGURADORA, seg } from '@/lib/formato';
import { sinal } from '@/lib/contas';
import { alternarRotina, cancelarOrdem, criarOrdem, repetirOrdem } from '@/lib/acoes';
import { AutoAtualiza } from '@/components/AutoAtualiza';
import { Aviso } from '@/components/Aviso';
import { Pill } from '@/components/Pill';
import type { Agente, Conferencia, Corretora, Maquina, Ordem, Previsao, Rotina } from '@/lib/tipos';

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

export default async function Agentes({ searchParams }: P) {
  const sp = await searchParams;
  const db = await cliente();
  const mes = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: maquinas }, { data: rotinas }, { data: ordens }, { data: corretoras }, { data: rodadas }, { data: conferencias }, { data: agentes }, { data: previsao }] = await Promise.all([
    db.from('maquinas').select('*').order('nome'),
    db.from('rotinas').select('*').order('nome'),
    db.from('ordens_execucao').select('*').order('criada_em', { ascending: false }).limit(100),
    db.from('corretoras').select('*').eq('ativa', true).order('nome'),
    // custo dos últimos 30 dias: só o que terminou
    db.from('ordens_execucao').select('agente, modo, tokens_entrada, tokens_saida, custo_usd').in('status', ['concluida', 'erro']).gte('terminada_em', mes),
    db.from('conferencias').select('*').is('resolvida_em', null).order('competencia', { ascending: false }).order('gravidade', { ascending: false }).limit(200),
    db.from('agentes').select('*').order('agente').order('nome'),
    db.from('supervisor_previsao').select('*').order('esperado_em'),
  ]);
  const cs = (corretoras ?? []) as Corretora[];
  const nomeC = (id: string | null) => (id ? cs.find((c) => c.id === id)?.nome ?? '—' : 'Todas');
  const comp = new Date().toISOString().slice(0, 7);
  const os = (ordens ?? []) as Ordem[];
  const rodando = os.filter((o) => o.status === 'em_execucao');
  const fila = os.filter((o) => o.status === 'pendente');
  const esperando = os.filter((o) => o.status === 'aguardando_voce');
  const ontem = Date.now() - 864e5;
  const erros = os.filter((o) => o.status === 'erro' && new Date(o.terminada_em ?? o.criada_em).getTime() > ontem);
  const prontas = os.filter((o) => o.status === 'concluida' && new Date(o.terminada_em ?? o.criada_em).getTime() > ontem);
  const titulo = (o: Ordem) => `${AGENTE[o.agente] ?? o.agente}${o.seguradora_id ? ' · ' + seg(o.seguradora_id) : ''}${o.competencia ? ' · ' + o.competencia : ''}`;
  // Código roda sem tokens; o Claude só entra onde o código não resolve
  const rs = (rodadas ?? []) as Pick<Ordem, 'agente' | 'modo' | 'tokens_entrada' | 'tokens_saida' | 'custo_usd'>[];
  const emCodigo = rs.filter((r) => r.modo === 'codigo').length;
  const comClaude = rs.filter((r) => r.modo === 'claude' || r.modo === 'misto');
  const custo = rs.reduce((t, r) => t + Number(r.custo_usd ?? 0), 0);
  const tokens = rs.reduce((t, r) => t + (r.tokens_entrada ?? 0) + (r.tokens_saida ?? 0), 0);
  const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const como = (o: Ordem) => o.modo ? `${MODO_ROTULO[o.modo]}${o.custo_usd != null && o.modo !== 'codigo' ? ' · ' + usd(Number(o.custo_usd)) : ''}` : '—';
  const cf = (conferencias ?? []) as Conferencia[];
  const ags = (agentes ?? []) as Agente[];
  const pv = ((previsao ?? []) as Previsao[]).sort((a, b) => Number(b.atrasado) - Number(a.atrasado));
  const cfErros = cf.filter((c) => c.gravidade === 'erro').length;
  const sessao = (o: Ordem) => o.sessao_url ? <a className="go" href={o.sessao_url} target="_blank" rel="noreferrer">Ver passo a passo</a> : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Agentes</h1>
          <p>Os agentes rodam na nuvem do Claude (ou na máquina de operação). Cada um pega trabalho desta fila, grava aqui o andamento e deixa o link da sessão para você ver o que fez.</p>
        </div>
      </div>
      <AutoAtualiza />
      <Aviso sp={sp} />

      <div className="kpis">
        <div className="kpi"><span className="kpi-l">Rodando agora</span><span className="kpi-v">{rodando.length}</span><span className="kpi-s">{rodando.map(titulo).join(', ') || 'nenhum agente trabalhando'}</span></div>
        <div className="kpi"><span className="kpi-l">Na fila</span><span className="kpi-v">{fila.length}</span><span className="kpi-s">esperando a próxima rodada</span></div>
        <div className="kpi"><span className="kpi-l">Esperando você</span><span className="kpi-v" style={esperando.length ? { color: 'var(--warn-fg)' } : undefined}>{esperando.length}</span><span className="kpi-s">login, código ou aprovação</span></div>
        <div className="kpi"><span className="kpi-l">Custo em 30 dias</span><span className="kpi-v">{custo ? usd(custo) : 'US$ 0'}</span>
          <span className="kpi-s">{emCodigo} {emCodigo === 1 ? 'rodada' : 'rodadas'} em código (sem tokens) · {comClaude.length} com o Claude{tokens ? ` · ${tokens.toLocaleString('pt-BR')} tokens` : ''}</span></div>
        <div className="kpi"><span className="kpi-l">Últimas 24 h</span><span className="kpi-v">{prontas.length} <small style={{ fontSize: '.85rem', color: 'var(--muted)' }}>prontas</small></span><span className="kpi-s">{erros.length ? <b style={{ color: 'var(--bad-fg)' }}>{erros.length} com erro</b> : 'nenhum erro'}</span></div>
      </div>

      {(esperando.length > 0 || erros.length > 0 || rodando.length > 0) && (
        <section className="card">
          <div className="card-h"><h2>O que precisa de atenção</h2><span className="hint">atualiza sozinho a cada 30 segundos</span></div>
          <ul className="rows">
            {[...esperando, ...erros, ...rodando].map((o) => (
              <li key={o.id}>
                <div><b>{titulo(o)}</b><small>{nomeC(o.corretora_id)} · {o.mensagem ?? '—'} · {quando(o.iniciada_em ?? o.criada_em)}</small></div>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Pill tom={ORDEM_TOM[o.status]} vivo={o.status === 'em_execucao'}>{ORDEM_ROTULO[o.status]}</Pill>
                  {sessao(o)}
                  {o.status !== 'em_execucao' && (
                    <form action={repetirOrdem}><input type="hidden" name="id" value={o.id} /><button className="btn ghost">{o.status === 'erro' ? 'Tentar de novo' : 'Já resolvi, continuar'}</button></form>
                  )}
                  {o.status === 'aguardando_voce' && (
                    <form action={cancelarOrdem}><input type="hidden" name="id" value={o.id} /><button className="btn ghost">Cancelar</button></form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid g32">
        <section className="card">
          <div className="card-h"><h2>Pedir uma execução agora</h2></div>
          <form action={criarOrdem} className="form">
            <input type="hidden" name="de" value="/master/agentes" />
            <div className="linha">
              <label className="campo">Corretora
                <select name="corretora_id" required>{cs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </label>
              <label className="campo">Agente
                <select name="agente" required>
                  {['faturas', 'comissao', 'vidas', 'projecao', 'conferencia'].map((a) => <option key={a} value={a}>{AGENTE[a]}</option>)}
                </select>
              </label>
            </div>
            <div className="linha">
              <label className="campo">Seguradora
                <select name="seguradora_id" defaultValue=""><option value="">Todas</option>
                  {Object.entries(SEGURADORA).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
              </label>
              <label className="campo">Competência<input type="month" name="competencia" defaultValue={comp} /></label>
            </div>
            <label className="campo">Pasta ou arquivos no PC (opcional)
              <input name="local" placeholder="Ex.: C:\Users\bruno\Downloads\kits bradesco" />
              <small className="hint">Deixe em branco: Porto, Bradesco e Hapvida entram sozinhos no portal e baixam o que precisam. Preencha só para usar arquivos que já estão no PC (Faturas Bradesco: a pasta dos kits; Comissão: os arquivos do extrato, separados por ponto e vírgula).</small>
            </label>
            <div><button className="btn">Colocar na fila</button></div>
            <p className="note">Faturas sempre dispara Vidas em seguida, e Comissões sempre dispara Projeção. Faturas, Vidas e Comissões disparam também a Conferência. Projeção, Conferência e Supervisor rodam na nuvem, como código; os outros, no PC (o vigia pega em até 2 minutos). Você não precisa pedir: o Supervisor põe na fila o que estiver atrasado.</p>
          </form>
        </section>
        <section className="card">
          <div className="card-h"><h2>Máquinas</h2></div>
          <ul className="rows">
            {((maquinas ?? []) as Maquina[]).map((m) => {
              const st = sinal(m.ultimo_sinal);
              return (
                <li key={m.id}>
                  <div><b>{m.nome}</b><small>{m.descricao}</small></div>
                  <span className={`sinal ${st === 'on' ? '' : st}`}><i />{st === 'nunca' ? 'nunca ligou' : quando(m.ultimo_sinal!)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h2>Supervisor: o que ele está vigiando</h2>
          <span className="hint">a cada 30 min, das 7h às 20h · o que está atrasado vai sozinho para a fila (no máximo um pedido por dia para cada um)</span></div>
        {pv.length === 0 ? <p className="note">Ainda sem histórico suficiente para prever as próximas faturas e comissões.</p> : (
          <div className="tbl scroll">
            <table>
              <thead><tr><th>Agente</th><th>Seguradora</th><th>Corretora</th><th>Competência</th><th>Esperado em</th><th>Situação</th><th>Por quê</th></tr></thead>
              <tbody>
                {pv.map((p) => (
                  <tr key={`${p.corretora_id}-${p.agente}-${p.seguradora_id}-${p.competencia}`}>
                    <td><b>{AGENTE[p.agente] ?? p.agente}</b></td><td>{seg(p.seguradora_id)}</td><td>{nomeC(p.corretora_id)}</td><td>{p.competencia}</td>
                    <td>{data(p.esperado_em)}</td><td>{p.atrasado ? <Pill tom="warn">Atrasado</Pill> : <Pill tom="ok">Em dia</Pill>}</td><td>{p.motivo}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ags.length > 0 && (
          <>
            <h3 style={{ margin: '1rem 0 .5rem', fontSize: '.95rem' }}>Agentes cadastrados</h3>
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
          </>
        )}
      </section>

      <section className="card">
        <div className="card-h"><h2>Conferência: o que não bate</h2>
          <span className="hint">{cf.length ? `${cfErros} erros e ${cf.length - cfErros} avisos em aberto` : 'nada em aberto'} · roda sozinha depois de Faturas, Vidas e Comissões, sem gastar tokens</span></div>
        {cf.length === 0 ? <p className="note">A última conferência não achou divergência. O que for corrigido some daqui na próxima rodada.</p> : (
          <div className="tbl scroll">
            <table>
              <thead><tr><th>Competência</th><th>Corretora</th><th>Seguradora</th><th>O que é</th><th>Detalhe</th><th>Desde</th></tr></thead>
              <tbody>
                {cf.map((c) => (
                  <tr key={c.id}><td>{c.competencia}</td><td>{nomeC(c.corretora_id)}</td><td>{seg(c.seguradora_id)}</td>
                    <td><Pill tom={c.gravidade === 'erro' ? 'bad' : 'warn'}>{CONFERENCIA_TIPO[c.tipo] ?? c.tipo}</Pill></td>
                    <td>{c.mensagem}</td><td>{quando(c.primeira_vez)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-h"><h2>Rotinas com horário</h2></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Rotina</th><th>Agente</th><th>Corretora</th><th>Quando roda</th><th>Última vez</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {((rotinas ?? []) as Rotina[]).map((r) => (
                <tr key={r.id}><td><b>{r.nome}</b></td><td>{AGENTE[r.agente] ?? r.agente}</td><td>{nomeC(r.corretora_id)}</td><td>{agenda(r.agenda)}</td>
                  <td>{r.ultima_execucao ? quando(r.ultima_execucao) : '—'}</td>
                  <td>{r.ativa ? <Pill tom="ok">Ligada</Pill> : <Pill tom="idle">Pausada</Pill>}</td>
                  <td>
                    <form action={alternarRotina}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="ligar" value={r.ativa ? '0' : '1'} />
                      <button className="btn ghost">{r.ativa ? 'Pausar' : 'Ligar'}</button></form>
                  </td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-h"><h2>Fila e histórico</h2><span className="hint">últimas 100</span></div>
        <div className="tbl scroll">
          <table>
            <thead><tr><th>Agente</th><th>Corretora</th><th>Seguradora</th><th>Competência</th><th>Origem</th><th>Situação</th><th>Como rodou</th><th>Criada</th><th>Mensagem</th><th></th></tr></thead>
            <tbody>
              {os.map((o) => (
                <tr key={o.id}>
                  <td><b>{AGENTE[o.agente] ?? o.agente}</b></td><td>{nomeC(o.corretora_id)}</td><td>{seg(o.seguradora_id)}</td><td>{o.competencia ?? '—'}</td><td>{o.origem}</td>
                  <td><Pill tom={ORDEM_TOM[o.status]} vivo={o.status === 'em_execucao'}>{ORDEM_ROTULO[o.status]}</Pill></td><td>{como(o)}</td><td>{quando(o.criada_em)}</td><td>{o.mensagem ?? '—'}</td>
                  <td>{sessao(o) ?? (o.status === 'pendente' && (
                    <form action={cancelarOrdem}><input type="hidden" name="id" value={o.id} /><button className="btn ghost">Tirar da fila</button></form>
                  ))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Atualizado em {data(new Date().toISOString())}. A página se atualiza sozinha enquanto estiver aberta.</p>
      </section>
    </div>
  );
}
