/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['ccxt'],
  turbopack: {
    // Empty config to suppress warning
  }
};

export default nextConfig;

