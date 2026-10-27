// Agente Faturas/Comissão Bradesco - baixa os kits de faturamento (PDF) e o extrato de comissão (.xls) do Portal de Negócios.
// Só baixa arquivos: não grava na base nem no Supabase. Precisa do Chrome que o atalho "Entrar na Bradesco" deixa logado
// na porta 9333; trabalha numa aba própria aberta a partir da aba logada (o portal guarda a sessão por aba) e fecha no fim.
// Uso:
//   node baixar_bradesco.js faturas 2026-11                        -> Faturas/Bradesco_portal/2026-11/<nome do portal>.pdf
//   node baixar_bradesco.js comissao 2026-10-01 2026-10-26         -> Comissoes/2026-10/BradescoSaude/SAUDESA 01-10 a 26-10-26 COMISSAO BRADESCO.xls
//   (dá para juntar os dois na mesma chamada). Depois: rodar.py faturas bradesco <data> --entrada <pasta dos kits>.
// Saída: uma linha JSON {"ok":true,"arquivos":[...],"repetidos":[...]}. Arquivo que já existe com o mesmo nome não é regravado.
// Erros: código 3 + {"ok":false,"motivo":"login"} se não houver aba logada; código 2 + print/passo em Scripts/_socorro/.
// Caminho no portal: SAÚDE -> Faturas "Ver detalhes" -> filtro "Mês de competência" -> marcar todas -> Opções de Download -> PDF;
// SAÚDE -> COMISSÕES -> Extrato de comissões -> Período -> Buscar -> Ver detalhes -> aba SAÚDE S.A. -> .XLS.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const fs = require('fs'), path = require('path');
const FAT = path.dirname(__dirname);
const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
let passo = 'início', page = null, browser = null;
const sai = (cod, obj) => { console.log(JSON.stringify(obj)); process.exit(cod); };

// Os downloads do portal são links blob:/data: clicados por script; o Chrome via CDP não entrega o arquivo,
// então intercepto o clique e leio o conteúdo dentro da página.
function gancho() {
  if (window.__baixados) return;
  window.__baixados = [];
  const pega = a => {
    if (!(a instanceof HTMLAnchorElement) || !/^(blob|data):/.test(a.href)) return false;
    const nome = a.download || 'arquivo', h = a.href;
    window.__baixados.push(fetch(h).then(r => r.blob()).then(b => new Promise(res => {
      const fr = new FileReader(); fr.onload = () => res({ nome, dados: fr.result.split(',')[1] }); fr.readAsDataURL(b);
    })));
    return true;
  };
  const clk = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!pega(this)) return clk.call(this); };
  const de = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) { if (ev.type === 'click' && pega(this)) return true; return de.call(this, ev); };
}

// espera os arquivos pararem de chegar (ou chegar `esperados`) e devolve [{nome, dados}]
async function recolhe(esperados, limite = 180000) {
  let n = -1, parado = 0;
  for (let t = 0; t < limite; t += 2000) {
    const k = await page.evaluate(() => window.__baixados.length);
    if (k >= esperados) break;
    parado = k === n && k > 0 ? parado + 2000 : 0; n = k;
    if (parado >= 20000) break;
    await page.waitForTimeout(2000);
  }
  return page.evaluate(async () => { const r = await Promise.all(window.__baixados); window.__baixados = []; return r; });
}

function grava(pasta, nome, dados, saida) {
  fs.mkdirSync(pasta, { recursive: true });
  const f = path.join(pasta, nome);
  if (fs.existsSync(f)) return saida.repetidos.push(f);
  fs.writeFileSync(f, Buffer.from(dados, 'base64'));
  saida.arquivos.push(f);
}

async function fechaAvisos() {
  for (const b of await page.locator('.modal.in button.close').all()) await b.click({ timeout: 2000 }).catch(() => {});
}

