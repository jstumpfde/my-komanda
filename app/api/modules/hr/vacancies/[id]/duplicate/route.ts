import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { nanoid } from "nanoid"
import { db } from "@/lib/db"
import { vacancies, companies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

function transliterate(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  return text
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? (c.match(/[a-z0-9]/) ? c : "-"))
    .join("")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
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

    const newTitle = `Копия: ${original.title}`
    const slug = `${transliterate(newTitle)}-${nanoid(6)}`

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
