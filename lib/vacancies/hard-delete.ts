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
// Всё удаление — ОДНА транзакция: либо вакансия удалена вместе с зависимыми
// строками, либо ничего (раньше сбой на середине оставлял полуудалённые
// данные: кандидаты снесены, вакансия жива).
//
// Между окружениями есть schema drift (например hh_vacancies ссылается то
// через vacancy_id, то через local_vacancy_id; таблицы follow_up_* могут
// отсутствовать локально). Поэтому зависимые строки чистим guarded-шагами
// через SAVEPOINT (вложенная транзакция drizzle): отсутствие таблицы/колонки
// пропускаем, но FK-конфликты и обрывы связи пробрасываем — глотать их
// нельзя, иначе при добавлении новой FK-таблицы удаление «тихо» сломается.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.code ?? e?.cause?.code
}

async function safeExec(tx: Tx, query: SQL): Promise<void> {
  try {
    // Вложенная транзакция = SAVEPOINT: ошибка шага не абортит внешнюю.
    await tx.transaction(async (sp) => {
      await sp.execute(query)
    })
  } catch (err) {
    const code = pgErrorCode(err)
    // 42P01 undefined_table / 42703 undefined_column — schema drift,
    // шаг легитимно пропускаем.
    if (code === "42P01" || code === "42703") {
      console.warn("[hardDeleteVacancy] dependent cleanup step skipped (drift):",
        err instanceof Error ? err.message : err)
      return
    }
    throw err
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
  return db.transaction(async (tx) => {
    // Сколько кандидатов будет удалено (для лога/ответа).
    const [cntRow] = await tx
      .select({ c: count() })
      .from(candidates)
      .where(eq(candidates.vacancyId, vacancyId))
    const candidatesCount = cntRow?.c ?? 0

    // Зависимые строки — порядок важен (сначала дети, потом вакансия).
    await safeExec(tx, sql`DELETE FROM follow_up_messages WHERE candidate_id IN (SELECT id FROM candidates WHERE vacancy_id = ${vacancyId})`)
    await safeExec(tx, sql`DELETE FROM hh_responses WHERE local_candidate_id IN (SELECT id FROM candidates WHERE vacancy_id = ${vacancyId})`)
    // hh_candidates → FK на candidates (NO ACTION) — снести до кандидатов, иначе блок удаления.
    await safeExec(tx, sql`DELETE FROM hh_candidates WHERE candidate_id IN (SELECT id FROM candidates WHERE vacancy_id = ${vacancyId})`)
    await safeExec(tx, sql`DELETE FROM candidates WHERE vacancy_id = ${vacancyId}`)
    await safeExec(tx, sql`DELETE FROM demos WHERE vacancy_id = ${vacancyId}`)
    // predictive_hiring_alerts → FK на vacancies (NO ACTION) — снести до самой вакансии.
    await safeExec(tx, sql`DELETE FROM predictive_hiring_alerts WHERE vacancy_id = ${vacancyId}`)
    // hh_vacancies: колонка-ссылка отличается между окружениями — пробуем обе.
    await safeExec(tx, sql`DELETE FROM hh_vacancies WHERE vacancy_id = ${vacancyId}`)
    await safeExec(tx, sql`DELETE FROM hh_vacancies WHERE local_vacancy_id = ${vacancyId}`)

    // Сама вакансия. companyId (если передан) защищает от межтенантного удаления.
    const where = companyId
      ? and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId))
      : eq(vacancies.id, vacancyId)
    const deleted = await tx
      .delete(vacancies)
      .where(where)
      .returning({ id: vacancies.id })

    // Вакансия не найдена/чужая — откатываем зависимые удаления, они были бы
    // потерей данных без удаления самой вакансии.
    if (deleted.length === 0) {
      tx.rollback()
    }

    return { deleted: deleted.length > 0, candidates: candidatesCount }
  }).catch((err) => {
    // tx.rollback() бросает TransactionRollbackError — это наш штатный путь
    // «вакансия не найдена», а не сбой.
    if (err instanceof Error && err.message.toLowerCase().includes("rollback")) {
      return { deleted: false, candidates: 0 }
    }
    throw err
  })
}