async function painelSaude() {
  passo = 'abrir SAÚDE';
  await page.locator('a,div,span').filter({ hasText: /^SAÚDE$/ }).first().click();
  await page.locator('div[openmenuoptions]', { hasText: 'COMISSÕES' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  await fechaAvisos();
}

async function faturas(comp, saida) {
  const [y, m] = comp.split('-').map(Number), rotulo = `${MES[m - 1]} / ${y}`;
  await painelSaude();
  passo = 'Faturas: Ver detalhes';
  await page.locator('.cartao__container__botao-detalhes__texto').first().click();
  await page.locator('.cabecalho__botao-filtros').waitFor({ timeout: 60000 });
  passo = `Faturas: filtro ${rotulo}`;
  await page.locator('.cabecalho__botao-filtros').click();
  const op = page.getByText(rotulo, { exact: true }).first();
  if (!await op.isVisible({ timeout: 5000 }).catch(() => false)) throw new Error(`competência ${rotulo} não aparece no filtro do portal`);
  await op.click();
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await page.waitForTimeout(3000);
  passo = 'Faturas: marcar todas';
  await page.locator('thead mat-checkbox').first().click();
  const sel = (await page.getByText(/Você selecionou \d+ kit/).innerText({ timeout: 10000 })).match(/\d+/)[0] * 1;
  passo = `Faturas: download PDF (${sel} kits)`;
  // os kits são montados na página e saem como data:application/pdf; o evento do CDP já traz o arquivo inteiro
  const cdp = await browser.newBrowserCDPSession(), arqs = [];
  cdp.on('Browser.downloadWillBegin', e => {
    if (e.url.startsWith('data:')) arqs.push({ nome: e.suggestedFilename, dados: e.url.slice(e.url.indexOf(',') + 1) });
  });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: path.join(require('os').tmpdir(), 'baixar_bradesco'), eventsEnabled: true });
  // às vezes o clique na opção não dispara nada (sem o aviso "Download(s) iniciado(s)"): tenta até 3 vezes
  for (let tent = 1; tent <= 3 && !arqs.length; tent++) {
    await page.getByText('Opções de Download').click();
    await page.waitForTimeout(1000);
    await page.locator('.botao-seletor__opcoes__item', { hasText: 'em PDF' }).click();
    for (let t = 0; t < 90000 && !arqs.length; t += 2000) await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Ok' }).click({ timeout: 3000 }).catch(() => {});
  }
  for (let t = 0, n = -1, parado = 0; arqs.length && t < 600000 && arqs.length < sel && parado < 30000; t += 2000) {
    parado = arqs.length === n && n > 0 ? parado + 2000 : 0; n = arqs.length;
    await page.waitForTimeout(2000);
  }
  await page.getByRole('button', { name: 'Ok' }).click({ timeout: 5000 }).catch(() => {}); // sem marcar "download realizado"
  if (!arqs.length) throw new Error('o portal não entregou nenhum PDF');
  const pasta = path.join(FAT, 'Faturas', 'Bradesco_portal', comp);
  for (const a of arqs) grava(pasta, a.nome, a.dados, saida);
  saida.faturas = { competencia: comp, selecionados: sel, recebidos: arqs.length, pasta };
}

