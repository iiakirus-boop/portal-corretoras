// Agente Faturas/Comissão Hapvida - baixa a coleta do Portal Empresa (faturas) e os CSV de comissão do webhap. Só baixa arquivos:
// não grava na base nem no Supabase.
// Faturas: entra sozinho, um por vez, com cada login ativo do Portal Empresa cadastrado no atalho "Cadastrar login Hapvida" (logins.js),
//   num Chrome visível próprio (sessões isoladas); junta tudo num JSON só, sem repetir contrato nem fatura. Login que falha é relatado e o próximo segue.
// Comissão: precisa dos Chromes do webhap que o atalho "Entrar na Hapvida" deixa logados (9335 = 045K | 9336 = 045L | 9337 = 02JZ);
//   trabalha numa aba própria aberta a partir da aba logada e fecha no fim.
// Uso:
//   node baixar_hapvida.js faturas 2026-08-01            -> Faturas/Hapvida_portal/portal_hapvida_<hoje>.json (faturas com vencimento desde a data)
//   node baixar_hapvida.js comissao 2026-10              -> Comissoes/2026-10/Hapvida|Hapvida_045L|Hapvida_02JZ/<lote> - <tipo> - <regra>.csv + lotes.tsv
//   node baixar_hapvida.js comissao 2026-10 045L,02JZ    -> só esses logins
//   (dá para juntar os dois na mesma chamada). Depois: faturas_hapvida.py com o JSON como 3º argumento; comissao_hapvida.py com as pastas.
// Saída: uma linha JSON {"ok":true,"arquivos":[...],"repetidos":[...],"sem_dados":[...],"avisos":[...],"falhas":[{login,passo,motivo}]}.
// Arquivo que já existe não é baixado de novo.
// Erros: código 3 + {"ok":false,"motivo":"login","login":...} sem aba logada do webhap ou nenhum login de fatura entrou;
//        código 2 + print/passo em Scripts/_socorro/.
// Faturas: mesma coleta do coleta_portal_hapvida.js (api.hapvida.com.br/b2b/api/v3), com o cabeçalho de acesso lido das chamadas da própria aba.
// Comissão: webhap → mês de referência → RELATORIOS → em cada card (lote), EXCEL do "Relatório de Comissão Analítico por Data Pagamento".
// O token do portal e os parâmetros de sessão do webhap nunca vão para a saída nem para o _socorro.
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const fs = require('fs'), path = require('path'), logins = require('./logins');
const FAT = path.dirname(__dirname);
const PORTAL = 'portal-empresa.hapvidagndi.com.br', API = 'https://api.hapvida.com.br/b2b/api/v3/', WEBHAP = 'webhap.hapvida.com.br';
// login do Portal Empresa (Azure B2C); prompt=login força a tela de login mesmo com sessão anterior, um login por vez
const LOGIN_PORTAL = 'https://hapvidaadb2bprd.b2clogin.com/hapvidaadb2bprd.onmicrosoft.com/oauth2/v2.0/authorize?p=B2C_1_portal-empresa-login'
  + '&client_id=a873a0fd-ed81-4cf2-bb25-0f6dca61bc46&nonce=defaultNonce&redirect_uri=https%3A%2F%2Fportal-empresa.hapvidagndi.com.br%2Fautenticando'
  + '&scope=openid%20offline_access&response_type=code+id_token&prompt=login';
const LOGINS = { '045K': { porta: 9335, pasta: 'Hapvida' }, '045L': { porta: 9336, pasta: 'Hapvida_045L' }, '02JZ': { porta: 9337, pasta: 'Hapvida_02JZ' } };
let passo = 'início', aba = null;
const abas = [];
const sai = (cod, obj) => { console.log(JSON.stringify(obj)); process.exit(cod); };
const semSessao = s => String(s).replace(/(authorization|bearer|token|sess\w*|p_\w+)(["':= ]+)[^&#'"\s,]+/gi, '$1$2X');
const erroLogin = login => Object.assign(new Error('login'), { login });

function grava(f, buf, saida) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
  saida.arquivos.push(f);
}

