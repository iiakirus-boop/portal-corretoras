// Abre o Corretor Online da Porto num Chrome visível e preenche o login com PORTO_USER/PORTO_PASS/PORTO_COD
// (vêm do login_porto.ps1, que guarda tudo criptografado no Windows). Deixa o Chrome aberto na
// porta 9334 para o Claude continuar o trabalho. Captcha ou código por SMS/e-mail: resolver na janela.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const SUSEP = process.env.PORTO_SUSEP || 'BA6QXJ';
// marcador para o vigia: o login terminou de verdade (o vigia só baixa depois disso)
const marca = op => { const d = require('path').join(process.env.LOCALAPPDATA, 'Shaddai');
  require('fs').mkdirSync(d, { recursive: true }); require('fs').writeFileSync(require('path').join(d, `${op}.logado`), new Date().toISOString()); };
(async () => {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--remote-debugging-port=9334', '--start-maximized'] });
  const page = await (await browser.newContext({ viewport: null, acceptDownloads: true })).newPage();
  browser.on('disconnected', () => process.exit(0));
  await page.goto('https://corretor.portoseguro.com.br/corretoronline/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('Dispensar', { exact: true }).click({ timeout: 5000 }).catch(() => {}); // recusa cookies não essenciais
  await page.locator('button[name="entrar"]').click();
  const cpf = page.locator('#logonPrincipal');
  await cpf.waitFor({ state: 'visible', timeout: 60000 });
  await cpf.fill(process.env.PORTO_USER);
  await page.locator('input[name="password"]:visible').first().fill(process.env.PORTO_PASS);
  await page.locator('#inputLogin').click();
  // se pedir captcha, resolva na janela; depois vem a escolha da SUSEP (corretor BA6QXJ): campo de texto com
  // sugestões (jQuery UI autocomplete), não um select. Digita, clica na sugestão "BA6QXJ (P)" e entra, sem pausa
  // (a tela parada por alguns minutos faz a Porto recusar o acesso)
  const susep = page.locator('#susepsAutocomplete');
  await susep.waitFor({ state: 'visible', timeout: 180000 });
  await susep.click();
  await susep.pressSequentially(SUSEP, { delay: 80 });
  await page.locator('ul.ui-autocomplete li.ui-menu-item', { hasText: SUSEP }).first().click({ timeout: 15000 });
  await page.locator('#btnAvancarSusep').click();
  // código de acesso: preenche se a tela pedir e ele estiver guardado; senão digite na janela
  const cod = page.locator('input:visible').and(page.locator('[id*=odigo i],[name*=odigo i],[id*=token i],[name*=token i],[placeholder*=ódigo i],[placeholder*=odigo i]'));
  if (process.env.PORTO_COD && await cod.first().waitFor({ timeout: 20000 }).then(() => true, () => false)) {
    await cod.first().fill(process.env.PORTO_COD);
    await cod.first().press('Enter');
  }
  console.log('Login enviado. Se pedir código ou captcha, resolva na janela. Deixe esta janela preta aberta enquanto o Claude trabalha.');
  // mantém a sessão viva: recarrega uma aba própria a cada 12 min, sem mexer na aba em que o Claude trabalha
  await page.waitForFunction(() => !document.querySelector('#logonPrincipal')?.offsetParent && !document.querySelector('#btnAvancarSusep')?.offsetParent
    && !/validar seu acesso/i.test(document.body.innerText) && !/template\.LOGIN/.test(location.href), null, { timeout: 300000 });
  marca('porto');
  const viva = await page.context().newPage();
  await page.bringToFront();
  setInterval(() => viva.goto(page.url().split('#')[0], { waitUntil: 'domcontentloaded', timeout: 60000 })
    .then(() => console.log(new Date().toLocaleTimeString('pt-BR'), 'sessão renovada'))
    .catch(e => console.log('falha ao renovar:', e.message)), 12 * 60 * 1000);
  await new Promise(() => {});
})().catch(e => console.log('Não consegui completar o login sozinho:', e.message, '\nTermine o login na janela do Chrome.'));
