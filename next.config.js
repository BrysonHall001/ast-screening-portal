/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfkit and sharp load assets/binaries from node_modules at runtime;
  // keep them out of the webpack bundle.
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', 'sharp'],
  },
}

module.exports = nextConfig
