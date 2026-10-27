// Agente Faturas Hapvida - coleta no Portal Empresa Hapvida/NotreDame (portal-empresa.hapvidagndi.com.br).
// Como usar (Claude in Chrome, com a equipe já logada no portal; o agente nunca digita senha):
//  1. Abrir um contrato qualquer e clicar em Extrato financeiro (a página faz as chamadas e o passo 2 guarda o cabeçalho de acesso).
//  2. Rodar PASSO 1 abaixo no console da página, depois clicar em "Voltar" ou em outra aba do extrato.
//  3. Rodar PASSO 2 (demora alguns minutos; roda em segundo plano e guarda tudo em window.__res).
//  4. Rodar PASSO 3: baixa portal_hapvida_<data>.json para Downloads.
//  5. Copiar o JSON para FATURAS/Faturas/Hapvida_portal/ e rodar faturas_hapvida.py com ele como 3º argumento.
// O portal só mostra os contratos do login usado (em 19/10/2026: 18 contratos principais do login da Renata Cristina).

// PASSO 1 - guarda os cabeçalhos que o próprio portal usa
window.__hdr = window.__hdr || {};
(() => {
  const os = XMLHttpRequest.prototype.setRequestHeader;
  if (!XMLHttpRequest.prototype.__p) { XMLHttpRequest.prototype.__p = 1; XMLHttpRequest.prototype.setRequestHeader = function (k, v) { window.__hdr[k] = v; return os.apply(this, arguments); }; }
  const of = window.fetch;
  if (!window.__fp) { window.__fp = 1; window.fetch = function (u, o) { try { const h = (o && o.headers) || {}; (h.forEach ? h.forEach((v, k) => window.__hdr[k] = v) : Object.assign(window.__hdr, h)); } catch (e) {} return of.apply(this, arguments); }; }
})();

// PASSO 2 - lista contratos e baixa as faturas (em aberto + histórico) desde DESDE, com o Relatório.csv de cada uma
window.__coleta = (async (DESDE = '2025-09-01') => {
  const B = 'https://api.hapvida.com.br/b2b/api/v3/';
  const H = { ...window.__hdr };
  const J = async u => { const r = await fetch(B + u, { headers: H }); return r.ok ? r.json() : { err: r.status }; };
  const iso = d => d.slice(6) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2);
  let comp = [];
  for (let off = 0; off < 500; off += 50) { const j = await J(`companies?offset=${off}&limit=50`); const c = (j.content && j.content.companies) || []; comp = comp.concat(c); if (c.length < 50) break; }
  const res = { geradoEm: new Date().toISOString(), login: 'portal-empresa NDI', contratos: [] };
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
  window.__res = res;
  return res.contratos.map(c => c.contrato + ':' + c.faturas.length).join(' ');
})();

// PASSO 3 - quando window.__res existir
// const s = JSON.stringify(window.__res); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'application/json' }));
// a.download = 'portal_hapvida_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
