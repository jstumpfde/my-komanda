// Извлечение «ярких моментов» из готового markdown-разбора «Типология» —
// 2-3 цитаты-выноски и 3 сильные стороны для журнальной вёрстки результата
// (components/tip/markdown.tsx) и карточек-картинок
// (app/api/public/tip/card/[token]/route.tsx).
//
// Лёгкий AI-вызов, самая дешёвая модель (AI_MODEL_FAST / Haiku, см.
// lib/ai/models.ts), паттерн вызова — lib/ai/client.ts (callClaudeHaiku).
//
// ЭКСПОРТ ДЛЯ КООРДИНАТОРА: вызов extractTipHighlights и запись результата в
// tip_runs.highlights_json встраивается в lib/tip/service.ts (runGeneration)
// отдельным агентом/координатором — этот файл только считает значение и
// ничего не пишет в БД.

import { callClaudeHaiku } from "@/lib/ai/client"

export interface TipHighlights {
  quotes: string[]
  strengths: string[]
}

const EMPTY_HIGHLIGHTS: TipHighlights = { quotes: [], strengths: [] }

function sanitizeStringArray(value: unknown, maxLen: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((v) => (v.length > maxLen ? v.slice(0, maxLen).trim() : v))
}

function parseHighlightsResponse(raw: string): TipHighlights {
  try {
    // AI иногда оборачивает JSON в ```json ... ``` — на всякий случай снимаем.
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
    const parsed = JSON.parse(cleaned)
    return {
      quotes: sanitizeStringArray(parsed?.quotes, 140, 3),
      strengths: sanitizeStringArray(parsed?.strengths, 60, 3),
    }
  } catch {
    return EMPTY_HIGHLIGHTS
  }
}

/**
 * Выбирает из готового markdown-разбора 2-3 ярких дословных цитаты (до 140
 * симв.) и формулирует до 3 сильных сторон (до 60 симв. каждая). Любая
 * ошибка (сеть, парсинг, таймаут) -> фолбэк {quotes:[], strengths:[]}, НЕ
 * бросает исключение — вызывающий код (генерация отчёта) не должен падать
 * из-за необязательного украшения.
 */
export async function extractTipHighlights(markdown: string): Promise<TipHighlights> {
  const text = (markdown ?? "").trim()
  if (!text) return EMPTY_HIGHLIGHTS

  const prompt = `Вот текст разбора личности:\n\n${text}\n\nВыбери из текста 3 самые яркие короткие цитаты (дословно, до 140 символов каждая) и сформулируй 3 сильные стороны человека (до 60 символов каждая). Ответ строго JSON без пояснений и без markdown-обёртки: {"quotes":[],"strengths":[]}`

  try {
    const raw = await callClaudeHaiku(prompt, undefined, 800)
    return parseHighlightsResponse(raw)
  } catch {
    return EMPTY_HIGHLIGHTS
  }
}
