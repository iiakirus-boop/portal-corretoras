// Login no Corretor Online da Porto, usado pelo atalho "Entrar na Porto" (login_porto.js, Chrome visível no PC) e pelo
// baixar_porto.js na nuvem (Chromium sem janela). Recebe a página já criada; não abre nem fecha navegador.
// Passos: Dispensar cookies -> Entrar -> CPF e senha -> (captcha: só no PC, na janela) -> SUSEP (campo com sugestões, jQuery UI
// autocomplete: digita, clica na sugestão "<SUSEP> (P)" e avança sem pausa, porque a tela parada faz a Porto recusar o acesso)
// -> código de acesso, se a tela pedir e ele vier -> espera sair da tela de login.
// Devolve true quando entrou; lança Error('captcha') / Error('codigo') quando a Porto pede algo que só uma pessoa resolve.
const URL_PORTO = 'https://corretor.portoseguro.com.br/corretoronline/';

async function entrarPorto(page, { usuario, senha, cod, susep = 'BA6QXJ', esperaHumano = 180000 }) {
  await page.goto(URL_PORTO, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByText('Dispensar', { exact: true }).click({ timeout: 5000 }).catch(() => {}); // recusa cookies não essenciais
  await page.locator('button[name="entrar"]').click();
  const cpf = page.locator('#logonPrincipal');
  await cpf.waitFor({ state: 'visible', timeout: 60000 });
  await cpf.fill(usuario);
  await page.locator('input[name="password"]:visible').first().fill(senha);
  await page.locator('#inputLogin').click();
  const campoSusep = page.locator('#susepsAutocomplete');
  const apareceu = await campoSusep.waitFor({ state: 'visible', timeout: esperaHumano }).then(() => true, () => false);
  if (!apareceu) {
    // só conta como captcha o desafio aberto na tela (o selo invisível do reCAPTCHA fica em toda página de login)
    const captcha = await page.locator('iframe[src*="recaptcha"][src*="bframe"], iframe[src*="hcaptcha"][src*="challenge"]').filter({ visible: true }).count();
    throw new Error(captcha ? 'captcha' : 'a tela da SUSEP não apareceu depois do CPF e senha');
  }
  await campoSusep.click();
  await campoSusep.pressSequentially(susep, { delay: 80 });
  await page.locator('ul.ui-autocomplete li.ui-menu-item', { hasText: susep }).first().click({ timeout: 15000 });
  await page.locator('#btnAvancarSusep').click();
  // código de acesso: preenche se a tela pedir e ele estiver guardado; senão, no PC, digite na janela
  const campoCod = page.locator('input:visible').and(page.locator('[id*=odigo i],[name*=odigo i],[id*=token i],[name*=token i],[placeholder*=ódigo i],[placeholder*=odigo i]'));
  if (await campoCod.first().waitFor({ timeout: 20000 }).then(() => true, () => false)) {
    if (!cod) { if (esperaHumano < 60000) throw new Error('codigo'); }
    else { await campoCod.first().fill(cod); await campoCod.first().press('Enter'); }
  }
  await page.waitForFunction(() => !document.querySelector('#logonPrincipal')?.offsetParent && !document.querySelector('#btnAvancarSusep')?.offsetParent
    && !/validar seu acesso/i.test(document.body.innerText) && !/template\.LOGIN/.test(location.href), null, { timeout: esperaHumano >= 60000 ? 300000 : 60000 })
    .catch(async () => {
      if (/validar seu acesso/i.test(await page.locator('body').innerText().catch(() => ''))) throw new Error('a Porto respondeu "não conseguimos validar seu acesso"');
      throw new Error('o login não terminou');
    });
  return true;
}

// Playwright: no PC vem do plugin do Claude Code; na nuvem, do pacote instalado (npm i playwright)
function playwright() {
  try { return require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright'); }
  catch (e) { return require('playwright'); }
}

module.exports = { entrarPorto, playwright, URL_PORTO };
