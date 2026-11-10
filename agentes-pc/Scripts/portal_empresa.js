// Faturas pelo portal de EMPRESA (SulAmérica Saúde Online Empresa, Amil Portal Empresa): um login por empresa/grupo de contratos.
// Usado por baixar_sulamerica.js e baixar_amil.js no modo "faturas". Só baixa arquivos: não grava na base nem no Supabase.
// Logins: os do atalho "Cadastrar login empresa <op>" (logins.js, operadora '<op>_empresa'); entra com um por vez, num Chrome
//   visível novo (sessões isoladas). Login que falha é relatado em "falhas" e o próximo segue.
// Em cada login: abre o menu de boletos/faturas pelos textos da tela e, nas linhas da competência (MM/AAAA), clica em cada botão de
//   boleto/fatura/demonstrativo/relatório. Guarda todo PDF/arquivo que o portal entregar (download ou PDF aberto em outra aba) em
//   "boletos a enviar\<PASTA>\MM-AA\<APELIDO>\" (a mesma pasta de onde o Bruno manda o faturamento por e-mail).
// shortcut: a tela de boletos é achada por texto, sem seletor fixo (as telas logadas ainda não foram vistas); se não achar,
//   o login vai em "falhas" com print + lista dos botões da tela em Scripts/_socorro para ajustar este arquivo.
// Usuário e senha só passam pela memória (logins.credencial); nunca vão para a saída nem para o _socorro.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), logins = require('./logins');
const ENTRADA = path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'boletos a enviar'); // Área de Trabalho\boletos a enviar
// botões que baixam documento; nunca clica no que muda algo no portal
const BAIXA = /boleto|fatura|2.? ?via|segunda via|demonstrativo|relat[oó]rio|rela[cç][aã]o|faturad|segurados|benefici[aá]rios|nota fiscal|nfs|pdf|imprimir|download|baixar|visualizar/i;
const NUNCA = /cancel|exclu|apag|remov|enviar|e-?mail|alterar|incluir|solicit|contest|negoci|parcel|sair|logout|chat|ajuda/i;

