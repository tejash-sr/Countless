import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships a WASM Postgres; keep it (and pg) out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    // Bill photos are shrunk in the browser, but allow headroom over the 1MB default.
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
