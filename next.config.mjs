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
      // Снижен с 200mb до 10mb (security P2 D-6, DoS-вектор).
      // Все загрузки файлов идут через /api/upload/* (не Server Actions) —
      // проверено грепом: formData/multipart только в app/api/upload/*.
      bodySizeLimit: '10mb',
    },
    proxyClientMaxBodySize: '200mb',
  },

  async headers() {
    // Базовые security-заголовки для всех маршрутов
    const securityHeaders = [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
    ]

    return [
      // Все маршруты — базовые заголовки без X-Frame-Options,
      // чтобы не сломать embed-виджеты (talent-pool, career-page и др.)
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Для внутренних и публичных страниц (не embed) — запрет framing
      // Исключаем /embed/*, /careers, /jobs/*, /vacancy/* (iframe-able виджеты)
      {
        source: "/((?!embed|careers|jobs|vacancy).*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
      // HTML-страницы: не кэшировать долго (иначе промежуточные кэши держат
      // старый HTML со ссылками на старые чанки → «вижу старое после деплоя»).
      // Исключаем /_next/ (статика — её можно кэшировать immutable) и /api/.
      {
        source: "/((?!_next/|api/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ]
  },
}

export default nextConfig
