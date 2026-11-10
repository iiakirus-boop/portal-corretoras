// Agente Comissão Amil - baixa os extratos de comissão (TXT com #) do SisAmil. Só baixa arquivos: não grava na base nem no Supabase.
// Entra sozinho num Chrome próprio (com janela) com o 1º login ativo de 'amil' do atalho "Cadastrar login Amil" (logins.js).
// Caminho: Portal do Corretor Amil → Gestão comercial (abre o SisAmil em outra aba) → Relatórios Comissionamento → Extrato
//   (a lista do período é aberta direto pela URL que o próprio SisAmil usa no "Voltar") → "Arquivo Texto com Delimitador (#)"
//   → clicar no Valor líquido de cada linha (baixa o TXT).
// Uso:  node baixar_amil.js comissao 2026-10-01 2026-11-05
//   -> Comissoes/<AAAA-MM do pagamento>/Amil/EXTRATO_COMISSAO_<produtor>_<nº>_<OPERADORA>.txt (mesmo nome dos já existentes)
//   Baixa os extratos "Pago" com data de pagamento (efetivo, ou previsto se vazio) dentro do período. A lista é pedida pelo período
//   de apuração com 60 dias de folga antes do início, porque a Amil paga depois da apuração. Extrato ainda não pago
//   (ex.: "Aguarda Nota Fiscal") não é baixado: vai em avisos e entra numa próxima rodada, quando for pago.
//   Extrato que já existe em qualquer Comissoes/*/Amil = repetido (não baixa de novo).
// Saída: última linha JSON {"ok":true,"arquivos":[...],"repetidos":[...],"sem_dados":[...],"avisos":[...]}.
// Erros: código 3 + {"ok":false,"motivo":"login","passo":...} se o login não entrar; código 2 + print/passo em Scripts/_socorro/.
// Usuário e senha só passam pela memória (logins.credencial); nunca vão para a saída nem para o _socorro.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const fs = require('fs'), path = require('path'), logins = require('./logins');
const FAT = path.dirname(__dirname), COM = path.join(FAT, 'Comissoes');
const LOGIN = 'https://portalcorretor.amil.com.br/portal/web/servicos/usuario/corretor/login';
const SIS = 'https://portalcorretor.amil.com.br';
const EXTRATO = '/cms/asp/cms1005a.asp?pt=Extrato&pprf=PRODUTORCNPJ&pprm=S,S,S,S,N,N&pcf=CNPJ22.1&pm=22&contexto=Default&pr=N';
let passo = 'início', aba = null;
const sai = (cod, obj) => { console.log(JSON.stringify(obj)); process.exit(cod); };
const etapa = s => { passo = s; console.error(new Date().toLocaleTimeString('pt-BR'), s); };
const br = iso => iso.split('-').reverse().join('/');
const iso = d => d.split('/').reverse().join('-');
const erroLogin = () => new Error('login');

// extratos já baixados (qualquer mês): nº -> arquivo
function jaBaixados() {
  const m = {};
  for (const mes of fs.existsSync(COM) ? fs.readdirSync(COM) : []) {
    const d = path.join(COM, mes, 'Amil');
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) { const x = /^EXTRATO_COMISSAO_\d+_(\d+)_/.exec(f); if (x) m[x[1]] = path.join(d, f); }
  }
  return m;
}

