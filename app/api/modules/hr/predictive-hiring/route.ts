import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { predictiveHiringAlerts, flightRiskScores, vacancies } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { randomUUID } from "crypto"

// GET /api/modules/hr/predictive-hiring
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const alerts = await db.select().from(predictiveHiringAlerts)
    .where(eq(predictiveHiringAlerts.tenantId, session.user.companyId))
    .orderBy(desc(predictiveHiringAlerts.createdAt))

  return NextResponse.json(alerts)
}

// POST /api/modules/hr/predictive-hiring
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  // Scan flight risk → create alerts for critical employees
  if (body.action === "scan") {
    const criticals = await db.select().from(flightRiskScores)
      .where(and(
        eq(flightRiskScores.tenantId, session.user.companyId),
        eq(flightRiskScores.riskLevel, "critical"),
      ))

    let created = 0
    for (const emp of criticals) {
      // Check if alert already exists
      const [existing] = await db.select().from(predictiveHiringAlerts)
        .where(and(
          eq(predictiveHiringAlerts.tenantId, session.user.companyId),
          eq(predictiveHiringAlerts.employeeId, emp.employeeId),
          eq(predictiveHiringAlerts.status, "new"),
        ))
        .limit(1)
      if (existing) continue

      await db.insert(predictiveHiringAlerts).values({
        tenantId:      session.user.companyId,
        flightRiskId:  emp.id,
        employeeId:    emp.employeeId,
        employeeName:  emp.employeeName,
        position:      emp.position,
        department:    emp.department,
        riskScore:     emp.score,
      })
      created++
    }

    return NextResponse.json({ scanned: criticals.length, alertsCreated: created })
  }

  // Create draft vacancy from alert
  if (body.action === "create-vacancy") {
    const [alert] = await db.select().from(predictiveHiringAlerts)
      .where(and(
        eq(predictiveHiringAlerts.id, body.alertId),
        eq(predictiveHiringAlerts.tenantId, session.user.companyId),
      ))
      .limit(1)

    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 })

    const slug = `predictive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const [vacancy] = await db.insert(vacancies).values({
      companyId:  session.user.companyId,
      createdBy:  session.user.id,
      title:      `${alert.position} (замена)`,
      city:       null,
      status:     "draft",
      slug,
      category:   alert.department,
    }).returning()

    await db.update(predictiveHiringAlerts)
      .set({ status: "vacancy_created", vacancyId: vacancy.id })
      .where(eq(predictiveHiringAlerts.id, alert.id))

    return NextResponse.json({ alert: alert.id, vacancy: vacancy.id })
  }

  // Dismiss alert
  if (body.action === "dismiss") {
    await db.update(predictiveHiringAlerts)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(and(
        eq(predictiveHiringAlerts.id, body.alertId),
        eq(predictiveHiringAlerts.tenantId, session.user.companyId),
      ))
    return NextResponse.json({ dismissed: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
