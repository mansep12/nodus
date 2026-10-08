import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded Postgres loads its WebAssembly from disk, which bundling breaks.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Lets a second instance of the app (the sandbox) run next to the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A self-contained build, for the Docker image.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // No other site gets to frame the app or guess at what its responses are.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
};

export default nextConfig;
