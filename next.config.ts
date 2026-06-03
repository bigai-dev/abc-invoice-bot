import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // better-sqlite3 is a native node module — keep it out of the server bundle
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
