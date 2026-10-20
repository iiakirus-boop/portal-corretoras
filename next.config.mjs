/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
  // a Central é lida do disco pela rota /central/[c]
  outputFileTracingIncludes: { '/central/[c]': ['./lib/central/central.html'] },
};
export default nextConfig;