// data de pagamento e operadora do TXT (mesmos campos que o comissao_amil.py lê)
function cabecalho(buf) {
  const t = buf.toString('latin1');
  const g = re => (re.exec(t) || [])[1] || '';
  return { op: g(/Operadora:#([^#]+)#/).trim(), produtor: g(/Produtor:#(\d+)/), pago: g(/Dt\. Pagto Efetivo:#(\d\d\/\d\d\/\d{4})/) || g(/Dt\. Pagto Previsto:#(\d\d\/\d\d\/\d{4})/),
    ok: t.includes('###Extrato') && t.includes('Porte Contrato#') };
}

async function entra(page) {
  etapa('login no Portal do Corretor');
  await page.goto(LOGIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('Rejeitar todos').click({ timeout: 5000 }).catch(() => {}); // cookies: só os essenciais
  const l = logins.ativos('amil')[0];
  if (!l) { passo = 'nenhum login cadastrado (atalho "Cadastrar login Amil")'; throw erroLogin(); }
  const c = logins.credencial('amil', l.apelido);
  await page.locator('input[type=password]').first().waitFor({ timeout: 60000 });
  await page.locator('input[type=text]:visible').first().fill(c.usuario);
  await page.locator('input[type=password]').first().fill(c.senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).or(page.getByText('Entrar', { exact: true })).first().click();
  etapa('login: esperando a tela inicial do corretor');
  if (!await page.waitForURL(/\/corretor\/home/, { timeout: 60000 }).then(() => true, () => false)) throw erroLogin();
  logins.marca('amil', l.apelido, { ultimo_sucesso: new Date().toISOString() });
}

async function comissao(ini, fim, saida) {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  try {
    const ctx = await browser.newContext({ viewport: null, acceptDownloads: true });
    const page = aba = await ctx.newPage();
    await entra(page);
    etapa('Gestão comercial (abre o SisAmil)');
    const [sis] = await Promise.all([ctx.waitForEvent('page', { timeout: 60000 }), page.getByText('Gestão comercial', { exact: true }).first().click()]);
    aba = sis;
    await sis.waitForLoadState('domcontentloaded');
    let principal = null;
    for (let t = 0; t < 60 && !principal; t++) { principal = sis.frame({ name: 'principal' }); if (!principal) await sis.waitForTimeout(1000); }
    if (!principal) throw new Error('o SisAmil não abriu (sem o quadro principal)');
    etapa('Relatórios Comissionamento → Extrato');
    await principal.goto(SIS + EXTRATO, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // mesma URL que o "Voltar" do SisAmil monta (produtor, período e formato TXT); produtor lido da própria tela
    const cod = await principal.locator('input[name=cod_corretor]').inputValue({ timeout: 60000 }).catch(() => '');
    const ts = /selecionar\('\d+','(\d+)'/.exec(await principal.content());
    if (!cod || !ts) throw new Error('a tela Extrato não trouxe o produtor ou a lista de extratos');
    const d0 = new Date(ini + 'T12:00:00'); d0.setDate(d0.getDate() - 60);
    const lista = `${SIS}/cms/asp/cms1005a.asp?PT=Extrato&cod_corretor=${cod}&cod_corretor_ts=${ts[1]}&cod_operadora=`
      + `&dt_periodo_ini=${br(d0.toISOString().slice(0, 10))}&dt_periodo_fim=${br(fim)}&ind_formato_saida=T`;
    etapa(`lista de extratos (apuração ${br(d0.toISOString().slice(0, 10))} a ${br(fim)})`);
    await principal.goto(lista, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const linhas = await principal.evaluate(() => {
      const m = {};
      for (const a of document.querySelectorAll('a[href*="selecionar("]')) (m[a.getAttribute('href')] = m[a.getAttribute('href')] || []).push(a.innerText.trim());
      return Object.entries(m).map(([href, c]) => ({ href, n: c[0], op: c[1], situacao: c[4], liquido: c[9] }));
    });
    if (!linhas.length) { saida.sem_dados.push('nenhum extrato no período'); return; }
    const ja = jaBaixados();
    for (const l of linhas) {
      if (ja[l.n]) { saida.repetidos.push(ja[l.n]); continue; }
      if (!/^pago$/i.test(l.situacao)) { saida.avisos.push(`extrato ${l.n} (${l.op}, R$ ${l.liquido}) ainda não pago: ${l.situacao}`); continue; }
      etapa(`baixar extrato ${l.n} (${l.op})`);
      if (!principal.url().includes('cms1005a')) await principal.goto(lista, { waitUntil: 'domcontentloaded', timeout: 90000 });
      const radio = principal.locator('input[name=ind_formato_saida][value=T]');
      if (await radio.count()) await radio.check();
      const [d] = await Promise.all([sis.waitForEvent('download', { timeout: 90000 }), principal.locator(`a[href="${l.href}"]`).nth(9).click()]);
      const tmp = await d.path(), buf = fs.readFileSync(tmp), c = cabecalho(buf);
      if (!c.ok) throw new Error(`o arquivo do extrato ${l.n} não é o TXT com # (${d.suggestedFilename()})`);
      await principal.goto(lista, { waitUntil: 'domcontentloaded', timeout: 90000 }); // volta para a lista
      const pago = iso(c.pago || '');
      if (!pago || pago < ini || pago > fim) continue; // pago fora do período pedido
      const f = path.join(COM, pago.slice(0, 7), 'Amil', `EXTRATO_COMISSAO_${c.produtor || '214809'}_${l.n}_${c.op || l.op}.txt`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, buf);
      saida.arquivos.push(f);
    }
    if (!saida.arquivos.length && !saida.repetidos.length) saida.sem_dados.push('nenhum extrato pago no período');
  } catch (e) {
    if (e.message !== 'login') e.print = await socorro(e);
    throw e;
  } finally { await browser.close().catch(() => {}); }
}

// Faturas: Portal Empresa Amil (amil.com.br/empresa, também Santa Helena), um login por empresa/grupo (usuário + senha),
// cadastrados no atalho "Cadastrar login empresa Amil". Navegação e download em portal_empresa.js.
//   node baixar_amil.js faturas 2026-11  -> boletos a enviar\AMIL\11-26\<APELIDO>\*.pdf
const EMPRESA = {
  op: 'amil', nome: 'Amil', pasta: 'AMIL',
  async entra(page, l, c) {
    await page.goto('https://www.amil.com.br/empresa/#/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('#onetrust-reject-all-handler').click({ timeout: 5000 }).catch(() => {}); // cookies: só os essenciais
    await page.locator('input[name=username]').fill(c.usuario, { timeout: 60000 });
    await page.locator('input[name=password]').fill(c.senha);
    await page.locator('button[type=submit]').filter({ hasText: 'Entrar' }).click();
    return page.waitForFunction(() => !location.hash.includes('login') && !document.querySelector('input[name=password]'), null, { timeout: 180000 })
      .then(() => true, () => false);
  },
  menus: [[/financeiro/i, /boleto|2.? ?via|fatura/i], [/demonstrativo|relat[oó]rio/i, /faturamento|anal[ií]tico/i]],
};

(async () => {
  const [cmd, ini, fim = new Date().toLocaleDateString('sv-SE')] = process.argv.slice(2);
  if (cmd === 'faturas' && /^\d{4}-\d\d$/.test(ini || '')) {
    if (fim && !/^\d{4}-/.test(fim)) EMPRESA.so = fim.toUpperCase().split(','); // node baixar_<op>.js faturas 2026-11 COMUNA,SWB
    const s = await require('./portal_empresa').faturas(chromium, EMPRESA, ini, { ok: true, arquivos: [], repetidos: [], sem_dados: [], falhas: [] });
    sai(s.ok ? 0 : 3, s);
  }
  if (cmd !== 'comissao' || !/^\d{4}-\d\d-\d\d$/.test(ini || '') || !/^\d{4}-\d\d-\d\d$/.test(fim)) {
    console.error('uso: node baixar_amil.js comissao AAAA-MM-DD [AAAA-MM-DD] | faturas AAAA-MM'); process.exit(1);
  }
  const saida = { ok: true, arquivos: [], repetidos: [], sem_dados: [], avisos: [] };
  await comissao(ini, fim, saida);
  sai(0, saida);
})().catch(async e => {
  if (e.message === 'login') sai(3, { ok: false, motivo: 'login', passo });
  sai(2, { ok: false, motivo: String(e.message || e).split('\n')[0], passo, print: e.print || await socorro(e) });
});

// print + passo em Scripts/_socorro (sem dados de sessão: só a URL sem parâmetros)
async function socorro(e) {
  const so = path.join(__dirname, '_socorro'), q = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
  fs.mkdirSync(so, { recursive: true });
  const png = path.join(so, `amil_${q}.png`);
  if (aba) await aba.screenshot({ path: png, fullPage: true }).catch(() => {});
  fs.writeFileSync(png.replace(/\.png$/, '.txt'), `passo: ${passo}\nerro: ${e.stack || e}\nurl: ${aba ? aba.url().split('?')[0] : '-'}\n`);
  return png;
}
