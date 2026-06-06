import { eq, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { companies, vacancies } from "@/lib/db/schema"
import { hardDeleteVacancy } from "@/lib/vacancies/hard-delete"

// Полное (необратимое) удаление компании вместе со всем тенантом.
//
// На companies.id ссылаются 69 таблиц: 64 с ON DELETE CASCADE (удалятся
// автоматически при db.delete(companies)) и 5 БЕЗ каскада, которые заблокируют
// удаление, если в них есть строки: users, vacancies, rooms, calendar_events,
// activity_log. Их (и зависимые от них строки) чистим первыми.
//
// Порядок важен: вакансии сносим через hardDeleteVacancy (он убирает кандидатов/
// демо/hh/follow-up), затем остальные блокеры, затем пользователей, затем саму
// компанию (каскад уберёт оставшиеся 64 таблицы). Каждый шаг — guarded: drift
// между окружениями (нет таблицы/колонки) логируется и пропускается. Если после
// чистки company всё равно не удаляется (остаточный FK) — НЕ падаем, возвращаем
// deleted:false, чтобы вызвавший (cron/endpoint) обработал мягко.

async function safeExec(query: SQL): Promise<void> {
  try {
    await db.execute(query)
  } catch (err) {
    console.warn("[hardDeleteCompany] dependent cleanup step skipped:",
      err instanceof Error ? err.message : err)
  }
}

export interface HardDeleteCompanyResult {
  deleted:    boolean
  vacancies:  number
  error?:     string
}

export async function hardDeleteCompany(companyId: string): Promise<HardDeleteCompanyResult> {
  // 1. Вакансии компании — каждую через hardDeleteVacancy (кандидаты/демо/hh/follow-up).
  const vacs = await db
    .select({ id: vacancies.id })
    .from(vacancies)
    .where(eq(vacancies.companyId, companyId))
    .catch(() => [] as { id: string }[])

  let deletedVacancies = 0
  for (const v of vacs) {
    try {
      const res = await hardDeleteVacancy(v.id, companyId)
      if (res.deleted) deletedVacancies++
    } catch (err) {
      console.warn("[hardDeleteCompany] vacancy cleanup skipped:", v.id,
        err instanceof Error ? err.message : err)
    }
  }

  // 2. Остальные блокеры (FK без каскада) + потенциально мешающие строки.
  await safeExec(sql`DELETE FROM calendar_events WHERE company_id = ${companyId}`)
  await safeExec(sql`DELETE FROM rooms WHERE company_id = ${companyId}`)
  await safeExec(sql`DELETE FROM activity_log WHERE company_id = ${companyId}`)
  // 3. Пользователи компании (FK без каскада).
  await safeExec(sql`DELETE FROM users WHERE company_id = ${companyId}`)

  // 4. Сама компания — каскад уберёт остальные 64 таблицы.
  try {
    const deleted = await db
      .delete(companies)
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id })
    return { deleted: deleted.length > 0, vacancies: deletedVacancies }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[hardDeleteCompany] company delete failed (остаточный FK):", companyId, msg)
    return { deleted: false, vacancies: deletedVacancies, error: msg }
  }
}
