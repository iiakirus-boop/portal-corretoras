// Abre o Corretor Online da Porto num Chrome visível e preenche o login com PORTO_USER/PORTO_PASS/PORTO_COD
// (vêm do login_porto.ps1, que guarda tudo criptografado no Windows). Deixa o Chrome aberto na
// porta 9334 para o Claude continuar o trabalho. Captcha ou código por SMS/e-mail: resolver na janela.
const { entrarPorto, playwright } = require('./entrar_porto');
const { chromium } = playwright();
const SUSEP = process.env.PORTO_SUSEP || 'BA6QXJ';
// marcador para o vigia: o login terminou de verdade (o vigia só baixa depois disso)
const marca = op => { const d = require('path').join(process.env.LOCALAPPDATA, 'Shaddai');
  require('fs').mkdirSync(d, { recursive: true }); require('fs').writeFileSync(require('path').join(d, `${op}.logado`), new Date().toISOString()); };
(async () => {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--remote-debugging-port=9334', '--start-maximized'] });
  const page = await (await browser.newContext({ viewport: null, acceptDownloads: true })).newPage();
  browser.on('disconnected', () => process.exit(0));
  // mesmo passo a passo do baixar_porto.js na nuvem (entrar_porto.js); captcha ou código: resolva na janela (espera 3 min)
  await entrarPorto(page, { usuario: process.env.PORTO_USER, senha: process.env.PORTO_PASS, cod: process.env.PORTO_COD, susep: SUSEP });
  console.log('Login feito. Deixe esta janela preta aberta enquanto o Claude trabalha.');
  marca('porto');
  const viva = await page.context().newPage();
  await page.bringToFront();
  setInterval(() => viva.goto(page.url().split('#')[0], { waitUntil: 'domcontentloaded', timeout: 60000 })
    .then(() => console.log(new Date().toLocaleTimeString('pt-BR'), 'sessão renovada'))
    .catch(e => console.log('falha ao renovar:', e.message)), 12 * 60 * 1000);
  await new Promise(() => {});
})().catch(e => console.log('Não consegui completar o login sozinho:', e.message, '\nTermine o login na janela do Chrome.'));
