import { NextRequest } from "next/server"
import { eq, and, ne, or, isNull, inArray, desc } from "drizzle-orm"
import * as XLSX from "xlsx"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, hhResponses } from "@/lib/db/schema"
import { requireCompany, apiError } from "@/lib/api-helpers"
import { deriveCandidateName } from "@/lib/candidate-name"

// GET /api/modules/hr/vacancies/[id]/export-candidates
// Выгружает кандидатов вакансии в .xlsx. Колонки см. COLUMNS ниже.

interface DemoBlock { blockId?: string; status?: string }
interface LessonShape { blocks?: { id?: string }[] }

// Дата рождения: колонка birth_date или вытащенная из anketa_answers.
function extractBirthDate(birthDate: string | Date | null, anketa: unknown): string | null {
  if (birthDate) {
    const s = birthDate instanceof Date ? birthDate.toISOString() : String(birthDate)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  }
  if (anketa && typeof anketa === "object" && !Array.isArray(anketa)) {
    const obj = anketa as Record<string, unknown>
    for (const k of ["birthDate", "birth_date", "birthday"]) {
      const v = obj[k]
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
    }
  }
  return null
}

function ageFromBirthDate(iso: string | null): number | null {
  if (!iso) return null
  const bd = new Date(iso)
  if (Number.isNaN(bd.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - bd.getFullYear()
  const m = now.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

function currencySymbol(code: string | null | undefined): string {
  if (!code) return "₽"
  const c = code.toUpperCase()
  if (c === "RUR" || c === "RUB") return "₽"
  if (c === "EUR") return "€"
  if (c === "USD") return "$"
  if (c === "GBP") return "£"
  return c
}

function formatSalary(min: number | null, max: number | null, cur: string | null): string {
  const sym = currencySymbol(cur)
  const fmt = (n: number) => n.toLocaleString("ru-RU")
  if (min && max) return min === max ? `${fmt(min)} ${sym}` : `${fmt(min)}–${fmt(max)} ${sym}`
  if (min) return `от ${fmt(min)} ${sym}`
  if (max) return `до ${fmt(max)} ${sym}`
  return ""
}

const STAGE_LABELS: Record<string, string> = {
  new: "Новый", primary_contact: "Первичный контакт", demo: "Демо",
  demo_opened: "Демо открыто", anketa_filled: "Анкета заполнена", decision: "Демо пройдено",
  ai_screening: "AI-скрининг", test_task_sent: "Тестовое отправлено", test_task_done: "Тестовое выполнено",
  scheduled: "Назначено интервью", interview: "Интервью", interviewed: "Интервью пройдено",
  reference_check: "Проверка рекомендаций", offer_sent: "Оффер отправлен", offer: "Оффер",
  final_decision: "Финальное решение", hired: "Нанят", rejected: "Отказ", talent_pool: "Кадровый резерв",
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vac] = await db
      .select({ id: vacancies.id, title: vacancies.title })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)
    if (!vac) return apiError("Vacancy not found", 404)

    const rows = await db
      .select()
      .from(candidates)
      .where(and(
        eq(candidates.vacancyId, id),
        or(isNull(candidates.source), ne(candidates.source, "preview")),
      ))
      .orderBy(desc(candidates.createdAt))

    // Структура демо для расчёта прогресса по страницам (total = lessons + 2).
    let demoTotalPages = 0
    const blockToLesson = new Map<string, number>()
    const [demoRow] = await db
      .select({ lessonsJson: demos.lessonsJson })
      .from(demos)
      .where(and(eq(demos.vacancyId, id), eq(demos.kind, "demo")))
      .orderBy(desc(demos.updatedAt))
      .limit(1)
    if (demoRow) {
      const lessons = Array.isArray(demoRow.lessonsJson) ? (demoRow.lessonsJson as LessonShape[]) : []
      demoTotalPages = lessons.length + 2
      lessons.forEach((lesson, idx) => {
        for (const b of (Array.isArray(lesson?.blocks) ? lesson.blocks : [])) {
          if (typeof b?.id === "string") blockToLesson.set(b.id, idx)
        }
      })
    }

    // Ссылка на резюме hh + имя-fallback.
    const candidateIds = rows.map(r => r.id)
    const hhByCandidate = new Map<string, { resumeUrl: string | null; name: string | null }>()
    if (candidateIds.length > 0) {
      const hhRows = await db
        .select({
          candidateId: hhResponses.localCandidateId,
          resumeUrl:   hhResponses.resumeUrl,
          name:        hhResponses.candidateName,
        })
        .from(hhResponses)
        .where(and(
          eq(hhResponses.companyId, user.companyId),
          inArray(hhResponses.localCandidateId, candidateIds),
        ))
      for (const h of hhRows) {
        if (h.candidateId && !hhByCandidate.has(h.candidateId)) {
          hhByCandidate.set(h.candidateId, { resumeUrl: h.resumeUrl ?? null, name: h.name ?? null })
        }
      }
    }

    const progressOf = (demoProgressJson: unknown): string => {
      const progress = demoProgressJson as { blocks?: DemoBlock[] } | null
      const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
      const completedLessons = new Set<number>()
      let hasAnketa = false, hasThanks = false
      for (const b of blocks) {
        if (b.status !== "completed" || !b.blockId) continue
        if (b.blockId === "__anketa__") { hasAnketa = true; continue }
        if (b.blockId === "__thanks__") { hasThanks = true; continue }
        if (b.blockId === "__complete__") continue
        const idx = blockToLesson.get(b.blockId)
        if (typeof idx === "number") completedLessons.add(idx)
      }
      const completed = completedLessons.size + (hasAnketa ? 1 : 0) + (hasThanks ? 1 : 0)
      if (demoTotalPages <= 0) return completed > 0 ? String(completed) : "0"
      return `${Math.min(100, Math.round((completed / demoTotalPages) * 100))}%`
    }

    const data = rows.map((c) => {
      const hh = hhByCandidate.get(c.id)
      const birth = extractBirthDate(c.birthDate as string | Date | null, c.anketaAnswers)
      const age = ageFromBirthDate(birth)
      return {
        "ФИО":            deriveCandidateName(c.name, c.anketaAnswers, hh?.name ?? null),
        "Возраст":        age ?? "",
        "Город":          c.city ?? "",
        "Зарплата":       formatSalary(c.salaryMin, c.salaryMax, c.salaryCurrency),
        "Дата отклика":   c.createdAt ? new Date(c.createdAt).toLocaleDateString("ru-RU") : "",
        "AI-резюме":      c.resumeScore ?? "",
        "AI-анкета":      c.aiScore ?? "",
        "Прогресс демо":  progressOf(c.demoProgressJson),
        "Этап воронки":   c.stage ? (STAGE_LABELS[c.stage] ?? c.stage) : "",
        "Источник":       c.source ?? "",
        "Резюме hh":      hh?.resumeUrl ?? "",
        "Телефон":        c.phone ?? "",
        "Email":          c.email ?? "",
      }
    })

    const ws = XLSX.utils.json_to_sheet(data)
    // Ширины колонок для читаемости.
    ws["!cols"] = [
      { wch: 28 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 13 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 12 },
      { wch: 36 }, { wch: 16 }, { wch: 26 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Кандидаты")
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

    // Имя файла с кириллицей — через RFC 5987 (filename*), плюс ASCII-fallback.
    const safeTitle = (vac.title || "vacancy").replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "vacancy"
    const fileName = `Кандидаты — ${safeTitle}.xlsx`
    const asciiFallback = "candidates.xlsx"

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[export-candidates]", err)
    return apiError("Internal server error", 500)
  }
}
