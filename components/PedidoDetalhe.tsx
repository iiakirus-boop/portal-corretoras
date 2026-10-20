// Um pedido: dados, anexos, linha do tempo e o que cada lado pode fazer.
// A corretora muda a situação e escreve para a empresa (ou deixa nota interna); a empresa responde e o gestor aprova.
import { aprovarPedido, comentar, mudarStatus } from '@/lib/acoes';
import { ACAO_STATUS, data, PROXIMOS, quando, STATUS_PEDIDO, TIPO_PEDIDO } from '@/lib/formato';
import { StatusPill } from './Pill';
import type { Documento, EventoPedido, Pedido } from '@/lib/tipos';

const CAMPO: Record<string, string> = {
  nome: 'Nome', cpf: 'CPF', nascimento: 'Nascimento', parentesco: 'Parentesco', titular: 'Titular', plano: 'Plano', inicio: 'Início',
  motivo: 'Motivo', data: 'Data', competencia: 'Mês', observacao: 'Observação', plano_atual: 'Plano atual', plano_novo: 'Plano novo',
  assunto: 'Assunto', mensagem: 'Mensagem', mae: 'Nome da mãe', admissao: 'Admissão', carteirinha: 'Carteirinha', seguradora: 'Seguradora',
};
const valor = (k: string, v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? data(v) : k === 'competencia' && /^\d{4}-\d{2}$/.test(v) ? `${v.slice(5)}/${v.slice(0, 4)}` : v);

type Props = {
  pedido: Pedido;
  eventos: (EventoPedido & { autor_id?: string | null })[];
  anexos: Documento[];
  empresa: string;
  lado: 'corretora' | 'empresa';
  de: string;
  podeAprovar?: boolean;
  nomes: Record<string, string>;
};

export function PedidoDetalhe({ pedido: p, eventos, anexos, empresa, lado, de, podeAprovar, nomes }: Props) {
  const proximos = lado === 'corretora' ? PROXIMOS[p.status] ?? [] : [];
  const quem = (e: Props['eventos'][number]) => e.autor_agente ?? (e.autor_id ? nomes[e.autor_id] ?? 'Equipe' : 'Sistema');
  return (
    <div className="grid g32">
      <div className="grid">
        <section className="card">
          <div className="card-h"><h2>{TIPO_PEDIDO[p.tipo]}</h2><StatusPill status={p.status} /></div>
          <div className="facts" style={{ marginBottom: '.9rem' }}>
            <span>Protocolo <b>{p.protocolo}</b></span><span>Empresa <b>{empresa}</b></span><span>Aberto <b>{data(p.criado_em)}</b></span>
            {p.prazo && <span>Prazo da seguradora <b>{data(p.prazo)}</b></span>}
          </div>
          <div className="tbl">
            <table style={{ minWidth: 0 }}>
              <tbody>
                {Object.entries(p.dados).map(([k, v]) => (
                  <tr key={k}><th style={{ position: 'static', width: '34%' }}>{CAMPO[k] ?? k}</th><td>{valor(k, String(v))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {anexos.length > 0 && (
            <div className="acoes" style={{ marginTop: '.8rem' }}>
              {anexos.map((a) => <a key={a.id} className="btn ghost sm" href={`/arquivo/${a.id}`} target="_blank" rel="noopener">{a.nome_arquivo}</a>)}
            </div>
          )}
        </section>

        {podeAprovar && p.status === 'aguardando_aprovacao_empresa' && (
          <section className="card">
            <div className="card-h"><h2>Este pedido precisa da sua aprovação</h2></div>
            <p className="hint" style={{ marginBottom: '.8rem' }}>Ao aprovar, ele vai para a corretora tratar com a seguradora.</p>
            <form action={aprovarPedido}>
              <input type="hidden" name="pedido_id" value={p.id} /><input type="hidden" name="de" value={de} />
              <button className="btn">Aprovar e enviar à corretora</button>
            </form>
          </section>
        )}

        {proximos.length > 0 && (
          <section className="card">
            <div className="card-h"><h2>Andar com o pedido</h2></div>
            <form action={mudarStatus} className="form">
              <input type="hidden" name="pedido_id" value={p.id} /><input type="hidden" name="de" value={de} />
              <label className="campo">Mensagem para a empresa <small>(opcional, aparece na linha do tempo)</small>
                <textarea name="mensagem" placeholder="Ex.: falta a carta de desligamento assinada" />
              </label>
              <div className="acoes">
                {proximos.map((st) => (
                  <button key={st} name="status" value={st} className={`btn${st === 'cancelado' ? ' perigo' : st === proximos[0] ? '' : ' ghost'}`}>{ACAO_STATUS[st] ?? STATUS_PEDIDO[st].rotulo}</button>
                ))}
              </div>
            </form>
          </section>
        )}
      </div>

      <section className="card">
        <div className="card-h"><h2>Linha do tempo</h2></div>
        <ol className="tempo">
          {eventos.map((e) => (
            <li key={e.id}>
              <time dateTime={e.em}>{quando(e.em)}, {quem(e)}{!e.visivel_empresa && ' (nota interna)'}</time>
              {e.para_status && e.de_status ? <>Passou para <b>{STATUS_PEDIDO[e.para_status].rotulo.toLowerCase()}</b>.</> : null}
              {e.para_status && !e.de_status && !e.mensagem ? <>Pedido aberto.</> : null}
              {e.mensagem && <div>{e.mensagem}</div>}
            </li>
          ))}
        </ol>
        {p.status !== 'concluido' && p.status !== 'cancelado' && (
          <form action={comentar} className="form" style={{ marginTop: '.4rem' }}>
            <input type="hidden" name="pedido_id" value={p.id} /><input type="hidden" name="de" value={de} />
            <label className="campo">{lado === 'corretora' ? 'Escrever no pedido' : 'Responder à corretora'}
              <textarea name="mensagem" required />
            </label>
            <label className="campo">Anexar documento <small>(opcional)</small><input type="file" name="anexo" accept=".pdf,image/*" /></label>
            <div className="acoes">
              <button className="btn ghost">Enviar mensagem</button>
              {lado === 'corretora' && <label className="hint" style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}><input type="checkbox" name="interna" value="sim" /> Só para a equipe</label>}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
