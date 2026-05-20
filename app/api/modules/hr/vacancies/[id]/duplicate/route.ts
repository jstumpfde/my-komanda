import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

async function generateDuplicateSlug(originalSlug: string | null | undefined): Promise<string> {
  // Draft vacancies start as «Новая вакансия» → slug «novaya-vakansiya-…». Don't propagate.
  if (!originalSlug || originalSlug.includes("novaya-vakansiya")) {
    return `vacancy-${nanoid(8)}`
  }

  // Strip trailing -N so a copy of "marketolog-b2b-2" probes -3 rather than -2-2.
  const base = originalSlug.replace(/-\d+$/, "")
  if (!base) return `vacancy-${nanoid(8)}`

  for (let counter = 2; counter < 100; counter++) {
    const candidate = `${base}-${counter}`
    const [existing] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(eq(vacancies.slug, candidate))
      .limit(1)
    if (!existing) return candidate
  }

  return `vacancy-${nanoid(8)}`
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCompany()
    const { id } = await params

    const [original] = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!original) {
      return apiError("Vacancy not found", 404)
    }

    const newTitle = `${original.title} (копия)`
    const slug = await generateDuplicateSlug(original.slug)

    const [duplicate] = await db
      .insert(vacancies)
      .values({
        companyId: user.companyId,
        createdBy: user.id!,
        title: newTitle,
        description: original.description,
        descriptionJson: original.descriptionJson,
        city: original.city,
        format: original.format,
        employment: original.employment,
        category: original.category,
        sidebarSection: original.sidebarSection,
        salaryMin: original.salaryMin,
        salaryMax: original.salaryMax,
        clientCompanyId: original.clientCompanyId,
        clientContactId: original.clientContactId,
        status: "draft" as const,
        slug,
      })
      .returning()

    return apiSuccess(duplicate, 201)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
