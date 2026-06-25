// POST /api/modules/hr/nancy/tts
//
// Проксирует текст → Yandex SpeechKit → возвращает audio/mpeg.
// Голос/интонация/скорость берутся из companies.nancy_voice_json (настройки компании).
// Если YANDEX_API_KEY не задан или ttsEnabled=false → 204 (браузерный fallback).
//
// Длинный текст режется по предложениям: каждый фрагмент синтезируется отдельно,
// аудио склеивается в один ответ. Это предотвращает 204 из-за превышения лимита.

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

// Максимальная длина одного фрагмента для Yandex SpeechKit v1.
// Официальный лимит — 5000 байт, но для надёжности режем по 1500 символов
// (кириллица в UTF-8 занимает 2 байта, 1500 × 2 = 3000 байт — с запасом).
const YANDEX_CHUNK_LIMIT = 1500

// Очищает текст от тегов action и HTML/markdown перед синтезом речи.
// Клиент должен делать то же самое, но на сервере — второй рубеж защиты.
function cleanTextForTts(raw: string): string {
  return raw
    .replace(/<action>[\s\S]*?<\/action>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim()
}

// Разбивает текст на фрагменты ≤ maxLen символов по границам предложений.
function splitIntoChunks(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  // Разбиваем по концу предложения: . ! ? … с возможным пробелом/переносом
  const sentences = text.split(/(?<=[.!?…])\s+/)
  let current = ""
  for (const sentence of sentences) {
    if (!sentence) continue
    if ((current + " " + sentence).trim().length <= maxLen) {
      current = current ? current + " " + sentence : sentence
    } else {
      if (current) chunks.push(current.trim())
      // Если одно предложение длиннее лимита — режем жёстко по maxLen
      if (sentence.length > maxLen) {
        let s = sentence
        while (s.length > maxLen) {
          chunks.push(s.slice(0, maxLen))
          s = s.slice(maxLen)
        }
        current = s
      } else {
        current = sentence
      }
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

// Синтезирует один фрагмент текста через Yandex SpeechKit.
async function synthesizeChunk(
  text: string,
  key: string,
  voice: string,
  emotion: string,
  speed: number,
  folderId: string,
): Promise<ArrayBuffer | null> {
  const form = new URLSearchParams({
    text,
    voice,
    emotion,
    lang:            "ru-RU",
    format:          "mp3",
    speed:           String(speed),
    sampleRateHertz: String(DEFAULT_SAMPLE_RATE),
    folderId,
  })

  const res = await fetch(YANDEX_TTS_URL, {
    method:  "POST",
    headers: {
      Authorization:  `Api-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  })

  if (!res.ok) {
    console.warn(`[nancy/tts] Yandex chunk error: HTTP ${res.status}, text length: ${text.length}`)
    return null
  }
  return res.arrayBuffer()
}

export async function POST(req: Request) {
  let user
  try {
    user = await requireCompany()
  } catch (res) {
    return res as Response
  }

  const key = process.env.YANDEX_API_KEY
  if (!key) {
    console.warn("[nancy/tts] 204: YANDEX_API_KEY не задан — браузерный fallback")
    return new Response(null, { status: 204 })
  }

  let rawText: string
  try {
    const body = await req.json() as { text?: unknown }
    rawText = typeof body.text === "string" ? body.text.trim() : ""
  } catch {
    return new Response(null, { status: 400 })
  }
  if (!rawText) return new Response(null, { status: 400 })

  // Очищаем на сервере (второй рубеж после клиентской очистки)
  const text = cleanTextForTts(rawText)
  if (!text) return new Response(null, { status: 400 })

  // Настройки голоса компании
  const [company] = await db
    .select({ nancyVoiceJson: companies.nancyVoiceJson })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
  const v = (company?.nancyVoiceJson ?? {}) as NancyVoiceSettings
  if (v.ttsEnabled === false) {
    console.warn("[nancy/tts] 204: ttsEnabled=false для компании", user.companyId)
    return new Response(null, { status: 204 })
  }

  const voice    = v.voice   ?? DEFAULT_VOICE
  const emotion  = v.emotion ?? DEFAULT_EMOTION
  const speed    = v.speed   ?? DEFAULT_SPEED
  const folderId = process.env.YANDEX_FOLDER_ID ?? ""

  try {
    // Разбиваем длинный текст на фрагменты и синтезируем по очереди
    const chunks = splitIntoChunks(text, YANDEX_CHUNK_LIMIT)
    console.log(`[nancy/tts] text=${text.length} chars, chunks=${chunks.length}`)

    const audioBuffers: ArrayBuffer[] = []
    for (const chunk of chunks) {
      const buf = await synthesizeChunk(chunk, key, voice, emotion, speed, folderId)
      if (!buf) {
        // Если хоть один фрагмент не синтезировался — возвращаем то, что есть
        // (лучше частичный звук, чем полный fallback на браузерный голос)
        if (audioBuffers.length === 0) {
          console.warn("[nancy/tts] 204: первый фрагмент не синтезировался, fallback")
          return new Response(null, { status: 204 })
        }
        break
      }
      audioBuffers.push(buf)
    }

    // Склеиваем все фрагменты в один MP3-поток
    const totalLength = audioBuffers.reduce((sum, b) => sum + b.byteLength, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const buf of audioBuffers) {
      combined.set(new Uint8Array(buf), offset)
      offset += buf.byteLength
    }

    return new Response(combined.buffer, {
      headers: { "Content-Type": "audio/mpeg" },
    })
  } catch (err) {
    console.error("[nancy/tts] exception:", err instanceof Error ? err.message : err)
    return new Response(null, { status: 204 })
  }
}
