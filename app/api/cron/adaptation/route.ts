import { NextRequest, NextResponse } from "next/server"
import { eq, and, isNull, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { adaptationAssignments, adaptationSteps, stepCompletions, adaptationPlans } from "@/lib/db/schema"

// POST /api/cron/adaptation
// Protected by X-Cron-Secret header
export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  let sent = 0
  let advanced = 0

  try {
    // Get all active assignments
    const assignments = await db
      .select({ a: adaptationAssignments })
      .from(adaptationAssignments)
      .where(eq(adaptationAssignments.status, "active"))

    for (const { a } of assignments) {
      const currentDay = a.currentDay ?? 1

      // Get steps for currentDay
      const steps = await db
        .select()
        .from(adaptationSteps)
        .where(and(
          eq(adaptationSteps.planId, a.planId),
          eq(adaptationSteps.dayNumber, currentDay),
        ))

      if (steps.length === 0) {
        // No steps for this day — advance to next day
        await db
          .update(adaptationAssignments)
          .set({ currentDay: currentDay + 1, updatedAt: now })
          .where(eq(adaptationAssignments.id, a.id))
        advanced++
        continue
      }

      // Find which steps already have completions
      const existingCompletions = await db
        .select({ stepId: stepCompletions.stepId })
        .from(stepCompletions)
        .where(and(
          eq(stepCompletions.assignmentId, a.id),
          inArray(stepCompletions.stepId, steps.map(s => s.id)),
        ))

      const existingStepIds = new Set(existingCompletions.map(c => c.stepId))
      const pendingSteps = steps.filter(s => !existingStepIds.has(s.id))

      if (pendingSteps.length === 0) {
        // All steps for today already have completions — advance
        const allDone = await db
          .select({ stepId: stepCompletions.stepId })
          .from(stepCompletions)
          .where(and(
            eq(stepCompletions.assignmentId, a.id),
            inArray(stepCompletions.stepId, steps.map(s => s.id)),
            eq(stepCompletions.status, "completed"),
          ))

        if (allDone.length === steps.length) {
          await db
            .update(adaptationAssignments)
            .set({ currentDay: currentDay + 1, updatedAt: now })
            .where(eq(adaptationAssignments.id, a.id))
          advanced++
        }
        continue
      }

      // Create "sent" completions for pending steps
      // TODO: реальная отправка в Telegram/email
      for (const step of pendingSteps) {
        await db
          .insert(stepCompletions)
          .values({
            assignmentId: a.id,
            stepId:       step.id,
            status:       "sent",
            sentAt:       now,
          })
          .onConflictDoNothing()
        sent++
      }

      // Recalculate completionPct
      const totalSteps = a.totalSteps ?? steps.length
      const [doneRow] = await db
        .select()
        .from(stepCompletions)
        .where(and(
          eq(stepCompletions.assignmentId, a.id),
          eq(stepCompletions.status, "completed"),
        ))
        .limit(1)

      // Count completed
      const completedCount = await db
        .select()
        .from(stepCompletions)
        .where(and(
          eq(stepCompletions.assignmentId, a.id),
          eq(stepCompletions.status, "completed"),
        ))

      const completionPct = totalSteps > 0
        ? Math.round((completedCount.length / totalSteps) * 100)
        : 0

      await db
        .update(adaptationAssignments)
        .set({ completionPct, completedSteps: completedCount.length, updatedAt: now })
        .where(eq(adaptationAssignments.id, a.id))
    }

    return NextResponse.json({
      ok:       true,
      processed: assignments.length,
      sent,
      advanced,
      ts:       now.toISOString(),
    })
  } catch (err) {
    console.error("[cron/adaptation]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