async function comissao(ini, fim, saida) {
  const br = d => d.split('-').reverse().join('/');
  await painelSaude();
  passo = 'Comissões: Extrato de comissões';
  await page.locator('div[openmenuoptions]', { hasText: 'COMISSÕES' }).click();
  await page.getByText('Extrato de comissões', { exact: true }).click();
  await page.locator('#botaoFiltro').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.jQuery && jQuery('#filtroPeriodo').data('daterangepicker'), null, { timeout: 30000 });
  passo = `Comissões: período ${br(ini)} a ${br(fim)}`;
  // o campo é somente leitura; a página só lê o período pelo callback do daterangepicker
  await page.evaluate(([a, b]) => {
    const d = jQuery('#filtroPeriodo').data('daterangepicker');
    d.setStartDate(a); d.setEndDate(b); d.updateElement(); d.callback(d.startDate.clone(), d.endDate.clone(), null);
  }, [br(ini), br(fim)]);
  await page.click('#botaoFiltro');
  const txt = `Todas as faturas no período: ${br(ini)} a ${br(fim)}`;
  await page.getByText(txt).first().waitFor({ timeout: 60000 }).catch(() => {
    throw new Error(`o portal não aceitou o período (máx. 90 dias, últimos 12 meses, até hoje)`);
  });
  await page.waitForTimeout(3000);
  passo = 'Comissões: Ver detalhes';
  await page.click('#botaoVerDetalhes');
  await page.locator('#saude-sa-tab').waitFor({ timeout: 90000 });
  passo = 'Comissões: aba SAÚDE S.A.';
  if (!/active/.test(await page.locator('#saude-sa-tab').getAttribute('class'))) await page.locator('#saude-sa-tab a').click();
  const xls = page.locator('button:has-text(".XLS")').filter({ visible: true }).first();
  await xls.waitFor({ timeout: 90000 });
  passo = 'Comissões: download .XLS';
  await page.evaluate(gancho);
  await xls.click();
  const [a] = await recolhe(1, 120000);
  if (!a) throw new Error('o portal não entregou o .xls');
  const dm = d => d.slice(8, 10) + '-' + d.slice(5, 7);
  const nome = `SAUDESA ${dm(ini)} a ${dm(fim)}-${fim.slice(2, 4)} COMISSAO BRADESCO.xls`;
  grava(path.join(FAT, 'Comissoes', ini.slice(0, 7), 'BradescoSaude'), nome, a.dados, saida);
}

(async () => {
  const args = process.argv.slice(2), tarefas = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'faturas' && /^\d{4}-\d{2}$/.test(args[i + 1])) tarefas.push(['faturas', args[++i]]);
    else if (args[i] === 'comissao' && /^\d{4}-\d{2}-\d{2}$/.test(args[i + 1]) && /^\d{4}-\d{2}-\d{2}$/.test(args[i + 2])) tarefas.push(['comissao', args[++i], args[++i]]);
    else sai(1, { ok: false, motivo: 'uso: node baixar_bradesco.js faturas AAAA-MM | comissao AAAA-MM-DD AAAA-MM-DD' });
  }
  if (!tarefas.length) sai(1, { ok: false, motivo: 'uso: node baixar_bradesco.js faturas AAAA-MM | comissao AAAA-MM-DD AAAA-MM-DD' });

  passo = 'conectar no Chrome (porta 9333)';
  browser = await chromium.connectOverCDP('http://localhost:9333').catch(() => null);
  if (!browser) sai(3, { ok: false, motivo: 'login' });
  const ctx = browser.contexts()[0];
  const logada = ctx && ctx.pages().find(p => p.url().includes('/arealogada/'));
  if (!logada) sai(3, { ok: false, motivo: 'login' });
  passo = 'abrir aba de trabalho';
  [page] = await Promise.all([ctx.waitForEvent('page'), logada.evaluate(() => { window.open(location.href.split('#')[0], '_blank'); })]);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  if (!page.url().includes('/arealogada/')) { await page.close(); sai(3, { ok: false, motivo: 'login' }); }

  const saida = { ok: true, arquivos: [], repetidos: [] };
  for (const [t, ...p] of tarefas) await (t === 'faturas' ? faturas(p[0], saida) : comissao(p[0], p[1], saida));
  await page.close();
  sai(0, saida);
})().catch(async e => {
  const so = path.join(__dirname, '_socorro'), q = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
  fs.mkdirSync(so, { recursive: true });
  const png = path.join(so, `bradesco_${q}.png`);
  if (page) await page.screenshot({ path: png, fullPage: true }).catch(() => {});
  fs.writeFileSync(png.replace(/\.png$/, '.txt'), `passo: ${passo}\nerro: ${e.stack || e}\nurl: ${page ? page.url() : '-'}\n`);
  if (page) await page.close().catch(() => {});
  sai(2, { ok: false, motivo: String(e.message || e).split('\n')[0], passo, print: png });
});
