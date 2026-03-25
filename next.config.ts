import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase serverless function timeout for fashn.ai polling
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
