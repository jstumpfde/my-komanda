import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { pulseResponses, pulseSurveys, notifications, companies } from "@/lib/db/schema"
import { eq, and, avg, sql, desc, lt } from "drizzle-orm"
import { checkCronAuth } from "@/lib/cron/auth"

// POST /api/cron/pulse-alerts — scan recent pulse responses for low scores
// Protected by X-Cron-Secret header.
export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req)
  if (!auth.ok) return auth.response
  try {
    // Find all tenants with pulse surveys sent in last 7 days
    const recentSurveys = await db
      .select({
        tenantId: pulseSurveys.tenantId,
        surveyId: pulseSurveys.id,
      })
      .from(pulseSurveys)
      .where(and(
        eq(pulseSurveys.status, "sent"),
        sql`${pulseSurveys.sentAt} > now() - interval '7 days'`
      ))

    let alertsCreated = 0

    for (const survey of recentSurveys) {
      // Get average score per employee for this survey
      const employeeScores = await db
        .select({
          employeeId: pulseResponses.employeeId,
          avgScore: avg(pulseResponses.score),
        })
        .from(pulseResponses)
        .where(eq(pulseResponses.surveyId, survey.surveyId))
        .groupBy(pulseResponses.employeeId)

      for (const emp of employeeScores) {
        const score = Number(emp.avgScore)
        if (score > 0 && score < 3) {
          // Check if we already alerted for this employee recently
          const [existing] = await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(and(
              eq(notifications.tenantId, survey.tenantId),
              eq(notifications.type, "pulse_alert"),
              eq(notifications.sourceId, emp.employeeId),
              sql`${notifications.createdAt} > now() - interval '7 days'`
            ))
            .limit(1)

          if (!existing) {
            await db.insert(notifications).values({
              tenantId:   survey.tenantId,
              type:       "pulse_alert",
              title:      `Низкий пульс-балл: ${score.toFixed(1)}/5`,
              body:       `Сотрудник ${emp.employeeId} показал средний балл ${score.toFixed(1)} в пульс-опросе. Рекомендуется провести 1:1 встречу.`,
              severity:   score < 2 ? "danger" : "warning",
              sourceType: "pulse_response",
              sourceId:   emp.employeeId,
              href:       "/hr/pulse-surveys",
            })
            alertsCreated++
          }
        }
      }
    }

    return NextResponse.json({ scanned: recentSurveys.length, alertsCreated })
  } catch (err) {
    return NextResponse.json({ error: "Failed to scan pulse alerts" }, { status: 500 })
  }
}
