// Этап 2: AI-оценка ответа кандидата на тестовое задание.
//
// Использует ЕДИНЫЙ Claude-клиент проекта (lib/ai/client.ts → callClaudeHaiku),
// тот же baseURL (claude-proxy) и retry/timeout, что и AI-чат-бот. Новый
// Anthropic-клиент здесь НЕ создаётся.
//
// Возвращает { score: 0-100, reasoning } или бросает ошибку (модель не
// ответила / JSON битый) — caller (submit-route) ловит и оставляет стадию
// test_task_done, чтобы HR проверил вручную.

import { callClaudeHaiku } from "@/lib/ai/client"

const SYSTEM_PROMPT =
  "Ты — опытный HR-эксперт. Оцени ответ кандидата на тестовое задание по шкале " +
  "0-100, где 0 — ответ не по теме/пустой, 100 — образцовый. Будь объективен и " +
  "строг. Ответь СТРОГО одним JSON-объектом без пояснений вокруг: " +
  '{"score": <число 0-100>, "reasoning": "<краткое обоснование на русском, 1-3 предложения>"}.'

// Дефолтные критерии, если HR не задал свой промпт (testAiPrompt).
export const DEFAULT_TEST_AI_PROMPT =
  "Оцени ответ по критериям: соответствие заданию, полнота, качество проработки " +
  "и аргументации, практическая применимость."

export interface TestScoreResult {
  score:     number   // 0-100, целое
  reasoning: string
}

export async function scoreTestSubmission(args: {
  taskText:   string          // текст тестового задания (instructions)
  answerText: string          // ответ кандидата
  hrPrompt?:  string          // критерии оценки от HR (testAiPrompt)
}): Promise<TestScoreResult> {
  const hr = args.hrPrompt && args.hrPrompt.trim().length > 0
    ? args.hrPrompt.trim()
    : DEFAULT_TEST_AI_PROMPT

  const prompt = [
    `Критерии оценки (от HR):\n${hr}`,
    `\nТекст тестового задания:\n${args.taskText.trim() || "(задание не указано — оценивай ответ по общему качеству)"}`,
    `\nОтвет кандидата:\n${args.answerText.trim()}`,
    `\nВерни ТОЛЬКО JSON: {"score": <0-100>, "reasoning": "<обоснование>"}.`,
  ].join("\n")

  const raw = await callClaudeHaiku(prompt, SYSTEM_PROMPT, 800)

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("Ответ AI не содержит JSON")
  const parsed = JSON.parse(match[0]) as { score?: unknown; reasoning?: unknown }

  const rawScore = typeof parsed.score === "number" ? parsed.score : Number(parsed.score)
  if (!Number.isFinite(rawScore)) throw new Error("AI вернул нечисловой score")
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : ""

  return { score, reasoning }
}
