// Отправка уведомлений владельцу разбора «Типология» в Telegram.
//
// Токен бота — env TIP_TG_BOT_TOKEN (общий бот модуля, см. lib/tip/bot/**).
// Если токен не задан (бот ещё не подключён/на этом окружении не настроен) —
// тихий no-op: аналитика просмотров не должна падать из-за отсутствия бота.
//
// Базовый URL — TIP_TG_API_BASE (на проде — стабильный прокси на рижском VPS,
// см. lib/tip/bot/telegram.ts). Исходящие fetch к api.telegram.org напрямую
// с прод-сервера (РФ) нестабильны — до 3 попыток на сетевые ошибки с backoff
// 500мс/1500мс; HTTP-ошибки самого Telegram (4xx) не ретраятся.

const TELEGRAM_API_BASE = process.env.TIP_TG_API_BASE || "https://api.telegram.org"
const RETRY_DELAYS_MS = [500, 1500]

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|timeout|aborted/i.test(msg)
}

/**
 * Отправляет текстовое сообщение в Telegram-чат владельца разбора.
 * Молча ничего не делает без TIP_TG_BOT_TOKEN или при ошибке сети/API —
 * это фоновое уведомление, а не критичный путь (не бросает исключений наружу).
 */
export async function sendTipTelegram(chatId: number, text: string): Promise<void> {
  const token = process.env.TIP_TG_BOT_TOKEN
  if (!token) return

  const maxAttempts = RETRY_DELAYS_MS.length + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
        console.error("[tip-bot] sendTipTelegram: Telegram API ответил ошибкой", res.status, body)
      }
      return
    } catch (e) {
      const network = isNetworkError(e)
      // eslint-disable-next-line no-console
      console.error(
        `[tip-bot] sendTipTelegram: ошибка отправки (попытка ${attempt}/${maxAttempts}${network ? "" : ", не похоже на сетевую"})`,
        e instanceof Error ? e.message : e,
      )
      if (!network || attempt === maxAttempts) return
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
    }
  }
}

/**
 * Формирует текст уведомления о достижении порога просмотров разбора.
 * appUrl — базовый URL приложения (getAppBaseUrl()) для ссылки на /tip.
 */
export function buildViewNotifyText(viewsCount: number, appUrl: string): string {
  return `👀 Ваш разбор посмотрели уже ${viewsCount} раз. Сделать ещё один: ${appUrl}/tip`
}
