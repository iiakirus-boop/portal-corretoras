// Logins de fatura por operadora (hapvida, sulamerica, amil...): vários por operadora, um por grupo de contratos.
// Senhas: %LOCALAPPDATA%\Shaddai\<op>_faturas_<apelido>.cred (DPAPI, só o usuário do Windows abre), gravadas pelo cadastrar_login.ps1.
// Lista sem senha: %LOCALAPPDATA%\Shaddai\logins.json = { "<op>": [ { apelido, usuario (mascarado), ativo, ultimo_sucesso } ] }.
// A senha só passa pela memória do processo que vai logar: nunca é impressa nem gravada em outro lugar.
// Linha de comando (usada pelo cadastrar_login.ps1):  node logins.js cadastrar <op> <apelido> <usuario mascarado>
//                                                     node logins.js listar [op]
//                                                     node logins.js portal <seguradora> [uso]  -> "045K:9335,045L:9336,..." (login_hapvida.ps1)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const DIR = path.join(process.env.LOCALAPPDATA, 'Shaddai'), LISTA = path.join(DIR, 'logins.json');
const OK = /^[A-Za-z0-9_-]+$/;

const le = () => { try { return JSON.parse(fs.readFileSync(LISTA, 'utf8')); } catch (e) { return {}; } };
const salva = j => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(LISTA, JSON.stringify(j, null, 2), 'utf8'); };
const arquivo = (op, apelido) => path.join(DIR, `${op}_faturas_${apelido}.cred`);

// logins ativos que têm o .cred
function ativos(op) {
  return (le()[op] || []).filter(l => l.ativo !== false && fs.existsSync(arquivo(op, l.apelido)));
}

// abre o .cred pelo PowerShell (DPAPI) e devolve { usuario, senha } só em memória
function credencial(op, apelido) {
  if (!OK.test(op) || !OK.test(apelido)) throw new Error('apelido inválido');
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $c=Import-Clixml '${arquivo(op, apelido)}'; $c.UserName; $c.GetNetworkCredential().Password`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r/g, '').split('\n');
  return { usuario: out[0], senha: out[1] };
}

function marca(op, apelido, campos) {
  const j = le(), l = (j[op] || []).find(x => x.apelido === apelido);
  if (l) { Object.assign(l, campos); salva(j); }
}

function cadastra(op, apelido, mascara) {
  if (!OK.test(op) || !OK.test(apelido)) throw new Error('use só letras, números, - e _ no apelido');
  const j = le(), lista = j[op] = j[op] || [], l = lista.find(x => x.apelido === apelido);
  if (l) Object.assign(l, { usuario: mascara, ativo: true }); else lista.push({ apelido, usuario: mascara, ativo: true, ultimo_sucesso: null });
  salva(j);
}

// shortcut: campos achados pelo tipo (1º texto visível + senha), sem seletor fixo por portal; se a tela mudar, o login falha e é relatado
async function preencheLogin(page, { usuario, senha }) {
  const s = page.locator('input[type=password]:visible').first();
  await s.waitFor({ timeout: 60000 });
  // webhap usa type="textfield" (inválido, o navegador trata como texto)
  await page.locator('input:not([type]):visible, input[type=text]:visible, input[type=textfield]:visible, input[type=email]:visible, input[type=tel]:visible').first().fill(usuario);
  await s.fill(senha);
  await s.press('Enter');
}

// Logins de PORTAL (um Chrome por login, aberto pelo atalho "Entrar na <op>") vêm do cadastro do banco (corretora_codigos),
// que o vigia copia em Scripts/_cadastro.json a cada volta. Sem a cópia (1ª vez sem rede), valem os logins de sempre.
const PADRAO = {
  hapvida: [{ codigo: '045K', porta: 9335, pasta: 'Hapvida', uso: 'comissao' }, { codigo: '045L', porta: 9336, pasta: 'Hapvida_045L', uso: 'comissao' },
            { codigo: '02JZ', porta: 9337, pasta: 'Hapvida_02JZ', uso: 'comissao' }],
  porto_saude: [{ codigo: 'BA6QXJ', porta: 9334, pasta: 'PortoSaude', uso: 'ambos' }],
  bradesco_saude: [{ codigo: 'Portal', porta: 9333, pasta: null, uso: 'ambos' }],
};
function doCadastro(seguradora, uso) {
  let ls = null;
  try { ls = JSON.parse(fs.readFileSync(path.join(__dirname, '_cadastro.json'), 'utf8')).logins.filter(l => l.seguradora === seguradora); } catch (e) { /* sem cópia */ }
  if (!ls || !ls.length) ls = PADRAO[seguradora] || [];
  return Object.fromEntries(ls.filter(l => l.porta && (!uso || [uso, 'ambos'].includes(l.uso || 'ambos')))
    .map(l => [l.codigo, { porta: l.porta, pasta: l.pasta || `${seguradora}_${l.codigo}` }]));
}

module.exports = { ativos, credencial, marca, cadastra, preencheLogin, arquivo, doCadastro };

if (require.main === module) {
  const [cmd, op, apelido, mascara] = process.argv.slice(2);
  if (cmd === 'cadastrar' && op && apelido) { cadastra(op, apelido, mascara || ''); console.log(`Login "${apelido}" da ${op} cadastrado.`); }
  else if (cmd === 'listar') console.log(JSON.stringify(op ? le()[op] || [] : le(), null, 2));
  else if (cmd === 'portal' && op) console.log(Object.entries(doCadastro(op, apelido)).map(([c, x]) => `${c}:${x.porta}`).join(','));
  else { console.log('uso: node logins.js cadastrar <op> <apelido> <usuario mascarado> | listar [op]'); process.exit(1); }
}
