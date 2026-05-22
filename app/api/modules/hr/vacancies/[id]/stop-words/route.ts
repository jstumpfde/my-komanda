// PATCH/PUT /api/modules/hr/vacancies/[id]/stop-words
// Body: { stopWords: string[] }
// Сохраняет список стоп-слов в vacancies.stopWordsJson (P0-22).
// Случай пустого массива — валидный (это «отключить стоп-слова на вакансии»).
//
// Стоп-слова используются:
//   - lib/followup/should-stop.ts — lazy-stop в cron-дожиме (matchStopWordList);
//   - lib/hh/scan-incoming.ts — реактивная отмена при входящем (планируется).

import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export { PUT as PATCH }

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const body = await req.json().catch(() => ({})) as { stopWords?: unknown }

    if (!Array.isArray(body.stopWords)) {
      return apiError("stopWords must be an array of strings", 400)
    }

    // Нормализация: trim + dedup, отбрасываем пустые и слишком длинные.
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const item of body.stopWords) {
      if (typeof item !== "string") continue
      const t = item.trim()
      if (!t || t.length > 100) continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      cleaned.push(t)
    }

    const [updated] = await db
      .update(vacancies)
      .set({ stopWordsJson: cleaned, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id, stopWordsJson: vacancies.stopWordsJson })

    if (!updated) return apiError("Vacancy not found", 404)

    return apiSuccess({ ok: true, stopWords: updated.stopWordsJson })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
