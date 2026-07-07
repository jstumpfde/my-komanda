/**
 * scripts/setup-tip-bot-webhook.ts
 *
 * Устанавливает Telegram webhook для бота модуля «Типология» на
 * <getAppBaseUrl()>/api/public/tip/tg, с secret_token (TIP_TG_WEBHOOK_SECRET),
 * drop_pending_updates и allowed_updates=[message, callback_query].
 * Затем печатает getWebhookInfo для проверки.
 *
 * Запуск: npx tsx scripts/setup-tip-bot-webhook.ts
 * Требует env: TIP_TG_BOT_TOKEN, TIP_TG_WEBHOOK_SECRET
 * (+ NEXT_PUBLIC_APP_URL/NEXTAUTH_URL — см. lib/funnel-v2/base-url.ts,
 * иначе используется прод-домен по умолчанию).
 */

import { getAppBaseUrl } from "@/lib/funnel-v2/base-url"
import { setWebhook, getWebhookInfo } from "@/lib/tip/bot/telegram"

async function main() {
  const botToken = process.env.TIP_TG_BOT_TOKEN
  const webhookSecret = process.env.TIP_TG_WEBHOOK_SECRET

  if (!botToken) {
    console.error("Не задан TIP_TG_BOT_TOKEN (токен бота от BotFather). Установка отменена.")
    process.exit(1)
  }
  if (!webhookSecret) {
    console.error("Не задан TIP_TG_WEBHOOK_SECRET (произвольная строка для проверки заголовка Telegram). Установка отменена.")
    process.exit(1)
  }

  const webhookUrl = `${getAppBaseUrl()}/api/public/tip/tg`
  console.log(`Устанавливаю webhook: ${webhookUrl}`)

  const ok = await setWebhook(botToken, webhookUrl, webhookSecret)
  if (!ok) {
    console.error("setWebhook вернул ошибку — см. лог выше.")
    process.exit(1)
  }
  console.log("setWebhook: OK")

  const info = await getWebhookInfo(botToken)
  console.log("getWebhookInfo:", JSON.stringify(info, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Ошибка установки webhook:", e)
    process.exit(1)
  })
