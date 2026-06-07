// POST /api/modules/hr/nancy/tts
//
// Проксирует текст → Yandex SpeechKit (голос Алёна) → возвращает audio/mpeg.
// Если YANDEX_API_KEY не задан → 204 (клиент использует браузерный fallback).
//
// Yandex SpeechKit v1 TTS:
//   POST https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize
//   Auth: Api-Key {YANDEX_API_KEY}
//   Body (form-urlencoded): text + voice=alena + emotion=good + lang=ru-RU + format=mp3 + speed=1.1
//
// Квота Yandex: 1 млн символов/месяц на free-tier (после регистрации в Yandex Cloud).
// Для Нэнси (короткие фразы 50-200 симв) — хватит надолго.

import { requireCompany } from "@/lib/api-helpers"

const YANDEX_TTS_URL = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize"

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }
  void user

  const key = process.env.YANDEX_API_KEY
  if (!key) {
    // Нет ключа — клиент использует браузерный SpeechSynthesis
    return new Response(null, { status: 204 })
  }

  let text: string
  try {
    const body = await req.json() as { text?: unknown }
    text = typeof body.text === "string" ? body.text.trim() : ""
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!text) return new Response(null, { status: 400 })

  try {
    const form = new URLSearchParams({
      text:     text.slice(0, 5000),
      voice:    "alena",
      emotion:  "good",
      lang:     "ru-RU",
      format:   "mp3",
      speed:    "1.1",
      folderId: process.env.YANDEX_FOLDER_ID ?? "",
    })

    const yttRes = await fetch(YANDEX_TTS_URL, {
      method:  "POST",
      headers: {
        Authorization:  `Api-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    })

    if (!yttRes.ok) {
      // Yandex недоступен — клиент использует браузерный fallback
      console.warn("[nancy/tts] Yandex TTS error:", yttRes.status)
      return new Response(null, { status: 204 })
    }

    const audio = await yttRes.arrayBuffer()
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg" },
    })
  } catch (err) {
    console.error("[nancy/tts]", err instanceof Error ? err.message : err)
    return new Response(null, { status: 204 })
  }
}
