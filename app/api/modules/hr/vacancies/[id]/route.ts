import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { logActivity } from "@/lib/activity-log"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [vacancy] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) {
      return apiError("Vacancy not found", 404)
    }

    return apiSuccess(vacancy)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Verify ownership
    const [existing] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!existing) {
      return apiError("Vacancy not found", 404)
    }

    const body = await req.json() as {
      title?: string
      city?: string
      format?: string
      employment?: string
      category?: string
      salary_min?: number
      salary_max?: number
      status?: string
      description_json?: unknown
      experience?: string
      schedule?: string
      description?: string
      required_experience?: string
      employment_type?: string[]
      hiring_plan?: number
      employee_type?: string
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.title !== undefined) updates.title = body.title
    if (body.city !== undefined) updates.city = body.city
    if (body.format !== undefined) updates.format = body.format
    if (body.employment !== undefined) updates.employment = body.employment
    if (body.category !== undefined) updates.category = body.category
    if (body.salary_min !== undefined) updates.salaryMin = body.salary_min
    if (body.salary_max !== undefined) updates.salaryMax = body.salary_max
    if (body.status !== undefined) updates.status = body.status
    if (body.description_json !== undefined) {
      updates.descriptionJson = body.description_json
      // Расписание (schedule_*) теперь редактируется отдельно — через
      // /api/modules/hr/vacancies/[id]/schedule-settings (см. компонент
      // vacancy-schedule-settings.tsx). Зеркаление workingHours удалено.
    }
    if (body.experience !== undefined) updates.experience = body.experience
    if (body.schedule !== undefined) updates.schedule = body.schedule
    if (body.description !== undefined) updates.description = body.description
    if (body.required_experience !== undefined) updates.requiredExperience = body.required_experience
    if (body.employment_type !== undefined) updates.employmentType = body.employment_type
    if (body.hiring_plan !== undefined) updates.hiringPlan = body.hiring_plan
    if (body.employee_type !== undefined) updates.employeeType = body.employee_type

    const [updated] = await db
      .update(vacancies)
      .set(updates)
      .where(eq(vacancies.id, id))
      .returning()

    const changedFields = Object.keys(updates).filter(k => k !== "updatedAt")
    logActivity({ companyId: user.companyId, userId: user.id!, action: "update", entityType: "vacancy", entityId: id, entityTitle: updated.title, module: "hr", details: { changedFields }, request: req })
    return apiSuccess(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// Тип для блока автоматических действий, хранится в descriptionJson.automation
export interface VacancyAutomationSettings {
  autoInvite?: boolean
  autoReject?: boolean
  notifyManager?: boolean
  rejectTemplate?: string
  inviteTemplate?: string
}

// PATCH — двойное назначение:
//   • Без тела (или пустое тело) — восстанавливает вакансию из корзины (clears deleted_at).
//     Так вызывается из app/(modules)/hr/vacancies/page.tsx → handleRestore.
//   • С полем `automation` — мерджит настройки авто-действий в descriptionJson.automation
//     (используется блоком «Автоматические действия» в табе «Автоматизация»).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    // Аккуратно достаём тело — для restore-вызовов оно может отсутствовать
    let body: { automation?: VacancyAutomationSettings } = {}
    try {
      const text = await req.text()
      if (text && text.trim().length > 0) {
        body = JSON.parse(text) as { automation?: VacancyAutomationSettings }
      }
    } catch {
      // Тело не JSON — считаем как пустое (восстановление)
      body = {}
    }

    // Ветка 1: обновление настроек автоматизации
    if (body.automation && typeof body.automation === "object") {
      // Получаем существующий descriptionJson чтобы сделать merge, а не перезатереть
      const [existing] = await db
        .select({ id: vacancies.id, descriptionJson: vacancies.descriptionJson })
        .from(vacancies)
        .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
        .limit(1)

      if (!existing) {
        return apiError("Vacancy not found", 404)
      }

      const currentJson = (existing.descriptionJson && typeof existing.descriptionJson === "object" && existing.descriptionJson !== null)
        ? existing.descriptionJson as Record<string, unknown>
        : {}
      const currentAutomation = (currentJson.automation && typeof currentJson.automation === "object" && currentJson.automation !== null)
        ? currentJson.automation as Record<string, unknown>
        : {}

      // Валидируем поля автоматизации — пропускаем только разрешённые
      const incoming = body.automation
      const sanitized: Record<string, unknown> = { ...currentAutomation }
      if (typeof incoming.autoInvite === "boolean") sanitized.autoInvite = incoming.autoInvite
      if (typeof incoming.autoReject === "boolean") sanitized.autoReject = incoming.autoReject
      if (typeof incoming.notifyManager === "boolean") sanitized.notifyManager = incoming.notifyManager
      if (typeof incoming.rejectTemplate === "string") sanitized.rejectTemplate = incoming.rejectTemplate
      if (typeof incoming.inviteTemplate === "string") sanitized.inviteTemplate = incoming.inviteTemplate

      const nextJson = {
        ...currentJson,
        automation: sanitized,
      }

      const [updated] = await db
        .update(vacancies)
        .set({ descriptionJson: nextJson, updatedAt: new Date() })
        .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
        .returning()

      if (!updated) {
        return apiError("Vacancy not found", 404)
      }

      logActivity({
        companyId: user.companyId,
        userId: user.id!,
        action: "update",
        entityType: "vacancy",
        entityId: id,
        entityTitle: updated.title,
        module: "hr",
        details: { changedFields: ["automation"] },
        request: req,
      })

      return apiSuccess(updated)
    }

    // Ветка 2: классическое восстановление из корзины
    const [restored] = await db
      .update(vacancies)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id })

    if (!restored) {
      return apiError("Vacancy not found", 404)
    }

    return apiSuccess({ restored: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}

// Soft delete — moves to trash (sets deleted_at)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [deleted] = await db
      .update(vacancies)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .returning({ id: vacancies.id })

    if (!deleted) {
      return apiError("Vacancy not found", 404)
    }

    logActivity({ companyId: user.companyId, userId: user.id!, action: "delete", entityType: "vacancy", entityId: id, module: "hr", request: _req })
    return apiSuccess({ deleted: true })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
