/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  env: {
    NEW_API_BASE_URL: process.env.NEW_API_BASE_URL || 'https://new-api.onemue.cn/',
    NEW_API_KEY: process.env.NEW_API_KEY || 'xmCgDsePJkpnrhsFmbp2SnqhiS8i',
    DATABASE_HOST: process.env.DATABASE_HOST || 'localhost',
    DATABASE_PORT: process.env.DATABASE_PORT || '3306',
    DATABASE_NAME: process.env.DATABASE_NAME || 'ai_token_dashboard',
    DATABASE_USER: process.env.DATABASE_USER || 'username',
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD || 'password',
    ADMIN_API_KEY: process.env.ADMIN_API_KEY || 'default-admin-key',
    SYNC_INTERVAL_HOURS: process.env.SYNC_INTERVAL_HOURS || '1',
    SYNC_ENABLED: process.env.SYNC_ENABLED || 'true',
  },
}

module.exports = nextConfig