// POST /api/modules/hr/nancy/stt
//
// Принимает сырой LPCM 16 кГц mono 16-bit (application/octet-stream),
// проксирует в Yandex SpeechKit STT (short audio recognition) и возвращает
// { text }. Используется голосовым режимом Нэнси — надёжная альтернатива
// браузерному Web Speech API (который не работает hands-free в Safari).

import { requireCompany } from "@/lib/api-helpers"

const YANDEX_STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize"

export async function POST(req: Request) {
  try {
    await requireCompany()
  } catch (res) {
    return res as Response
  }

  const key = process.env.YANDEX_API_KEY
  const folderId = process.env.YANDEX_FOLDER_ID
  if (!key || !folderId) {
    return Response.json({ error: "stt_not_configured" }, { status: 503 })
  }

  const audio = await req.arrayBuffer()
  if (!audio.byteLength) {
    return Response.json({ text: "" })
  }
  // Yandex STT v1 — лимит 1 МБ на запрос.
  if (audio.byteLength > 1024 * 1024) {
    return Response.json({ error: "audio_too_large" }, { status: 413 })
  }

  const params = new URLSearchParams({
    lang: "ru-RU",
    format: "lpcm",
    sampleRateHertz: "16000",
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
      const errText = await res.text()
      console.warn("[nancy/stt] Yandex STT error:", res.status, errText.slice(0, 200))
      return Response.json({ error: "stt_failed", text: "" }, { status: 502 })
    }

    const data = (await res.json()) as { result?: string }
    return Response.json({ text: (data.result ?? "").trim() })
  } catch (err) {
    console.error("[nancy/stt]", err instanceof Error ? err.message : err)
    return Response.json({ error: "stt_error", text: "" }, { status: 502 })
  }
}