// abre uma aba de trabalho a partir da aba logada (mesma sessão) no Chrome da porta
async function abreAba(porta, host, login) {
  passo = `conectar no Chrome (porta ${porta})`;
  const browser = await chromium.connectOverCDP(`http://localhost:${porta}`).catch(() => null);
  const ctx = browser && browser.contexts()[0];
  const logada = ctx && ctx.pages().find(p => p.url().includes(host) && !/login/i.test(p.url()));
  if (!logada) throw erroLogin(login);
  passo = `abrir aba de trabalho (${login})`;
  const [p] = await Promise.all([ctx.waitForEvent('page'), logada.evaluate(u => { window.open(u, '_blank'); }, logada.url())]);
  abas.push(p);
  aba = p;
  await p.waitForLoadState('domcontentloaded');
  return p;
}

const temSenha = p => p.locator('input[type=password]').filter({ visible: true }).count();

// coleta do coleta_portal_hapvida.js, rodada dentro da aba logada com o cabeçalho de acesso do próprio portal
const coleta = (page, H, desde) => page.evaluate(async ([B, H, DESDE]) => {
    const fetch = (u, o = {}) => window.fetch(u, { ...o, signal: AbortSignal.timeout(90000) }); // nenhuma chamada fica pendurada
    const J = async u => { const r = await fetch(B + u, { headers: H }); return r.ok ? r.json() : { err: r.status }; };
    const iso = d => d.slice(6) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2);
    let comp = [];
    for (let off = 0; off < 500; off += 50) {
      const j = await J(`companies?offset=${off}&limit=50`);
      if (j.err) return { err: j.err };
      const c = (j.content && j.content.companies) || []; comp = comp.concat(c); if (c.length < 50) break;
    }
    const res = { contratos: [] };
    for (const c of comp.filter(c => c.isMainPartnerCompany)) {
      const pc = c.partnerCompany;
      await fetch(B + `users/partner-company/${pc}/create-session`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' });
      let bills = [];
      for (let off = 0; off < 500; off += 50) { const j = await J(`billings/partner-company/${pc}/historic-bills/search?offset=${off}&limit=50`); const b = (j.content && j.content.bills) || []; bills = bills.concat(b.map(x => ({ ...x, aba: 'historico' }))); if (b.length < 50) break; }
      const u = await J(`billings/partner-company/${pc}/unpaid-bills/search?offset=0&limit=50`);
      bills = bills.concat(((u.content && u.content.bills) || []).map(x => ({ ...x, aba: 'aberto' })));
      const filhos = comp.filter(x => x.mainPartnerCompany === pc).map(x => ({ cod: x.partnerCompany, plano: x.planType, status: x.partnerCompanyStatus }));
      const ent = { contrato: pc, razao: c.legal, cnpj: c.document, status: c.partnerCompanyStatus, filhos, faturas: [] };
      for (const b of bills) {
        if (iso(b.dueDate) < DESDE) continue;
        const f = { ...b };
        if (!/COPARTIC/i.test(b.billType || '')) {
          try { const j = await J(`billings/report-monthly/billing-number/${b.billingNumber}/report-type/CSV`); if (j.content && j.content.link) { f.csv = await (await fetch(j.content.link)).text(); } else f.csvErro = JSON.stringify(j).slice(0, 150); } catch (e) { f.csvErro = String(e); }
          try { const j = await J(`billings/invoice?billing-number=${b.billingNumber}`); if (j.content) f.nf = j.content.invoiceNumber; } catch (e) {}
        }
        ent.faturas.push(f);
      }
      res.contratos.push(ent);
    }
    return res;
}, [API, H, desde]);

// junta a coleta de um login na saída: contrato repetido (visto por outro login) só soma as faturas que faltam
function junta(res, contratos, apelido) {
  for (const c of contratos) {
    const ja = res.contratos.find(x => x.contrato === c.contrato);
    if (!ja) { res.contratos.push({ ...c, login: apelido }); continue; }
    const nums = new Set(ja.faturas.map(f => f.billingNumber));
    ja.faturas.push(...c.faturas.filter(f => !nums.has(f.billingNumber)));
  }
}

