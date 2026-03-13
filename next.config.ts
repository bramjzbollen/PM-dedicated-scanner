import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Disable asset prefix for dev server
  assetPrefix: undefined,
};

export default nextConfig;
