import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompany()
    const vacancyId = req.nextUrl.searchParams.get("vacancy_id")
    if (!vacancyId) return apiError("vacancy_id обязателен", 400)

    // Get vacancy anketa
    const [vacancy] = await db
      .select({ title: vacancies.title, descriptionJson: vacancies.descriptionJson })
      .from(vacancies)
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, user.companyId)))
      .limit(1)

    if (!vacancy) return apiError("Вакансия не найдена", 404)

    const dj = (vacancy.descriptionJson as Record<string, unknown>) || {}
    const anketa = (dj.anketa as Record<string, unknown>) || {}
    const reqSkills = new Set(
      (Array.isArray(anketa.requiredSkills) ? anketa.requiredSkills as string[] : []).map(s => s.toLowerCase())
    )
    const desSkills = new Set(
      (Array.isArray(anketa.desiredSkills) ? anketa.desiredSkills as string[] : []).map(s => s.toLowerCase())
    )
    const reqCity = String(anketa.positionCity || "").toLowerCase()

    // Find talent pool candidates for this tenant
    const poolCandidates = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        city: candidates.city,
        skills: candidates.skills,
        experience: candidates.experience,
        aiScore: candidates.aiScore,
        vacancyId: candidates.vacancyId,
        source: candidates.source,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(candidates.stage, "talent_pool"), eq(vacancies.companyId, user.companyId)))
      .limit(50)

    // Score each candidate
    const scored = poolCandidates.map(c => {
      let match = 0
      let total = 0

      // Skill matching
      const cSkills = new Set((c.skills || []).map(s => s.toLowerCase()))
      for (const s of reqSkills) {
        total += 3
        if (cSkills.has(s)) match += 3
      }
      for (const s of desSkills) {
        total += 1
        if (cSkills.has(s)) match += 1
      }

      // City matching
      if (reqCity) {
        total += 2
        if (c.city?.toLowerCase().includes(reqCity)) match += 2
      }

      // AI score bonus
      if (c.aiScore && c.aiScore >= 60) {
        total += 2
        match += Math.min(2, Math.round(c.aiScore / 50))
      }

      const percent = total > 0 ? Math.round((match / total) * 100) : 0

      return {
        id: c.id,
        name: c.name,
        city: c.city,
        skills: c.skills,
        experience: c.experience,
        aiScore: c.aiScore,
        matchPercent: percent,
      }
    })

    // Return top 5
    const top = scored
      .filter(c => c.matchPercent > 20)
      .sort((a, b) => b.matchPercent - a.matchPercent)
      .slice(0, 5)

    return apiSuccess(top)
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
