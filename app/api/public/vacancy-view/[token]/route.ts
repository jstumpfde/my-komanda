import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { vacancyGuestLinks, vacancies, companies, candidates } from "@/lib/db/schema"

// GET — public vacancy view data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const passwordHeader = req.headers.get("x-guest-password") || ""

    // Find link
    const [link] = await db
      .select()
      .from(vacancyGuestLinks)
      .where(eq(vacancyGuestLinks.token, token))
      .limit(1)

    if (!link) {
      return NextResponse.json({ error: "Ссылка не найдена" }, { status: 404 })
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Ссылка истекла" }, { status: 410 })
    }

    // Check password
    if (link.password && passwordHeader !== link.password) {
      return NextResponse.json({
        needPassword: true,
        companyName: "",
      }, { status: 200 })
    }

    // Get vacancy
    const [vacancy] = await db
      .select({
        id: vacancies.id,
        title: vacancies.title,
        status: vacancies.status,
        city: vacancies.city,
        salaryMin: vacancies.salaryMin,
        salaryMax: vacancies.salaryMax,
        createdAt: vacancies.createdAt,
      })
      .from(vacancies)
      .where(eq(vacancies.id, link.vacancyId))
      .limit(1)

    if (!vacancy) {
      return NextResponse.json({ error: "Вакансия не найдена" }, { status: 404 })
    }

    // Get company
    const [company] = await db
      .select({ name: companies.name, logoUrl: companies.logoUrl })
      .from(companies)
      .where(eq(companies.id, link.tenantId))
      .limit(1)

    // Get candidates (without contact info)
    const allCandidates = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        stage: candidates.stage,
        aiScore: candidates.aiScore,
        aiSummary: candidates.aiSummary,
        source: candidates.source,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .where(eq(candidates.vacancyId, link.vacancyId))

    // Build funnel stats
    const stageNames: Record<string, string> = {
      new: "Новые",
      demo: "Демонстрация",
      decision: "Решение",
      interview: "Интервью",
      final_decision: "Финал",
      hired: "Наняты",
      rejected: "Отказ",
    }

    const stageCounts: Record<string, number> = {}
    for (const c of allCandidates) {
      const s = c.stage || "new"
      stageCounts[s] = (stageCounts[s] || 0) + 1
    }

    const funnel = Object.entries(stageNames).map(([key, label]) => ({
      stage: key,
      label,
      count: stageCounts[key] || 0,
    }))

    // Candidate list (no contacts)
    const candidateList = allCandidates
      .filter(c => c.stage !== "rejected")
      .map(c => ({
        id: c.id,
        name: c.name,
        stage: c.stage,
        aiScore: c.aiScore,
        aiVerdict: c.aiScore != null ? (c.aiScore >= 70 ? "подходит" : c.aiScore >= 40 ? "возможно" : "не подходит") : null,
        source: c.source,
        createdAt: c.createdAt,
      }))
      .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))

    return NextResponse.json({
      needPassword: false,
      companyName: company?.name || "Компания",
      companyLogo: company?.logoUrl || null,
      vacancy: {
        title: vacancy.title,
        status: vacancy.status,
        city: vacancy.city,
        salaryMin: vacancy.salaryMin,
        salaryMax: vacancy.salaryMax,
        createdAt: vacancy.createdAt,
      },
      funnel,
      candidates: candidateList,
      totalCandidates: allCandidates.length,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
