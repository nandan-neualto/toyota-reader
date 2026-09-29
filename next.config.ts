import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.DEPLOY_TARGET === "render" ? {
    output: "export" as const,
    distDir: ".next-render",
    images: { unoptimized: true },
  } : {}),
};

export default nextConfig;
