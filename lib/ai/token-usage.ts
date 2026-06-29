// Атомичный учёт AI-токенов на уровне вакансии.
//
// Использование (fire-and-forget):
//   void addVacancyTokens(vacancyId, msg.usage)
//
// Никогда не бросает исключений — учёт токенов не должен ломать AI-флоу.

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export async function addVacancyTokens(
  vacancyId: string | null | undefined,
  usage: { input_tokens?: number; output_tokens?: number } | null | undefined,
): Promise<void> {
  if (!vacancyId || !usage) return
  const tokIn  = Number(usage.input_tokens  ?? 0)
  const tokOut = Number(usage.output_tokens ?? 0)
  if (tokIn === 0 && tokOut === 0) return
  try {
    await db.execute(sql`
      UPDATE vacancies
         SET ai_tokens_in  = ai_tokens_in  + ${tokIn}::bigint,
             ai_tokens_out = ai_tokens_out + ${tokOut}::bigint
       WHERE id = ${vacancyId}::uuid
    `)
  } catch (err) {
    console.warn("[token-usage] addVacancyTokens failed:", err instanceof Error ? err.message : err)
  }
}
