// Отправка уведомлений владельцу разбора «Типология» в Telegram.
//
// Токен бота — env TIP_TG_BOT_TOKEN (общий бот модуля, см. lib/tip/bot/**).
// Если токен не задан (бот ещё не подключён/на этом окружении не настроен) —
// тихий no-op: аналитика просмотров не должна падать из-за отсутствия бота.

const TELEGRAM_API_BASE = "https://api.telegram.org"

/**
 * Отправляет текстовое сообщение в Telegram-чат владельца разбора.
 * Молча ничего не делает без TIP_TG_BOT_TOKEN или при ошибке сети/API —
 * это фоновое уведомление, а не критичный путь (не бросает исключений наружу).
 */
export async function sendTipTelegram(chatId: number, text: string): Promise<void> {
  const token = process.env.TIP_TG_BOT_TOKEN
  if (!token) return

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      // eslint-disable-next-line no-console
      console.error("[tip] sendTipTelegram: Telegram API ответил ошибкой", res.status, body)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[tip] sendTipTelegram: ошибка отправки", e)
  }
}

/**
 * Формирует текст уведомления о достижении порога просмотров разбора.
 * appUrl — базовый URL приложения (getAppBaseUrl()) для ссылки на /tip.
 */
export function buildViewNotifyText(viewsCount: number, appUrl: string): string {
  return `👀 Ваш разбор посмотрели уже ${viewsCount} раз. Сделать ещё один: ${appUrl}/tip`
}
