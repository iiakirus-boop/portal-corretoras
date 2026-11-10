// Agente Comissão SulAmérica - baixa os extratos de pagamento de comissão (CIA SAÚDE - 9512) do Portal do Corretor.
// Só baixa: não grava na base nem no Supabase.
// Entra sozinho num Chrome próprio (com janela, perfil guardado em %LOCALAPPDATA%\Shaddai\chrome_sulamerica, que mantém a
// sessão entre rodadas) com o 1º login ativo de 'sulamerica' do atalho "Cadastrar login SulAmerica" (logins.js).
// O portal pede reCAPTCHA no login às vezes: a janela espera até 3 min alguém resolver; se ninguém resolver, sai com código 3.
// Caminho: card "Comissões e Demonstrativos" → Extrato pagamento → CIA SAÚDE - 9512 → cada pagamento (data/valor) → "Gerar extrato".
// Em vez de ler os cards da tela, chama a mesma API que a página usa (remuneracao-corretor-newsas), com o token da própria aba,
// e grava os campos com os mesmos nomes dos cards.
// Uso:  node baixar_sulamerica.js comissao 2026-10-01 2026-11-05
//   -> Comissoes/<AAAA-MM da emissão>/SulAmerica/extratos_9512.json no formato que o comissao_sulamerica.py lê
//      ({"cia","lidoEm","extratos":[{id,opt,emissao,liquido,remun,debito,credito}],"rows":[{extrato, <campos do card>}]}).
//   Pagamento (Nº do extrato) que já está no JSON do mês = repetido; os novos entram no mesmo JSON.
// Saída: última linha JSON {"ok":true,"arquivos":[...JSONs com extrato novo...],"repetidos":[...],"sem_dados":[...]}.
// Erros: código 3 + {"ok":false,"motivo":"login","passo":...} se o login não entrar (captcha, senha); código 2 + print/passo em Scripts/_socorro/.
// Usuário, senha e token só passam pela memória; nunca vão para a saída nem para o _socorro.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const fs = require('fs'), path = require('path'), logins = require('./logins');
const FAT = path.dirname(__dirname), COM = path.join(FAT, 'Comissoes');
const PORTAL = 'https://corretor.sulamericaseguros.com.br/', COMISSOES = PORTAL + 'area-logada/#/comissoes';
const API = 'https://remuneracao-corretor-newsas.paas.sulamerica.com.br/api/v1/comissoes/';
const CIA = '9512', PERFIL = path.join(process.env.LOCALAPPDATA, 'Shaddai', 'chrome_sulamerica');
let passo = 'início', aba = null;
const sai = (cod, obj) => { console.log(JSON.stringify(obj)); process.exit(cod); };
const etapa = s => { passo = s; console.error(new Date().toLocaleTimeString('pt-BR'), s); };
const br = iso => (iso || '').split('-').reverse().join('/');
const erroLogin = () => new Error('login');

