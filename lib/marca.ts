// Identidade visual da corretora nas apresentações (PDF da cotação).
// Cada corretora pode ter a sua: cores, logo (arquivos em lib/pdf/marcas) e contatos. Sem cadastro, usa o padrão.
export type Marca = {
  nome: string;
  logo: string | null;        // arquivo em lib/pdf/marcas, versão para fundo claro
  logoBranco: string | null;  // versão para fundo escuro (capa e encerramento)
  logoProporcao: number;      // altura / largura
  cores: { escuro: string; principal: string; destaque: string; vinho: string; verde: string; ouro: string };
  contatos: [string, string][];
};

const PADRAO: Marca = {
  nome: 'Corretora',
  logo: null, logoBranco: null, logoProporcao: 1,
  cores: { escuro: '#10193A', principal: '#1B2A5C', destaque: '#1C7293', vinho: '#8C1F3D', verde: '#1E6E4A', ouro: '#C9A227' },
  contatos: [],
};

const MARCAS: Record<string, Partial<Marca>> = {
  // Shaddai Seguros
  '17e3e5ee-591d-4dbf-8e47-44930ef2941f': {
    nome: 'Shaddai Seguros',
    logo: 'shaddai.png', logoBranco: 'shaddai-branco.png', logoProporcao: 660 / 765,
    contatos: [
      ['Corretora', 'Shaddai Seguros'],
      ['E-mail', 'Patricia.Yoneda@shaddaiseguros.com.br'],
      ['Telefone', '(11) 4477-4477 / (11) 96474-0410'],
      ['Site', 'www.shaddaiseguros.com.br'],
    ],
  },
};

export function marcaDa(corretoraId: string, nome?: string): Marca {
  const m = MARCAS[corretoraId] ?? {};
  return { ...PADRAO, nome: nome ?? PADRAO.nome, ...m, cores: { ...PADRAO.cores, ...(m.cores ?? {}) } };
}
