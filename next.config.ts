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
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "framer-motion"],
  },
};

export default withBundleAnalyzer(nextConfig);
