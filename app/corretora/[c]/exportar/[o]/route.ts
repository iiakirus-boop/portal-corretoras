// Baixar em planilha (abre no Excel): faturas, comissões ou vidas da corretora.
// É um arquivo CSV com ponto e vírgula e números no formato brasileiro, que o Excel abre direto.
// Só entra quem é da corretora; comissões só para o administrador. O banco aplica as mesmas regras.
import { NextResponse } from 'next/server';
import { cliente, exigirCorretora } from '@/lib/servidor';
import { pagamento, seg } from '@/lib/formato';

type Linha = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;

// o banco entrega no máximo 1000 linhas por vez: busca em páginas até acabar (no modo demonstração vem tudo de uma vez)
async function todas(montar: () => Consulta, max = 60000): Promise<Linha[]> {
  const out: Linha[] = [];
  for (let de = 0; de < max; de += 1000) {
    const q = montar();
    if (typeof q.range !== 'function') { const { data } = await q; return (data ?? []) as Linha[]; }
    const { data, error } = await q.range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const dataBR = (v: unknown) => { const s = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : ''; };
const valor = (v: unknown) => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
function celula(v: unknown) {
  let s = v == null ? '' : String(v);
  // nome que começa com = + - @ viraria fórmula no Excel: ganha um apóstrofo na frente
  if (/^[=+\-@]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (cab: string[], linhas: unknown[][]) => '﻿' + [cab, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';

export async function GET(req: Request, { params }: { params: Promise<{ c: string; o: string }> }) {
  const { c, o } = await params;
  const { admin } = await exigirCorretora(c);
  const db = await cliente();
  const url = new URL(req.url);
  const compPedida = /^\d{4}-\d{2}$/.test(url.searchParams.get('comp') ?? '') ? url.searchParams.get('comp')! : null;
  const emps = await todas(() => db.from('empresas').select('id, razao_social, nome_curto, cnpj, codigo_interno').eq('corretora_id', c).order('id'));
  const emp = new Map(emps.map((e) => [e.id as string, e]));
  const nomeE = (id: unknown) => { const e = emp.get(String(id)); return e ? String(e.nome_curto || e.razao_social) : ''; };
  const cnpjE = (id: unknown) => String(emp.get(String(id))?.cnpj ?? '');
  let nome = '', corpo = '';

  if (o === 'faturas') {
    const fs = await todas(() => {
      let q = db.from('faturas').select('*').eq('corretora_id', c).is('excluido_em', null);
      if (compPedida) q = q.eq('competencia', compPedida);
      return q.order('competencia', { ascending: false }).order('id');
    });
    nome = `faturas${compPedida ? '-' + compPedida : ''}`;
    corpo = csv(['Mês', 'Empresa', 'CNPJ', 'Seguradora', 'Nº da fatura', 'Emissão', 'Vencimento', 'Vidas', 'Valor da fatura', 'Valor do boleto', 'Situação', 'Pago em', 'Conferência do valor'],
      fs.map((f) => {
        const pg = pagamento(f as never);
        return [String(f.competencia).trim(), nomeE(f.empresa_id), cnpjE(f.empresa_id), seg(String(f.seguradora_id)), f.numero, dataBR(f.emissao), dataBR(f.vencimento), f.vidas_informadas ?? '',
          valor(f.valor_total), valor(f.valor_boleto), pg ? (pg.via === 'portal' ? 'Pago' : 'Pago (pela comissão)') : 'Em aberto', pg ? dataBR(pg.em) : '', f.conferencia_valor ?? ''];
      }));
  } else if (o === 'comissoes') {
    if (!admin) return NextResponse.json({ erro: 'Só o administrador da corretora baixa as comissões.' }, { status: 403 });
    const desde = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
    const [pags, ls] = await Promise.all([
      todas(() => db.from('comissao_pagamentos').select('id, seguradora_id, competencia, data_pagamento, ordem').eq('corretora_id', c).order('id')),
      todas(() => db.from('comissao_lancamentos').select('*').eq('corretora_id', c).is('excluido_em', null).gte('data_lancamento', desde).order('data_lancamento', { ascending: false }).order('id')),
    ]);
    const pag = new Map(pags.map((p) => [p.id as string, p]));
    nome = 'comissoes-12-meses';
    corpo = csv(['Data', 'Seguradora', 'Extrato', 'Empresa no cadastro', 'Nome no extrato', 'Nº da fatura', 'Parcela', 'Tipo', 'Prêmio', 'Taxa %', 'Comissão'],
      ls.map((l) => {
        const p = pag.get(String(l.pagamento_id));
        return [dataBR(l.data_lancamento), p ? seg(String(p.seguradora_id)) : '', p?.ordem ?? '', nomeE(l.empresa_id), l.segurado ?? '', l.numero_fatura ?? '', l.parcela ?? '',
          l.classe === 'agenciamento' ? 'Agenciamento' : l.classe === 'vitalicio' ? 'Vitalício' : (l.classe ?? ''), valor(l.premio_liquido), valor(l.taxa), valor(l.comissao)];
      }));
  } else if (o === 'vidas') {
    // um mês só (o mais novo, ou o pedido): a lista inteira de todos os meses seria grande demais para uma planilha
    let comp = compPedida;
    if (!comp) {
      const { data } = await db.from('vidas').select('competencia').eq('corretora_id', c).order('competencia', { ascending: false }).limit(1);
      comp = data?.[0]?.competencia ? String(data[0].competencia).trim() : null;
    }
    const vs = comp ? await todas(() => db.from('vidas').select('*').eq('corretora_id', c).eq('competencia', comp).order('empresa_id').order('id')) : [];
    nome = `vidas-${comp ?? 'sem-dados'}`;
    corpo = csv(['Mês', 'Empresa', 'Seguradora', 'Nome', 'CPF', 'Titular ou dependente', 'Parentesco', 'Nascimento', 'Idade', 'Plano', 'Adesão', 'Situação', 'Valor'],
      vs.map((v) => [String(v.competencia).trim(), nomeE(v.empresa_id), seg(String(v.seguradora_id)), v.nome, v.cpf ?? '', v.titular ? 'Titular' : 'Dependente', v.parentesco ?? '',
        dataBR(v.nascimento), v.idade ?? '', v.plano ?? '', dataBR(v.adesao), v.situacao ?? '', valor(v.valor_total)]));
  } else {
    return NextResponse.json({ erro: 'Planilha desconhecida.' }, { status: 404 });
  }
  return new NextResponse(corpo, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nome}.csv"`, 'cache-control': 'no-store' },
  });
}
