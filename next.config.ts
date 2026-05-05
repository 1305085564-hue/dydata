import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "framer-motion"],
  },
};

export default nextConfig;
