import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["images.mapillary.com", "scontent.xx.fbcdn.net"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
