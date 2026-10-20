// Publica o modelo da Projeção (blocos //<model> da Central) em public/modelo-projecao.js.
// O Agente Projeção na nuvem (supabase/functions/agente-projecao) baixa este arquivo a cada rodada,
// então a projeção da nuvem usa sempre a mesma conta da página Projeção. Roda sozinho antes de cada build.
import fs from 'node:fs';
const src = fs.readFileSync('lib/central/central.html', 'utf8');
const blocos = [...src.matchAll(/\/\/<model>\n([\s\S]*?)\/\/<\/model>/g)].map((m) => m[1]).join('\n');
if (!blocos.includes('function projAll')) throw new Error('modelo da Projeção não encontrado no central.html');
fs.writeFileSync('public/modelo-projecao.js',
  '// GERADO por scripts/gerar-modelo-projecao.mjs a partir de lib/central/central.html. Não editar à mão.\n' +
  'globalThis.modeloProjecao = (function () {\nconst $ = () => null; const S = { agentes: [] };\n' + blocos +
  '\nreturn { projAll, mergeCom, fam, famsIn, uniq, sum, addMonth, ckey, isAg };\n})();\n');
console.log('public/modelo-projecao.js gerado,', blocos.length, 'caracteres');
