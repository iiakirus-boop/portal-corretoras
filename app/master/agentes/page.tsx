import { cliente } from '@/lib/servidor';
import { AGENTE, data, ORDEM_ROTULO, ORDEM_TOM, quando, SEGURADORA, seg } from '@/lib/formato';
import { sinal } from '@/lib/contas';
import { alternarRotina, cancelarOrdem, criarOrdem, repetirOrdem } from '@/lib/acoes';
import { AutoAtualiza } from '@/components/AutoAtualiza';
import { Aviso } from '@/components/Aviso';
import { Pill } from '@/components/Pill';
import type { Corretora, Maquina, Ordem, Rotina } from '@/lib/tipos';

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
  const [{ data: maquinas }, { data: rotinas }, { data: ordens }, { data: corretoras }] = await Promise.all([
    db.from('maquinas').select('*').order('nome'),
    db.from('rotinas').select('*').order('nome'),
    db.from('ordens_execucao').select('*').order('criada_em', { ascending: false }).limit(100),
    db.from('corretoras').select('*').eq('ativa', true).order('nome'),
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
                  <Pill tom={ORDEM_TOM[o.status]}>{ORDEM_ROTULO[o.status]}</Pill>
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
                  {['faturas', 'comissao', 'vidas', 'projecao'].map((a) => <option key={a} value={a}>{AGENTE[a]}</option>)}
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
              <small className="hint">Faturas Bradesco: a pasta dos kits. Comissão: os arquivos do extrato, separados por ponto e vírgula. Sem isso, o PC deixa o pedido esperando alguém entrar no portal.</small>
            </label>
            <div><button className="btn">Colocar na fila</button></div>
            <p className="note">Faturas sempre dispara Vidas em seguida, e Comissões sempre dispara Projeção. Projeção roda na nuvem; os outros, no PC (o vigia pega em até 2 minutos).</p>
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
            <thead><tr><th>Agente</th><th>Corretora</th><th>Seguradora</th><th>Competência</th><th>Origem</th><th>Situação</th><th>Criada</th><th>Mensagem</th><th></th></tr></thead>
            <tbody>
              {os.map((o) => (
                <tr key={o.id}>
                  <td><b>{AGENTE[o.agente] ?? o.agente}</b></td><td>{nomeC(o.corretora_id)}</td><td>{seg(o.seguradora_id)}</td><td>{o.competencia ?? '—'}</td><td>{o.origem}</td>
                  <td><Pill tom={ORDEM_TOM[o.status]}>{ORDEM_ROTULO[o.status]}</Pill></td><td>{quando(o.criada_em)}</td><td>{o.mensagem ?? '—'}</td>
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
