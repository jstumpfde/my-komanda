// PM2 cluster-конфиг для zero-downtime деплоя (прод).
//
// Запускает Next.js standalone-сервер в 2 инстансах в cluster-режиме →
// `pm2 reload my-komanda` перезапускает их по очереди, всегда хотя бы один
// отвечает = деплой без простоя.
//
// ВАЖНО: используется только со standalone-сборкой:
//   NEXT_OUTPUT_STANDALONE=1 pnpm build
//   cp -r .next/static  .next/standalone/.next/static
//   cp -r public        .next/standalone/public
// (см. DEPLOY-zero-downtime.md). Без этого server.js не появится.
//
// .env / .env.local лежат в cwd — standalone-сервер их подхватывает.
module.exports = {
  apps: [
    {
      name: "my-komanda",
      script: ".next/standalone/server.js",
      cwd: "/var/www/my-komanda",
      instances: 2,
      exec_mode: "cluster",
      // Чистим лишнюю память: рестарт инстанса при превышении.
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
}
