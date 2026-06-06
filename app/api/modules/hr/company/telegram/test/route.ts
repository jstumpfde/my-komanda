import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { sendToCompanyChannel } from "@/lib/telegram/send-to-company"

// Группа 34, задача 3: отправка тестового сообщения в Telegram-канал HR.
// POST /api/modules/hr/company/telegram/test — без body. Использует уже
// сохранённые settings (bot token + chat id из companies).

export async function POST() {
  try {
    const user = await requireCompany()
    const text = "✅ <b>Тестовое уведомление Company24</b>\n\nЕсли вы это видите — Telegram-канал HR подключён корректно. Сюда будут приходить новые отклики, AI-эскалации и важные события."
    const result = await sendToCompanyChannel(user.companyId, text)
    if (result.skipped) {
      return apiError(
        result.reason === "not_configured"
          ? "Сначала задайте bot token и chat id"
          : `Не удалось отправить: ${result.reason}`,
        400,
      )
    }
    if (!result.ok) {
      return apiError(result.error ?? "Telegram API вернул ошибку", 502)
    }
    return apiSuccess({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
