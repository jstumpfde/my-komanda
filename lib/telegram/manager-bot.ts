// Платформенный Telegram-бот напоминаний менеджеру об интервью (@Ren_HR_bot,
// миграция 0270). В отличие от sendToCompanyChannel (per-company бот БЗ) —
// один общий bot token на всю платформу (env MANAGER_REMINDER_BOT_TOKEN),
// получатель — конкретный users.managerReminderChatId, привязанный через
// /start <код> (app/api/telegram/manager-bot/webhook).

const BOT_TOKEN = process.env.MANAGER_REMINDER_BOT_TOKEN
export const MANAGER_BOT_USERNAME = process.env.MANAGER_REMINDER_BOT_USERNAME ?? null

export interface SendManagerBotResult {
  ok:       boolean
  skipped?: boolean
  reason?:  string
  error?:   string
}

export async function sendManagerBotMessage(
  chatId: string,
  text:   string,
): Promise<SendManagerBotResult> {
  if (!BOT_TOKEN) return { ok: false, skipped: true, reason: "bot_not_configured" }
  if (!chatId?.trim()) return { ok: false, skipped: true, reason: "no_chat_id" }
  if (!text?.trim()) return { ok: false, skipped: true, reason: "empty_message" }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:                  chatId,
        text,
        parse_mode:               "HTML",
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.warn(`[manager-bot] send failed status=${res.status} body=${errText.slice(0, 200)}`)
      return { ok: false, error: errText || `status_${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.warn("[manager-bot] exception:", err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
