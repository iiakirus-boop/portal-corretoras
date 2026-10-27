// Agente Faturas/Comissão Porto Saúde - baixa fatura (PDF), boleto, exportação de vidas (.zip + TXT) e o analítico de comissão (HTML)
// do Corretor Online. Só baixa arquivos: não grava na base nem no Supabase. Precisa do Chrome que o atalho "Entrar na Porto" deixa
// logado na porta 9334; trabalha numa aba própria aberta a partir da aba logada e fecha no fim.
// Uso:
//   node baixar_porto.js faturas 2026-11                 -> Faturas/2026-11/PortoSaude/<sub> - <NOME CURTO>/<sub> - <NOME CURTO> VIDAS|BOLETO|FATURADOS PORTO SAUDE 11-26
//   node baixar_porto.js comissao 2026-10-01 2026-10-26  -> Comissoes/<mês do pagamento>/PortoSaude/<OP> - PORTOMED|SEGURO SAUDE|SEGUROS GERAIS COMISSAO DD-MM-AA.html
//   node baixar_porto.js faturas 2026-11 1979216,1808600  -> só essas subestipulantes (teste)
//   (dá para juntar os dois na mesma chamada).
// Saída: uma linha JSON {"ok":true,"arquivos":[...],"repetidos":[...],"pagos":[...],"sem_dados":[...]}. Arquivo que já existe não é baixado de novo.
// Erros: código 3 + {"ok":false,"motivo":"login"} sem aba logada (ou tela de login/código/captcha); código 2 + print/passo em Scripts/_socorro/.
// Caminho no portal: Saúde > links úteis > "Resumo da Fatura" (frame Filtros.aspx). Para cada estipulante ativo, cada subestipulante e a
// 1ª unidade: ResumoFaturaFull.aspx?comp=MMAAAA&nest&nsub&nuni; os botões Imprimir/Exportação/Boleto são links baixados por fetch.
// Comissão: Comissões > Pagamentos/Pendências > TODAS, Pagamentos, Período > cada ordem > planilha (gerarplanilhaanalitico.do).
// Os parâmetros de sessão (sesnum, cpf, webusrcod) são lidos da aba logada na hora e nunca vão para a saída nem para o _socorro.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const FAT = path.dirname(__dirname);
const COL = 'https://corretor.portoseguro.com.br/novocol/';
const RFC = 'https://wwws.portoseguro.com.br/ResumoFaturamentoCol/Pages/';
const EMPRESA = { 1: 'SEGUROS GERAIS', 31: 'PORTOMED', 50: 'SEGURO SAUDE', 32: 'ODONTO', 14: 'VIDA' };
let passo = 'início', page = null;
const sai = (cod, obj) => { console.log(JSON.stringify(obj)); process.exit(cod); };
const semSessao = s => String(s).replace(/(cpf|sesnum|webusrcod|Token)=[^&#'"\s]+/gi, '$1=X');

async function confereLogin() {
  const u = page.url();
  if (!/portoseguro\.com\.br/.test(u) || /login|logon|auth/i.test(u.split('?')[0]) ||
      await page.locator('#logonPrincipal, #btnAvancarSusep, iframe[src*="recaptcha"][src*="bframe"]').filter({ visible: true }).count()) throw new Error('login');
}

function grava(f, buf, saida) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
  saida.arquivos.push(f);
}

// baixa por fetch dentro da página (o portal só entrega com os cookies da sessão)
async function baixa(url, metodo = 'GET', corpo = null) {
  const r = await page.evaluate(async ([url, metodo, corpo]) => {
    const r = await fetch(url, { method: metodo, credentials: 'include', body: corpo,
      headers: corpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {} });
    const b = new Uint8Array(await r.arrayBuffer());
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return { st: r.status, ct: r.headers.get('content-type') || '', dados: btoa(s) };
  }, [url, metodo, corpo]);
  if (r.st !== 200) throw new Error(`download devolveu HTTP ${r.st}`);
  return { ct: r.ct, buf: Buffer.from(r.dados, 'base64') };
}

// o Imprimir devolve o PDF com o HTML da página colado depois do %%EOF; sem cortar, o PDF fica "danificado"
function pdfLimpo(buf) {
  const h = buf.indexOf('<!DOCTYPE'), e = h < 0 ? -1 : buf.lastIndexOf('%%EOF', h);
  return e < 0 ? buf : buf.subarray(0, e + 5);
}

// lê um .zip (deflate ou store) pelo diretório central e devolve [{nome, dados}]
function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip inválido');
  const out = [];
  for (let i = 0, p = buf.readUInt32LE(e + 16); i < buf.readUInt16LE(e + 10); i++) {
    const met = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28);
    const nome = buf.toString('latin1', p + 46, p + 46 + nl), loc = buf.readUInt32LE(p + 42);
    const ini = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28), raw = buf.subarray(ini, ini + tam);
    if (!nome.endsWith('/')) out.push({ nome, dados: met === 8 ? zlib.inflateRawSync(raw) : raw });
    p += 46 + nl + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

