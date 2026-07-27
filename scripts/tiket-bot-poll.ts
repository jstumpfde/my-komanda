/**
 * tiket-bot-poll.ts
 *
 * DEV-ONLY поллер для @TiketCompany24bot (Бизнес-ассистент → Авиабилеты).
 * На проде бот работает через вебхук (app/api/telegram/tiket-bot/webhook) —
 * этот скрипт НЕ для прода, только для локальной разработки без публичного
 * URL: long-polling getUpdates → тот же обработчик handleTiketBotUpdate,
 * что и вебхук (не дублируем логику).
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/tiket-bot-poll.ts
 *
 * Остановка: Ctrl+C (или kill процесса).
 */
import { handleTiketBotUpdate, tiketBotToken, type TgUpdate } from "@/lib/telegram/tiket-bot"

const POLL_TIMEOUT_S = 25 // long-polling timeout Telegram getUpdates

async function main() {
  const token = tiketBotToken()
  if (!token) {
    console.error("[tiket-bot-poll] TELEGRAM_BOT_TOKEN не задан в env — нечего опрашивать.")
    process.exit(1)
  }

  console.log("[tiket-bot-poll] запущен (dev-only long-polling). Ctrl+C — остановить.")

  let offset = 0
  let running = true
  process.on("SIGINT", () => { running = false; console.log("\n[tiket-bot-poll] остановка…"); process.exit(0) })
  process.on("SIGTERM", () => { running = false; process.exit(0) })

  while (running) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=${POLL_TIMEOUT_S}&offset=${offset}`,
      )
      if (!res.ok) {
        console.error("[tiket-bot-poll] getUpdates HTTP", res.status)
        await sleep(3000)
        continue
      }
      const data = (await res.json()) as { ok: boolean; result?: TgUpdate[] }
      if (!data.ok || !data.result) {
        await sleep(3000)
        continue
      }
      for (const update of data.result) {
        offset = update.update_id + 1
        try {
          await handleTiketBotUpdate(update)
        } catch (err) {
          console.error("[tiket-bot-poll] handleTiketBotUpdate failed:", err)
        }
      }
    } catch (err) {
      console.error("[tiket-bot-poll] poll error:", err)
      await sleep(3000)
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

main()
