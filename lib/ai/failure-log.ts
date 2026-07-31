// Лог сбоев AI-вызовов (drizzle/0277) — компактная, симметричная logAiCall
// (lib/ai/usage-log.ts), но для НЕУДАЧНЫХ вызовов. Инцидент 13.07: лимит
// Anthropic исчерпан несколько часов подряд, screenResume/scoreResumeByAxes
// тихо глотали ошибку (console.warn + return null) — 38 кандидатов зависли
// незамеченными. lib/hiring-watchdog/checks.ts::checkAiOutageSpike читает эту
// таблицу за короткое скользящее окно (10-15 мин), чтобы поймать массовый
// сбой быстро и платформенно (across companies), а не через per-company
// побочные эффекты (entry_gate_ai_scoring_stuck и т.п.).
//
// Fire-and-forget — НИКОГДА не бросает исключение (лог сбоя не должен сам
// стать новым сбоем в критичном пути скоринга/чат-бота).

import { db } from "@/lib/db"
import { aiCallFailures } from "@/lib/db/schema"

export interface LogAiCallFailureParams {
  /** Источник вызова — 'screen-resume' | 'axis-scorer' | 'score-test' | 'score-candidate-v2' | 'score-answers' и т.п. */
  source:        string
  errorMessage?: string | null
  companyId?:    string | null
  vacancyId?:    string | null
}

export async function logAiCallFailure(params: LogAiCallFailureParams): Promise<void> {
  try {
    await db.insert(aiCallFailures).values({
      source:       params.source,
      companyId:    params.companyId || null,
      vacancyId:    params.vacancyId || null,
      errorMessage: params.errorMessage ? params.errorMessage.slice(0, 500) : null,
    })
  } catch (err) {
    console.error("[failure-log] logAiCallFailure failed", err)
  }
}
