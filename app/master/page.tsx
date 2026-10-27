import Link from 'next/link';
import { cliente } from '@/lib/servidor';
import { ABERTOS, AGENTE, data, num, plural, ORDEM_ROTULO, ORDEM_TOM, quando, seg, TIPO_PEDIDO } from '@/lib/formato';
import { sinal, vidasCarteira, type VidaCarteira } from '@/lib/contas';
import { Pill, StatusPill } from '@/components/Pill';
import type { Corretora, Empresa, LoginStatus, Maquina, Ordem, Pedido } from '@/lib/tipos';

export default async function Master() {
  const db = await cliente();
  const [{ data: corretoras }, { data: empresas }, { data: vidasC }, { data: pedidos }, { data: ordens }, { data: maquinas }, { data: logins }] = await Promise.all([
    db.from('corretoras').select('*').order('nome'),
    db.from('empresas').select('*').eq('ativa', true),
    db.from('vidas_carteira').select('*'),
    db.from('pedidos').select('*').in('status', ABERTOS).order('prazo'),
    db.from('ordens_execucao').select('*').order('criada_em', { ascending: false }).limit(30),
    db.from('maquinas').select('*').order('nome'),
    db.from('login_status').select('*'),
  ]);
  const cs = (corretoras ?? []) as Corretora[];
  const es = (empresas ?? []) as Empresa[];
  const vc = (vidasC ?? []) as VidaCarteira[];
  const ps = (pedidos ?? []) as Pedido[];
  const os = (ordens ?? []) as Ordem[];
  const ms = (maquinas ?? []) as Maquina[];
  const ls = (logins ?? []) as LoginStatus[];
  const nomeC = (id: string) => cs.find((c) => c.id === id)?.nome ?? '—';
  const nomeE = (id: string) => { const e = es.find((x) => x.id === id); return e?.nome_curto ?? e?.razao_social ?? '—'; };
  const precisa = os.filter((o) => o.status === 'aguardando_voce' || o.status === 'erro');
  // o vigia do PC confere a cada 2 min e grava a cada 10: sem notícia há 20 min, o PC ou o vigia parou
  const velho = (l: LoginStatus) => Date.now() - new Date(l.verificado_em).getTime() > 20 * 60 * 1000;
  const caidos = ls.filter((l) => !l.ativa || velho(l));
  const atrasados = ps.filter((p) => p.prazo && p.prazo < new Date().toISOString().slice(0, 10));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <p>Todas as corretoras, a fila de pedidos e o estado dos robôs que buscam as faturas.</p>
        </div>
        <Link href="/master/corretoras#nova" className="btn">Cadastrar corretora</Link>
      </div>

      <div className="kpis">
        <Link href="/master/corretoras" className="kpi"><span className="kpi-l">Corretoras ativas</span><span className="kpi-v">{num(cs.filter((c) => c.ativa).length)}</span><span className="kpi-s">{num(es.length)} empresas na carteira</span></Link>
        <Link href="/master/cobranca" className="kpi"><span className="kpi-l">Vidas ativas</span><span className="kpi-v">{num(vidasCarteira(vc))}</span><span className="kpi-s">último mês faturado, mais entradas e menos saídas</span></Link>
        <div className="kpi"><span className="kpi-l">Pedidos em andamento</span><span className="kpi-v">{num(ps.length)}</span><span className="kpi-s">{atrasados.length ? `${atrasados.length} passaram do prazo` : 'nenhum atrasado'}</span></div>
        <Link href="/master/agentes" className={`kpi${precisa.length + caidos.length ? ' alerta' : ''}`}><span className="kpi-l">Precisa de você</span><span className="kpi-v">{num(precisa.length + caidos.length)}</span><span className="kpi-s">{plural(caidos.length, 'login caído', 'logins caídos')}, {plural(precisa.length, 'execução parada', 'execuções paradas')}</span></Link>
      </div>

      <div className="grid g32">
        <section className="card">
          <div className="card-h"><h2>Fila de pedidos de todas as corretoras</h2><span className="hint">por prazo</span></div>
          {ps.length === 0 ? <p className="empty">Nenhum pedido em andamento.</p> : (
            <ul className="rows">
              {ps.slice(0, 12).map((p) => (
                <li key={p.id}>
                  <Link href={`/corretora/${p.corretora_id}/pedidos/${p.id}`}>
                    <b>{TIPO_PEDIDO[p.tipo]}: {p.dados.nome ?? p.dados.assunto ?? p.protocolo}</b>
                    <small>{nomeE(p.empresa_id)}, {nomeC(p.corretora_id)}. Prazo {data(p.prazo)}</small>
                  </Link>
                  <StatusPill status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid">
          <section className="card">
            <div className="card-h"><h2>Máquinas de operação</h2></div>
            <ul className="rows">
              {ms.map((m) => {
                const st = sinal(m.ultimo_sinal);
                return (
                  <li key={m.id}>
                    <div><b>{m.nome}</b><small>{m.descricao}</small></div>
                    <span className={`sinal ${st === 'on' ? '' : st}`}><i />{st === 'on' ? `no ar, ${quando(m.ultimo_sinal!)}` : st === 'off' ? `sem sinal desde ${quando(m.ultimo_sinal!)}` : 'nunca ligou'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="card">
            <div className="card-h"><h2>Logins nas seguradoras</h2></div>
            <ul className="rows">
              {ls.map((l) => (
                <li key={`${l.corretora_id}${l.codigo}`}>
                  <div><b>{seg(l.seguradora_id)} {l.codigo}</b><small>{nomeC(l.corretora_id)}, conferido {quando(l.verificado_em)}</small></div>
                  {velho(l) ? <Pill tom="warn">Sem notícia do PC</Pill> : l.ativa ? <Pill tom="ok">Ativo</Pill> : <Pill tom="warn">Caiu</Pill>}
                </li>
              ))}
            </ul>
            <p className="note">O vigia do PC confere os logins a cada 2 minutos. Quando um cai, o próprio agente entra de novo com a senha guardada no cofre do Windows na próxima vez que precisar do portal. Só captcha ou código por SMS ficam com você.</p>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-h"><h2>Últimas execuções dos agentes</h2><Link href="/master/agentes" className="hint">ver todas</Link></div>
        <div className="tbl">
          <table>
            <thead><tr><th>Agente</th><th>Corretora</th><th>Seguradora</th><th>Origem</th><th>Situação</th><th>Quando</th><th>Mensagem</th></tr></thead>
            <tbody>
              {os.slice(0, 10).map((o) => (
                <tr key={o.id}>
                  <td><b>{AGENTE[o.agente] ?? o.agente}</b></td><td>{nomeC(o.corretora_id)}</td><td>{seg(o.seguradora_id)}</td><td>{o.origem}</td>
                  <td><Pill tom={ORDEM_TOM[o.status]} vivo={o.status === 'em_execucao'}>{ORDEM_ROTULO[o.status]}</Pill></td><td>{quando(o.criada_em)}</td><td>{o.mensagem ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
