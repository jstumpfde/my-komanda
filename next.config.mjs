/** @type {import('next').NextConfig} */
const nextConfig = {
  // Zero-downtime деплой: при NEXT_OUTPUT_STANDALONE=1 сборка дополнительно
  // эмитит .next/standalone/server.js → запускается в PM2 cluster-режиме
  // (2 инстанса, rolling reload без простоя). Без переменной — обычный режим
  // (next start), текущий прод не затрагивается.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
    proxyClientMaxBodySize: '200mb',
  },
}

export default nextConfig
