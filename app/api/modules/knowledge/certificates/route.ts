import { NextRequest } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { learningAssignments, learningPlans, users } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"

// POST /api/modules/knowledge/certificates
// Body: { userId, planId } или { assignmentId }
//
// Возвращает URL публичной страницы сертификата. Сертификат — это
// HTML-страница с `@media print` стилями для «Сохранить как PDF» в браузере.
// Для настоящего серверного PDF понадобится pdfkit + Cyrillic-шрифт —
// оставлено задачей следующей итерации (HTML-подход покрывает UX).
//
// Endpoint требует что assignment находится в статусе completed.

function buildCertificateUrl(assignmentId: string): string {
  return `/certificate/${assignmentId}`
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompany()
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string
      planId?: string
      assignmentId?: string
    }

    let assignment:
      | {
          id: string
          tenantId: string
          status: string
          certificateUrl: string | null
          userId: string
          planId: string
          completedAt: Date | null
        }
      | null = null

    if (body.assignmentId) {
      const [row] = await db
        .select({
          id: learningAssignments.id,
          tenantId: learningAssignments.tenantId,
          status: learningAssignments.status,
          certificateUrl: learningAssignments.certificateUrl,
          userId: learningAssignments.userId,
          planId: learningAssignments.planId,
          completedAt: learningAssignments.completedAt,
        })
        .from(learningAssignments)
        .where(
          and(
            eq(learningAssignments.id, body.assignmentId),
            eq(learningAssignments.tenantId, user.companyId),
          ),
        )
        .limit(1)
      assignment = row ?? null
    } else if (body.userId && body.planId) {
      const [row] = await db
        .select({
          id: learningAssignments.id,
          tenantId: learningAssignments.tenantId,
          status: learningAssignments.status,
          certificateUrl: learningAssignments.certificateUrl,
          userId: learningAssignments.userId,
          planId: learningAssignments.planId,
          completedAt: learningAssignments.completedAt,
        })
        .from(learningAssignments)
        .where(
          and(
            eq(learningAssignments.tenantId, user.companyId),
            eq(learningAssignments.userId, body.userId),
            eq(learningAssignments.planId, body.planId),
          ),
        )
        .orderBy(desc(learningAssignments.assignedAt))
        .limit(1)
      assignment = row ?? null
    } else {
      return apiError("Укажите assignmentId или userId+planId", 400)
    }

    if (!assignment) return apiError("Назначение не найдено", 404)
    if (assignment.status !== "completed") {
      return apiError("Сертификат выдаётся только для завершённых назначений", 400)
    }

    // Идемпотентность
    if (assignment.certificateUrl) {
      return apiSuccess({ ok: true, url: assignment.certificateUrl })
    }

    const url = buildCertificateUrl(assignment.id)
    await db
      .update(learningAssignments)
      .set({ certificateUrl: url })
      .where(eq(learningAssignments.id, assignment.id))

    return apiSuccess({ ok: true, url })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/certificates] POST", err)
    return apiError("Internal server error", 500)
  }
}

// GET — данные для рендера страницы сертификата (используется public page)
export async function GET(req: NextRequest) {
  try {
    const assignmentId = req.nextUrl.searchParams.get("assignmentId")
    if (!assignmentId) return apiError("'assignmentId' обязателен", 400)

    const user = await requireCompany()

    const [row] = await db
      .select({
        id: learningAssignments.id,
        tenantId: learningAssignments.tenantId,
        status: learningAssignments.status,
        completedAt: learningAssignments.completedAt,
        assignedAt: learningAssignments.assignedAt,
        userName: users.name,
        planTitle: learningPlans.title,
      })
      .from(learningAssignments)
      .innerJoin(users, eq(users.id, learningAssignments.userId))
      .innerJoin(learningPlans, eq(learningPlans.id, learningAssignments.planId))
      .where(
        and(
          eq(learningAssignments.id, assignmentId),
          eq(learningAssignments.tenantId, user.companyId),
        ),
      )
      .limit(1)

    if (!row) return apiError("Not found", 404)
    return apiSuccess(row)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
