// Транскрибация голосовых сообщений Telegram-бота базы знаний.
//
// Переиспользует существующую STT-инфраструктуру Ненси (Yandex SpeechKit,
// см. app/api/modules/hr/nancy/stt/route.ts) — там формат lpcm (браузер
// пишет сырой PCM). Telegram voice-сообщения приходят в OGG/Opus, поэтому
// используем тот же провайдер, но с format=oggopus (SpeechKit поддерживает
// оба формата нативно — конвертация не нужна, никаких новых npm-пакетов).
//
// Лимиты: Bot API отдаёт файл только до 20 МБ (см. TG_BOT_API_DOWNLOAD_LIMIT
// в lib/telegram/candidate-bot.ts), SpeechKit v1 short-audio — до 1 МБ на
// запрос. Голосовые Telegram обычно укладываются в это (Opus ~1-2 КБ/сек),
// но проверяем оба лимита явно.

const YANDEX_STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize"
// SpeechKit short-audio recognition — жёсткий лимит на размер запроса.
const SPEECHKIT_MAX_BYTES = 1024 * 1024

export function isTelegramSttConfigured(): boolean {
  return Boolean(process.env.YANDEX_API_KEY && process.env.YANDEX_FOLDER_ID)
}

export interface TranscribeResult {
  ok: boolean
  text: string
  /** Причина отказа для лога/диагностики — не показываем пользователю as-is. */
  reason?: "not_configured" | "too_large" | "empty" | "api_error"
}

/** Скачивает и транскрибирует OGG/Opus buffer голосового Telegram-сообщения. */
export async function transcribeVoice(audio: Buffer): Promise<TranscribeResult> {
  const key = process.env.YANDEX_API_KEY
  const folderId = process.env.YANDEX_FOLDER_ID
  if (!key || !folderId) {
    return { ok: false, text: "", reason: "not_configured" }
  }
  if (!audio.byteLength) {
    return { ok: false, text: "", reason: "empty" }
  }
  if (audio.byteLength > SPEECHKIT_MAX_BYTES) {
    return { ok: false, text: "", reason: "too_large" }
  }

  const params = new URLSearchParams({
    lang: "ru-RU",
    format: "oggopus",
    folderId,
    topic: "general",
  })

  try {
    const res = await fetch(`${YANDEX_STT_URL}?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${key}`,
        "Content-Type": "application/octet-stream",
      },
      body: audio,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.warn("[telegram-voice] Yandex STT error:", res.status, errText.slice(0, 200))
      return { ok: false, text: "", reason: "api_error" }
    }

    const data = (await res.json()) as { result?: string }
    const text = (data.result ?? "").trim()
    return text ? { ok: true, text } : { ok: false, text: "", reason: "empty" }
  } catch (err) {
    console.error("[telegram-voice] fetch failed", err)
    return { ok: false, text: "", reason: "api_error" }
  }
}
