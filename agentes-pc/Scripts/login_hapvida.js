// Abre o webhap da Hapvida (comissão) em Chromes visíveis, cada um com perfil próprio em %LOCALAPPDATA%\Shaddai\chrome_hapvida_<porta>,
// e preenche o login com HAP_<LOGIN>_USER/PASS (vêm do login_hapvida.ps1, que guarda tudo criptografado no Windows).
// Portas (o baixar_hapvida.js conecta nelas):
//   9335 = webhap 045K  |  9336 = webhap 045L  |  9337 = webhap 02JZ
// Faturas (Portal Empresa) não passam por aqui: o baixar_hapvida.js entra com cada login cadastrado no logins.js.
// Um Chrome por login do webhap porque a sessão do webhap é por navegador: dois logins no mesmo Chrome se derrubam.
// Captcha ou código: resolver na janela. Login sem senha guardada: o Chrome abre na tela de login para digitar na janela.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const path = require('path'), { preencheLogin } = require('./logins');
const WEBHAP = 'https://webhap.hapvida.com.br/pls/webhap/pk_controle_comissao.Login';
const CHROMES = [
  { porta: 9335, abas: [['045K', WEBHAP]] },
  { porta: 9336, abas: [['045L', WEBHAP]] },
  { porta: 9337, abas: [['02JZ', WEBHAP]] },
];
let abertos = CHROMES.length;

async function entra(page, login, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const usuario = process.env[`HAP_${login}_USER`], senha = process.env[`HAP_${login}_PASS`];
  if (!usuario || !senha) return console.log(`${login}: sem senha guardada, digite na janela.`);
  await preencheLogin(page, { usuario, senha });
  console.log(`${login}: login enviado.`);
}

for (const c of CHROMES) (async () => {
  const ctx = await chromium.launchPersistentContext(path.join(process.env.LOCALAPPDATA, 'Shaddai', `chrome_hapvida_${c.porta}`),
    { headless: false, channel: 'chrome', viewport: null, acceptDownloads: true, args: [`--remote-debugging-port=${c.porta}`, '--start-maximized'] });
  ctx.on('close', () => { if (--abertos === 0) process.exit(0); });
  const paginas = [];
  for (const [i, [login, url]] of c.abas.entries()) {
    const page = i === 0 ? (ctx.pages()[0] || await ctx.newPage()) : await ctx.newPage();
    paginas.push(page);
    await entra(page, login, url).catch(e => console.log(`${login}: não consegui completar o login sozinho (${e.message.split('\n')[0]}). Termine na janela.`));
  }
  // mantém as sessões vivas: recarrega uma aba própria a cada 12 min, sem mexer nas abas em que o Claude trabalha
  const viva = await ctx.newPage();
  await paginas[0].bringToFront();
  let vez = 0;
  setInterval(() => {
    const p = paginas[vez++ % paginas.length], u = p.url().split('#')[0];
    if (!/^https:/.test(u)) return;
    viva.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .then(() => console.log(new Date().toLocaleTimeString('pt-BR'), `porta ${c.porta}: sessão renovada`))
      .catch(e => console.log(`porta ${c.porta}: falha ao renovar:`, e.message.split('\n')[0]));
  }, 12 * 60 * 1000 / paginas.length);
})().catch(e => console.log(`porta ${c.porta}: não abriu o Chrome:`, e.message.split('\n')[0]));
console.log('Deixe esta janela preta aberta enquanto o Claude trabalha.');
