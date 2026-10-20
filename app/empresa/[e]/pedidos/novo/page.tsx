import Link from 'next/link';
import { cliente, exigirEmpresa } from '@/lib/servidor';
import { competencia, seg, TIPO_PEDIDO } from '@/lib/formato';
import { proximoCorte } from '@/lib/contas';
import { abrirPedido } from '@/lib/acoes';
import { Aviso } from '@/components/Aviso';
import type { Apolice, Fatura, TipoPedido } from '@/lib/tipos';

type P = { params: Promise<{ e: string }>; searchParams: Promise<Record<string, string | undefined>> };

const AJUDA: Record<TipoPedido, string> = {
  inclusao: 'Colocar um funcionário ou dependente no plano.',
  exclusao: 'Tirar alguém do plano (desligamento, pedido do funcionário).',
  troca_plano: 'Mudar a pessoa de plano, por exemplo de enfermaria para apartamento.',
  segunda_via: 'Receber um boleto novo, por exemplo quando o anterior venceu.',
  atualizacao_extra: 'Pedir para a corretora buscar as informações na seguradora agora.',
  duvida: 'Qualquer outra pergunta para a corretora.',
};

function Campo({ nome, rotulo, tipo = 'text', req = true, ...r }: { nome: string; rotulo: string; tipo?: string; req?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="campo">{rotulo}<input name={`d_${nome}`} type={tipo} required={req} {...r} /></label>;
}

export default async function NovoPedido({ params, searchParams }: P) {
  const { e } = await params;
  const sp = await searchParams;
  const x = await exigirEmpresa(e);
  const db = await cliente();
  const [{ data: aps }, { data: fat }] = await Promise.all([
    db.from('apolices').select('*').eq('empresa_id', e).eq('ativa', true),
    x.veFaturas ? db.from('faturas').select('*').eq('empresa_id', e).order('competencia', { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
  ]);
  const apolices = (aps ?? []) as Apolice[];
  const permitidos: TipoPedido[] = x.soFinanceiro ? ['segunda_via']
    : (['inclusao', 'exclusao', 'troca_plano', 'segunda_via', 'atualizacao_extra', 'duvida'] as TipoPedido[]).filter((t) => t !== 'segunda_via' || x.veFaturas);
  const tipo = (permitidos.includes(sp.tipo as TipoPedido) ? sp.tipo : permitidos[0]) as TipoPedido;
  const base = `/empresa/${e}`;
  const corte = proximoCorte(apolices[0]?.dia_corte_movimentacao ?? null);
  const vaiParaGestor = !x.daCorretora && !x.master && !x.papeis.includes('gestor_empresa') && x.papeis.includes('movimentacao_empresa') && tipo !== 'segunda_via';
  const movimenta = ['inclusao', 'exclusao', 'troca_plano'].includes(tipo);

  return (
    <div className="page">
      <div className="page-head">
        <div><Link href={`${base}/pedidos`} className="voltar">Pedidos</Link><h1>Fazer um pedido</h1></div>
      </div>
      <Aviso sp={sp} />
      <nav className="acoes" aria-label="Tipo de pedido">
        {permitidos.map((t) => <Link key={t} href={`?tipo=${t}`} className={`btn sm${t === tipo ? '' : ' ghost'}`} aria-current={t === tipo ? 'page' : undefined}>{TIPO_PEDIDO[t]}</Link>)}
      </nav>
      <section className="card" style={{ maxWidth: 820 }}>
        <div className="card-h"><h2>{TIPO_PEDIDO[tipo]}</h2><span className="hint">{AJUDA[tipo]}</span></div>
        <form action={abrirPedido} className="form">
          <input type="hidden" name="empresa_id" value={e} />
          <input type="hidden" name="tipo" value={tipo} />
          {movimenta && corte && <input type="hidden" name="prazo" value={corte} />}
          {movimenta && apolices.length > 1 && (
            <label className="campo">Plano de qual seguradora
              <select name="apolice_id">{apolices.map((a) => <option key={a.id} value={a.id}>{seg(a.seguradora_id)}</option>)}</select>
            </label>
          )}
          {movimenta && apolices.length === 1 && <input type="hidden" name="apolice_id" value={apolices[0].id} />}

          {tipo === 'inclusao' && (<>
            <div className="linha"><Campo nome="nome" rotulo="Nome completo" /><Campo nome="cpf" rotulo="CPF" inputMode="numeric" /></div>
            <div className="linha"><Campo nome="nascimento" rotulo="Nascimento" tipo="date" /><Campo nome="mae" rotulo="Nome da mãe" /></div>
            <div className="linha">
              <label className="campo">Parentesco<select name="d_parentesco">{['Titular', 'Cônjuge', 'Filho(a)', 'Outro'].map((p) => <option key={p}>{p}</option>)}</select></label>
              <Campo nome="titular" rotulo="Se dependente, nome do titular" req={false} />
            </div>
            <div className="linha">
              <label className="campo">Plano<select name="d_plano"><option>Enfermaria</option><option>Apartamento</option></select></label>
              <Campo nome="admissao" rotulo="Admissão do funcionário" tipo="date" req={false} />
            </div>
          </>)}
          {tipo === 'exclusao' && (<>
            <div className="linha"><Campo nome="nome" rotulo="Nome completo" /><Campo nome="cpf" rotulo="CPF" req={false} inputMode="numeric" /></div>
            <div className="linha">
              <label className="campo">Motivo<select name="d_motivo">{['Desligamento', 'Pedido do funcionário', 'Falecimento', 'Outro'].map((p) => <option key={p}>{p}</option>)}</select></label>
              <Campo nome="data" rotulo="A partir de" tipo="date" />
            </div>
          </>)}
          {tipo === 'troca_plano' && (<>
            <Campo nome="nome" rotulo="Nome completo" />
            <div className="linha">
              <label className="campo">Plano atual<select name="d_plano_atual"><option>Enfermaria</option><option>Apartamento</option></select></label>
              <label className="campo">Plano novo<select name="d_plano_novo" defaultValue="Apartamento"><option>Enfermaria</option><option>Apartamento</option></select></label>
            </div>
          </>)}
          {tipo === 'segunda_via' && (
            <label className="campo">Boleto de qual mês
              <select name="d_competencia">{((fat ?? []) as Fatura[]).map((f) => <option key={f.id} value={f.competencia}>{competencia(f.competencia)}, {seg(f.seguradora_id)}</option>)}</select>
            </label>
          )}
          {tipo === 'atualizacao_extra' && <Campo nome="assunto" rotulo="O que precisa ser atualizado" placeholder="Ex.: fatura de outubro da Porto" />}
          {tipo === 'duvida' && <Campo nome="assunto" rotulo="Assunto" />}
          <label className="campo">{tipo === 'duvida' ? 'Mensagem' : 'Observação'} <small>{tipo === 'duvida' ? '' : '(opcional)'}</small>
            <textarea name={tipo === 'duvida' ? 'd_mensagem' : 'd_observacao'} required={tipo === 'duvida'} />
          </label>
          {movimenta && (
            <label className="campo">Documento <small>(RG, certidão, carta de desligamento; PDF ou foto)</small>
              <input type="file" name="anexo" accept=".pdf,image/*" />
            </label>
          )}
          {movimenta && corte && <p className="hint">Pedidos que chegam à corretora até {corte.split('-').reverse().join('/')} entram na próxima fatura.</p>}
          {vaiParaGestor && <p className="msg aviso">Este pedido vai primeiro para o gestor da empresa aprovar.</p>}
          <div><button className="btn">Enviar pedido</button></div>
        </form>
      </section>
    </div>
  );
}
