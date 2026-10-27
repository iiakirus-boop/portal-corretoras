// Publica o modelo da Projeção (blocos //<model> da Central) em public/modelo-projecao.js.
// O Agente Projeção na nuvem (supabase/functions/agente-projecao) baixa este arquivo a cada rodada,
// então a projeção da nuvem usa sempre a mesma conta da página Projeção. Roda sozinho antes de cada build.
// Grava também lib/central/projecao.gen.js (módulo) para as telas do portal usarem a mesma conta.
import fs from 'node:fs';
const src = fs.readFileSync('lib/central/central.html', 'utf8');
const blocos = [...src.matchAll(/\/\/<model>\n([\s\S]*?)\/\/<\/model>/g)].map((m) => m[1]).join('\n');
if (!blocos.includes('function projAll')) throw new Error('modelo da Projeção não encontrado no central.html');
const nomes = 'projAll, mergeCom, fam, famsIn, uniq, sum, addMonth, ckey, isAg';
const aviso = '// GERADO por scripts/gerar-modelo-projecao.mjs a partir de lib/central/central.html. Não editar à mão.\n';
fs.writeFileSync('public/modelo-projecao.js',
  aviso + 'globalThis.modeloProjecao = (function () {\nconst $ = () => null; const S = { agentes: [] };\n' + blocos +
  `\nreturn { ${nomes} };\n})();\n`);
fs.writeFileSync('lib/central/projecao.gen.js',
  aviso + '/* eslint-disable */\n// @ts-nocheck\nconst $ = () => null; const S = { agentes: [] };\n' + blocos + `\nexport { ${nomes} };\n`);
console.log('modelo da Projeção gerado,', blocos.length, 'caracteres');
