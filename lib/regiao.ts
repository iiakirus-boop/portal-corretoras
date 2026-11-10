// Região da empresa (município do CNPJ) -> regiões da rede credenciada (cot_prestadores.regiao), em ordem de proximidade.
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

const CAPITAL = ['São Paulo - Centro', 'São Paulo - Zona Sul', 'São Paulo - Zona Oeste', 'São Paulo - Zona Leste', 'São Paulo - Zona Norte'];
const GRUPOS: [string[], string[]][] = [
  [['SANTO ANDRE', 'SAO BERNARDO DO CAMPO', 'SAO CAETANO DO SUL', 'DIADEMA', 'MAUA', 'RIBEIRAO PIRES', 'RIO GRANDE DA SERRA'], ['ABCD', 'São Paulo - Zona Sul', 'São Paulo - Zona Leste']],
  [['SANTOS', 'SAO VICENTE', 'GUARUJA', 'PRAIA GRANDE', 'CUBATAO', 'BERTIOGA', 'MONGAGUA', 'ITANHAEM', 'PERUIBE'], ['Baixada Santista']],
  [['GUARULHOS', 'OSASCO', 'BARUERI', 'CARAPICUIBA', 'COTIA', 'ITAPEVI', 'JANDIRA', 'TABOAO DA SERRA', 'EMBU DAS ARTES', 'SANTANA DE PARNAIBA', 'FRANCO DA ROCHA', 'CAIEIRAS', 'ITAPECERICA DA SERRA'], ['Grande SP', 'Osasco', 'Grande SP - Sul', 'São Paulo - Zona Oeste']],
  [['SUZANO', 'MOGI DAS CRUZES', 'POA', 'ITAQUAQUECETUBA', 'FERRAZ DE VASCONCELOS', 'ARUJA'], ['Alto Tietê', 'São Paulo - Zona Leste']],
  [['CAMPINAS'], ['Campinas', 'Campinas e Região']],
  [['VALINHOS', 'VINHEDO', 'INDAIATUBA', 'HORTOLANDIA', 'SUMARE', 'AMERICANA', 'PAULINIA', 'LIMEIRA', 'JUNDIAI', 'ATIBAIA', 'BRAGANCA PAULISTA', 'PIRACICABA', 'SANTA BARBARA D OESTE'], ['Campinas e Região', 'Campinas']],
  [['SOROCABA', 'VOTORANTIM', 'ITU', 'SALTO', 'TATUI', 'ITAPETININGA'], ['Sorocaba e Região']],
  [['SAO JOSE DOS CAMPOS', 'TAUBATE', 'JACAREI', 'PINDAMONHANGABA', 'CACAPAVA', 'GUARATINGUETA', 'LORENA'], ['Vale do Paraíba']],
];

export function regioesDaEmpresa(municipio: string | null | undefined): { regioes: string[]; cidade: string | null } {
  const m = municipio ? sem(municipio) : '';
  if (!m || m === 'SAO PAULO') return { regioes: CAPITAL, cidade: null };
  const g = GRUPOS.find(([cs]) => cs.includes(m));
  if (g) return { regioes: g[1], cidade: m };
  return { regioes: ['Interior'], cidade: m }; // interior: só os hospitais da própria cidade
}
export const mesmaCidade = (bairro: string | null | undefined, cidade: string) => !!bairro && sem(bairro) === cidade;