// nome curto por subestipulante, tirado das pastas/arquivos que a equipe já usa (Faturas/AAAA-MM/PortoSaude)
function nomesCurtos() {
  const m = {}, re = /^(\d+) - (.+?)(?: (?:VIDAS|BOLETO|FATURADOS) PORTO (?:SAUDE|ODONTO).*)?$/;
  for (const mes of fs.readdirSync(path.join(FAT, 'Faturas')).filter(d => /^\d{4}-\d\d$/.test(d)).sort()) {
    const ps = path.join(FAT, 'Faturas', mes, 'PortoSaude');
    if (!fs.existsSync(ps)) continue;
    for (const d of fs.readdirSync(ps)) {
      const a = d.match(re); if (a) m[a[1]] = a[2];
      if (fs.statSync(path.join(ps, d)).isDirectory()) for (const f of fs.readdirSync(path.join(ps, d))) { const b = f.match(re); if (b && !m[b[1]]) m[b[1]] = b[2]; }
    }
  }
  return m;
}
// shortcut: sub novo sem pasta anterior recebe as 2 primeiras palavras do nome no portal; a equipe confere pelo aviso
const curtoPortal = s => s.replace(/^\d+ - /, '').replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A|SOCIEDADE|DE|DA|DO|E)\b/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ');

