// Группа 34, задача 3: отправка сообщения в per-company Telegram-канал HR.
//
// Использует company.telegramBotToken + company.telegramChatId. Если что-то
// не настроено — тихо skip без ошибки (вызывающий код пишет в основные
// уведомления независимо от Telegram).
//
// Главный канал Юрия @Company24AgentsBot — отдельный, через
// sendTelegramAlert(channel, text) из lib/notifications/telegram.ts.

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"

export interface SendToCompanyOptions {
  parseMode?:             "HTML" | "Markdown"
  disableWebPagePreview?: boolean
}

export interface SendToCompanyResult {
  ok:      boolean
  skipped?: boolean
  reason?:  string
  error?:   string
}

export async function sendToCompanyChannel(
  companyId: string,
  message:   string,
  options:   SendToCompanyOptions = {},
): Promise<SendToCompanyResult> {
  if (!message?.trim()) {
    return { ok: false, skipped: true, reason: "empty_message" }
  }

  const [company] = await db
    .select({
      botToken: companies.telegramBotToken,
      chatId:   companies.telegramChatId,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1)

  if (!company) return { ok: false, skipped: true, reason: "company_not_found" }

  const token  = company.botToken?.trim()
  const chatId = company.chatId?.trim()
  if (!token || !chatId) {
    return { ok: false, skipped: true, reason: "not_configured" }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id:                  chatId,
        text:                     message,
        parse_mode:               options.parseMode ?? "HTML",
        disable_web_page_preview: options.disableWebPagePreview ?? true,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.warn(`[telegram-company] ${companyId} send failed status=${res.status} body=${errText.slice(0, 200)}`)
      return { ok: false, error: errText || `status_${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.warn("[telegram-company] exception:", err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
