// Group 14 — Phase 3.
//
// Срочные платформенные действия: killswitch AI-чат-бота у всех компаний,
// добавление глобального стоп-слова, форсированный сброс AI-промптов.
// Каждая функция выполняется одним SQL и логируется в
// platform_emergency_actions через recordEmergencyAction().

import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies,
  vacancies,
  platformEmergencyActions,
} from "@/lib/db/schema"

export type EmergencyActionType =
  | "kill_all_ai_chatbots"
  | "restore_all_ai_chatbots"
  | "add_global_stop_word"
  | "regenerate_ai_prompts"

export async function recordEmergencyAction(
  actionType: EmergencyActionType,
  payload: unknown,
  result: unknown,
  executedBy?: string,
): Promise<void> {
  await db.insert(platformEmergencyActions).values({
    actionType,
    payload:     (payload ?? null) as object | null,
    result:      (result ?? null) as object | null,
    executedBy:  executedBy ?? null,
  })
}

export async function emergencyKillAllAiChatbots(): Promise<{ affected: number }> {
  const rows = await db.update(companies)
    .set({ aiChatbotKilled: true })
    .returning({ id: companies.id })
  return { affected: rows.length }
}

export async function emergencyRestoreAllAiChatbots(): Promise<{ affected: number }> {
  const rows = await db.update(companies)
    .set({ aiChatbotKilled: false })
    .returning({ id: companies.id })
  return { affected: rows.length }
}

export async function emergencyAddGlobalStopWord(word: string): Promise<{ affected: number }> {
  const trimmed = word.trim()
  if (!trimmed) return { affected: 0 }
  // jsonb concatenation добавляет элемент массива; фильтр '?' гарантирует
  // что мы не дублируем слово у вакансий, где оно уже было.
  const wordJson = JSON.stringify([trimmed])
  const result = await db.execute(sql`
    UPDATE vacancies
    SET stop_words_json = stop_words_json || ${wordJson}::jsonb
    WHERE NOT (stop_words_json ? ${trimmed})
    RETURNING id
  `)
  return { affected: result.length }
}

export async function emergencyRegenerateAllAiPrompts(): Promise<{ scheduled: number }> {
  // Сбрасываем aiChatbotPrompt в пустую строку у всех вакансий, у которых
  // AI-чат-бот включён. HR при следующем заходе в настройки увидит пустой
  // промпт и пересоберёт его (или система регенерирует при следующем
  // вызове AI). Это самый простой способ без изменений схемы.
  const rows = await db.update(vacancies)
    .set({ aiChatbotPrompt: "" })
    .where(eq(vacancies.aiChatbotEnabled, true))
    .returning({ id: vacancies.id })
  return { scheduled: rows.length }
}
