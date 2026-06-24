import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { flightRiskScores, notifications } from "@/lib/db/schema"
import { eq, and, sql, inArray } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"
import { startCronRun, finishCronRun } from "@/lib/cron/record-run"

const CRON_NAME = "flight-risk-alerts"

// POST /api/cron/flight-risk-alerts — detect risk level transitions
// Protected by X-Cron-Secret header.
export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response
  const run = await startCronRun(CRON_NAME).catch(() => null)
  try {
    // Find employees with high/critical risk that don't have a recent notification
    const highRisk = await db
      .select()
      .from(flightRiskScores)
      .where(inArray(flightRiskScores.riskLevel, ["high", "critical"]))

    let alertsCreated = 0

    for (const emp of highRisk) {
      // Check if already notified in last 7 days
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(
          eq(notifications.tenantId, emp.tenantId),
          eq(notifications.type, "flight_risk_alert"),
          eq(notifications.sourceId, emp.employeeId),
          sql`${notifications.createdAt} > now() - interval '7 days'`
        ))
        .limit(1)

      if (!existing) {
        const isCritical = emp.riskLevel === "critical"
        await db.insert(notifications).values({
          tenantId:   emp.tenantId,
          type:       "flight_risk_alert",
          title:      isCritical
            ? `🚨 Критический риск увольнения: ${emp.employeeName}`
            : `⚠️ Высокий риск увольнения: ${emp.employeeName}`,
          body:       `${emp.employeeName} (${emp.position}, ${emp.department}) — балл ${emp.score}/100, тренд: ${emp.trend === "declining" ? "ухудшается" : "стабильно"}. Рекомендуется запланировать retention-действие.`,
          severity:   isCritical ? "danger" : "warning",
          sourceType: "flight_risk",
          sourceId:   emp.employeeId,
          href:       "/hr/flight-risk",
        })
        alertsCreated++
      }
    }

    if (run) await finishCronRun(run.id, "ok", { scanned: highRisk.length, alertsCreated })
    return NextResponse.json({ scanned: highRisk.length, alertsCreated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) await finishCronRun(run.id, "error", null, msg)
    return NextResponse.json({ error: "Failed to scan flight risk alerts" }, { status: 500 })
  }
}
