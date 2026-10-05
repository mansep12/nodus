import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded Postgres loads its WebAssembly from disk, which bundling breaks.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Lets a second instance of the app (the sandbox) run next to the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
