import { NextRequest } from "next/server"
import { eq, and, inArray, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { generateCandidateToken } from "@/lib/candidate-tokens"

interface DemoBlockProgress {
  blockId: string
  status?: string
  answeredAt?: string
  timeSpent?: number
}

interface LessonShape {
  id?: string
  blocks?: { id?: string }[]
}

const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000

// GET /api/modules/hr/candidates?vacancy_id=...&stage=new,demo,...
export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const url = new URL(req.url)
    const vacancyId = url.searchParams.get("vacancy_id")
    const stageParam = url.searchParams.get("stage")

    // If no vacancy_id — return ALL candidates for this company with vacancy title
    if (!vacancyId) {
      const rows = await db
        .select({
          id: candidates.id,
          name: candidates.name,
          phone: candidates.phone,
          email: candidates.email,
          city: candidates.city,
          source: candidates.source,
          stage: candidates.stage,
          score: candidates.score,
          aiScore: candidates.aiScore,
          vacancyId: candidates.vacancyId,
          vacancyTitle: vacancies.title,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
          demoProgressJson: candidates.demoProgressJson,
          isFavorite: candidates.isFavorite,
        })
        .from(candidates)
        .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
        .where(eq(vacancies.companyId, user.companyId))

      const vacancyIds = [...new Set(rows.map((r) => r.vacancyId))]

      const totalsByVacancy = new Map<string, number>()
      if (vacancyIds.length > 0) {
        const demoRows = await db
          .select({
            vacancyId: demos.vacancyId,
            lessonsJson: demos.lessonsJson,
            updatedAt: demos.updatedAt,
          })
          .from(demos)
          .where(inArray(demos.vacancyId, vacancyIds))
          .orderBy(desc(demos.updatedAt))

        const latestByVacancy = new Map<string, unknown>()
        for (const d of demoRows) {
          if (!latestByVacancy.has(d.vacancyId)) {
            latestByVacancy.set(d.vacancyId, d.lessonsJson)
          }
        }
        for (const [vid, lessonsJson] of latestByVacancy.entries()) {
          const lessons = Array.isArray(lessonsJson) ? (lessonsJson as LessonShape[]) : []
          const total = lessons.reduce(
            (sum, l) => sum + (Array.isArray(l?.blocks) ? l.blocks.length : 0),
            0,
          )
          totalsByVacancy.set(vid, total)
        }
      }

      const now = Date.now()

      const enriched = rows.map((r) => {
        const demoTotalBlocks = totalsByVacancy.get(r.vacancyId) ?? 0
        const progress = r.demoProgressJson as { blocks?: DemoBlockProgress[] } | null
        const blocks = Array.isArray(progress?.blocks) ? progress.blocks : []
        const completed = blocks.filter((b) => b.status === "completed")
        const demoCompletedBlocks = completed.length
        const progressPercent =
          demoTotalBlocks > 0
            ? Math.round((demoCompletedBlocks / demoTotalBlocks) * 100)
            : null

        const stamps = completed
          .map((b) => (b.answeredAt ? new Date(b.answeredAt).getTime() : NaN))
          .filter((t) => !Number.isNaN(t))
          .sort((a, b) => a - b)
        const lastAnswerAt =
          stamps.length > 0 ? new Date(stamps[stamps.length - 1]).toISOString() : null
        const isActive = lastAnswerAt
          ? now - new Date(lastAnswerAt).getTime() <= ACTIVE_THRESHOLD_MS
          : false

        // Strip demoProgressJson from response — too heavy, not needed by clients
        const { demoProgressJson: _drop, ...rest } = r
        void _drop
        return {
          ...rest,
          demoTotalBlocks,
          demoCompletedBlocks,
          progressPercent,
          isActive,
        }
      })

      return apiSuccess(enriched)
    }

    // Verify ownership
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vac) return apiError("Vacancy not found", 404)

    const stages = stageParam ? stageParam.split(",").filter(Boolean) : []

    const rows = stages.length > 0
      ? await db.select().from(candidates)
          .where(and(eq(candidates.vacancyId, vacancyId), inArray(candidates.stage, stages)))
      : await db.select().from(candidates)
          .where(eq(candidates.vacancyId, vacancyId))

    return apiSuccess(rows)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// POST /api/modules/hr/candidates — добавить кандидата вручную
export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = await req.json() as {
      vacancyId: string
      name: string
      phone?: string
      email?: string
      city?: string
      source?: string
    }

    if (!body.vacancyId || !body.name) return apiError("vacancyId и name обязательны", 400)

    // Verify ownership
    const [vac] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, body.vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vac) return apiError("Vacancy not found", 404)

    const [created] = await db.insert(candidates).values({
      vacancyId: body.vacancyId,
      name: body.name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      city: body.city ?? null,
      source: body.source ?? "manual",
      stage: "new",
      token: generateCandidateToken(),
    }).returning()

    return apiSuccess(created, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
