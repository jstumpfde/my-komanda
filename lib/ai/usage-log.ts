// Общий логгер AI-вызовов в ai_usage_log — единая точка для ВСЕХ фич платформы
// (модуль знаний/AI-курсы уже писали сюда через lib/knowledge/token-limits.ts;
// скоринг раньше писал только суммарный счётчик вакансии — addVacancyTokens,
// см. lib/ai/token-usage.ts — модель и стоимость терялись). Юрий 05.07: «хочу
// точную сумму расходов AI».
//
// logAiCall() — fire-and-forget, НИКОГДА не бросает исключение (ошибка лога не
// должна ронять скоринг/чат-бот/генерацию). Стоимость считается по прайс-таблице
// lib/ai/models.ts::computeCostUsd; неизвестная модель → cost_usd = null (не
// выдумываем цену).
//
// lib/knowledge/token-limits.ts::logAiUsage — тонкая обёртка над этой функцией
// (сохранена ради обратной совместимости 4 существующих call-сайтов модуля
// знаний/AI-курсов, которые импортируют logAiUsage оттуда).

import { db } from "@/lib/db"
import { aiUsageLog } from "@/lib/db/schema"
import { computeCostUsd } from "@/lib/ai/models"

export interface LogAiCallParams {
  tenantId:      string
  userId?:       string | null
  action:        string
  model?:        string | null
  inputTokens?:  number | null
  outputTokens?: number | null
  /** Опционально — привязка к AI-курсу (course_generate/course_regenerate). */
  projectId?:    string | null
}

/**
 * Пер-вызовное логирование AI-запроса: пишет одну строку в ai_usage_log
 * (tenant_id, user_id, action, model, input/output_tokens, cost_usd,
 * created_at). Fire-and-forget — НЕ await'ить в критичном пути, ошибка лога
 * НЕ должна валить основной AI-вызов (скоринг/чат-бот/генерация).
 *
 * vacancyId в ai_usage_log НЕТ колонки (см. lib/db/schema.ts) — привязка к
 * вакансии остаётся через lib/ai/token-usage.ts::addVacancyTokens (счётчик
 * вакансии живёт параллельно, вызывать оба). Если нужна разбивка по вакансии
 * в будущем — action уже несёт достаточно контекста (scoring_*), а detailed
 * per-vacancy drill-down можно добавить отдельной миграцией при необходимости.
 */
export async function logAiCall(params: LogAiCallParams): Promise<void> {
  try {
    const inputTokens = params.inputTokens ?? 0
    const outputTokens = params.outputTokens ?? 0
    const cost = computeCostUsd(params.model, inputTokens, outputTokens)
    await db.insert(aiUsageLog).values({
      tenantId:     params.tenantId,
      userId:       params.userId || null,
      action:       params.action,
      projectId:    params.projectId || null,
      inputTokens,
      outputTokens,
      model:        params.model || null,
      costUsd:      cost != null ? cost.toString() : null,
    })
  } catch (err) {
    console.error("[usage-log] logAiCall failed", err)
  }
}
