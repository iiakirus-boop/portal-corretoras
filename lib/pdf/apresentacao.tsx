// Apresentação comercial da cotação em PDF, no layout das propostas da corretora
// (capa azul-marinho, visão geral, cenário atual, uma página por operadora, comparativo, rede e contato).
// Montada na hora, com os números da função cot_cotacao. Marca (cores, logo, contatos) trocável por corretora.
import path from 'node:path';
import { Document, Font, Image, Page, StyleSheet, Text, View, type Styles } from '@react-pdf/renderer';
type Estilo = Styles[string];
import { operadora, pctCob, somaFx, type Cotacao, type LinhaCot, type OpcaoCot, resumirPlano } from '@/lib/cotacao';
import type { Marca } from '@/lib/marca';

const DIR = path.join(process.cwd(), 'lib', 'pdf');
let fontes = false;
function registrarFontes() {
  if (fontes) return;
  const f = (n: string) => path.join(DIR, 'fontes', n);
  // Caladea e Carlito têm as mesmas medidas da Cambria e da Calibri usadas nas apresentações
  Font.register({ family: 'Titulo', fonts: [
    { src: f('caladea-latin-400-normal.woff') }, { src: f('caladea-latin-700-normal.woff'), fontWeight: 700 },
    { src: f('caladea-latin-400-italic.woff'), fontStyle: 'italic' },
  ] });
  Font.register({ family: 'Texto', fonts: [
    { src: f('carlito-latin-400-normal.woff') }, { src: f('carlito-latin-700-normal.woff'), fontWeight: 700 },
    { src: f('carlito-latin-400-italic.woff'), fontStyle: 'italic' }, { src: f('carlito-latin-700-italic.woff'), fontStyle: 'italic', fontWeight: 700 },
  ] });
  Font.registerHyphenationCallback((w) => [w]);
  fontes = true;
}

// 13,33 x 7,5 polegadas (16:9), como o LAYOUT_WIDE das apresentações
const W = 960, H = 540;
const BRANCO = '#FFFFFF', OFF = '#F5F7F9', CINZA = '#5B6472', CLARO = '#E8EAED', TEXTO = '#1F2430';

