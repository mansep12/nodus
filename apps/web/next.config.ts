import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded Postgres loads its WebAssembly from disk, which bundling breaks.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Lets a second instance of the app (the sandbox) run next to the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A self-contained build, for the Docker image.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
