// Motor do Agente Projeção: roda o MESMO modelo da página Projeção da Central
// (blocos //<model> ... //</model> do HTML), com os dados da base da Central.
// Uso: node motor_projecao.js <central.html> <pasta db> <implantacoes.json> <saida.json> [gatilho] [AAAA-MM-DD]
const fs = require('fs'), path = require('path');
const [html, dbDir, impFile, outFile, gatilho = 'Sob demanda', hojeArg] = process.argv.slice(2);
const src = fs.readFileSync(html, 'utf8');
const blocks = [...src.matchAll(/\/\/<model>\n([\s\S]*?)\/\/<\/model>/g)].map(m => m[1]).join('\n');
const $ = () => null; // a página usa $, o modelo não
const M_ = new Function('$', blocks + '\nreturn {projAll,mergeCom,fam,famsIn,uniq,sum,addMonth,ckey,isAg};')($);
const readDir = d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))) : [];
const fat = readDir(path.join(dbDir, 'faturas')), com = readDir(path.join(dbDir, 'comissoes'));
const agcfg = {}; fs.existsSync(path.join(dbDir, 'agenciamentos')) && fs.readdirSync(path.join(dbDir, 'agenciamentos')).forEach(f => agcfg[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dbDir, 'agenciamentos', f), 'utf8')));
const imps = fs.existsSync(impFile) ? JSON.parse(fs.readFileSync(impFile, 'utf8')) : [];
const hoje = hojeArg ? new Date(hojeArg + 'T12:00:00') : new Date();
const M = M_.projAll(fat, M_.mergeCom(com), { agcfg, imps, hoje });
const T = M.hoje, cm = M_.ckey(T), meses = [0, 1, 2, 3].map(k => M_.addMonth(cm, k));
const r2 = v => Math.round(v * 100) / 100;
const linhas = [];
meses.forEach(m => {
  const it = M.com.filter(x => M_.ckey(x.data) === m);
  const segs = M_.famsIn(M_.uniq(M.com.map(x => M_.fam(x.op))));
  segs.forEach(f => ['ag', 'vit'].forEach(k => {
    const L = it.filter(x => M_.fam(x.op) === f && x.kind === k);
    const real = M_.sum(L.filter(x => x.tipo === 'real'), x => x.valor), prev = M_.sum(L.filter(x => x.tipo === 'prev'), x => x.valor), proj = M_.sum(L.filter(x => x.tipo === 'proj'), x => x.valor);
    if (real + prev + proj > 0) linhas.push({ comp: m, seg: f, kind: k, real: r2(real), prev: r2(prev), proj: r2(proj), total: r2(real + prev + proj), n: L.length });
  }));
});
// realizado por mês (pela data do crédito), para comparar com fotos anteriores
const realizado = {};
M.com.filter(x => x.tipo === 'real').forEach(x => { const m = M_.ckey(x.data), f = M_.fam(x.op); const o = realizado[m] = realizado[m] || { total: 0, porSeg: {} }; o.total += x.valor; o.porSeg[f] = (o.porSeg[f] || 0) + x.valor; });
const realizadoTipo = {};
M.com.filter(x => x.tipo === 'real').forEach(x => { const m = M_.ckey(x.data), f = M_.fam(x.op); const o = (realizadoTipo[m] = realizadoTipo[m] || {})[f] = (realizadoTipo[m] || {})[f] || { ag: 0, vit: 0 }; o[x.kind] = r2(o[x.kind] + x.valor); });
Object.values(realizado).forEach(o => { o.total = r2(o.total); Object.keys(o.porSeg).forEach(k => o.porSeg[k] = r2(o.porSeg[k])); });
// empresas que mais pesam nos meses futuros
const top = {};
M.com.filter(x => x.tipo !== 'real' && M_.ckey(x.data) > cm).forEach(x => { const k = x.empresa + '|' + M_.fam(x.op) + '|' + x.kind; top[k] = (top[k] || 0) + x.valor; });
const empresas = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => { const [empresa, seg, kind] = k.split('|'); return { empresa, seg, kind, valor: r2(v) }; });
const agora = new Date();
const foto = {
  id: cm + '_' + agora.toISOString().slice(0, 16).replace(/[-:T]/g, ''), geradoEm: agora.toISOString(), gatilho, mesAtual: cm, horizonte: meses[3], ultCompFaturas: M.ultComp,
  meses: meses.map(m => { const L = linhas.filter(l => l.comp === m); const porSeg = {}; L.forEach(l => { const o = porSeg[l.seg] = porSeg[l.seg] || { ag: 0, vit: 0, total: 0 }; o[l.kind] = r2(o[l.kind] + l.total); o.total = r2(o.total + l.total); });
    return { comp: m, total: r2(M_.sum(L, l => l.total)), ag: r2(M_.sum(L.filter(l => l.kind === 'ag'), l => l.total)), vit: r2(M_.sum(L.filter(l => l.kind === 'vit'), l => l.total)), real: r2(M_.sum(L, l => l.real)), porSeg }; }),
  linhas, empresas, agenciamentos: M.ag.map(A => ({ eid: A.eid, nome: A.nome, restantes: A.restantes, recebidas: A.rec.length + A.assum, imp: !!A.im })),
  atrasos: M.com.filter(x => x.atraso).map(x => ({ empresa: x.empresa, seg: M_.fam(x.op), kind: x.kind, valor: r2(x.valor), quando: x.quando })),
  implantacoesNovas: (M.novas || []).length, extraSemFatura: M.extraN
};
fs.writeFileSync(outFile, JSON.stringify({ foto, realizado, realizadoTipo, pendencias: foto.atrasos.length ? foto.atrasos.length + ' créditos em atraso (R$ ' + r2(M_.sum(foto.atrasos, x => x.valor)).toLocaleString('pt-BR') + '), jogados para o próximo dia útil' : '' }, null, 1));
console.log(JSON.stringify(foto.meses, null, 1));
console.log('em atraso:', foto.atrasos.length, 'R$', r2(M_.sum(foto.atrasos, x => x.valor)));
console.log('agenciamentos em andamento:', foto.agenciamentos.length, '| implantações novas:', foto.implantacoesNovas);
