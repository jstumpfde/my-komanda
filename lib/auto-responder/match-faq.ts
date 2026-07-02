// Матчер FAQ-пар «Автоответов кандидату» (единый блок в Портрете).
// Ищет первое совпадение по любому из keywords (case-insensitive,
// substring по нормализованному тексту — тот же стиль, что и
// matchStopWordList в lib/followup/stop-words.ts).

export interface FaqEntry {
  id?:       string
  keywords:  string[]
  reply:     string
}

// Что делать со стадией кандидата при срабатывании стоп-слова. Редактируется
// в Портрете → «Автоответы кандидату» → «Стоп-слова». Юрий 02.07: раньше
// стоп-слово ВСЕГДА молча кидало в rejected; теперь по умолчанию 'none' —
// стадию НЕ трогаем вообще, реагируем только прощальным сообщением (если
// текст задан). Явный опт-ин на автопереход — 'candidate_declined' / 'reject'.
export const STOP_WORD_STAGE_ACTIONS = ["none", "candidate_declined", "reject"] as const
export type StopWordStageAction = (typeof STOP_WORD_STAGE_ACTIONS)[number]

export function readStopWordStageAction(v: unknown): StopWordStageAction {
  return (STOP_WORD_STAGE_ACTIONS as readonly string[]).includes(v as string) ? v as StopWordStageAction : "none"
}

/** Прощальный текст при стоп-слове: пусто → null (не отправляем ничего). */
export function resolveStopWordFarewellText(custom: string | null | undefined): string | null {
  const trimmed = (custom ?? "").trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Нормализация: нижний регистр + схлопывание пробелов (пунктуацию не трогаем,
 *  чтобы «сколько платите?» матчилось по «сколько платите»). */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Возвращает reply первой FAQ-пары, чьё любое keyword встречается в text
 * (substring-match по нормализованному тексту), либо null если совпадений нет.
 */
export function matchFaqReply(text: string, faq: FaqEntry[] | null | undefined): string | null {
  if (!text || !Array.isArray(faq) || faq.length === 0) return null
  const norm = normalize(text)
  if (!norm) return null
  for (const entry of faq) {
    if (!entry || !Array.isArray(entry.keywords) || typeof entry.reply !== "string") continue
    const reply = entry.reply.trim()
    if (!reply) continue
    for (const raw of entry.keywords) {
      if (typeof raw !== "string") continue
      const kw = normalize(raw)
      if (!kw) continue
      if (norm.includes(kw)) return reply
    }
  }
  return null
}
