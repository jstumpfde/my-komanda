import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  flightRiskScores, pulseResponses, pulseSurveys,
  adaptationAssignments, courseEnrollments, assessments, skillAssessments,
  companies,
} from "@/lib/db/schema"
import { eq, and, avg, sql, desc, count } from "drizzle-orm"

// POST /api/cron/recalculate-flight-risk
// Recalculates flight risk scores for all employees based on available data
export async function POST() {
  try {
    // Get all existing flight risk entries
    const allScores = await db.select().from(flightRiskScores)

    let updated = 0

    for (const emp of allScores) {
      let newScore = 0
      const factors: Record<string, number> = {}

      // ── Factor 1: Pulse score (weight: 25) ────────────────────────────
      // Get latest pulse responses for this employee
      const pulseAvg = await db
        .select({ avgScore: avg(pulseResponses.score) })
        .from(pulseResponses)
        .where(and(
          eq(pulseResponses.employeeId, emp.employeeId),
          sql`${pulseResponses.respondedAt} > now() - interval '30 days'`
        ))

      const pulseScore = Number(pulseAvg[0]?.avgScore || 0)
      if (pulseScore > 0) {
        // Low pulse = high risk: 1/5 → +25, 5/5 → +0
        const pulseRisk = Math.round(Math.max(0, (5 - pulseScore) / 4 * 25))
        factors.low_pulse_score = pulseRisk
        newScore += pulseRisk
      }

      // ── Factor 2: Adaptation completion (weight: 15) ──────────────────
      const [adaptation] = await db
        .select({ pct: adaptationAssignments.completionPct })
        .from(adaptationAssignments)
        .where(eq(sql`${adaptationAssignments.employeeId}::text`, emp.employeeId))
        .orderBy(desc(adaptationAssignments.createdAt))
        .limit(1)

      if (adaptation) {
        const pct = adaptation.pct ?? 0
        if (pct < 50) {
          factors.failed_probation = 15
          newScore += 15
        } else if (pct < 80) {
          factors.failed_probation = 8
          newScore += 8
        }
      }

      // ── Factor 3: Skills assessment (weight: 15) ──────────────────────
      const skillScores = await db
        .select({ avgScore: avg(skillAssessments.score) })
        .from(skillAssessments)
        .innerJoin(assessments, eq(assessments.id, skillAssessments.assessmentId))
        .where(eq(assessments.employeeId, emp.employeeId))

      const skillAvg = Number(skillScores[0]?.avgScore || 0)
      if (skillAvg > 0 && skillAvg < 3) {
        factors.low_assessment = Math.round((3 - skillAvg) / 2 * 15)
        newScore += factors.low_assessment
      }

      // ── Factor 4: No training (weight: 10) ────────────────────────────
      const [enrollments] = await db
        .select({ cnt: count() })
        .from(courseEnrollments)
        .where(and(
          eq(courseEnrollments.employeeId, emp.employeeId),
          sql`${courseEnrollments.enrolledAt} > now() - interval '90 days'`
        ))

      if (Number(enrollments?.cnt || 0) === 0) {
        factors.no_training = 10
        newScore += 10
      }

      // ── Factor 5: Base factors from existing score (weight: 35) ───────
      // Keep some of the original score's "unknown" factors
      // (tenure, compensation, organizational — we don't have this data yet)
      const baseFactors = Math.round(emp.score * 0.35)
      factors.base_existing = baseFactors
      newScore += baseFactors

      // ── Clamp and determine level ─────────────────────────────────────
      newScore = Math.min(100, Math.max(0, newScore))
      const riskLevel =
        newScore >= 76 ? "critical" :
        newScore >= 51 ? "high" :
        newScore >= 26 ? "medium" : "low"

      // Determine trend
      const trend =
        newScore > emp.score + 5 ? "declining" :
        newScore < emp.score - 5 ? "improving" : "stable"

      // Update
      await db
        .update(flightRiskScores)
        .set({
          previousScore: emp.score,
          score: newScore,
          riskLevel,
          trend,
          factors,
          calculatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(flightRiskScores.id, emp.id))

      updated++
    }

    return NextResponse.json({ updated, total: allScores.length })
  } catch (err) {
    console.error("Recalculate flight risk error:", err)
    return NextResponse.json({ error: "Failed to recalculate" }, { status: 500 })
  }
}
