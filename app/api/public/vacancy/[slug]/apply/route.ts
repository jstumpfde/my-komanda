import { NextRequest } from "next/server"
import { eq, and, or, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancies, candidates, vacancyUtmLinks } from "@/lib/db/schema"
import { sql } from "drizzle-orm"
import { apiError, apiSuccess } from "@/lib/api-helpers"
import { generateCandidateToken } from "@/lib/candidate-tokens"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await req.json()

    const { name, contact, contactType, utmSource, refId } = body as {
      name?: string
      contact?: string
      contactType?: "phone" | "telegram"
      utmSource?: string
      refId?: string
    }

    if (!name?.trim()) {
      return apiError("Имя обязательно", 400)
    }
    if (!contact?.trim()) {
      return apiError("Контакт обязателен", 400)
    }

    // Find published vacancy by slug
    const [vacancy] = await db
      .select({ id: vacancies.id })
      .from(vacancies)
      .where(
        and(
          or(eq(vacancies.slug, slug), eq(vacancies.id, slug)),
          or(eq(vacancies.status, "active"), eq(vacancies.status, "published")),
          isNull(vacancies.deletedAt),
        ),
      )
      .limit(1)

    if (!vacancy) {
      return apiError("Вакансия не найдена", 404)
    }

    // Determine source: resolve from short link ref if present
    let source = utmSource || "site"
    if (refId) {
      const [utmLink] = await db
        .select({ id: vacancyUtmLinks.id, source: vacancyUtmLinks.source })
        .from(vacancyUtmLinks)
        .where(eq(vacancyUtmLinks.id, refId))
        .limit(1)
      if (utmLink) {
        source = utmLink.source
        // Increment candidates count
        await db.update(vacancyUtmLinks)
          .set({ candidatesCount: sql`${vacancyUtmLinks.candidatesCount} + 1` })
          .where(eq(vacancyUtmLinks.id, utmLink.id))
      }
    }

    // Store contact based on type
    const phone = contactType === "phone" ? contact.trim() : null
    const email = contactType === "telegram" ? contact.trim() : null

    const [created] = await db
      .insert(candidates)
      .values({
        vacancyId: vacancy.id,
        name: name.trim(),
        phone,
        email, // telegram handle stored in email field
        source,
        stage: "new",
        token: generateCandidateToken(),
      })
      .returning()

    return apiSuccess({ ok: true, candidateId: created.id, token: created.token }, 201)
  } catch (err) {
    if (err instanceof Response) return err
    console.error("POST /api/public/vacancy/[slug]/apply", err)
    return apiError("Internal server error", 500)
  }
}
