import { NextRequest } from "next/server"
import { eq, and, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, demos, companies } from "@/lib/db/schema"
import { apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Find candidate by token
    const candidateRows = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        vacancyId: candidates.vacancyId,
        anketaAnswers: candidates.anketaAnswers,
        demoProgressJson: candidates.demoProgressJson,
        aiScore: candidates.aiScore,
      })
      .from(candidates)
      .where(eq(candidates.token, token))
      .limit(1)

    if (candidateRows.length === 0) {
      return apiError("Кандидат не найден", 404)
    }

    const candidate = candidateRows[0]

    // Find vacancy + company
    const vacancyRows = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        companyId: vacancies.companyId,
        descriptionJson: vacancies.descriptionJson,
        salaryMin: vacancies.salaryMin,
        salaryMax: vacancies.salaryMax,
        city: vacancies.city,
        format: vacancies.format,
        companyName: companies.name,
        companyLogo: companies.logoUrl,
        brandPrimaryColor: companies.brandPrimaryColor,
        brandBgColor: companies.brandBgColor,
        brandTextColor: companies.brandTextColor,
      })
      .from(vacancies)
      .innerJoin(companies, eq(vacancies.companyId, companies.id))
      .where(
        and(
          eq(vacancies.id, candidate.vacancyId),
          isNull(vacancies.deletedAt),
        ),
      )
      .limit(1)

    if (vacancyRows.length === 0) {
      return apiError("Вакансия не найдена", 404)
    }

    const vacancy = vacancyRows[0]

    // Find published demo for this vacancy
    const demoRows = await db
      .select({
        id: demos.id,
        title: demos.title,
        lessonsJson: demos.lessonsJson,
        postDemoSettings: demos.postDemoSettings,
      })
      .from(demos)
      .where(eq(demos.vacancyId, vacancy.id))
      .orderBy(sql`${demos.updatedAt} DESC`)
      .limit(1)

    if (demoRows.length === 0) {
      return apiError("Демо-курс не найден", 404)
    }

    const demo = demoRows[0]

    return apiSuccess({
      candidateName: candidate.name,
      vacancyTitle: vacancy.title,
      companyName: vacancy.companyName,
      companyLogo: vacancy.companyLogo,
      brandPrimaryColor: vacancy.brandPrimaryColor,
      brandBgColor: vacancy.brandBgColor,
      brandTextColor: vacancy.brandTextColor,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      city: vacancy.city,
      format: vacancy.format,
      lessons: demo.lessonsJson,
      progress: candidate.demoProgressJson,
      answers: candidate.anketaAnswers,
      aiScore: candidate.aiScore,
      postDemoSettings: demo.postDemoSettings ?? {},
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error("GET /api/public/demo/[token]", err)
    return apiError("Internal server error", 500)
  }
}
