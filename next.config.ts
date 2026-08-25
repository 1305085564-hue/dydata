import path from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // sharp 含原生二进制，必须作为外部包整体打进 lambda，禁止打包器拆解
  serverExternalPackages: ["sharp"],
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "framer-motion"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: "/demo/:path*",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