// formulário do Azure B2C: #signInName/#email + #password + #next; depois volta por portal-empresa.../autenticando
async function entraB2C(page, { usuario, senha }) {
  const user = page.locator('#signInName, #email').first();
  if (!await user.waitFor({ timeout: 60000 }).then(() => true, () => false)) return logins.preencheLogin(page, { usuario, senha });
  await user.fill(usuario);
  await page.locator('#password').fill(senha);
  await page.locator('#next').click();
  const fora = await page.waitForURL(u => u.hostname === PORTAL, { timeout: 60000 }).then(() => true, () => false);
  if (fora) return;
  // ainda no B2C: erro de senha (mostra o texto) ou passo extra que só a pessoa resolve
  const erro = (await page.locator('.error.pageLevel:visible, .error.itemLevel:visible').allInnerTexts().catch(() => [])).join(' ').trim();
  if (erro) throw new Error(`o B2C recusou: ${erro.slice(0, 120)}`);
  if (await page.locator('#verificationCode, [id*=Verification i], [id*=otp i], iframe[src*=captcha i], iframe[src*=recaptcha i]').count()) throw new Error('precisa de você (MFA ou captcha)');
  throw new Error('precisa de você (o login não saiu da tela do B2C)');
}

// passo atual também no stderr, para acompanhar a coleta enquanto roda (a saída JSON continua só no stdout)
const etapa = s => { passo = s; console.error(new Date().toLocaleTimeString('pt-BR'), s); };

// tela "Realizar busca" depois do login: operadora sempre "NDI" (nunca "NDI MINAS") e Buscar; é isso que faz o portal chamar a API
async function escolheNDI(page) {
  const nativo = page.locator('select').filter({ has: page.locator('option', { hasText: /^\s*NDI\s*$/ }) }).first();
  if (await nativo.count()) {
    const v = await nativo.locator('option').evaluateAll(os => os.find(o => o.textContent.trim() === 'NDI').value);
    await nativo.selectOption(v);
  } else {
    const caixa = page.getByText(/Selecione a operadora/i).first();
    await caixa.waitFor({ timeout: 60000 }).catch(() => { throw new Error('a tela "Realizar busca" não mostrou "Selecione a operadora"'); });
    await caixa.click();
    const op = page.getByRole('option', { name: 'NDI', exact: true }).or(page.locator('li, [role=option], mat-option, .ng-option').filter({ hasText: /^\s*NDI\s*$/ })).first();
    await op.waitFor({ timeout: 15000 }).catch(() => { throw new Error('a opção "NDI" não apareceu no dropdown de operadora'); });
    await op.click();
  }
  await page.getByRole('button', { name: /^\s*Buscar\s*$/i }).or(page.locator('button, input[type=submit], input[type=button]').filter({ hasText: /^\s*Buscar\s*$/i })).first().click({ timeout: 15000 });
}

