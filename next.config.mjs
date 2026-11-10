/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
  // a Central é lida do disco pela rota /central/[c]
  outputFileTracingIncludes: {
    '/central/[c]': ['./lib/central/central.html'],
    // a apresentação da cotação (PDF) usa as fontes e os logos do disco
    '/corretora/[c]/cotacao/[e]/pdf': ['./lib/pdf/fontes/*', './lib/pdf/marcas/*'],
  },
};
export default nextConfig;
