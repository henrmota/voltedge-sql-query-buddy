import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://volt-backend:4000/api/:path*',
      },
    ];
  },
  // Disable Turbopack to use webpack watchOptions
  experimental: {
    turbo: false,
  },
  webpack: (config) => {
    config.watchOptions = {
      ignored: [
        '**/node_modules',
        '**/.git',
        '**/.next',
      ],
    };
    return config;
  },
};

export default nextConfig;
