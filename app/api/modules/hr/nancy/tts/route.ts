// POST /api/modules/hr/nancy/tts
//
// Проксирует текст → Yandex SpeechKit → возвращает audio/mpeg.
// Голос/интонация/скорость берутся из companies.nancy_voice_json (настройки компании).
// Если YANDEX_API_KEY не задан или ttsEnabled=false → 204 (браузерный fallback).

import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { companies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { NancyVoiceSettings } from "@/lib/db/schema"

const YANDEX_TTS_URL = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize"

// Оптимальный пресет по умолчанию:
// - alena: нейронный флагманский голос Yandex, наиболее естественный и тёплый
// - neutral: менее «операторский», чем good (good звучит слишком бодро/восклицательно)
// - speed 1.0: нормальный темп — 1.1 ускоряет и добавляет механичности
// - sampleRateHertz 48000: максимальное качество аудио (поддерживается API v1)
const DEFAULT_VOICE   = "alena"
const DEFAULT_EMOTION = "neutral"
const DEFAULT_SPEED   = 1.0
const DEFAULT_SAMPLE_RATE = 48000

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  const key = process.env.YANDEX_API_KEY
  if (!key) {
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

  // Настройки голоса компании
  const [company] = await db
    .select({ nancyVoiceJson: companies.nancyVoiceJson })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
  const v = (company?.nancyVoiceJson ?? {}) as NancyVoiceSettings
  if (v.ttsEnabled === false) {
    return new Response(null, { status: 204 })
  }

  try {
    const form = new URLSearchParams({
      text:             text.slice(0, 5000),
      voice:            v.voice   ?? DEFAULT_VOICE,
      emotion:          v.emotion ?? DEFAULT_EMOTION,
      lang:             "ru-RU",
      format:           "mp3",
      speed:            String(v.speed ?? DEFAULT_SPEED),
      sampleRateHertz:  String(DEFAULT_SAMPLE_RATE),
      folderId:         process.env.YANDEX_FOLDER_ID ?? "",
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