const brl = (v: number | null | undefined) => (v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const FX = ['00-18 ANOS', '19-23 ANOS', '24-28 ANOS', '29-33 ANOS', '34-38 ANOS', '39-43 ANOS', '44-48 ANOS', '49-53 ANOS', '54-58 ANOS', '59 em diante'];

export type Rede = { operadora: string; comuns: string[]; total: number; faltam: string[] };
export type DadosApresentacao = {
  marca: Marca; empresa: { razao: string; curta: string; cnpj: string | null };
  cot: Cotacao; rede: Rede[]; data: string;
};

export function Apresentacao({ d }: { d: DadosApresentacao }) {
  registrarFontes();
  const { marca: m, cot: k } = d;
  const c = m.cores;
  const s = estilos(c);
  const ops = k.opcoes.filter((o) => o.completa);
  const ativos = k.grupos.filter((g) => !g.fora);
  const Rodape = ({ escuro = false }: { escuro?: boolean }) => {
    return (
      <View style={s.rodape} fixed>
        <Text style={[s.rodNum, { color: escuro ? BRANCO : CINZA }]} render={({ pageNumber }) => String(pageNumber)} />
        <Text style={[s.rodTxt, { color: escuro ? '#B9C6E0' : CINZA }]}>Proposta Comercial Saúde</Text>
        <Text style={[s.rodTxt, { color: escuro ? '#B9C6E0' : CINZA, marginLeft: 'auto' }]}>{d.empresa.razao}</Text>
      </View>
    );
  };
  const Logo = ({ largura, escuro = false, style }: { largura: number; escuro?: boolean; style?: Estilo }) => {
    const arq = escuro ? m.logoBranco : m.logo;
    if (!arq) return <Text style={[{ fontFamily: 'Titulo', fontWeight: 700, fontSize: 16, color: escuro ? BRANCO : c.principal }, style ?? {}]}>{m.nome}</Text>;
    return <Image src={path.join(DIR, 'marcas', arq)} style={[{ width: largura, height: largura * m.logoProporcao }, style ?? {}]} />;
  };
  const Titulo = ({ kicker, titulo }: { kicker: string; titulo: string }) => (
    <View style={{ position: 'absolute', left: 43, top: 26, right: 43 }}>
      <Text style={s.kicker}>{kicker.toUpperCase()}</Text>
      <Text style={[s.titulo, titulo.length > 46 ? { fontSize: 22 } : {}]}>{titulo}</Text>
      <Logo largura={70} style={{ position: 'absolute', right: 0, top: -6 }} />
    </View>
  );

  const nomesOps = ops.map((o) => operadora(o.operadora));
  const planosOps = [...new Set(ops.flatMap((o) => o.linhas.map((l) => l.plano)))];
  const melhor = [...ops].sort((a, b) => (b.economia ?? 0) - (a.economia ?? 0))[0];

  return (
    <Document title={`Proposta ${d.empresa.curta}`} author={m.nome} creator={m.nome} producer={m.nome}>
      {/* 1 — capa */}
      <Page size={[W, H]} style={[s.pagina, { backgroundColor: c.escuro }]}>
        <View style={s.fundo}>
        <View style={[s.circulo, { left: -216, top: -144, width: 648, height: 648, backgroundColor: c.principal, opacity: 0.5 }]} />
        <View style={[s.circulo, { left: 504, top: 252, width: 720, height: 720, backgroundColor: '#132047', opacity: 0.8 }]} />
        <View style={[s.circulo, { left: 828, top: -72, width: 360, height: 360, backgroundColor: c.principal, opacity: 0.3 }]} />
        </View>
        <Logo largura={115} escuro style={{ position: 'absolute', right: 50, top: 40 }} />
        <Text style={{ position: 'absolute', left: 50, top: 66, fontFamily: 'Texto', fontStyle: 'italic', fontSize: 11, color: '#6E80A8' }}>Apresentação Comercial Exclusiva</Text>
        <Text style={{ position: 'absolute', left: 50, top: 190, fontFamily: 'Texto', fontSize: 20, color: '#9FB3D6' }}>Proposta Comercial</Text>
        <Text style={{ position: 'absolute', left: 49, top: 222, fontFamily: 'Titulo', fontWeight: 700, fontSize: 42, color: BRANCO }}>Seguro Saúde Empresarial</Text>
        <View style={{ position: 'absolute', left: 50, top: 313, width: 40, height: 4, backgroundColor: c.destaque }} />
        <Text style={{ position: 'absolute', left: 50, top: 330, right: 60, fontFamily: 'Titulo', fontWeight: 700, fontSize: 20, color: BRANCO }}>{d.empresa.razao}</Text>
        {d.empresa.cnpj && <Text style={{ position: 'absolute', left: 50, top: 362, fontFamily: 'Texto', fontSize: 13, color: '#B9C6E0' }}>CNPJ: {d.empresa.cnpj}</Text>}
        <View style={{ position: 'absolute', left: 50, top: 438, right: 50, flexDirection: 'row' }}>
          {[['Operadoras', nomesOps.length > 2 ? `${nomesOps.length} operadoras` : nomesOps.join(' / ')], ['Vidas', `${k.vidas} Vidas`], ['Planos', planosOps.length > 2 ? `${planosOps.length} planos` : planosOps.join(' / ')], ['Coparticipação', k.copart ? 'Com' : 'Sem']].map(([a, b]) => (
            <View key={a} style={{ width: 210, paddingRight: 12 }}>
              <Text style={{ fontFamily: 'Texto', fontWeight: 700, fontSize: 9, color: '#7C8DB5', letterSpacing: 1 }}>{a.toUpperCase()}</Text>
              <Text style={{ fontFamily: 'Titulo', fontWeight: 700, fontSize: 15, color: BRANCO, marginTop: 4 }}>{b}</Text>
            </View>
          ))}
        </View>
        <Rodape escuro />
      </Page>

      {/* 2 — visão geral */}
      <Page size={[W, H]} style={s.pagina}>
        <Titulo kicker="Visão Geral" titulo="Dados Gerais da Proposta" />
        <View style={{ position: 'absolute', left: 43, right: 43, top: 126, flexDirection: 'row', gap: 20 }}>
          {[
            ['Vidas seguradas', String(k.vidas), 'Titulares e dependentes', c.principal],
            ['Custo atual', brl(k.custo_atual), 'Mensal, última fatura', c.destaque],
            ['Operadoras cotadas', String(ops.length), nomesOps.join(', '), c.vinho],
            ['Melhor economia', melhor && (melhor.economia ?? 0) > 0 ? brl(melhor.economia) : '—', melhor && (melhor.economia ?? 0) > 0 ? `por mês com ${operadora(melhor.operadora)}` : 'nenhuma opção mais barata', c.verde],
          ].map(([a, b, sub, cor]) => (
            <View key={a} style={s.cartao}>
              <View style={{ width: 30, height: 5, backgroundColor: cor, marginBottom: 12 }} />
              <Text style={{ fontFamily: 'Texto', fontWeight: 700, fontSize: 11.5, color: CINZA }}>{a}</Text>
              <Text style={{ fontFamily: 'Titulo', fontWeight: 700, fontSize: 20, color: c.escuro, marginTop: 6 }}>{b}</Text>
              <Text style={{ fontFamily: 'Texto', fontStyle: 'italic', fontSize: 10, color: CINZA, marginTop: 6 }}>{sub}</Text>
            </View>
          ))}
        </View>
        <View style={{ position: 'absolute', left: 43, top: 299, width: 421, height: 169, borderRadius: 6, borderWidth: 1, borderColor: CLARO, padding: 20 }}>
          <Text style={[s.kicker, { fontSize: 10 }]}>EMPRESA</Text>
          {[['Razão social', d.empresa.razao], ['CNPJ', d.empresa.cnpj ?? '—'], ['Plano atual', [...new Set(ativos.map((g) => resumirPlano(g.plano_atual ?? g.plano)))].join(', ')], ['Fatura de referência', k.competencia ? `${k.competencia.slice(5, 7)}/${k.competencia.slice(0, 4)}` : '—']].map(([a, b]) => (
            <View key={a} style={{ flexDirection: 'row', marginTop: 10 }}>
              <Text style={{ width: 130, fontFamily: 'Texto', fontWeight: 700, fontSize: 11, color: CINZA }}>{a}</Text>
              <Text style={{ flex: 1, fontFamily: 'Texto', fontSize: 11, color: TEXTO }}>{b}</Text>
            </View>
          ))}
        </View>
        <View style={{ position: 'absolute', left: 477, top: 299, right: 43, height: 169, borderRadius: 6, backgroundColor: c.principal, padding: 20 }}>
          <Text style={[s.kicker, { fontSize: 10, color: '#9FB3D6' }]}>COMPOSIÇÃO DO ESTUDO</Text>
          <Text style={{ fontFamily: 'Titulo', fontWeight: 700, fontSize: 20, color: BRANCO, marginTop: 8 }}>{k.vidas} Vidas — {ops.length} {ops.length === 1 ? 'Cenário' : 'Cenários'}</Text>
          <Text style={{ fontFamily: 'Texto', fontSize: 11, color: '#B9C6E0', marginTop: 8 }}>Valores por faixa etária da ANS, já com IOF de 2,38%:</Text>
          {ops.map((o) => (
            <Text key={o.operadora} style={{ fontFamily: 'Texto', fontSize: 11, color: '#B9C6E0', marginTop: 3 }}>•  {operadora(o.operadora)}: {[...new Set(o.linhas.map((l) => l.plano))].join(', ')}</Text>
          ))}
        </View>
        <Rodape />
      </Page>

      {/* 3 — cenário atual */}
      <Page size={[W, H]} style={s.pagina}>
        <Titulo kicker="Cenário Atual" titulo="Distribuição de Vidas por Faixa Etária" />
        <View style={{ position: 'absolute', left: 43, right: 43, top: 104 }}>
          <View style={s.linhaTab}>
            <Cel w={150} cab cor={c.principal}>FAIXA ETÁRIA</Cel>
            {ativos.map((g) => <Cel key={g.i} flex cab cor={c.vinho}>{`${resumirPlano(g.plano_atual ?? g.plano).toUpperCase()}${g.acomodacao ? `\n${g.acomodacao.toUpperCase()}` : ''}`}</Cel>)}
            <Cel w={110} cab cor={c.principal}>TOTAL DE VIDAS</Cel>
          </View>
          {FX.map((f, j) => (
            <View key={f} style={[s.linhaTab, { backgroundColor: j % 2 ? OFF : BRANCO }]}>
              <Cel w={150} negrito>{f}</Cel>
              {ativos.map((g) => <Cel key={g.i} flex>{g.faixas[j] ? String(g.faixas[j]) : '-'}</Cel>)}
              <Cel w={110} negrito>{String(ativos.reduce((a, g) => a + (g.faixas[j] ?? 0), 0))}</Cel>
            </View>
          ))}
          <View style={[s.linhaTab, { backgroundColor: c.escuro }]}>
            <Cel w={150} claro negrito>VIDAS</Cel>
            {ativos.map((g) => <Cel key={g.i} flex claro negrito>{String(g.vidas)}</Cel>)}
            <Cel w={110} claro negrito>{String(k.vidas)}</Cel>
          </View>
          <View style={[s.linhaTab, { backgroundColor: c.destaque }]}>
            <Cel w={150} claro negrito>CUSTO MENSAL ATUAL</Cel>
            {ativos.map((g) => <Cel key={g.i} flex claro negrito>{brl(g.valor)}</Cel>)}
            <Cel w={110} ouro={c.ouro} negrito>{brl(k.custo_atual)}</Cel>
          </View>
        </View>
        <Text style={s.nota}>Vidas e valores da fatura de referência. {ativos.map((g) => g.seguradora).filter((x, i, a) => a.indexOf(x) === i).join(', ')}.</Text>
        <Rodape />
      </Page>

      {/* uma página por operadora (até 3 planos por página) */}
      {ops.flatMap((o) => partes(o.linhas, 3).map((ls, n, todas) => (
        <Page key={`${o.operadora}-${n}`} size={[W, H]} style={s.pagina}>
          <Titulo kicker={`Proposta ${operadora(o.operadora)}`} titulo={`Tabela por Faixa Etária${todas.length > 1 ? ` (${n + 1}/${todas.length})` : ''} — ${k.copart ? 'Com' : 'Sem'} Coparticipação`} />
          <TabelaOperadora o={o} ls={ls} ultima={n === todas.length - 1} c={c} s={s} />
          <Text style={s.nota}>Valores por faixa etária, com IOF de 2,38%. {[...new Set(ls.map((l) => `${l.plano}: ${l.tabela.titulo} (${l.tabela.condicoes}${l.tabela.copart ? ', com coparticipação' : ''})`))].join(' · ')}. Produto sujeito à análise de aceitação da operadora.</Text>
          <Rodape />
        </Page>
      )))}

      {/* comparativo */}
      <Page size={[W, H]} style={s.pagina}>
        <Titulo kicker="Comparativo" titulo="Comparativo Geral" />
        <View style={{ position: 'absolute', left: 43, right: 43, top: 110 }}>
          <View style={s.linhaTab}>
            <Cel w={200} cab cor={c.principal}>CENÁRIO</Cel>
            <Cel flex cab cor={c.principal}>PLANOS</Cel>
            <Cel w={130} cab cor={c.principal}>MENSAL (C/ IOF)</Cel>
            <Cel w={130} cab cor={c.principal}>ECONOMIA MENSAL</Cel>
            <Cel w={130} cab cor={c.principal}>ECONOMIA 12 MESES</Cel>
            <Cel w={90} cab cor={c.principal}>REDE ATUAL</Cel>
          </View>
          <View style={[s.linhaTab, { backgroundColor: OFF }]}>
            <Cel w={200} negrito>Atual</Cel>
            <Cel flex>{[...new Set(ativos.map((g) => resumirPlano(g.plano_atual ?? g.plano)))].join(', ')}</Cel>
            <Cel w={130} negrito>{brl(k.custo_atual)}</Cel><Cel w={130}>-</Cel><Cel w={130}>-</Cel><Cel w={90}>100%</Cel>
          </View>
          {ops.map((o, i) => (
            <View key={o.operadora} style={[s.linhaTab, { backgroundColor: i % 2 ? OFF : BRANCO }]}>
              <Cel w={200} negrito>{operadora(o.operadora)}</Cel>
              <Cel flex>{[...new Set(o.linhas.map((l) => `${l.plano}${l.acomodacao ? ` ${l.acomodacao}` : ''}`))].join(', ')}</Cel>
              <Cel w={130} negrito>{brl(o.total_iof)}</Cel>
              <Cel w={130} negrito cor2={(o.economia ?? 0) >= 0 ? c.verde : c.vinho}>{brl(o.economia)}</Cel>
              <Cel w={130} negrito cor2={(o.economia ?? 0) >= 0 ? c.verde : c.vinho}>{brl(r2((o.economia ?? 0) * 12))}</Cel>
              <Cel w={90}>{pctCob(o.cobertura)}</Cel>
            </View>
          ))}
        </View>
        {melhor && (melhor.economia ?? 0) > 0 && (
          <View style={{ position: 'absolute', left: 43, right: 43, bottom: 60, height: 92, borderRadius: 6, backgroundColor: c.destaque, padding: 18, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Texto', fontWeight: 700, fontSize: 12, color: '#D9ECF2', letterSpacing: 1.2 }}>MELHOR CENÁRIO: {operadora(melhor.operadora).toUpperCase()}</Text>
              <Text style={{ fontFamily: 'Texto', fontSize: 11, color: '#D9ECF2', marginTop: 4 }}>{pctCob(melhor.cobertura)} dos hospitais da rede atual, mesma categoria de plano.</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: 'Titulo', fontWeight: 700, fontSize: 30, color: BRANCO }}>{brl(melhor.economia)}/mês</Text>
              <Text style={{ fontFamily: 'Texto', fontWeight: 700, fontSize: 13, color: c.ouro }}>{brl(r2((melhor.economia ?? 0) * 12))} em 12 meses</Text>
            </View>
          </View>
        )}
        <Rodape />
      </Page>

      {/* rede credenciada */}
      {d.rede.length > 0 && (
        <Page size={[W, H]} style={s.pagina}>
          <Titulo kicker="Rede Credenciada" titulo="Hospitais da Rede Atual Mantidos" />
          <View style={{ position: 'absolute', left: 43, right: 43, top: 110, bottom: 56, flexDirection: 'row', gap: 16 }}>
            {d.rede.map((r) => (
              <View key={r.operadora} style={{ flex: 1, borderRadius: 6, borderWidth: 1, borderColor: CLARO, backgroundColor: OFF, padding: 14 }}>
                <Text style={{ fontFamily: 'Titulo', fontWeight: 700, fontSize: 14, color: c.escuro }}>{operadora(r.operadora)}</Text>
                <Text style={{ fontFamily: 'Texto', fontSize: 10, color: CINZA, marginTop: 2, marginBottom: 8 }}>{r.comuns.length} de {r.total} hospitais de hoje</Text>
                {r.comuns.slice(0, 16).map((h) => <Text key={h} style={{ fontFamily: 'Texto', fontSize: 9, color: TEXTO, marginBottom: 2.5 }}>•  {h}</Text>)}
                {r.comuns.length > 16 && <Text style={{ fontFamily: 'Texto', fontStyle: 'italic', fontSize: 9, color: CINZA }}>e mais {r.comuns.length - 16}</Text>}
                {r.faltam.length > 0 && <Text style={{ fontFamily: 'Texto', fontSize: 8.5, color: c.vinho, marginTop: 8 }}>Fora: {r.faltam.slice(0, 6).join(', ')}{r.faltam.length > 6 ? ` e mais ${r.faltam.length - 6}` : ''}</Text>}
              </View>
            ))}
          </View>
          <Rodape />
        </Page>
      )}

      {/* encerramento */}
      <Page size={[W, H]} style={[s.pagina, { backgroundColor: c.escuro }]}>
        <View style={s.fundo}>
        <View style={[s.circulo, { left: -115, top: -130, width: 360, height: 360, backgroundColor: c.destaque, opacity: 0.2 }]} />
        <View style={[s.circulo, { left: 814, top: 331, width: 317, height: 317, backgroundColor: c.vinho, opacity: 0.24 }]} />
        </View>
        <Logo largura={187} escuro style={{ position: 'absolute', left: 691, top: 173 }} />
        <Text style={{ position: 'absolute', left: 65, top: 94, fontFamily: 'Titulo', fontWeight: 700, fontSize: 38, color: BRANCO }}>Vamos conversar?</Text>
        <Text style={{ position: 'absolute', left: 65, top: 155, width: 590, fontFamily: 'Texto', fontSize: 14, color: '#B9C6E0' }}>Nossa equipe está à disposição para esclarecer dúvidas e apoiar a implantação do plano de saúde da {d.empresa.curta}.</Text>
        {m.contatos.map(([a, b], i) => (
          <View key={a} style={{ position: 'absolute', left: 65, top: 230 + i * 59 }}>
            <View style={{ width: 22, height: 3, backgroundColor: c.destaque }} />
            <Text style={{ fontFamily: 'Texto', fontWeight: 700, fontSize: 10, color: '#7C8DB5', letterSpacing: 1.5, marginTop: 6 }}>{a.toUpperCase()}</Text>
            <Text style={{ fontFamily: 'Texto', fontSize: 14, color: BRANCO, marginTop: 3 }}>{b}</Text>
          </View>
        ))}
        <Rodape escuro />
      </Page>
    </Document>
  );
}

function partes<T>(xs: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out.length ? out : [[]];
}

type Est = ReturnType<typeof estilos>;
function TabelaOperadora({ o, ls, ultima, c, s }: { o: OpcaoCot; ls: LinhaCot[]; ultima: boolean; c: Marca['cores']; s: Est }) {
  return (
    <View style={{ position: 'absolute', left: 43, right: 43, top: 100 }}>
      <View style={s.linhaTab}>
        <Cel w={110} cab cor={c.principal}>FAIXA ETÁRIA</Cel>
        {ls.map((l) => <Cel key={l.grupo} flex={3} cab cor={c.vinho}>{`${operadora(o.operadora).toUpperCase()}\n${l.plano.toUpperCase()}${l.acomodacao ? ` ${l.acomodacao.toUpperCase()}` : ''}`}</Cel>)}
      </View>
      <View style={s.linhaTab}>
        <Cel w={110} cab cor={c.principal}> </Cel>
        {ls.map((l) => (
          <View key={l.grupo} style={{ flex: 3, flexDirection: 'row' }}>
            <Cel flex={1} cab cor={c.principal} pequeno>VIDAS</Cel><Cel flex={2} cab cor={c.principal} pequeno>VALOR UNITÁRIO</Cel><Cel flex={2} cab cor={c.principal} pequeno>CUSTO TOTAL</Cel>
          </View>
        ))}
      </View>
      {FX.map((f, j) => (
        <View key={f} style={[s.linhaTab, { backgroundColor: j % 2 ? OFF : BRANCO }]}>
          <Cel w={110} negrito>{f}</Cel>
          {ls.map((l) => (
            <View key={l.grupo} style={{ flex: 3, flexDirection: 'row' }}>
              <Cel flex={1} negrito>{String(l.faixas[j] ?? 0)}</Cel>
              <Cel flex={2} cor2={CINZA}>{brl(Number(l.valores[j]))}</Cel>
              <Cel flex={2}>{l.faixas[j] ? brl(r2(l.faixas[j] * Number(l.valores[j]))) : '-'}</Cel>
            </View>
          ))}
        </View>
      ))}
      <View style={[s.linhaTab, { backgroundColor: c.escuro }]}>
        <Cel w={110} claro negrito>SUBTOTAL</Cel>
        {ls.map((l) => (
          <View key={l.grupo} style={{ flex: 3, flexDirection: 'row' }}>
            <Cel flex={1} claro negrito>{String(somaFx(l.faixas))}</Cel><Cel flex={4} claro negrito>{brl(l.total)}</Cel>
          </View>
        ))}
      </View>
      {ultima && (
        <>
          <View style={[s.linhaTab, { backgroundColor: c.escuro }]}>
            <Cel w={110} claro negrito>IOF (2,38%)</Cel><Cel flex claro negrito>{brl(o.iof)}</Cel>
          </View>
          <View style={[s.linhaTab, { backgroundColor: c.destaque, height: 30 }]}>
            <Cel w={110} claro negrito>TOTAL MENSAL (C/ IOF)</Cel><Cel flex ouro={c.ouro} negrito grande>{brl(o.total_iof)}</Cel>
          </View>
        </>
      )}
    </View>
  );
}

function Cel({ children, w, flex, cab, cor, negrito, claro, ouro, cor2, pequeno, grande }: {
  children: React.ReactNode; w?: number; flex?: boolean | number; cab?: boolean; cor?: string; negrito?: boolean; claro?: boolean; ouro?: string; cor2?: string; pequeno?: boolean; grande?: boolean;
}) {
  const color = cab || claro ? BRANCO : ouro ? ouro : cor2 ?? TEXTO;
  return (
    <View style={{ width: w, flex: flex === true ? 1 : flex || undefined, backgroundColor: cab ? cor : undefined, borderWidth: 0.5, borderColor: CLARO, justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 3, minHeight: 22 }}>
      <Text style={{ fontFamily: 'Texto', fontWeight: negrito || cab ? 700 : 400, fontSize: grande ? 15 : pequeno ? 7.5 : cab ? 8.5 : 9.5, color: ouro ? ouro : color, textAlign: 'center' }}>{children}</Text>
    </View>
  );
}

function estilos(c: Marca['cores']) {
  return StyleSheet.create({
    pagina: { backgroundColor: BRANCO, position: 'relative', fontFamily: 'Texto' },
    circulo: { position: 'absolute', borderRadius: 9999 },
    fundo: { position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden' },
    kicker: { fontFamily: 'Texto', fontWeight: 700, fontSize: 12, color: c.destaque, letterSpacing: 2 },
    titulo: { fontFamily: 'Titulo', fontWeight: 700, fontSize: 28, color: c.escuro, marginTop: 4 },
    cartao: { flex: 1, height: 144, borderRadius: 6, backgroundColor: OFF, borderWidth: 1, borderColor: CLARO, padding: 17 },
    linhaTab: { flexDirection: 'row' },
    nota: { position: 'absolute', left: 43, right: 43, bottom: 40, fontFamily: 'Texto', fontStyle: 'italic', fontSize: 9, color: CINZA, textAlign: 'right' },
    rodape: { position: 'absolute', left: 43, right: 43, bottom: 12, flexDirection: 'row', alignItems: 'center' },
    rodNum: { fontFamily: 'Titulo', fontWeight: 700, fontSize: 12, width: 36 },
    rodTxt: { fontFamily: 'Texto', fontSize: 9 },
  });
}

