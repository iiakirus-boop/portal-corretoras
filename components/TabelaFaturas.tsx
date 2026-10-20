import { competencia, data, moeda, num, seg } from '@/lib/formato';
import { Pill } from './Pill';
import type { Fatura } from '@/lib/tipos';

// Faturas com os links de fatura e boleto. A coluna de conferência só aparece para a corretora.
export function TabelaFaturas({ faturas, conferencia = false }: { faturas: Fatura[]; conferencia?: boolean }) {
  const h = new Date().toISOString().slice(0, 10);
  if (faturas.length === 0) return <p className="empty">Nenhuma fatura ainda. Elas aparecem aqui quando a corretora busca no portal da seguradora.</p>;
  return (
    <div className="tbl">
      <table>
        <thead>
          <tr><th>Mês</th><th>Seguradora</th><th>Vencimento</th><th className="num">Vidas</th><th className="num">Valor</th><th>Pagamento</th>{conferencia && <th>Conferência</th>}<th>Arquivos</th></tr>
        </thead>
        <tbody>
          {faturas.map((f) => (
            <tr key={f.id}>
              <td><b>{competencia(f.competencia)}</b><small>nº {f.numero}</small></td>
              <td>{seg(f.seguradora_id)}</td>
              <td>{data(f.vencimento)}</td>
              <td className="num">{num(f.vidas_informadas)}</td>
              <td className="num">{moeda(f.valor_boleto ?? f.valor_total)}</td>
              <td>{f.data_pagamento ? <Pill tom="ok">Pago</Pill> : f.vencimento && f.vencimento < h ? <Pill tom="idle">Sem baixa</Pill> : <Pill tom="warn">Em aberto</Pill>}</td>
              {conferencia && <td>{f.conferencia_valor === 'OK' ? <Pill tom="ok">Bateu</Pill> : f.conferencia_valor ? <Pill tom="warn">{f.conferencia_valor}</Pill> : '—'}</td>}
              <td>
                <span className="acoes">
                  {f.fatura_doc_id && <a href={`/arquivo/${f.fatura_doc_id}`} target="_blank" rel="noopener">Fatura</a>}
                  {f.boleto_doc_id && !f.data_pagamento && <a href={`/arquivo/${f.boleto_doc_id}`} target="_blank" rel="noopener">Boleto</a>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
