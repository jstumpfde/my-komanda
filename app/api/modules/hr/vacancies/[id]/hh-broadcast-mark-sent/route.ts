// POST /api/modules/hr/vacancies/[id]/hh-broadcast-mark-sent
// body: { candidateIds: string[], interviewMode?: 'phone'|'zoom'|'office' }
//
// Полу-ручная рассылка через hh-чат (hh-broadcast-dialog) отправляет приглашение
// к тесту вручную (HR вставляет текст в чат hh). Платформа не знает факт отправки,
// поэтому фронт после копирования/«Отправлено» зовёт этот эндпоинт.
//
// ВАЖНО: НЕ двигаем стадию кандидата (иначе в колонке «Статус» появлялось бы
// «Тест отправлен» — Юрий это не хочет). Ставим только маркер test_invite_sent_at,
// который драйвит ТОЛЬКО колонку «Тест» (= «отп.»).
//
// interviewMode (Юрий 03.07): когда HR копирует приглашение с выбранным видом
// интервью (Звонок/Онлайн/В офис) — сохраняем candidates.interview_mode, чтобы
// страница самозаписи /schedule/<slug> показала календарь этого вида. Стадию
// НЕ двигаем и здесь — тот же принцип, что и для теста.

import { NextRequest } from "next/server"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

const INTERVIEW_MODES = new Set(["phone", "zoom", "office"])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // tenant-изоляция: вакансия принадлежит компании
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Вакансия не найдена", 404)

    const body = (await req.json().catch(() => ({}))) as {
      candidateIds?: unknown
      interviewMode?: unknown
    }
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((x): x is string => typeof x === "string")
      : []
    if (candidateIds.length === 0) return apiError("Не выбраны кандидаты", 400)

    const interviewMode =
      typeof body.interviewMode === "string" && INTERVIEW_MODES.has(body.interviewMode)
        ? (body.interviewMode as "phone" | "zoom" | "office")
        : null

    // Ставим маркер только тем, у кого его ещё нет (не перетираем дату повторно).
    // Стадию НЕ трогаем. Для интервью-рассылки (interviewMode задан) тест-маркер
    // НЕ ставим — иначе колонка «Тест» ложно показала бы «отп.».
    const updated = interviewMode
      ? []
      : await db.update(candidates)
        .set({ testInviteSentAt: new Date() })
        .where(and(
          eq(candidates.vacancyId, id),
          inArray(candidates.id, candidateIds),
          isNull(candidates.testInviteSentAt),
        ))
        .returning({ id: candidates.id })

    // Вид интервью — отдельно от маркера теста, перетираем при каждом выборе
    // (HR мог передумать «Звонок» → «В офис» и переслать снова). Скоуп по
    // companyId — через join vacancyId+companyId выше (та же изоляция).
    if (interviewMode) {
      await db.update(candidates)
        .set({ interviewMode })
        .where(and(
          eq(candidates.vacancyId, id),
          inArray(candidates.id, candidateIds),
        ))
    }

    return apiSuccess({ marked: interviewMode ? candidateIds.length : updated.length })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hh-broadcast-mark-sent]", err instanceof Error ? err.message : err)
    return apiError("Internal server error", 500)
  }
}