// como os cards mostram: "SAUDE E ODONTO" -> "Saude e Odonto"; 0/vazio -> "-"
const PEQ = new Set(['e', 'de', 'da', 'do', 'das', 'dos']);
const titulo = s => String(s || '').toLowerCase().replace(/\S+/g, (w, i) => (i && PEQ.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
const tr = v => (v === undefined || v === null || v === '' || v === 0 || v === '0' ? '-' : String(v).replace(/\s+/g, ' ').trim());
const rs = v => 'R$' + (v || '0,00');

function card(n, l) {
  return {
    extrato: String(n), 'Nome': titulo(l.segurado), 'Apólice/Titulo': tr(l.apoliceVinculada), 'Tipo de documento': titulo(l.tipoDocumento),
    'Produto': titulo(l.produto), 'Proposta': tr(l.proposta), 'Sucursal': tr(l.sucursal), 'Contrato/Empresa': tr(l.contrato),
    'Item/Plano': tr(l.itemContrato), 'Valor Prêmio Total': rs(l.valorPremioTotal), 'Valor Remuneração': rs(l.valorRemuneracao),
    'Remuneração': `${l.percentualRemuneracao ?? 0}%`.replace('.', ','), 'Tipo remuneração': tr(l.tipoRemuneracao),
    'Grupo faturamento': tr(l.grupoFaturamento), 'Data pagamento': br(l.data), 'Parcela atual': tr(l.parcelaAtual),
    'Total de parcelas': tr(l.totalParcelas), 'Parcela remuneração': tr(l.parcelaRemuneracao),
    'Total de parc. remuneradas': tr(l.totalParcelasRemuneracao), 'Ação apoio': tr(l.acaoApoio), 'CIA': tr(l.cia),
    'Código Produtor': tr(l.codProdr), 'Documento': tr(l.documento), 'EA': tr(l.estruturaApoio), 'EV': tr(l.estruturaVenda),
    'UOP': tr(l.uop), 'Situação': titulo(l.situacao), 'Início de Vigência': br(l.dataIniVigencia),
  };
}

async function entra(page) {
  etapa('abrir o Portal do Corretor');
  await page.goto(COMISSOES, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  if (page.url().includes('area-logada')) return; // sessão guardada no perfil ainda vale
  etapa('login no Portal do Corretor');
  await page.getByText('Continuar', { exact: true }).click({ timeout: 3000 }).catch(() => {}); // aviso de cookies essenciais
  const l = logins.ativos('sulamerica')[0];
  if (!l) { passo = 'nenhum login cadastrado (atalho "Cadastrar login SulAmerica")'; throw erroLogin(); }
  await logins.preencheLogin(page, logins.credencial('sulamerica', l.apelido));
  etapa('login: esperando a área logada (se aparecer captcha, resolva na janela; espero até 3 min)');
  if (!await page.waitForURL(/area-logada/, { timeout: 180000 }).then(() => true, () => false)) {
    if (await page.locator('iframe[src*="recaptcha"][src*="bframe"]').filter({ visible: true }).count()) passo = 'captcha do login (ninguém resolveu em 3 min)';
    throw erroLogin();
  }
  logins.marca('sulamerica', l.apelido, { ultimo_sucesso: new Date().toISOString() });
}

async function comissao(ini, fim, saida) {
  const ctx = await chromium.launchPersistentContext(PERFIL, { headless: false, channel: 'chrome', viewport: null });
  try {
    const page = aba = ctx.pages()[0] || await ctx.newPage();
    // o token de acesso só existe nas chamadas que a própria página faz; escuto desde antes do login
    let token = null;
    page.on('request', q => { if (q.url().startsWith(API) && q.headers()['x-auth-token']) token = q.headers()['x-auth-token']; });
    await entra(page);
    etapa('Comissões e Demonstrativos');
    if (!page.url().includes('#/comissoes')) await page.goto(COMISSOES, { waitUntil: 'domcontentloaded', timeout: 90000 });
    for (let t = 0; t < 60 && !token; t++) await page.waitForTimeout(1000);
    if (!token) throw new Error('a tela de comissões não chamou a API em 60 s');
    const api = u => page.evaluate(async ([u, tk]) => {
      const r = await fetch(u, { headers: { accept: 'application/json', 'x-auth-token': tk }, signal: AbortSignal.timeout(90000) });
      return r.ok ? r.json() : { erro: r.status };
    }, [API + u, token]);
    etapa(`Extrato pagamento: CIA ${CIA}, pagamentos de ${br(ini)} a ${br(fim)}`);
    let pags = [];
    for (let a = +ini.slice(0, 4); a <= +fim.slice(0, 4); a++) {
      const j = await api(`extratos?ano=${a}&codCia=${CIA}`);
      if (j.erro) throw new Error(`a API devolveu HTTP ${j.erro} na lista de pagamentos de ${a}`);
      pags = pags.concat(j);
    }
    pags = pags.filter(p => p.dataEmissaoExtratoAtual >= ini && p.dataEmissaoExtratoAtual <= fim);
    if (!pags.length) { saida.sem_dados.push(`nenhum pagamento da CIA ${CIA} no período`); return; }
    const meses = {};
    for (const p of pags) (meses[p.dataEmissaoExtratoAtual.slice(0, 7)] = meses[p.dataEmissaoExtratoAtual.slice(0, 7)] || []).push(p);
    for (const [mes, ps] of Object.entries(meses).sort()) {
      const arq = path.join(COM, mes, 'SulAmerica', `extratos_${CIA}.json`);
      const d = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : { cia: CIA, lidoEm: null, extratos: [], rows: [] };
      const ja = new Set(d.extratos.map(e => String(e.id)));
      let novos = 0;
      for (const p of ps.sort((a, b) => a.dataEmissaoExtratoAtual.localeCompare(b.dataEmissaoExtratoAtual))) {
        const n = String(p.numExtratoProdr);
        if (ja.has(n)) { saida.repetidos.push(`${arq} (extrato ${n})`); continue; }
        etapa(`Gerar extrato ${n} (${br(p.dataEmissaoExtratoAtual)} / R$${p.valTotalRemun})`);
        const j = await api(`extratos?idExtrato=${n}`), e = Array.isArray(j) ? j[0] : null;
        if (!e) throw new Error(`a API não devolveu o extrato ${n}` + (j && j.erro ? ` (HTTP ${j.erro})` : ''));
        const em = br(e.dataEmissaoExtratoAtual);
        d.extratos.push({ id: n, opt: `${em} / R$${e.valTotalRemun}`, emissao: em, liquido: rs(e.valLiqExtrato), remun: rs(e.valTotalRemun),
          debito: rs(e.valTotalDebito), credito: rs(e.valTotalCredito) });
        d.rows.push(...(e.lancamentos || []).map(l => card(n, l)));
        if (!(e.lancamentos || []).length) saida.sem_dados.push(`extrato ${n} sem lançamentos`);
        novos++;
      }
      if (!novos) continue;
      d.lidoEm = new Date().toISOString();
      fs.mkdirSync(path.dirname(arq), { recursive: true });
      fs.writeFileSync(arq, JSON.stringify(d, null, 1), 'utf8');
      saida.arquivos.push(arq);
    }
  } catch (e) {
    if (e.message !== 'login') e.print = await socorro(e);
    throw e;
  } finally { await ctx.close().catch(() => {}); }
}

// Faturas: Saúde Online Empresa (saude.sulamericaseguros.com.br/empresa), um login por empresa (código da empresa + usuário + senha),
// cadastrados no atalho "Cadastrar login empresa SulAmerica". Navegação e download em portal_empresa.js.
//   node baixar_sulamerica.js faturas 2026-11  -> boletos a enviar\SUL AMERICA\11-26\<APELIDO>\*.pdf
const EMPRESA = {
  op: 'sulamerica', nome: 'SulAmerica', pasta: 'SUL AMERICA',
  async entra(page, l, c) {
    // às vezes o site não responde na 1ª tentativa: tenta de novo uma vez
    await page.goto('https://saude.sulamericaseguros.com.br/empresa/login/', { waitUntil: 'commit', timeout: 90000 })
      .catch(() => page.goto('https://saude.sulamericaseguros.com.br/empresa/login/', { waitUntil: 'commit', timeout: 90000 }));
    await page.locator('#onetrust-reject-all-handler').click({ timeout: 5000 }).catch(() => {});
    // o site demora a terminar de carregar (domcontentloaded não chega em 90 s): espera só o campo
    await page.locator('#code').fill(l.codigo || '', { timeout: 90000 });
    await page.locator('#user').fill(c.usuario);
    await page.locator('#senha').fill(c.senha);
    await page.locator('#entrarLogin').click();
    // captcha: a janela espera até 3 min alguém resolver
    return page.waitForFunction(() => !location.pathname.includes('/login') && !document.querySelector('#senha'), null, { timeout: 180000 })
      .then(() => true, () => false);
  },
  menus: [],
  prefixo: l => (l.codigo ? `${l.codigo} - ` : ''), // como os arquivos da pasta: "8J3U6 - ..."
  // passos do Bruno (09/11/2026): 1) 2ª via de Fatura -> clicar na competência com link = boleto;
  // 2) Faturamento > Emissão de Fatura de Prêmio > Anexos > Relação de Segurados Ativos > Solicitar -> linha emitida no mês: PDF, TXT e CSV
  async baixa(page, comp, h) {
    const pe = require('./portal_empresa'), mes = h.mesAno(comp), espera = () => page.waitForTimeout(6000);
    let n = 0;
    h.passo('2ª via de Fatura');
    await page.getByText('Continuar', { exact: true }).click({ timeout: 3000 }).catch(() => {}); // faixa de cookies
    // o 1º "2ª via de Fatura" é o do menu Faturamento (escondido); o dos Atalhos é o visível
    await page.locator('a:visible').filter({ hasText: /2.? via de Fatura/i }).first().click({ timeout: 30000 });
    await page.waitForTimeout(4000);
    const link = page.locator('a').filter({ hasText: new RegExp(`^\\s*${mes.replace('/', '\\/')}\\s*$`) }).first();
    if (await link.count()) { h.passo(`boleto ${mes}`); await link.click(); n++; await espera(); }
    else { // print da 2ª via para conferir depois
      h.aviso(`boleto de ${mes} ainda sem link na 2ª via`);
      await page.screenshot({ path: path.join(__dirname, '_socorro', `sulamerica_2via_sem_${mes.replace('/', '-')}_${Date.now()}.png`), fullPage: true, timeout: 20000 }).catch(() => {});
    }
    h.passo('Emissão de Fatura de Prêmio > Anexos');
    await page.goto('https://saude.sulamericaseguros.com.br/empresa/faturamento/emissao-de-fatura-de-premio/', { waitUntil: 'commit', timeout: 90000 });
    await page.locator('input[type=radio]:visible').first().waitFor({ timeout: 90000 }); // há um rádio escondido da busca no topo
    if (!await pe.marcaRadio(page, 'anexos')) throw new Error('não achei a opção "Anexos"');
    await pe.botao(page, 'Consultar').click();
    await page.waitForTimeout(4000);
    h.passo('Anexos > Relação de Segurados Ativos');
    if (!await pe.marcaRadio(page, 'relação de segurados ativos')) throw new Error('não achei a opção "Relação de Segurados Ativos"');
    await pe.botao(page, 'Solicitar').click();
    await page.waitForTimeout(4000);
    // linha emitida no mês da competência (ex.: 11/11/2026 para 11/2026): PDF, TXT e CSV
    // tabelas dentro de tabelas e uma tabela escondida com a mesma data: só a linha que tem os ícones
    const linha = page.locator('tr:not(:has(tr))').filter({ hasText: new RegExp(`\\d\\d\\/${mes.replace('/', '\\/')}`) })
      .filter({ has: page.locator('a, img, input[type=image]') }).first();
    if (!await linha.count()) { h.aviso(`relação de segurados ativos de ${mes} ainda não emitida`); return n; }
    // ícones PDF/TXT/CSV: link, ou imagem clicável sem link em volta
    const icones = linha.locator('a:visible, img:visible:not(a img), input[type=image]:visible');
    if (!await icones.count()) fs.writeFileSync(path.join(__dirname, '_socorro', `sulamerica_linha_${mes.replace('/', '-')}.html`), await linha.evaluate(e => e.outerHTML));
    for (let i = 0, t = await icones.count(); i < t; i++) {
      h.passo(`relação de segurados ${mes} (${i + 1}/${t})`);
      await icones.nth(i).click(); n++; await espera();
    }
    return n;
  },
};

(async () => {
  const [cmd, ini, fim = new Date().toLocaleDateString('sv-SE')] = process.argv.slice(2);
  if (cmd === 'faturas' && /^\d{4}-\d\d$/.test(ini || '')) {
    if (fim && !/^\d{4}-/.test(fim)) EMPRESA.so = fim.toUpperCase().split(','); // node baixar_<op>.js faturas 2026-11 COMUNA,SWB
    const s = await require('./portal_empresa').faturas(chromium, EMPRESA, ini, { ok: true, arquivos: [], repetidos: [], sem_dados: [], falhas: [] });
    sai(s.ok ? 0 : 3, s);
  }
  if (cmd !== 'comissao' || !/^\d{4}-\d\d-\d\d$/.test(ini || '') || !/^\d{4}-\d\d-\d\d$/.test(fim)) {
    console.error('uso: node baixar_sulamerica.js comissao AAAA-MM-DD [AAAA-MM-DD] | faturas AAAA-MM'); process.exit(1);
  }
  const saida = { ok: true, arquivos: [], repetidos: [], sem_dados: [] };
  await comissao(ini, fim, saida);
  sai(0, saida);
})().catch(async e => {
  if (e.message === 'login') sai(3, { ok: false, motivo: 'login', passo });
  sai(2, { ok: false, motivo: String(e.message || e).split('\n')[0], passo, print: e.print || await socorro(e) });
});

// print + passo em Scripts/_socorro (só a URL sem parâmetros; o token nunca entra)
async function socorro(e) {
  const so = path.join(__dirname, '_socorro'), q = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
  fs.mkdirSync(so, { recursive: true });
  const png = path.join(so, `sulamerica_${q}.png`);
  if (aba) await aba.screenshot({ path: png, fullPage: true }).catch(() => {});
  fs.writeFileSync(png.replace(/\.png$/, '.txt'), `passo: ${passo}\nerro: ${e.stack || e}\nurl: ${aba ? aba.url().split('?')[0] : '-'}\n`);
  return png;
}
