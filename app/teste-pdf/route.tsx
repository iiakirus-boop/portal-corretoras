import { renderToBuffer } from '@react-pdf/renderer';
import { marcaDa } from '@/lib/marca';
import { Apresentacao } from '@/lib/pdf/apresentacao';
import type { Cotacao } from '@/lib/cotacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Só nas prévias: confere se o PDF monta no servidor, com dados inventados
export async function GET() {
  if (process.env.VERCEL_ENV === 'production') return new Response('Não encontrado', { status: 404 });
  const fx = [2, 0, 0, 0, 0, 0, 0, 2, 0, 0], val = [100, 110, 120, 130, 140, 150, 160, 170, 180, 300];
  const linha = (plano: string) => ({ grupo: 0, origem: { seguradora: 'Exemplo', operadora: 'bradesco', plano: 'Nacional III', acomodacao: 'Quarto', plano_atual: 'Plano exemplo' },
    plano, acomodacao: 'Quarto', cobertura: 0.8, faltam: ['Hospital X'], escolha: 'automatico' as const, fora_criterio: false,
    tabela: { id: 1, titulo: 'Tabela exemplo', condicoes: '3 a 29', copart: true }, faixas: fx, valores: val, total: 540 });
  const cot: Cotacao = { empresa_id: 'x', status: 'com opção mais barata', vidas: 4, titulares: 1, custo_atual: 1000, competencia: '2026-11',
    mei: false, simples: false, municipio: 'SAO PAULO', situacao_cnpj: 'ATIVA', copart: false,
    grupos: [{ i: 0, seguradora: 'Exemplo', plano_atual: 'Plano exemplo', operadora: 'bradesco', plano: 'Nacional III', acomodacao: 'Quarto', faixas: fx, vidas: 4, valor: 1000, sem_equivalente: false, copart: false, fora: false }],
    opcoes: [{ operadora: 'amil', completa: true, total: 540, iof: 12.85, total_iof: 552.85, economia: 447.15, cobertura: 0.8, linhas: [linha('S750 R1')], faltando: [] }],
    automatico: true, operadoras: ['amil'], calculado_em: new Date().toISOString() };
  try {
    const buf = await renderToBuffer(<Apresentacao d={{ marca: marcaDa('17e3e5ee-591d-4dbf-8e47-44930ef2941f', 'Shaddai'), empresa: { razao: 'EMPRESA EXEMPLO LTDA', curta: 'EXEMPLO', cnpj: null }, cot, rede: [], data: new Date().toISOString() }} />);
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/pdf' } });
  } catch (err) {
    return new Response(`Erro ao montar o PDF: ${(err as Error).stack ?? err}`, { status: 500 });
  }
}