const mmaa = comp => `${comp.slice(5, 7)}-${comp.slice(2, 4)}`;           // 2026-11 -> 11-26
const mesAno = comp => `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;         // 2026-11 -> 11/2026
const pastaLogin = apelido => apelido.toUpperCase().replace(/_/g, ' ');
const nomeLimpo = s => String(s || 'arquivo').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

// grava o arquivo; mesmo conteúdo já na pasta = repetido; mesmo nome com conteúdo novo ganha " (2)"
function guarda(dir, nome, buf, saida, vistos) {
  const h = crypto.createHash('sha1').update(buf).digest('hex');
  if (vistos.has(h)) return;
  vistos.add(h);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex') === h) { saida.repetidos.push(path.join(dir, f)); return; }
  }
  // mesmo nome na pasta do mês = já baixado (o portal gera o boleto de novo a cada clique, com bytes diferentes)
  const f = path.join(dir, nomeLimpo(nome));
  if (fs.existsSync(f)) { saida.repetidos.push(f); return; }
  fs.writeFileSync(f, buf);
  saida.arquivos.push(f);
}

// tudo que o portal entregar enquanto o login está aberto: download, PDF aberto em outra aba, TXT/CSV aberto como página
const GUID = /^[0-9a-f]{8}-[0-9a-f-]{27}(\.\w+)?$/i;
const base = u => { try { return decodeURIComponent(path.basename(new URL(u).pathname)); } catch (e) { return ''; } };
function escuta(ctx, dir, saida, vistos, pendentes, prefixo = '') {
  const pega = p => p.on('download', d => pendentes.push((async () => {
    const t = await d.path().catch(() => null);
    const nome = GUID.test(d.suggestedFilename()) ? base(d.url()) || 'documento' : d.suggestedFilename();
    if (t) guarda(dir, prefixo + (/\.\w{2,4}$/.test(nome) ? nome : nome + '.pdf'), fs.readFileSync(t), saida, vistos);
  })().catch(e => saida.sem_dados.push(`download não lido: ${e.message}`))));
  ctx.pages().forEach(pega);
  ctx.on('page', pega);
  ctx.on('response', r => {
    const h = r.headers(), tipo = (h['content-type'] || '').toLowerCase();
    const pdf = tipo.includes('application/pdf'), texto = /text\/(plain|csv)/.test(tipo) && r.request().resourceType() === 'document';
    if ((!pdf && !texto) || r.status() !== 200) return; // 206 = pedaço que o leitor de PDF do Chrome pede
    pendentes.push((async () => {
      const buf = await r.body().catch(() => null);
      if (!buf || (pdf && (buf.length < 500 || buf.subarray(0, 4).toString() !== '%PDF'))) return; // aba do leitor de PDF devolve HTML
      const cd = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(h['content-disposition'] || '');
      let nome = cd ? decodeURIComponent(cd[1]) : base(r.url());
      if (!nome || GUID.test(nome)) { try { nome = base(r.frame().page().url()); } catch (e) { nome = ''; } nome = nome || 'documento'; } // leitor de PDF pede por um endereço guid
      const ext = pdf ? '.pdf' : tipo.includes('csv') ? '.csv' : '.txt';
      if (!/\.\w{2,4}$/.test(nome)) nome += ext;
      guarda(dir, prefixo + nome, buf, saida, vistos);
    })().catch(e => saida.sem_dados.push(`arquivo não lido: ${e.message}`)));
  });
}

// clica no 1º elemento visível cujo texto bate (menu); devolve true se clicou
async function clicaTexto(page, re) {
  for (const fr of page.frames()) {
    const alvos = fr.locator('a, button, [role=menuitem], [role=button], [role=tab], li, span, div[onclick]').filter({ hasText: re });
    const n = Math.min(await alvos.count().catch(() => 0), 30);
    for (let i = 0; i < n; i++) {
      const el = alvos.nth(i);
      const txt = ((await el.innerText().catch(() => '')) || '').trim();
      if (!txt || txt.length > 60 || NUNCA.test(txt) || !await el.isVisible().catch(() => false)) continue;
      await el.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3000);
      return true;
    }
  }
  return false;
}

// na tela atual (e nos iframes), clica nos botões de download das linhas que mostram a competência
async function baixaDaTela(page, comp) {
  const alvo = mesAno(comp), alvo2 = `${comp.slice(5, 7)}/${comp.slice(2, 4)}`;
  let cliques = 0;
  for (const fr of page.frames()) {
    const linhas = fr.locator('tr, [role=row], li, .card, [class*=card], [class*=item], [class*=linha]').filter({ hasText: new RegExp(`${alvo.replace('/', '\\/')}|\\b${alvo2.replace('/', '\\/')}\\b`) });
    const n = Math.min(await linhas.count().catch(() => 0), 40);
    for (let i = 0; i < n; i++) {
      const botoes = linhas.nth(i).locator('a, button, [role=button], img[onclick], i[onclick], span[onclick]');
      const m = Math.min(await botoes.count().catch(() => 0), 12);
      for (let j = 0; j < m; j++) {
        const b = botoes.nth(j);
        if (!await b.isVisible().catch(() => false)) continue;
        const t = [await b.innerText().catch(() => ''), await b.getAttribute('title').catch(() => ''), await b.getAttribute('aria-label').catch(() => ''),
          await b.getAttribute('alt').catch(() => ''), await b.getAttribute('href').catch(() => '')].join(' ');
        if (!BAIXA.test(t) || NUNCA.test(t)) continue;
        await b.click({ timeout: 8000 }).catch(() => {});
        cliques++;
        await page.waitForTimeout(4000);
        for (const p of page.context().pages()) if (p !== page && p.url() === 'about:blank') await p.close().catch(() => {});
      }
    }
  }
  return cliques;
}

// print + lista dos botões visíveis em Scripts/_socorro (para ajustar a navegação); sem URL com parâmetros
async function socorro(page, op, apelido, passo, erro) {
  const so = path.join(__dirname, '_socorro'), q = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
  fs.mkdirSync(so, { recursive: true });
  const png = path.join(so, `${op}_faturas_${apelido}_${q}.png`);
  let mapa = [];
  if (page) {
    await page.screenshot({ path: png, fullPage: true, timeout: 20000 }).catch(() => {});
    for (const fr of page.frames()) {
      mapa = mapa.concat(await fr.evaluate(() => [...document.querySelectorAll('a,button,[role=menuitem],[role=button],[role=tab]')]
        .filter(e => e.offsetParent).map(e => (e.innerText || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 60)).filter(Boolean)).catch(() => []));
    }
  }
  fs.writeFileSync(png.replace(/\.png$/, '.txt'), `passo: ${passo}\nerro: ${erro}\nurl: ${page ? page.url().split('?')[0] : '-'}\n\nbotões na tela:\n${[...new Set(mapa)].join('\n')}\n`);
  return png;
}

// cfg: { op: 'sulamerica', pasta: 'SUL AMERICA', entra(page, login, cred), menus: [[regex, ...], ...] }
async function faturas(chromium, cfg, comp, saida) {
  // só: apelidos pedidos (ex.: só COMUNA); sem nada = todos os logins ativos
  const lista = logins.ativos(`${cfg.op}_empresa`).filter(l => !cfg.so || cfg.so.includes(l.apelido.toUpperCase()));
  if (!lista.length) return Object.assign(saida, { ok: false, motivo: 'login', passo: `nenhum login de empresa cadastrado (atalho "Cadastrar login empresa ${cfg.nome}")` });
  const dirMes = path.join(path.resolve(ENTRADA, cfg.pasta), mmaa(comp));
  saida.pasta = dirMes;
  let entrou = 0;
  for (const l of lista) {
    let passo = 'abrir o Chrome', page = null;
    const browser = await chromium.launch({ headless: false, channel: 'chrome' });
    try {
      const ctx = await browser.newContext({ viewport: null, acceptDownloads: true });
      page = await ctx.newPage();
      const dir = path.join(dirMes, pastaLogin(l.apelido)), vistos = new Set(), pendentes = [];
      passo = `login ${l.apelido}`;
      console.error(new Date().toLocaleTimeString('pt-BR'), passo);
      if (!await cfg.entra(page, l, logins.credencial(`${cfg.op}_empresa`, l.apelido))) {
        saida.falhas.push({ login: l.apelido, passo, motivo: 'o login não entrou (senha, código ou captcha)', print: await socorro(page, cfg.op, l.apelido, passo, 'login') });
        continue;
      }
      entrou++;
      logins.marca(`${cfg.op}_empresa`, l.apelido, { ultimo_sucesso: new Date().toISOString() });
      escuta(ctx, dir, saida, vistos, pendentes, cfg.prefixo ? cfg.prefixo(l) : '');
      const antes = saida.arquivos.length;
      let cliques = 0;
      if (cfg.baixa) { // caminho conhecido do portal (passos do Bruno)
        cliques = await cfg.baixa(page, comp, { mesAno, passo: x => { passo = x; console.error(new Date().toLocaleTimeString('pt-BR'), x); },
          aviso: x => saida.sem_dados.push(`${l.apelido}: ${x}`) });
      }
      for (const caminho of cfg.baixa ? [] : cfg.menus) { // cada caminho = sequência de menus até uma tela de documentos
        passo = `menus ${caminho.map(r => r.source).join(' > ')}`;
        for (const re of caminho) await clicaTexto(page, re);
        cliques += await baixaDaTela(page, comp);
      }
      await Promise.all(pendentes);
      await page.waitForTimeout(3000);
      await Promise.all(pendentes);
      const novos = saida.arquivos.length - antes;
      if (!cliques && !cfg.baixa) saida.falhas.push({ login: l.apelido, passo, motivo: `não achei os documentos de ${mesAno(comp)} na tela (precisa de ajuste)`, print: await socorro(page, cfg.op, l.apelido, passo, 'sem botões da competência') });
      else if (!novos) saida.sem_dados.push(`${l.apelido}: nada novo de ${mesAno(comp)}`);
    } catch (e) {
      saida.falhas.push({ login: l.apelido, passo, motivo: String(e.message || e).split('\n')[0], print: await socorro(page, cfg.op, l.apelido, passo, e.stack || e) });
    } finally { await browser.close().catch(() => {}); }
  }
  if (saida.falhas.length) saida.aviso = `Nada novo baixado. Com problema: ${saida.falhas.map(f => `${f.login} (${f.motivo})`).join('; ')}. Print em Scripts/_socorro.`;
  if (!entrou) Object.assign(saida, { ok: false, motivo: 'login', passo: 'nenhum login de empresa entrou' });
  return saida;
}

// marca o rádio cujo rótulo contém o texto: label, ou o menor bloco em volta do rádio que só tem ele (linha/célula)
const marcaRadio = (page, texto) => page.evaluate(t => {
  const norm = x => (x || '').toLowerCase().replace(/\s+/g, ' ');
  for (const r of document.querySelectorAll('input[type=radio]')) {
    if (!r.offsetParent) continue; // rádio escondido (ex.: busca do topo)
    if (r.labels && [...r.labels].some(l => norm(l.innerText).includes(t))) { r.click(); return true; }
    for (let a = r.parentElement, k = 0; a && k < 5; a = a.parentElement, k++) {
      if (a.querySelectorAll('input[type=radio]').length > 1) break;
      if (norm(a.innerText).includes(t)) { r.click(); return true; }
    }
    let txt = ''; // rádios irmãos no mesmo bloco: o texto entre este rádio e o próximo
    for (let n = r.nextSibling; n && !(n.matches && (n.matches('input[type=radio]') || n.querySelector('input[type=radio]'))); n = n.nextSibling) txt += ' ' + (n.textContent || '');
    if (norm(txt).includes(t)) { r.click(); return true; }
  }
  return false;
}, texto.toLowerCase());

// botão por nome: link, botão, input ou imagem
const botao = (page, nome) => page.getByRole('button', { name: nome }).or(page.getByRole('link', { name: nome }))
  .or(page.locator(`input[value="${nome}"], [alt="${nome}"], [title="${nome}"]`)).first();

module.exports = { faturas, mmaa, mesAno, marcaRadio, botao };
