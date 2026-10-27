// Abre o Portal de Negócios da Bradesco num Chrome visível e preenche o login com BRAD_USER/BRAD_PASS
// (vêm do login_bradesco.ps1, que guarda a senha criptografada no Windows). Deixa o Chrome aberto na
// porta 9333 para o Claude continuar o trabalho. Captcha ou código de verificação: resolver na janela.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
// marcador para o vigia: o login terminou de verdade (o vigia só baixa depois disso)
const marca = op => { const d = require('path').join(process.env.LOCALAPPDATA, 'Shaddai');
  require('fs').mkdirSync(d, { recursive: true }); require('fs').writeFileSync(require('path').join(d, `${op}.logado`), new Date().toISOString()); };
(async () => {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--remote-debugging-port=9333', '--start-maximized'] });
  const page = await (await browser.newContext({ viewport: null, acceptDownloads: true })).newPage();
  browser.on('disconnected', () => process.exit(0));
  await page.goto('https://wwwn.bradescoseguros.com.br/pnegocios2/wps/portal/portaldenegocios/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#adopt-reject-all-button').click({ timeout: 5000 }).catch(() => {});
  // 1ª tela: CNPJ da corretora (Proventus); 2ª tela: CPF do usuário + senha
  await page.locator('#CpfCnpjTelaInicial').fill(process.env.BRAD_CNPJ || '21878424000123');
  await page.locator('#tag_Home_Login-Continuar').click();
  const cpf = page.locator('#input_cpf_cnpj');
  await cpf.waitFor({ timeout: 120000 }); // se aparecer captcha, resolva na janela que ele segue
  await cpf.fill(process.env.BRAD_USER);
  await page.locator('#input_senha').fill(process.env.BRAD_PASS);
  await page.locator('#loginButton2').click();
  console.log('Login enviado. Se pedir código, digite na janela. Deixe esta janela preta aberta enquanto o Claude trabalha.');
  // mantém a sessão viva: recarrega uma aba própria a cada 12 min, sem mexer na aba em que o Claude trabalha
  await page.waitForURL('**/arealogada/**', { timeout: 300000 });
  marca('bradesco');
  const viva = await page.context().newPage();
  await page.bringToFront();
  setInterval(() => viva.goto(page.url().split('#')[0], { waitUntil: 'domcontentloaded', timeout: 60000 })
    .then(() => console.log(new Date().toLocaleTimeString('pt-BR'), 'sessão renovada', viva.url().includes('arealogada') ? '' : '(caiu: rode o atalho de novo)'))
    .catch(e => console.log('falha ao renovar:', e.message)), 12 * 60 * 1000);
  await new Promise(() => {});
})().catch(e => console.log('Não consegui completar o login sozinho:', e.message, '\nTermine o login na janela do Chrome.'));
