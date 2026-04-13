import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

interface HealthIssue {
  type: string
  severity: "critical" | "warning" | "ok"
  message: string
  action: string
  tab?: string
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json()) as { vacancyId: string }
    if (!body.vacancyId) return apiError("vacancyId обязателен", 400)

    const [vacancy] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Вакансия не найдена", 404)

    const dj = (vacancy.descriptionJson as Record<string, unknown>) || {}
    const anketa = (dj.anketa as Record<string, unknown>) || {}
    const automation = (dj.automation as Record<string, unknown>) || {}
    const pipeline = dj.pipeline as Record<string, unknown> | undefined

    // Get candidates
    const allCandidates = await db
      .select({ id: candidates.id, stage: candidates.stage, aiScore: candidates.aiScore, createdAt: candidates.createdAt })
      .from(candidates)
      .where(eq(candidates.vacancyId, body.vacancyId))

    // Get demo
    const [demo] = await db
      .select({ id: demos.id })
      .from(demos)
      .where(eq(demos.vacancyId, body.vacancyId))
      .limit(1)

    const issues: HealthIssue[] = []

    // 1. Anketa filled
    if (!anketa.responsibilities && !anketa.requirements) {
      issues.push({ type: "anketa_empty", severity: "critical", message: "Не заполнены обязанности и требования", action: "Заполните анкету вакансии", tab: "anketa" })
    } else if (!anketa.responsibilities || !anketa.requirements) {
      issues.push({ type: "anketa_partial", severity: "warning", message: "Анкета заполнена частично", action: "Дополните обязанности или требования", tab: "anketa" })
    } else {
      issues.push({ type: "anketa_ok", severity: "ok", message: "Анкета заполнена", action: "" })
    }

    // 2. Salary
    if (!vacancy.salaryMin && !vacancy.salaryMax && !anketa.salaryFrom && !anketa.salaryTo) {
      issues.push({ type: "salary_missing", severity: "warning", message: "Зарплата не указана", action: "Укажите зарплатную вилку", tab: "anketa" })
    } else {
      issues.push({ type: "salary_ok", severity: "ok", message: "Зарплата указана", action: "" })
    }

    // 3. HH description
    if (!anketa.hhDescription) {
      issues.push({ type: "hh_missing", severity: "warning", message: "Описание для hh.ru не сгенерировано", action: "Сгенерируйте описание для hh.ru", tab: "anketa" })
    } else {
      issues.push({ type: "hh_ok", severity: "ok", message: "Описание для hh.ru готово", action: "" })
    }

    // 4. Demo
    if (!demo) {
      issues.push({ type: "demo_missing", severity: "warning", message: "Демонстрация должности не создана", action: "Создайте демонстрацию", tab: "course" })
    } else {
      issues.push({ type: "demo_ok", severity: "ok", message: "Демонстрация создана", action: "" })
    }

    // 5. Pipeline
    if (!pipeline?.preset) {
      issues.push({ type: "pipeline_missing", severity: "warning", message: "Воронка не настроена", action: "Выберите сценарий обработки кандидатов", tab: "automation" })
    } else {
      issues.push({ type: "pipeline_ok", severity: "ok", message: "Воронка настроена", action: "" })
    }

    // 6. Message templates
    if (!automation.messageTemplates) {
      issues.push({ type: "templates_missing", severity: "ok", message: "Используются шаблоны компании", action: "" })
    } else {
      issues.push({ type: "templates_ok", severity: "ok", message: "Шаблоны сообщений настроены", action: "" })
    }

    // 7. Stale candidates (waiting > 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const staleCandidates = allCandidates.filter(c =>
      c.stage === "new" && c.createdAt && new Date(c.createdAt) < threeDaysAgo
    )
    if (staleCandidates.length > 0) {
      issues.push({ type: "stale_candidates", severity: "critical", message: `${staleCandidates.length} кандидатов ожидают разбора более 3 дней`, action: "Разберите новые отклики", tab: "candidates" })
    }

    // 8. AI screening conflicts
    const conflicts = allCandidates.filter(c => c.aiScore != null && c.aiScore > 80 && c.stage === "new")
    if (conflicts.length > 0) {
      issues.push({ type: "high_score_unprocessed", severity: "warning", message: `${conflicts.length} кандидатов с высоким AI-скором не обработаны`, action: "Пригласите подходящих кандидатов", tab: "candidates" })
    }

    // Calculate score
    const criticals = issues.filter(i => i.severity === "critical").length
    const warnings = issues.filter(i => i.severity === "warning").length
    const oks = issues.filter(i => i.severity === "ok").length
    const total = issues.length
    const score = Math.max(0, Math.round(((oks * 1 + warnings * 0.5) / total) * 100))

    // Next step
    const firstIssue = issues.find(i => i.severity === "critical") || issues.find(i => i.severity === "warning")
    const nextStep = firstIssue ? firstIssue.action : "Вакансия полностью настроена!"

    return apiSuccess({ score, issues, nextStep })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("vacancy-health-check error:", err)
    return apiError("Internal server error", 500)
  }
}
