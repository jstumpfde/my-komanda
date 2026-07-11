/**
 * Пилот «агента коммуникаций» (Юрий 10.07): вместо буквальной подстановки
 * {{переменных}} в шаблон дожима, AI ПЕРЕПИСЫВАЕТ уже отрендеренный шаблон
 * («заготовку» HR — источник истины/рамка) под контекст конкретного
 * кандидата (на каком блоке демо застрял, какая по счёту попытка касания).
 *
 * Согласовано с Юрием 10.07: начинаем ИМЕННО с дожимов (низкая ставка,
 * не юридический текст) — НЕ с отказов (там текст закреплён как нейтральный,
 * см. memory legal-rejection-texts-neutral-keep-autoreject). Живой чат-бот
 * (lib/ai/chatbot-processor.ts) сюда НЕ трогаем — отдельная, более рискованная
 * система с собственными проблемами запуска.
 *
 * Жёсткие гарантии безопасности (дешёвые пост-хук-проверки, без второго AI-вызова):
 *   1. Все ссылки (http../https..) из guardrailText должны быть in verbatim
 *      в выходном тексте — агент не может выдумать/подменить ссылку.
 *   2. Длина результата в разумных пределах (0.4×..2× длины заготовки) —
 *      отсекает как обрыв, так и "растекание мыслью".
 *   3. Пустой/бракованный AI-ответ → safe=false, вызывающий код шлёт
 *      ЛИТЕРАЛЬНЫЙ guardrailText (текущее поведение, нулевой риск регрессии).
 *
 * Используется ТОЛЬКО когда vacancy.aiProcessSettings.dozhimAgentEnabled===true
 * (флаг НЕ выставлен ни у одной вакансии по умолчанию — см. cron/follow-up).
 */

import Anthropic from "@anthropic-ai/sdk"
import { getClaudeApiUrl } from "@/lib/claude-proxy"
import { addVacancyTokens } from "@/lib/ai/token-usage"
import { logAiCall } from "@/lib/ai/usage-log"
import { AI_MODEL_MAIN } from "@/lib/ai/models"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: getClaudeApiUrl(),
})

export interface AdaptFollowupParams {
  guardrailText:  string   // уже отрендеренный литеральный текст (шаблон HR + подставленные {{}})
  candidateName:  string
  vacancyTitle:   string
  branch:         string   // 'not_opened' | 'opened_not_finished' | 'test_not_opened' | ...
  touchNumber:    number   // какое по счёту касание в цепочке
  progressHint:   string   // короткое человекочитаемое описание прогресса ("не открывал демо" / "дошёл до блока 3 из 7" и т.п.), может быть пустым
  vacancyId:      string   // для учёта токенов
  companyId:      string   // для лога использования AI
}

export interface AdaptFollowupResult {
  safe: boolean
  text: string   // при safe=false — совпадает с guardrailText (готов к прямой отправке)
  reason?: string
}

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s)]+/g) ?? []
}

export async function adaptFollowupMessage(params: AdaptFollowupParams): Promise<AdaptFollowupResult> {
  const { guardrailText, candidateName, vacancyTitle, branch, touchNumber, progressHint, vacancyId, companyId } = params

  if (!guardrailText.trim()) {
    return { safe: false, text: guardrailText, reason: "empty_guardrail" }
  }

  const BRANCH_LABELS: Record<string, string> = {
    not_opened:                "кандидат ещё не открывал демо",
    opened_not_finished:       "кандидат открыл демо, но не дошёл до конца",
    test_not_opened:           "кандидат не начал тест",
    test_opened_not_submitted: "кандидат начал тест, но не завершил",
  }
  const branchLabel = BRANCH_LABELS[branch] ?? branch

  const prompt = `Ты помогаешь HR-менеджеру написать напоминание кандидату на вакансию «${vacancyTitle}».

ЗАГОТОВКА менеджера (единственный источник смысла и фактов — НЕ добавляй ничего, чего там нет):
"""
${guardrailText}
"""

Контекст: ${branchLabel}. Это касание №${touchNumber} в цепочке напоминаний.${progressHint ? ` Прогресс кандидата: ${progressHint}.` : ""}
Имя кандидата: ${candidateName || "не указано"}.

Задача: перепиши заготовку так, чтобы она звучала уместно именно для этой ситуации и не повторяла дословно предыдущие касания, но:
- НЕ меняй ни одной ссылки (URL) — скопируй их из заготовки буквально, символ в символ.
- НЕ добавляй новых фактов, обещаний, сроков, скидок — только то, что есть в заготовке.
- НЕ меняй смысл и тональность (если заготовка деловая — не делай слишком фамильярной).
- НЕ пиши «заметили», «заметил», «увидели», «мы обратили внимание» и подобные
  фразы-наблюдатель — это звучит как слежка за кандидатом. Формулируй как
  обычное деловое напоминание («напоминаем», «возвращаемся к вам», «ссылка
  ещё актуальна», «хотели уточнить») — без апелляции к тому, что мы следим
  за его действиями на сайте.
- Сохрани примерно ту же длину.
- Ответь ТОЛЬКО текстом сообщения, без пояснений, без кавычек вокруг него.`

  let msg
  try {
    msg = await anthropic.messages.create({
      model:      AI_MODEL_MAIN,
      thinking:   { type: "disabled" },
      max_tokens: 500,
      messages:   [{ role: "user", content: prompt }],
    })
  } catch (err) {
    console.error("[comms-agent] adaptFollowupMessage AI call failed:", err instanceof Error ? err.message : err)
    return { safe: false, text: guardrailText, reason: "ai_call_failed" }
  }

  void addVacancyTokens(vacancyId, msg.usage)
  void logAiCall({
    tenantId:     companyId,
    action:       "dozhim_agent_adapt",
    model:        AI_MODEL_MAIN,
    inputTokens:  msg.usage?.input_tokens,
    outputTokens: msg.usage?.output_tokens,
  })

  const textBlock = msg.content.find((b) => b.type === "text")
  const generated = textBlock && textBlock.type === "text" ? textBlock.text.trim() : ""

  if (!generated) {
    return { safe: false, text: guardrailText, reason: "empty_ai_response" }
  }

  // Гард 1: ссылки из заготовки обязаны присутствовать буквально в результате.
  const guardrailUrls = extractUrls(guardrailText)
  const missingUrl = guardrailUrls.some((url) => !generated.includes(url))
  if (missingUrl) {
    return { safe: false, text: guardrailText, reason: "url_mismatch" }
  }

  // Гард 2: длина в разумных пределах.
  const ratio = generated.length / guardrailText.length
  if (ratio < 0.4 || ratio > 2) {
    return { safe: false, text: guardrailText, reason: "length_out_of_bounds" }
  }

  return { safe: true, text: generated }
}
