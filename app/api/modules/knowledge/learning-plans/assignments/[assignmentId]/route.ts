import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { learningAssignments, learningPlans } from "@/lib/db/schema"
import { apiError, apiSuccess, requireCompany } from "@/lib/api-helpers"
import { awardPoints } from "@/lib/knowledge/achievements"

// PATCH /api/modules/knowledge/learning-plans/assignments/[assignmentId]
//
// Обновляет прогресс / статус назначения. Хуки геймификации:
//  - новый урок помечен как done   → +10 баллов (type=lesson, sourceId=assignmentId:lessonKey)
//  - status переходит в completed  → +50 баллов (type=course, sourceId=assignmentId)
//                                     + авто-генерация сертификата (certificateUrl)
//
// Тело (все поля опциональны):
//   - completeLesson: string     — ключ/id урока, который сейчас помечен как done
//   - progress: object           — полная замена объекта прогресса
//   - status: 'assigned'|'in_progress'|'completed'

interface Body {
  completeLesson?: string
  progress?: Record<string, unknown>
  status?: "assigned" | "in_progress" | "completed"
}

function normalizeProgress(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {}
  return raw as Record<string, unknown>
}

function isDone(value: unknown): boolean {
  return (
    value === true ||
    (typeof value === "object" &&
      value !== null &&
      (value as { done?: boolean }).done === true)
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const user = await requireCompany()
    const { assignmentId } = await params
    const body = (await req.json().catch(() => ({}))) as Body

    const [existing] = await db
      .select({
        id: learningAssignments.id,
        planId: learningAssignments.planId,
        userId: learningAssignments.userId,
        tenantId: learningAssignments.tenantId,
        status: learningAssignments.status,
        progress: learningAssignments.progress,
        certificateUrl: learningAssignments.certificateUrl,
      })
      .from(learningAssignments)
      .where(
        and(
          eq(learningAssignments.id, assignmentId),
          eq(learningAssignments.tenantId, user.companyId),
        ),
      )
      .limit(1)

    if (!existing) return apiError("Назначение не найдено", 404)

    // Только владелец назначения или HR/директор могут обновлять.
    const canEdit =
      existing.userId === user.id ||
      user.role === "director" ||
      user.role === "hr_lead" ||
      user.role === "hr_manager" ||
      user.role === "platform_admin"
    if (!canEdit) return apiError("Forbidden", 403)

    const prevProgress = normalizeProgress(existing.progress)
    let nextProgress: Record<string, unknown> = prevProgress
    let newlyCompletedLesson: string | null = null

    // 1) Апдейт по completeLesson (идемпотентно для того же ключа)
    if (body.completeLesson) {
      const key = body.completeLesson
      if (!isDone(prevProgress[key])) {
        nextProgress = { ...prevProgress, [key]: true }
        newlyCompletedLesson = key
      }
    }

    // 2) Или целиком замена progress
    if (body.progress) {
      nextProgress = body.progress
    }

    // Определяем статус
    let nextStatus = existing.status
    if (body.status) {
      nextStatus = body.status
    } else if (existing.status === "assigned" && (body.completeLesson || body.progress)) {
      nextStatus = "in_progress"
    }

    // Авто-completion: если все материалы плана отмечены done
    const [plan] = await db
      .select({ id: learningPlans.id, title: learningPlans.title, materials: learningPlans.materials })
      .from(learningPlans)
      .where(eq(learningPlans.id, existing.planId))
      .limit(1)

    const planMaterialIds: string[] = Array.isArray(plan?.materials)
      ? (plan!.materials as Array<{ id?: string } | string>).map((m) =>
          typeof m === "string" ? m : m?.id ?? "",
        ).filter(Boolean)
      : []

    if (
      planMaterialIds.length > 0 &&
      planMaterialIds.every((mid) => isDone(nextProgress[mid])) &&
      nextStatus !== "completed"
    ) {
      nextStatus = "completed"
    }

    const wasCompleted = existing.status === "completed"
    const becomesCompleted = !wasCompleted && nextStatus === "completed"

    const updatePayload: Partial<{
      progress: Record<string, unknown>
      status: string
      completedAt: Date
      certificateUrl: string
    }> = {
      progress: nextProgress,
      status: nextStatus,
    }

    if (becomesCompleted) {
      updatePayload.completedAt = new Date()
      if (!existing.certificateUrl) {
        updatePayload.certificateUrl = `/certificate/${existing.id}`
      }
    }

    await db
      .update(learningAssignments)
      .set(updatePayload)
      .where(eq(learningAssignments.id, existing.id))

    // ── Геймификация ─────────────────────────────────────────────────────

    // +10 за урок
    if (newlyCompletedLesson) {
      try {
        await awardPoints(
          existing.tenantId,
          existing.userId,
          "lesson",
          `${existing.id}:${newlyCompletedLesson}`,
          `Урок «${newlyCompletedLesson}»`,
        )
      } catch (err) {
        console.error("[assignments patch] lesson award failed", err)
      }
    }

    // +50 за курс (только при переходе в completed)
    if (becomesCompleted) {
      try {
        await awardPoints(
          existing.tenantId,
          existing.userId,
          "course",
          existing.id,
          plan ? `План «${plan.title}»` : null,
        )
      } catch (err) {
        console.error("[assignments patch] course award failed", err)
      }
    }

    return apiSuccess({
      ok: true,
      status: nextStatus,
      progress: nextProgress,
      completed: becomesCompleted,
      certificateUrl:
        becomesCompleted && !existing.certificateUrl
          ? `/certificate/${existing.id}`
          : existing.certificateUrl,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[knowledge/learning-plans/assignments] PATCH", err)
    return apiError("Internal server error", 500)
  }
}
