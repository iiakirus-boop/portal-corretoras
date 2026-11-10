// arquivos que o PDF lê do disco: fontes e logos, e as fontes padrão do pdfkit (carregadas por '#standard-fonts', que o rastreio não vê)
const PDF = ['./lib/pdf/fontes/*', './lib/pdf/marcas/*', './node_modules/pdfkit/js/standard-fonts/**/*', './node_modules/pdfkit/js/data/**/*'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
  // a Central é lida do disco pela rota /central/[c]
  outputFileTracingIncludes: {
    '/central/[c]': ['./lib/central/central.html'],
    // a apresentação da cotação (PDF) usa as fontes e os logos do disco
    '/corretora/[c]/cotacao/[e]/pdf': PDF,
    '/teste-pdf': PDF,
  },
};
export default nextConfig;
