// #15 Phase 5: отправка алертов в Telegram канал HR для AI-эскалаций.
// Опционально — работает только если есть TELEGRAM_BOT_TOKEN в env
// И у вакансии заполнен settings.telegramChannel.

export async function sendTelegramAlert(channel: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !channel?.trim()) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channel,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    })
    return res.ok
  } catch (err) {
    console.warn("[telegram-alert] failed:", err)
    return false
  }
}
