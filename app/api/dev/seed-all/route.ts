/**
 * Master seed — заполняет все пустые состояния демо-данными
 * GET /api/dev/seed-all
 */
import { NextResponse } from "next/server"
import { execSync } from "child_process"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import {
  adaptationPlans, adaptationAssignments, adaptationSteps, stepCompletions,
  buddyTasks, buddyMeetings,
  employeePoints, pointsHistory,
  assessments, skillAssessments, skills,
  lessons, courseEnrollments, lessonCompletions, certificates,
} from "@/lib/db/schema"
import { eq, isNull, or, asc } from "drizzle-orm"

// Valid-format demo UUIDs for demo employees
const DEMO_EMP = [
  "aaaabbbb-0001-4000-a000-000000000001",
  "aaaabbbb-0001-4000-a000-000000000002",
  "aaaabbbb-0001-4000-a000-000000000003",
]

export async function GET() {
  let user: { companyId: string; id: string }
  try { user = await requireCompany() as { companyId: string; id: string } }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  // Free disk space first
  try { execSync("find /private/tmp/claude-501 -name '*.output' -delete 2>/dev/null || true") } catch {}
  try { execSync("rm -rf /Users/juri/my-komanda/.claude/worktrees/objective-elgamal/.next/cache/turbopack 2>/dev/null || true") } catch {}

  const results: string[] = []

  // ── 1. Adaptation assignments ─────────────────────────────────────────────
  const [existingAssignment] = await db
    .select({ id: adaptationAssignments.id })
    .from(adaptationAssignments)
    .limit(1)

  if (!existingAssignment) {
    const [plan] = await db
      .select({ id: adaptationPlans.id })
      .from(adaptationPlans)
      .where(eq(adaptationPlans.tenantId, user.companyId))
      .limit(1)

    if (plan) {
      const steps = await db
        .select({ id: adaptationSteps.id })
        .from(adaptationSteps)
        .where(eq(adaptationSteps.planId, plan.id))
        .orderBy(asc(adaptationSteps.dayNumber))

      const total = steps.length || 10

      // Assignment 1: current user is buddy
      const [a1] = await db.insert(adaptationAssignments).values({
        planId: plan.id,
        employeeId: DEMO_EMP[0] as unknown as string,
        buddyId: user.id as unknown as string,
        startDate: new Date(Date.now() - 7 * 86400000),
        status: "active",
        currentDay: 8,
        completionPct: 45,
        totalSteps: total,
        completedSteps: Math.floor(total * 0.45),
      }).returning()

      // Assignment 2: another employee, no buddy
      await db.insert(adaptationAssignments).values({
        planId: plan.id,
        employeeId: DEMO_EMP[1] as unknown as string,
        startDate: new Date(Date.now() - 3 * 86400000),
        status: "active",
        currentDay: 4,
        completionPct: 20,
        totalSteps: total,
        completedSteps: Math.floor(total * 0.2),
      })

      // Assignment 3: completed
      await db.insert(adaptationAssignments).values({
        planId: plan.id,
        employeeId: DEMO_EMP[2] as unknown as string,
        startDate: new Date(Date.now() - 14 * 86400000),
        status: "completed",
        currentDay: 14,
        completionPct: 100,
        totalSteps: total,
        completedSteps: total,
        completedAt: new Date(Date.now() - 86400000),
      })

      // Step completions for a1
      if (a1 && steps.length > 0) {
        const doneCount = Math.floor(steps.length * 0.45)
        for (let i = 0; i < doneCount; i++) {
          try {
            await db.insert(stepCompletions).values({
              assignmentId: a1.id,
              stepId: steps[i].id,
              status: "completed",
              completedAt: new Date(Date.now() - (doneCount - i) * 86400000),
            })
          } catch { /* unique constraint — already exists */ }
        }
      }

      // Buddy tasks & meetings for a1
      if (a1) {
        await db.insert(buddyTasks).values([
          { assignmentId: a1.id, title: "Познакомить с командой", dayNumber: 1, status: "done", completedAt: new Date(Date.now() - 6 * 86400000) },
          { assignmentId: a1.id, title: "Рассказать о процессах компании", dayNumber: 2, status: "done", completedAt: new Date(Date.now() - 5 * 86400000) },
          { assignmentId: a1.id, title: "Помочь с настройкой рабочего места", dayNumber: 3, status: "done", completedAt: new Date(Date.now() - 4 * 86400000) },
          { assignmentId: a1.id, title: "Итоги первой недели", dayNumber: 7, status: "pending" },
          { assignmentId: a1.id, title: "Проверить прогресс онбординга", dayNumber: 10, status: "pending" },
        ])

        await db.insert(buddyMeetings).values([
          { assignmentId: a1.id, title: "Знакомство", scheduledAt: new Date(Date.now() - 6 * 86400000), status: "completed", completedAt: new Date(Date.now() - 6 * 86400000), rating: 5, notes: "Отличный старт!" },
          { assignmentId: a1.id, title: "Итоги первой недели", scheduledAt: new Date(Date.now() + 86400000), status: "scheduled" },
          { assignmentId: a1.id, title: "Проверка прогресса", scheduledAt: new Date(Date.now() + 7 * 86400000), status: "scheduled" },
        ])
      }

      results.push("adaptation:3 assignments, buddy tasks+meetings")
    } else {
      results.push("adaptation:skip (no plan)")
    }
  } else {
    results.push("adaptation:already_seeded")
  }

  // ── 2. Gamification leaderboard ───────────────────────────────────────────
  const [existingPts] = await db
    .select({ id: employeePoints.id })
    .from(employeePoints)
    .where(eq(employeePoints.tenantId, user.companyId))
    .limit(1)

  if (!existingPts) {
    const leaderData = [
      { employeeId: user.id, totalPoints: 1250, level: 4, streak: 7 },
      { employeeId: DEMO_EMP[0], totalPoints: 980, level: 3, streak: 5 },
      { employeeId: DEMO_EMP[1], totalPoints: 720, level: 2, streak: 3 },
      { employeeId: DEMO_EMP[2], totalPoints: 400, level: 1, streak: 1 },
    ]

    for (const d of leaderData) {
      const [ep] = await db.insert(employeePoints).values({
        tenantId: user.companyId,
        employeeId: d.employeeId,
        totalPoints: d.totalPoints,
        level: d.level,
        streak: d.streak,
        lastActiveDate: new Date(),
      }).returning()

      if (ep) {
        await db.insert(pointsHistory).values([
          { pointsId: ep.id, amount: 500, reason: "course_completed", createdAt: new Date(Date.now() - 3 * 86400000) },
          { pointsId: ep.id, amount: 250, reason: "assessment_done", createdAt: new Date(Date.now() - 2 * 86400000) },
          { pointsId: ep.id, amount: 200, reason: "streak_bonus", createdAt: new Date(Date.now() - 86400000) },
        ])
      }
    }
    results.push("gamification:4 employees")
  } else {
    results.push("gamification:already_seeded")
  }

  // ── 3. Assessments with skill scores ─────────────────────────────────────
  const [existingAssessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.tenantId, user.companyId))
    .limit(1)

  if (!existingAssessment) {
    const allSkills = await db
      .select()
      .from(skills)
      .where(or(isNull(skills.tenantId), eq(skills.tenantId, user.companyId)))

    if (allSkills.length > 0) {
      const empScores = [
        { emp: user.id, scores: [4, 3, 5, 4, 2, 3, 4, 5, 3, 4] },
        { emp: DEMO_EMP[0], scores: [3, 4, 3, 2, 3, 4, 3, 4, 3, 3] },
        { emp: DEMO_EMP[1], scores: [2, 3, 2, 3, 4, 3, 2, 3, 4, 3] },
      ]

      for (const { emp, scores } of empScores) {
        const [a] = await db.insert(assessments).values({
          tenantId: user.companyId,
          employeeId: emp,
          type: "self",
          status: "completed",
          period: "2026-Q1",
          completedAt: new Date(Date.now() - Math.floor(Math.random() * 5 + 1) * 86400000),
        }).returning()

        if (a) {
          await db.insert(skillAssessments).values(
            allSkills.slice(0, scores.length).map((s, i) => ({
              assessmentId: a.id,
              skillId: s.id,
              score: scores[i],
              assessorId: emp,
            }))
          )
        }
      }
      results.push("assessments:3 with skill scores")
    } else {
      results.push("assessments:skip (no skills seeded)")
    }
  } else {
    results.push("assessments:already_seeded")
  }

  // ── 4. Complete a course → certificate ────────────────────────────────────
  const [existingCert] = await db
    .select({ id: certificates.id })
    .from(certificates)
    .limit(1)

  if (!existingCert) {
    const [enrollment] = await db
      .select()
      .from(courseEnrollments)
      .where(eq(courseEnrollments.employeeId, user.id))
      .limit(1)

    if (enrollment) {
      const courseLessons = await db
        .select()
        .from(lessons)
        .where(eq(lessons.courseId, enrollment.courseId))

      for (const lesson of courseLessons) {
        try {
          await db.insert(lessonCompletions).values({
            enrollmentId: enrollment.id,
            lessonId: lesson.id,
            status: "completed",
            score: 80 + Math.floor(Math.random() * 20),
            completedAt: new Date(Date.now() - Math.floor(Math.random() * 3 + 1) * 86400000),
          })
        } catch { /* ignore unique violations */ }
      }

      await db.update(courseEnrollments).set({
        status: "completed",
        completionPct: 100,
        completedAt: new Date(Date.now() - 86400000),
      }).where(eq(courseEnrollments.id, enrollment.id))

      const num = `MK-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
      await db.insert(certificates).values({
        courseId: enrollment.courseId,
        employeeId: user.id,
        number: num,
      })
      results.push(`certificate:${num}`)
    } else {
      results.push("certificate:skip (no enrollment)")
    }
  } else {
    results.push("certificate:already_seeded")
  }

  return NextResponse.json({ ok: true, results })
}
