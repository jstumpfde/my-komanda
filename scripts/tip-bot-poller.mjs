#!/usr/bin/env node
// scripts/tip-bot-poller.mjs
//
// Long-polling мост для Telegram-бота модуля «Типология» (@Pypologie_Bot).
// Зачем: на проде нет валидного домена/сертификата, отдельно принимающего
// вебхуки бота под TIP_TG_*, поэтому вместо setWebhook используется
// getUpdates в цикле — этот скрипт запускается отдельным процессом (pm2/
// systemd/nohup) на сервере, читает апдейты и ретранслирует их на локальный
// webhook-роут приложения (POST /api/public/tip/tg), как будто их прислал
// сам Telegram.
//
// Перенесено из /root/tip-bot-poller.mjs (черновая копия на проде) в репозиторий,
// чтобы держать код версионированным. Улучшения при переносе:
//   - TIP_TG_API_BASE тоже читается из env-файла — getUpdates ходит через тот
//     же рижский прокси, что и остальной Bot API (см. lib/tip/bot/telegram.ts):
//     исходящие к api.telegram.org с прод-сервера (РФ) нестабильны.
//   - Путь к env-файлу, целевой webhook и файл офсета — настраиваемые через
//     аргументы командной строки/переменные окружения, с теми же дефолтами,
//     что были захардкожены в черновике.
//
// Запуск (дефолты — прод-пути):
//   node scripts/tip-bot-poller.mjs
// Переопределение:
//   ENV_FILE=/path/.env.local WEBHOOK_URL=http://127.0.0.1:3000/api/public/tip/tg \
//   OFFSET_FILE=/root/.tip-poller-offset node scripts/tip-bot-poller.mjs
// Или аргументами: --env-file=... --webhook-url=... --offset-file=...

import { readFileSync, writeFileSync, existsSync } from "fs"

function parseArgs(argv) {
  const out = {}
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

const ENV_FILE = args["env-file"] || process.env.ENV_FILE || "/var/www/my-komanda/.env.local"
const WEBHOOK_URL = args["webhook-url"] || process.env.WEBHOOK_URL || "http://127.0.0.1:3000/api/public/tip/tg"
const OFFSET_FILE = args["offset-file"] || process.env.OFFSET_FILE || "/root/.tip-poller-offset"

function readEnvVar(envFileContent, key) {
  return (envFileContent.match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1]?.trim()
}

let envFileContent
try {
  envFileContent = readFileSync(ENV_FILE, "utf8")
} catch (e) {
  console.error(`[tip-bot-poller] не удалось прочитать env-файл ${ENV_FILE}:`, e.message)
  process.exit(1)
}

const TOKEN = readEnvVar(envFileContent, "TIP_TG_BOT_TOKEN")
const SECRET = readEnvVar(envFileContent, "TIP_TG_WEBHOOK_SECRET")
// Прокси Bot API (рижский Caddy reverse_proxy → api.telegram.org) — тот же
// принцип, что и в lib/tip/bot/telegram.ts/notify.ts. Без переменной — прямой
// api.telegram.org (для локальной разработки не в РФ-сети).
const TG_API_BASE = readEnvVar(envFileContent, "TIP_TG_API_BASE") || process.env.TIP_TG_API_BASE || "https://api.telegram.org"

if (!TOKEN || !SECRET) {
  console.error(`[tip-bot-poller] нет TIP_TG_BOT_TOKEN/TIP_TG_WEBHOOK_SECRET в ${ENV_FILE}`)
  process.exit(1)
}

console.log(`[tip-bot-poller] старт: API=${TG_API_BASE} webhook=${WEBHOOK_URL} offsetFile=${OFFSET_FILE}`)

let offset = existsSync(OFFSET_FILE) ? parseInt(readFileSync(OFFSET_FILE, "utf8"), 10) || 0 : 0

async function loop() {
  for (;;) {
    try {
      const url = `${TG_API_BASE}/bot${TOKEN}/getUpdates?timeout=50&offset=${offset}&allowed_updates=["message","callback_query"]`
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) })
      const d = await r.json()

      if (!d.ok) {
        console.error("[tip-bot-poller] getUpdates not ok:", d.description)
        await new Promise((s) => setTimeout(s, 5000))
        continue
      }

      for (const u of d.result) {
        offset = u.update_id + 1
        writeFileSync(OFFSET_FILE, String(offset))
        try {
          const res = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Telegram-Bot-Api-Secret-Token": SECRET,
            },
            body: JSON.stringify(u),
            signal: AbortSignal.timeout(120000),
          })
          if (!res.ok) console.error("[tip-bot-poller] webhook->", res.status, "update", u.update_id)
        } catch (e) {
          console.error("[tip-bot-poller] webhook post fail", u.update_id, e.message)
        }
      }
    } catch (e) {
      console.error("[tip-bot-poller] poll error:", e.message)
      await new Promise((s) => setTimeout(s, 5000))
    }
  }
}

loop()
