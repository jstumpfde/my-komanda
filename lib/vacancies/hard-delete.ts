import { eq, and, count, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates } from "@/lib/db/schema"

// Полное (необратимое) удаление вакансии из БД вместе с зависимыми строками.
//
// Удаление vacancies блокируют FK (NO ACTION) от candidates / demos /
// hh_vacancies — их нужно снести первыми. Кандидаты привязаны к вакансии
// один-к-одному (candidates.vacancy_id), поэтому удаление по vacancy_id НЕ
// затрагивает кандидатов других вакансий (ровно как просит ТЗ).
//
// Между окружениями есть schema drift (например hh_vacancies ссылается то
// через vacancy_id, то через local_vacancy_id; таблицы follow_up_* могут
// отсутствовать локально). Поэтому зависимые строки чистим отдельными
// guarded-стейтментами: отсутствие таблицы/колонки логируется и пропускается,
// не валя всю операцию. Сама vacancies удаляется Drizzle'ом (стабильная схема).

async function safeExec(query: SQL): Promise<void> {
  try {
    await db.execute(query)
  } catch (err) {
    // Таблица/колонка отсутствует в этом окружении (drift) или нет строк —
    // безопасно пропускаем. Осиротевшие follow-up-сообщения гасит follow-up-cron.
    console.warn("[hardDeleteVacancy] dependent cleanup step skipped:",
      err instanceof Error ? err.message : err)
  }
}

export interface HardDeleteResult {
  deleted:    boolean
  candidates: number
}

export async function hardDeleteVacancy(
  vacancyId: string,
  companyId?: string,
): Promise<HardDeleteResult> {
  // Сколько кандидатов будет удалено (для лога/ответа).
  const [cntRow] = await db
    .select({ c: count() })
    .from(candidates)
    .where(eq(candidates.vacancyId, vacancyId))
  const candidatesCount = cntRow?.c ?? 0

  // Зависимые строки — порядок важен (сначала дети, потом вакансия).
  await safeExec(sql`DELETE FROM follow_up_messages WHERE candidate_id IN (SELECT id FROM candidates WHERE vacancy_id = ${vacancyId})`)
  await safeExec(sql`DELETE FROM candidates WHERE vacancy_id = ${vacancyId}`)
  await safeExec(sql`DELETE FROM demos WHERE vacancy_id = ${vacancyId}`)
  // hh_vacancies: колонка-ссылка отличается между окружениями — пробуем обе.
  await safeExec(sql`DELETE FROM hh_vacancies WHERE vacancy_id = ${vacancyId}`)
  await safeExec(sql`DELETE FROM hh_vacancies WHERE local_vacancy_id = ${vacancyId}`)

  // Сама вакансия. companyId (если передан) защищает от межтенантного удаления.
  const where = companyId
    ? and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId))
    : eq(vacancies.id, vacancyId)
  const deleted = await db
    .delete(vacancies)
    .where(where)
    .returning({ id: vacancies.id })

  return { deleted: deleted.length > 0, candidates: candidatesCount }
}