async function faturas(desde, saida) {
  const arq = path.join(FAT, 'Faturas', 'Hapvida_portal', `portal_hapvida_${new Date().toLocaleDateString('sv-SE')}.json`); // data local (AAAA-MM-DD)
  if (fs.existsSync(arq)) { saida.repetidos.push(arq); return; }
  const lista = logins.ativos('hapvida');
  if (!lista.length) throw erroLogin('nenhum login de fatura cadastrado (atalho "Cadastrar login Hapvida")');
  const res = { geradoEm: new Date().toISOString(), login: 'portal-empresa NDI', logins: [], contratos: [] };
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  try {
    for (const l of lista) {
      const ctx = await browser.newContext({ viewport: null });
      const page = aba = await ctx.newPage();
      try {
        etapa(`portal ${l.apelido}: login`);
        // o cabeçalho de acesso só existe nas chamadas que o portal faz; escuto o contexto todo (qualquer aba) desde antes do login
        let r = null;
        ctx.on('request', q => { if (!r && q.url().startsWith(API) && 'authorization' in q.headers()) r = q; });
        await page.goto(LOGIN_PORTAL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await entraB2C(page, logins.credencial('hapvida', l.apelido));
        etapa(`portal ${l.apelido}: tela inicial, operadora NDI + Buscar`);
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
        if (!r) await escolheNDI(page);
        for (let t = 0; t < 60 && !r; t++) await page.waitForTimeout(1000);
        if (!r) throw new Error('o portal não chamou a API em 60 s depois de escolher NDI e Buscar');
        const H = Object.fromEntries(Object.entries(await r.allHeaders()).filter(([k]) => !k.startsWith(':') && !/^(host|content-length|cookie|accept-encoding|connection|origin|referer|sec-|user-agent)/.test(k)));
        etapa(`portal ${l.apelido}: coletar contratos e faturas (alguns minutos)`);
        const c = await Promise.race([coleta(page, H, desde), page.waitForTimeout(40 * 60000).then(() => { throw new Error('a coleta passou de 40 min'); })]);
        if (c.err) throw new Error(`a API devolveu HTTP ${c.err} na lista de contratos`);
        junta(res, c.contratos, l.apelido);
        res.logins.push(l.apelido);
        logins.marca('hapvida', l.apelido, { ultimo_sucesso: new Date().toISOString() });
      } catch (e) {
        const so = path.join(__dirname, '_socorro'), png = path.join(so, `hapvida_${l.apelido}_${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_')}.png`);
        fs.mkdirSync(so, { recursive: true });
        await page.screenshot({ path: png, fullPage: true }).catch(() => {});
        saida.falhas.push({ login: l.apelido, passo, motivo: semSessao(String(e.message || e).split('\n')[0]), url: page.url().split('?')[0], print: png });
      } finally { aba = null; await ctx.close().catch(() => {}); }
    }
  } finally { await browser.close().catch(() => {}); }
  if (!res.logins.length) throw erroLogin('nenhum login de fatura entrou');
  if (!res.contratos.length) { saida.sem_dados.push({ faturas: 'nenhum contrato principal nos logins do portal' }); return; }
  const n = res.contratos.reduce((s, c) => s + c.faturas.length, 0), semCsv = res.contratos.flatMap(c => c.faturas.filter(f => f.csvErro).map(f => f.billingNumber));
  if (semCsv.length) saida.avisos.push(`faturas sem Relatório.csv: ${semCsv.join(', ')}`);
  saida.faturas = { logins: res.logins, contratos: res.contratos.length, faturas: n, arquivo: arq };
  grava(arq, JSON.stringify(res), saida);
}

const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
// soma de VL RECEBER (coluna 27) do analítico, igual ao organizar_hapvida.py
function totalCsv(buf) {
  const ls = buf.toString('latin1').split(/\r?\n/).map(l => l.split(';'));
  if (!(ls[0][0] || '').startsWith('CD FILIAL')) return null;
  return Math.round(ls.slice(1).filter(r => r.length > 26).reduce((s, r) => s + (num(r[26].replace(/[="]/g, '').trim() || '0') || 0), 0) * 100) / 100;
}

// shortcut: telas do webhap mapeadas só pela descrição do caminho (não vistas por dentro); se um passo falhar, o print em _socorro mostra a tela para ajustar
async function comissao(comp, login, saida) {
  const { porta, pasta } = LOGINS[login], [y, m] = comp.split('-'), dest = path.join(FAT, 'Comissoes', comp, pasta);
  const page = await abreAba(porta, WEBHAP, login);
  if (await temSenha(page)) throw erroLogin(login);
  // aviso "ATENCAO" que o webhap abre por cima do menu depois do login
  const fechar = page.getByRole('button', { name: /^\s*Fechar\s*$/i }).filter({ visible: true }).first();
  if (await fechar.waitFor({ timeout: 5000 }).then(() => true, () => false)) { await fechar.click(); await page.waitForTimeout(500); }
  passo = `webhap ${login}: escolher mês ${m}/${y}`;
  const esc = page.getByText(/ESCOLHER UM M[ÊE]S/i).first();
  if (await esc.count()) await Promise.all([page.waitForLoadState('domcontentloaded'), esc.click()]);
  const sel = page.locator('select').filter({ visible: true });
  let escolheu = false;
  for (let i = 0; i < await sel.count() && !escolheu; i++) {
    const v = await sel.nth(i).locator('option').evaluateAll((os, alvos) => (os.find(o => alvos.some(a => o.textContent.includes(a) || o.value.includes(a))) || {}).value, [`${m}/${y}`, `${m}${y}`, `${y}${m}`]);
    if (v) { await sel.nth(i).selectOption(v); escolheu = true; }
  }
  if (!escolheu) {
    const link = page.locator('a, button, input[type=button], input[type=submit]').filter({ hasText: new RegExp(`${m}/${y}`) }).first();
    if (!await link.count()) throw new Error(`o mês ${m}/${y} não aparece na tela de mês de referência`);
    await Promise.all([page.waitForLoadState('domcontentloaded'), link.click()]);
  } // com o select pMes escolhido não há botão de confirmar: o RELATORIOS logo abaixo usa o mês (o 1º botão da tela é INFORMATIVOS)
  await page.waitForTimeout(2000);
  passo = `webhap ${login}: RELATORIOS`;
  const rel = page.getByText(/^\s*RELAT[ÓO]RIOS\s*$/i).first();
  await rel.waitFor({ timeout: 60000 }).catch(async () => { if (await temSenha(page)) throw erroLogin(login); throw new Error('o menu RELATORIOS não apareceu'); });
  await Promise.all([page.waitForLoadState('domcontentloaded'), rel.click()]);
  await page.waitForTimeout(3000);
  passo = `webhap ${login}: ler cards`;
  const tela = await page.locator('body').innerText();
  if (/nenhum|n[ãa]o (h[áa]|existe|foram encontrad)/i.test(tela) && !/EXCEL/i.test(tela)) { saida.sem_dados.push({ comissao: comp, login }); return; }
  // cada card = menor bloco com "Lote" e um único botão EXCEL do analítico por data de pagamento
  const cards = await page.evaluate(() => {
    const ex = [...document.querySelectorAll('a, button, input[type=button], input[type=submit], img')].filter(e => /EXCEL/i.test(e.innerText || e.value || e.alt || e.title || ''));
    return ex.map((e, i) => {
      let r = e.closest('tr') || e.parentElement; // linha do relatório dentro do card
      // os lotes ficam todos numa tabela só: o card são as linhas desde o "Lote:" acima do botão até ele
      let card = '';
      if (e.closest('tr')) for (let t = r; t; t = t.previousElementSibling) { card = (t.innerText || '') + ' ' + card; if (/Lote/i.test(t.innerText || '')) break; }
      else { let c = e; while (c.parentElement && !/Lote/i.test(c.innerText || '')) c = c.parentElement; card = c.innerText || ''; }
      e.setAttribute('data-shaddai-excel', i);
      return { i, card: card.replace(/\s+/g, ' ').trim(), linha: (r.innerText || '').replace(/\s+/g, ' ').trim() };
    }).filter(x => /Anal[íi]tico por Data/i.test(x.linha) || /Anal[íi]tico por Data/i.test(x.card));
  });
  if (!cards.length) throw new Error('nenhum card com EXCEL do "Analítico por Data Pagamento" na tela');
  const tsv = path.join(dest, 'lotes.tsv');
  const lotes = fs.existsSync(tsv) ? fs.readFileSync(tsv, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('lote\t')) : [];
  const vistos = new Set();
  saida.comissao = saida.comissao || [];
  for (const c of cards) {
    const t = c.card, pega = re => (t.match(re) || [])[1];
    const datas = t.match(/\d\d\/\d\d\/\d{4}/g) || [];
    const L = {
      lote: pega(/Lote\D{0,15}(\d{4,})/i), tipo: pega(/\b([A-ZÇÃÉ]+ HAPVIDA)\b/), regra: pega(/\b(SUPLEMENTO|AGENCIAMENTO|VITAL[ÍI]CIO|PRIMEIRA|RENOVA\S*)\b/i),
      integracao: pega(/Integra\S*\D{0,15}(\d\d\/\d\d\/\d{4})/i) || datas[0], ini: pega(/(\d\d\/\d\d\/\d{4})\s*(?:a|at[ée]|-)\s*\d\d\/\d\d\/\d{4}/i),
      fim: pega(/\d\d\/\d\d\/\d{4}\s*(?:a|at[ée]|-)\s*(\d\d\/\d\d\/\d{4})/i), obrigacao: pega(/Obriga\S*\D{0,15}(\d{8,})/i), valor: pega(/R\$\s*([\d.]+,\d\d)/) || pega(/([\d.]+,\d\d)/),
    };
    const falta = Object.keys(L).filter(k => !L[k]);
    if (falta.length) throw new Error(`card sem ${falta.join(', ')}: ${t.slice(0, 200)}`);
    if (vistos.has(L.lote)) continue;
    vistos.add(L.lote);
    L.regra = L.regra.toUpperCase();
    saida.comissao.push({ login, lote: L.lote, tipo: L.tipo, regra: L.regra, valor: L.valor });
    const arq = path.join(dest, `${L.lote} - ${L.tipo} - ${L.regra}.csv`);
    const linha = [L.lote, L.tipo, L.regra, L.integracao, L.ini, L.fim, L.obrigacao, L.valor].join('\t');
    if (!lotes.some(l => l.split('\t')[0] === L.lote)) lotes.push(linha);
    if (fs.existsSync(arq)) { saida.repetidos.push(arq); continue; }
    passo = `webhap ${login}: EXCEL do lote ${L.lote}`;
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator(`[data-shaddai-excel="${c.i}"]`).click()]);
    const buf = fs.readFileSync(await dl.path());
    const tot = totalCsv(buf);
    if (tot === null) throw new Error(`o EXCEL do lote ${L.lote} não é o analítico por data de pagamento`);
    if (Math.abs(tot - num(L.valor)) > 0.05) saida.avisos.push(`${login} lote ${L.lote}: CSV soma ${tot.toFixed(2)} e o card mostra ${L.valor}`);
    grava(arq, buf, saida);
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(tsv, 'lote\ttipo\tregra\tintegracao\tini\tfim\tobrigacao\tvalor\n' + lotes.join('\n') + '\n', 'utf8');
}

(async () => {
  const args = process.argv.slice(2), tarefas = [];
  const uso = { ok: false, motivo: 'uso: node baixar_hapvida.js faturas AAAA-MM-DD | comissao AAAA-MM [045K,045L,02JZ]' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'faturas' && /^\d{4}-\d{2}-\d{2}$/.test(args[i + 1])) tarefas.push(['faturas', args[++i]]);
    else if (args[i] === 'comissao' && /^\d{4}-\d{2}$/.test(args[i + 1])) {
      const comp = args[++i], so = /^[0-9A-Z]{4}(,[0-9A-Z]{4})*$/.test(args[i + 1] || '') ? args[++i].split(',') : Object.keys(LOGINS);
      if (so.some(l => !LOGINS[l])) sai(1, uso);
      for (const l of so) tarefas.push(['comissao', comp, l]);
    } else sai(1, uso);
  }
  if (!tarefas.length) sai(1, uso);
  const saida = { ok: true, arquivos: [], repetidos: [], sem_dados: [], avisos: [], falhas: [] };
  for (const [t, a, l] of tarefas) await (t === 'faturas' ? faturas(a, saida) : comissao(a, l, saida));
  for (const p of abas) await p.close().catch(() => {});
  sai(0, saida);
})().catch(async e => {
  if (e.message === 'login') { for (const p of abas) await p.close().catch(() => {}); sai(3, { ok: false, motivo: 'login', login: e.login, passo }); }
  const so = path.join(__dirname, '_socorro'), q = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
  fs.mkdirSync(so, { recursive: true });
  const png = path.join(so, `hapvida_${q}.png`);
  if (aba) await aba.screenshot({ path: png, fullPage: true }).catch(() => {});
  fs.writeFileSync(png.replace(/\.png$/, '.txt'), semSessao(`passo: ${passo}\nerro: ${e.stack || e}\nurl: ${aba ? aba.url().split('?')[0] : '-'}\n`));
  for (const p of abas) await p.close().catch(() => {});
  sai(2, { ok: false, motivo: semSessao(String(e.message || e).split('\n')[0]), passo, print: png });
});