async function abreFiltros() {
  passo = 'abrir Resumo da Fatura';
  await page.goto(COL + 'produto/saude/links-uteis?menuid=COL-02X27', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const a = page.locator('a', { hasText: 'Resumo da Fatura' }).first();
  await a.waitFor({ timeout: 60000 }).catch(async () => { await confereLogin(); throw new Error('link "Resumo da Fatura" não apareceu'); });
  await page.goto(await a.getAttribute('href'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  let f;
  for (let t = 0; t < 60 && !(f = page.frames().find(x => /Filtros\.aspx/.test(x.url()))); t++) await page.waitForTimeout(1000);
  if (!f) { await confereLogin(); throw new Error('a tela de filtros do Resumo da Fatura não abriu'); }
  await f.waitForFunction(() => { const s = document.querySelector('#bodyContent_ddlEstipulante'); return s && s.selectize && Object.keys(s.selectize.options).length > 1; }, null, { timeout: 60000 });
  return f;
}

async function faturas(comp, saida, so) {
  const [y, m] = comp.split('-'), mmaa = `${m}-${y.slice(2)}`, nomes = nomesCurtos();
  const f = await abreFiltros();
  passo = 'listar estipulantes, subestipulantes e unidades';
  const ws = (metodo, codigo) => f.evaluate(async ([metodo, codigo]) => {
    const r = await fetch('Filtros2.aspx/' + metodo, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ codigo: String(codigo), ativo: true }) });
    return JSON.parse((await r.json()).d);
  }, [metodo, codigo]);
  const ests = await f.evaluate(() => Object.values(document.querySelector('#bodyContent_ddlEstipulante').selectize.options)
    .filter(o => /^\d+$/.test(o.value)).map(o => ({ h: o.value, cod: o.text.split(' - ')[0], nome: o.text.split(' - ').slice(1).join(' - ') })));
  const alvos = [], subNome = {};
  for (const e of ests) {
    const subs = await ws('GetContratoByEstipulante', e.h);
    if (!subs.length) { saida.sem_dados.push({ estipulante: e.cod.replace(/^0+/, ''), empresa: e.nome, motivo: 'sem subestipulante ativa' }); continue; }
    for (const s of subs) {
      subNome[s.nr] = s.c;
      const us = await ws('GetLotacaoByContrato', s.h);
      if (!us.length) { saida.sem_dados.push({ estipulante: e.cod.replace(/^0+/, ''), sub: String(s.nr), motivo: 'sem unidade de cobrança ativa' }); continue; }
      // cada unidade tem título próprio (ex.: IAV 01 e 02) e o portal nem sempre lista a 01 primeiro
      for (const u of us) alvos.push({ est: e.cod, sub: String(s.nr), nuni: u.cd.split(' - ')[0], portal: s.c });
    }
  }
  const nomeDe = sub => nomes[sub] || (saida.avisos.push(`sub ${sub} sem pasta anterior: nome curto "${curtoPortal(subNome[sub] || sub)}" tirado do portal, confira`), nomes[sub] = curtoPortal(subNome[sub] || sub));
  const titulos = new Set();
  saida.faturas = [];
  for (const a of alvos.filter(x => !so || so.includes(x.sub))) {
    passo = `fatura ${a.sub} ${comp}`;
    await page.goto(`${RFC}ResumoFaturaFull.aspx?comp=${m}${y}&nest=${a.est}&nsub=${a.sub.padStart(10, '0')}&nuni=${a.nuni}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const txt = await page.locator('body').innerText({ timeout: 60000 });
    if (/Ocorreu um erro ao realizar a requisi|SEM DADOS DISPON/i.test(txt) || !/T[íi]tulo:/.test(txt)) {
      await confereLogin();
      saida.sem_dados.push({ estipulante: a.est.replace(/^0+/, ''), sub: a.sub, unidade: Number(a.nuni), empresa: a.portal.replace(/^\d+ - /, '') });
      continue;
    }
    const pega = re => (txt.match(re) || [])[1];
    const titulo = pega(/T[íi]tulo:\s*(\d+)/), ref = pega(/Referencia:\s*(\d\d\/\d{4})/), estTela = pega(/Estipulante:\s*(\d+)/);
    if (ref !== `${m}/${y}` || Number(estTela) !== Number(a.est)) { saida.avisos.push(`sub ${a.sub}: tela mostra ${ref} / estipulante ${estTela}; nada baixado`); continue; }
    if (titulos.has(titulo)) continue; // outra subestipulante do mesmo título: já veio no .zip
    titulos.add(titulo);
    const nome = nomeDe(a.sub), base = `${a.sub} - ${nome}`, un = Number(a.nuni) > 1 ? ` U${String(Number(a.nuni)).padStart(2, '0')}` : '', pasta = path.join(FAT, 'Faturas', comp, 'PortoSaude', base);
    const links = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[onclick]')].map(e => {
      const u = (e.getAttribute('onclick').match(/window\.open\('([^']*)'/) || [])[1];
      return [e.title || e.innerText.trim(), { url: u ? new URL(u, location.href).href : '', off: e.classList.contains('button-disabled') || !u }];
    })));
    const bt = k => Object.entries(links).find(([t]) => new RegExp(k, 'i').test(t))?.[1] || { off: true };
    const vidas = Number(pega(/Saldo Atual\s+\d+\s+R\$\s*[\d.,]+\s+\d+\s+R\$\s*[\d.,]+\s+(\d+)/));
    const total = pega(/\bTotal\s+R\$\s*([\d.,]+)/), venc = pega(/Vencimento:\s*(\d\d\/\d\d\/\d{4})/);
    const reg = { sub: a.sub, unidade: Number(a.nuni), nome, titulo, vencimento: venc, vidas, total: total ? Number(total.replace(/\./g, '').replace(',', '.')) : null, boleto: 'aberto' };
    saida.faturas.push(reg);
    // FATURADOS (PDF)
    const pdf = path.join(pasta, `${base} FATURADOS PORTO SAUDE ${mmaa}${un}.pdf`);
    if (fs.existsSync(pdf)) saida.repetidos.push(pdf);
    else if (bt('Imprimir').off) saida.avisos.push(`${base}: botão Imprimir desabilitado`);
    else { passo = `fatura ${a.sub}: PDF`; const r = await baixa(bt('Imprimir').url); if (!/pdf/i.test(r.ct)) throw new Error(`${base}: Imprimir não devolveu PDF (${r.ct})`); grava(pdf, pdfLimpo(r.buf), saida); }
    // BOLETO: desabilitado = já pago
    const bol = path.join(pasta, `${base} BOLETO PORTO SAUDE ${mmaa}${un}.pdf`);
    if (bt('boleto').off) { reg.boleto = 'pago'; saida.pagos.push({ sub: a.sub, nome, titulo }); }
    else if (fs.existsSync(bol)) saida.repetidos.push(bol);
    else { passo = `fatura ${a.sub}: boleto`; const r = await baixa(bt('boleto').url); if (r.buf.subarray(0, 4).toString() !== '%PDF') throw new Error(`${base}: boleto não veio em PDF`); grava(bol, r.buf, saida); }
    // VIDAS (.zip + TXT extraído, um por sub/unidade)
    const zip = path.join(pasta, `${base} VIDAS PORTO SAUDE ${mmaa}${un}.zip`);
    if (fs.existsSync(zip)) { saida.repetidos.push(zip); continue; }
    if (bt('txt|Exporta').off) { saida.avisos.push(`${base}: Exportação Arquivos desabilitada`); continue; }
    passo = `fatura ${a.sub}: exportação`;
    const r = await baixa(bt('txt|Exporta').url);
    const txts = unzip(r.buf).filter(x => /\.txt$/i.test(x.nome));
    if (!txts.length) throw new Error(`${base}: .zip sem TXT`);
    grava(zip, r.buf, saida);
    for (const t of txts) {
      const [, sub2, uni] = path.basename(t.nome).split('_'), s2 = String(Number(sub2));
      const f2 = path.join(pasta, `${s2} - ${s2 === a.sub ? nome : nomeDe(s2)} VIDAS PORTO SAUDE ${mmaa}${uni && uni !== '01' ? ' U' + uni : ''}.txt`);
      if (fs.existsSync(f2)) saida.repetidos.push(f2); else grava(f2, t.dados, saida);
    }
    if (txts.length === 1 && !/^02\|/m.test(txts[0].dados.toString('latin1'))) saida.avisos.push(`${base}: TXT sem linhas 02 (vidas)`);
  }
}

async function comissao(ini, fim, saida) {
  const br = d => d.split('-').reverse().join('/');
  passo = 'abrir Comissões > Pagamentos/Pendências';
  // a URL do menu traz os parâmetros da sessão; leio da própria resposta do menu, sem guardar
  const menu = page.waitForResponse(r => r.url().includes('/home/v2/menu'), { timeout: 90000 });
  await page.goto(COL + 'homepage', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const j = JSON.parse(await (await menu.catch(async () => { await confereLogin(); throw new Error('o menu do portal não carregou'); })).text());
  const item = (j.menuList.find(x => /Comiss/.test(x.name))?.children || []).find(c => /Pagamentos/.test(c.name));
  if (!item) throw new Error('item Comissões > Pagamentos/Pendências não está no menu');
  await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const fr = () => page.frames().find(x => /demonstrativocomissaocorretor/.test(x.url()));
  for (let t = 0; t < 60 && !fr(); t++) await page.waitForTimeout(1000);
  let f = fr();
  if (!f) { await confereLogin(); throw new Error('a tela de pagamentos de comissão não abriu'); }
  passo = `Comissões: período ${br(ini)} a ${br(fim)}`;
  await f.locator('#codigoEmpresa').waitFor({ timeout: 60000 });
  await f.selectOption('#codigoEmpresa', { label: 'TODAS' });
  await f.selectOption('#susepCorretor', { index: 1 });
  await f.selectOption('#tipoPesquisa', { label: 'Pagamentos' });
  await f.check('input[name=criterioPesquisa][value="2"]');
  await f.fill('#periodoInc', br(ini)); await f.fill('#periodoFnl', br(fim));
  await Promise.all([f.waitForNavigation({ timeout: 120000 }).catch(() => {}), f.click('input[name=Submeter]')]);
  await page.waitForTimeout(2000);
  f = fr();
  const tela = await f.locator('body').innerText();
  if (!/RESUMO DE PAGAMENTOS/i.test(tela)) {
    if (/n[ãa]o (foram encontrad|exist)|nenhum/i.test(tela)) { saida.sem_dados.push({ comissao: `${ini} a ${fim}` }); return; }
    throw new Error('o portal não mostrou o resumo de pagamentos: ' + tela.replace(/\s+/g, ' ').slice(0, 150));
  }
  passo = 'Comissões: ler ordens';
  const ops = await f.evaluate(() => [...document.querySelectorAll('[href*="chamarPlanilha"],[onclick*="chamarPlanilha"]')].map(a => {
    const s = (a.getAttribute('onclick') || '') + (a.getAttribute('href') || ''), p = s.match(/chamarPlanilha\(([^)]*)\)/)[1].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
    return { op: p[0], emp: p[1], data: a.closest('tr').cells[0].innerText.trim(), args: p };
  }));
  if (!ops.length) throw new Error('nenhuma ordem de pagamento com planilha na tela');
  page = f; // o fetch precisa sair do frame do demonstrativo (mesma origem)
  saida.comissao = [];
  for (const o of ops) {
    const [d, mm, yy] = o.data.split('/'), emp = EMPRESA[o.emp] || `EMPRESA ${o.emp}`;
    const arq = path.join(FAT, 'Comissoes', `${yy}-${mm}`, 'PortoSaude', `${o.op} - ${emp} COMISSAO ${d}-${mm}-${yy.slice(2)}.html`);
    saida.comissao.push({ op: o.op, empresa: emp, data: o.data });
    if (fs.existsSync(arq)) { saida.repetidos.push(arq); continue; }
    passo = `Comissões: planilha da ordem ${o.op}`;
    const [op, ce, sus, susc, wu, sn] = o.args;
    const corpo = await f.evaluate(() => new URLSearchParams(new FormData(document.forms[0])).toString());
    const r = await baixa(`/demonstrativocomissaocorretor/gerarplanilhaanalitico.do?numOp=${op}&empresa.codigoEmpresa=${ce}&susep=${sus}&susepCorretor=${susc}&webusrcod=${wu}&sesnum=${sn}`, 'POST', corpo);
    if (!r.buf.toString('latin1').includes('Pagamentos de Comiss')) throw new Error(`a planilha da ordem ${o.op} não é o analítico de comissões`);
    grava(arq, r.buf, saida);
  }
}

(async () => {
  const args = process.argv.slice(2), tarefas = [];
  const uso = { ok: false, motivo: 'uso: node baixar_porto.js faturas AAAA-MM | comissao AAAA-MM-DD AAAA-MM-DD' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'faturas' && /^\d{4}-\d{2}$/.test(args[i + 1])) tarefas.push(['faturas', args[++i], /^\d+(,\d+)*$/.test(args[i + 1] || '') ? args[++i].split(',') : null]);
    else if (args[i] === 'comissao' && /^\d{4}-\d{2}-\d{2}$/.test(args[i + 1]) && /^\d{4}-\d{2}-\d{2}$/.test(args[i + 2])) tarefas.push(['comissao', args[++i], args[++i]]);
    else sai(1, uso);
  }
  if (!tarefas.length) sai(1, uso);

  passo = 'conectar no Chrome (porta 9334)';
  const browser = await chromium.connectOverCDP('http://localhost:9334').catch(() => null);
  if (!browser) sai(3, { ok: false, motivo: 'login' });
  const ctx = browser.contexts()[0];
  const logada = ctx && ctx.pages().find(p => p.url().startsWith(COL));
  if (!logada) sai(3, { ok: false, motivo: 'login' });
  passo = 'abrir aba de trabalho';
  [page] = await Promise.all([ctx.waitForEvent('page'), logada.evaluate(u => { window.open(u, '_blank'); }, COL + 'homepage')]);
  const aba = page;
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  const saida = { ok: true, arquivos: [], repetidos: [], pagos: [], sem_dados: [], avisos: [] };
  try {
    await confereLogin();
    for (const [t, ...p] of tarefas) { page = aba; await (t === 'faturas' ? faturas(p[0], saida, p[1]) : comissao(p[0], p[1], saida)); }
  } catch (e) { e.aba = aba; throw e; }
  await aba.close();
  sai(0, saida);
})().catch(async e => {
  const aba = e.aba || (page && page.close ? page : null);
  if (e.message === 'login') { if (aba) await aba.close().catch(() => {}); sai(3, { ok: false, motivo: 'login', passo }); }
  const so = path.join(__dirname, '_socorro'), q = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
  fs.mkdirSync(so, { recursive: true });
  const png = path.join(so, `porto_${q}.png`);
  if (aba) await aba.screenshot({ path: png, fullPage: true }).catch(() => {});
  fs.writeFileSync(png.replace(/\.png$/, '.txt'), semSessao(`passo: ${passo}\nerro: ${e.stack || e}\nurl: ${aba ? aba.url() : '-'}\n`));
  if (aba) await aba.close().catch(() => {});
  sai(2, { ok: false, motivo: semSessao(String(e.message || e).split('\n')[0]), passo, print: png });
});
