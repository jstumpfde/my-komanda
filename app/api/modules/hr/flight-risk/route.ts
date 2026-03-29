import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { flightRiskScores, flightRiskFactors, retentionActions } from "@/lib/db/schema"
import { eq, desc, and, count, sql } from "drizzle-orm"

// GET /api/modules/hr/flight-risk — дашборд flight risk
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const type = url.searchParams.get("type") // "scores" | "factors" | "summary"

  if (type === "factors") {
    const factors = await db
      .select()
      .from(flightRiskFactors)
      .where(eq(flightRiskFactors.isActive, true))
      .orderBy(desc(flightRiskFactors.weight))
    return NextResponse.json(factors)
  }

  if (type === "summary") {
    // Сводка по уровням риска
    const summary = await db
      .select({
        riskLevel: flightRiskScores.riskLevel,
        cnt: count(),
      })
      .from(flightRiskScores)
      .where(eq(flightRiskScores.tenantId, session.user.companyId))
      .groupBy(flightRiskScores.riskLevel)

    const totalActions = await db
      .select({ cnt: count() })
      .from(retentionActions)
      .where(and(
        eq(retentionActions.tenantId, session.user.companyId),
        eq(retentionActions.status, "in_progress"),
      ))

    return NextResponse.json({
      riskDistribution: summary,
      activeActions: totalActions[0]?.cnt ?? 0,
    })
  }

  // Default: все сотрудники с рисками
  const riskFilter = url.searchParams.get("risk") // low/medium/high/critical
  const scores = await db
    .select()
    .from(flightRiskScores)
    .where(and(
      eq(flightRiskScores.tenantId, session.user.companyId),
      riskFilter ? eq(flightRiskScores.riskLevel, riskFilter) : undefined,
    ))
    .orderBy(desc(flightRiskScores.score))

  return NextResponse.json(scores)
}

// POST /api/modules/hr/flight-risk — seed демо-данных
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  if (body.action === "seed-demo") {
    const demoEmployees = [
      { name: "Алексей Петров",    dept: "Продажи",      pos: "Менеджер по продажам",  score: 82, risk: "critical", trend: "declining" },
      { name: "Мария Козлова",     dept: "Маркетинг",    pos: "Маркетолог",            score: 68, risk: "high",     trend: "declining" },
      { name: "Дмитрий Соколов",   dept: "Разработка",   pos: "Frontend-разработчик",  score: 55, risk: "high",     trend: "stable" },
      { name: "Анна Волкова",      dept: "HR",           pos: "HR-менеджер",           score: 45, risk: "medium",   trend: "stable" },
      { name: "Сергей Морозов",    dept: "Продажи",      pos: "Руководитель отдела",   score: 38, risk: "medium",   trend: "improving" },
      { name: "Елена Новикова",    dept: "Финансы",      pos: "Бухгалтер",             score: 30, risk: "medium",   trend: "stable" },
      { name: "Иван Кузнецов",     dept: "Разработка",   pos: "Backend-разработчик",   score: 22, risk: "low",      trend: "stable" },
      { name: "Ольга Лебедева",    dept: "Продажи",      pos: "Менеджер по продажам",  score: 18, risk: "low",      trend: "improving" },
      { name: "Николай Федоров",   dept: "Поддержка",    pos: "Специалист поддержки",  score: 12, risk: "low",      trend: "stable" },
      { name: "Татьяна Смирнова",  dept: "HR",           pos: "Рекрутер",              score: 8,  risk: "low",      trend: "stable" },
    ]

    for (const emp of demoEmployees) {
      await db
        .insert(flightRiskScores)
        .values({
          tenantId:     session.user.companyId,
          employeeId:   `demo-${emp.name.toLowerCase().replace(/\s/g, '-')}`,
          employeeName: emp.name,
          department:   emp.dept,
          position:     emp.pos,
          score:        emp.score,
          riskLevel:    emp.risk,
          trend:        emp.trend,
          factors:      {},
        })
        .onConflictDoUpdate({
          target: [flightRiskScores.tenantId, flightRiskScores.employeeId],
          set: { score: emp.score, riskLevel: emp.risk, trend: emp.trend, employeeName: emp.name, updatedAt: new Date() },
        })
    }

    return NextResponse.json({ seeded: demoEmployees.length })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
