// Классификатор намерения (intent) входящего сообщения клиента sales-чатбота.
// Ниша: продажи времени (beauty, стоматология, услуги).
// Зеркалит HR-паттерн из chatbot-processor.ts → classifyIntent.

import { callClaudeHaiku } from "@/lib/ai/client"

// ─── Типы ────────────────────────────────────────────────────────────────────

/** Возможные категории намерения клиента */
export type SalesIntentCategory =
  | "pricing"             // вопрос о цене/стоимости услуги
  | "booking_scheduling"  // хочет записаться / выбрать время / перенести
  | "service_inquiry"     // вопрос о самой услуге (что входит, длительность, мастера)
  | "objection"           // сомнение/возражение (дорого, подумаю, не уверен)
  | "ready_to_buy"        // явная готовность записаться/купить сейчас
  | "reschedule_cancel"   // отменить/перенести существующую запись
  | "rejection_signal"    // отказывается, не интересно
  | "other"               // прочее

// ─── Классификатор ───────────────────────────────────────────────────────────

/**
 * Классифицирует сообщение клиента через Claude Haiku (дёшево/быстро).
 *
 * @param message  — входящее сообщение клиента
 * @param opts.context — последние ходы диалога для контекста (необязательно)
 * @returns { category, confidence }; при ошибке парсинга → { category: "other", confidence: 0 }
 */
export async function classifySalesIntent(
  message: string,
  opts?: { context?: Array<{ role: "user" | "assistant"; text: string }> }
): Promise<{ category: SalesIntentCategory; confidence: number }> {
  // Формируем блок с историей диалога (последние 4 хода, если переданы)
  const contextBlock =
    opts?.context && opts.context.length > 0
      ? `\nКонтекст последних сообщений диалога:\n${opts.context
          .slice(-4)
          .map(m => `${m.role === "user" ? "Клиент" : "Ассистент"}: ${m.text}`)
          .join("\n")}\n`
      : ""

  const prompt = `Классифицируй намерение клиента салона/стоматологии/сервиса.${contextBlock}
Сообщение клиента:
"${message}"

Возможные категории:
- pricing            (вопрос о цене/стоимости услуги)
- booking_scheduling (хочет записаться / выбрать время / уточняет слоты)
- service_inquiry    (вопрос о самой услуге: что входит, длительность, мастера)
- objection          (сомнение/возражение: дорого, подумаю, не уверен)
- ready_to_buy       (явная готовность записаться или купить прямо сейчас)
- reschedule_cancel  (отменить или перенести существующую запись)
- rejection_signal   (отказывается, не интересно, больше не пишите)
- other              (что-то иное)

Верни ТОЛЬКО JSON: { "category": "...", "confidence": 0.0-1.0 }
Без markdown.`

  // Вызываем Haiku: 200 токенов достаточно для JSON-ответа
  const raw = await callClaudeHaiku(prompt, undefined, 200)

  // Извлекаем JSON-объект из ответа (устойчиво к мусору вокруг — как в classifyIntent)
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return { category: "other", confidence: 0 }

  try {
    const parsed = JSON.parse(m[0]) as { category?: string; confidence?: number }
    const category = (parsed.category ?? "other") as SalesIntentCategory
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
    return { category, confidence }
  } catch {
    return { category: "other", confidence: 0 }
  }
}
