// Teste do portal_empresa.js num portal de mentira (servidor local): login, menu por texto, só a linha da competência,
// boleto por download e PDF aberto em outra aba, nunca clica em "Cancelar", repetido na 2ª rodada.
// Uso: node testes/teste_portal_empresa.js   (não abre portal de verdade nem usa senha; grava numa pasta temporária)
const { chromium } = require('C:/Users/bruno/.claude/plugins/cache/playwright-skill/playwright-skill/5.0.0/skills/playwright-skill/node_modules/playwright');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const logins = require('../logins');
const PDF = n => Buffer.from(`%PDF-1.4\n% boleto ${n}\n` + 'x'.repeat(600) + '\n%%EOF');
let cancelou = false;
const PAG = `<html><body><a href="#" onclick="document.getElementById('m').style.display='block'">Financeiro</a>
<div id="m" style="display:none"><a href="/lista">2ª via de boleto</a></div></body></html>`;
const LISTA = `<html><body><table>
<tr><td>10/2026</td><td><a href="/b10.pdf" download>Boleto</a></td></tr>
<tr><td>11/2026</td><td><a href="/b11.pdf" download>Boleto</a> <a href="/r11.pdf" target="_blank">Relatório faturamento</a>
<button onclick="fetch('/cancelar')">Cancelar boleto</button></td></tr></table></body></html>`;
const srv = http.createServer((q, r) => {
  if (q.url === '/cancelar') { cancelou = true; return r.end('x'); }
  if (q.url.endsWith('.pdf')) { r.writeHead(200, { 'content-type': 'application/pdf', ...(q.url.includes('/b') ? { 'content-disposition': `attachment; filename="${q.url.slice(1)}"` } : {}) }); return r.end(PDF(q.url)); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(q.url === '/lista' ? LISTA : PAG);
});

(async () => {
  await new Promise(ok => srv.listen(0, ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  // logins e pasta de saída de mentira
  logins.ativos = () => [{ apelido: 'teste_x' }];
  logins.credencial = () => ({ usuario: 'u', senha: 's' });
  logins.marca = () => {};
  const pe = require('../portal_empresa');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-'));
  const cfg = { op: 'teste', nome: 'Teste', pasta: path.join(tmp, 'OP'), entra: async page => { await page.goto(base); return true; },
    menus: [[/financeiro/i, /boleto/i]] };
  // sem janela: uma janela de Chrome aparecendo na tela pode ser fechada por quem está no PC
  const semJanela = { launch: o => chromium.launch({ ...o, headless: true }) };
  const roda = () => pe.faturas(semJanela, cfg, '2026-11', { ok: true, arquivos: [], repetidos: [], sem_dados: [], falhas: [] });
  const s1 = await roda();
  const nomes = s1.arquivos.map(f => path.basename(f)).sort();
  assert.deepStrictEqual(s1.falhas, [], JSON.stringify(s1.falhas));
  assert.ok(nomes.includes('b11.pdf'), 'baixou o boleto 11/2026: ' + nomes);
  assert.ok(nomes.some(n => n.startsWith('r11')), 'pegou o PDF aberto em outra aba: ' + nomes);
  assert.ok(!nomes.includes('b10.pdf'), 'não baixa outra competência');
  assert.ok(s1.arquivos.every(f => f.includes(path.join('OP', '11-26', 'TESTE X'))), 'pasta MM-AA/APELIDO: ' + s1.arquivos[0]);
  assert.ok(!cancelou, 'nunca clica em Cancelar');
  const s2 = await roda();
  assert.strictEqual(s2.arquivos.length, 0, '2ª rodada não baixa de novo: ' + JSON.stringify([s1, s2]));
  assert.ok(s2.repetidos.length >= 2, '2ª rodada marca como repetido');
  assert.strictEqual(pe.mmaa('2026-11'), '11-26');
  if (!process.env.MANTER) fs.rmSync(tmp, { recursive: true, force: true });
  srv.close();
  console.log('OK portal_empresa:', nomes.join(', '));
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
