import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"
import { logActivity } from "@/lib/activity-log"

type HHVacancy = {
  id?: string
  name?: string
  description?: string
  alternate_url?: string
  salary?: { from?: number | null; to?: number | null; currency?: string | null } | null
  experience?: { id?: string | null } | null
  employment?: { id?: string | null } | null
  schedule?: { id?: string | null } | null
  area?: { name?: string | null } | null
  key_skills?: Array<{ name?: string }> | null
  professional_roles?: Array<{ name?: string }> | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [existing] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!existing) {
      return apiError("Vacancy not found", 404)
    }

    const body = await req.json() as { hhUrl?: string }
    const hhUrl = body.hhUrl?.trim()
    if (!hhUrl) {
      return apiError("hhUrl is required", 400)
    }

    const match = hhUrl.match(/vacancy\/(\d+)/)
    if (!match) {
      return apiError("Invalid hh.ru vacancy URL", 400)
    }
    const hhVacancyId = match[1]

    const res = await fetch(`https://api.hh.ru/vacancies/${hhVacancyId}`, {
      headers: { "User-Agent": "Company24/1.0 (company24.pro)" },
    })

    if (!res.ok) {
      return apiError(`Failed to fetch hh.ru vacancy (${res.status})`, 502)
    }

    const hh = await res.json() as HHVacancy

    const skills = Array.isArray(hh.key_skills)
      ? hh.key_skills.map(s => s?.name).filter((x): x is string => !!x)
      : []

    const specialization = Array.isArray(hh.professional_roles) && hh.professional_roles[0]?.name
      ? hh.professional_roles[0].name
      : ""

    const mappedData = {
      title: hh.name ?? "",
      description: hh.description ? stripHtml(hh.description) : "",
      salaryFrom: typeof hh.salary?.from === "number" ? hh.salary.from : null,
      salaryTo: typeof hh.salary?.to === "number" ? hh.salary.to : null,
      salaryCurrency: hh.salary?.currency ?? "",
      experience: hh.experience?.id ?? "",
      employment: hh.employment?.id ?? "",
      schedule: hh.schedule?.id ?? "",
      city: hh.area?.name ?? "",
      skills,
      specialization,
    }

    const now = new Date()
    const updates: Record<string, unknown> = {
      hhVacancyId,
      hhUrl,
      hhSyncedAt: now,
      updatedAt: now,
    }

    if (mappedData.title) updates.title = mappedData.title
    if (mappedData.description) updates.description = mappedData.description
    if (mappedData.city) updates.city = mappedData.city
    if (mappedData.employment) updates.employment = mappedData.employment
    if (mappedData.schedule) updates.schedule = mappedData.schedule
    if (mappedData.salaryFrom !== null) updates.salaryMin = mappedData.salaryFrom
    if (mappedData.salaryTo !== null) updates.salaryMax = mappedData.salaryTo
    if (mappedData.experience) updates.requiredExperience = mappedData.experience

    const [updated] = await db
      .update(vacancies)
      .set(updates)
      .where(eq(vacancies.id, id))
      .returning()

    logActivity({
      companyId: user.companyId,
      userId: user.id!,
      action: "update",
      entityType: "vacancy",
      entityId: id,
      entityTitle: updated.title,
      module: "hr",
      details: { source: "hh_import", hhVacancyId },
      request: req,
    })

    return apiSuccess({ success: true, data: mappedData })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("[hh-import]", err)
    return apiError("Internal server error", 500)
  }
}
