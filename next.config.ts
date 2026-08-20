import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions handle file uploads (signed agreement, resale certificate).
    serverActions: { bodySizeLimit: '10mb' },
  },
}

export default nextConfig
