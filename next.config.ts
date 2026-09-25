import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second instance (see scripts/dev-sandbox.mjs) must never share this
  // folder with the main server: two Next processes writing to one .next
  // directory produce missing chunks and ChunkLoadErrors.
  distDir: process.env.TRAJECTORY_DIST_DIR ?? ".next",
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from disk at runtime (drizzle-orm migrator), so they
  // must be shipped with the serverless functions on Vercel and similar hosts.
  outputFileTracingIncludes: {
    "/**/*": ["./drizzle/**/*"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
