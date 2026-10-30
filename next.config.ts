import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "admins.qikink.com" },
      { protocol: "https", hostname: "qikink.com" },
      { protocol: "https", hostname: "*.qikink.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
