import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ── MERN architecture ──
  // The Express + Mongoose + MongoDB backend (mini-services/api-server,
  // port 3010) owns the entire /api surface. Next.js acts as the reverse
  // proxy so the React frontend talks to the API on a single origin —
  // exactly how the MEAN/MERN tutorial wires frontend → backend.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:3010/api/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
