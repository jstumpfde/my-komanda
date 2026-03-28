import { eq, and, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { employeePoints, pointsHistory, badges, employeeBadges, companies } from "@/lib/db/schema"

// ─── Constants ────────────────────────────────────────────────────────────────

export const POINT_RULES: Record<string, number> = {
  step_completed:      10,
  quiz_passed:         25,
  quiz_perfect:        50,
  task_submitted:      15,
  video_watched:        5,
  course_finished:    100,
  streak_3:            30,
  streak_7:            75,
  adaptation_completed:200,
}

export const LEVELS = [
  { level: 1, name: "Новичок",     min: 0 },
  { level: 2, name: "Ученик",      min: 100 },
  { level: 3, name: "Специалист",  min: 300 },
  { level: 4, name: "Профессионал",min: 700 },
  { level: 5, name: "Эксперт",     min: 1500 },
  { level: 6, name: "Мастер",      min: 3000 },
]

export function calcLevel(points: number): number {
  let level = 1
  for (const l of LEVELS) {
    if (points >= l.min) level = l.level
  }
  return level
}

export function nextLevelPoints(points: number): number {
  const current = calcLevel(points)
  const next = LEVELS.find(l => l.level === current + 1)
  return next ? next.min : LEVELS[LEVELS.length - 1].min
}

export function levelInfo(level: number) {
  return LEVELS.find(l => l.level === level) ?? LEVELS[0]
}

// ─── Badge conditions ─────────────────────────────────────────────────────────

const BADGE_CHECKS: Record<string, (opts: {
  reason: string
  totalPoints: number
  streak: number
  completedSteps?: number
}) => boolean> = {
  first_step:       ({ reason }) => reason === "step_completed",
  first_day:        ({ totalPoints }) => totalPoints >= 10,
  quiz_master:      ({ reason }) => reason === "quiz_perfect",
  streak_3:         ({ streak }) => streak >= 3,
  streak_7:         ({ streak }) => streak >= 7,
  adaptation_done:  ({ reason }) => reason === "adaptation_completed",
  helpful:          ({ reason }) => reason === "buddy_assigned",
  fast_learner:     ({ totalPoints }) => totalPoints >= 500,
}

// ─── Core function ────────────────────────────────────────────────────────────

export async function awardPoints(
  tenantId: string,
  employeeId: string,
  reason: string,
  sourceType?: string,
  sourceId?: string,
): Promise<{ points: number; newLevel: number; newBadges: string[] }> {
  const amount = POINT_RULES[reason] ?? 0
  if (amount === 0) return { points: 0, newLevel: 1, newBadges: [] }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get or create employee_points row
  let [ep] = await db
    .select()
    .from(employeePoints)
    .where(and(eq(employeePoints.tenantId, tenantId), eq(employeePoints.employeeId, employeeId)))
    .limit(1)

  if (!ep) {
    const [inserted] = await db.insert(employeePoints).values({
      tenantId, employeeId, totalPoints: 0, level: 1, streak: 0,
    }).returning()
    ep = inserted
  }

  // Streak logic
  let newStreak = ep.streak ?? 0
  const lastActive = ep.lastActiveDate ? new Date(ep.lastActiveDate) : null
  if (lastActive) {
    lastActive.setHours(0, 0, 0, 0)
    const diff = Math.floor((today.getTime() - lastActive.getTime()) / 86400000)
    if (diff === 1) newStreak += 1
    else if (diff > 1) newStreak = 1
    // diff === 0: same day, keep streak
  } else {
    newStreak = 1
  }

  const newTotal = (ep.totalPoints ?? 0) + amount
  const newLevel = calcLevel(newTotal)

  await db
    .update(employeePoints)
    .set({ totalPoints: newTotal, level: newLevel, streak: newStreak, lastActiveDate: today })
    .where(eq(employeePoints.id, ep.id))

  // Record history
  await db.insert(pointsHistory).values({
    pointsId: ep.id, amount, reason, sourceType: sourceType ?? null, sourceId: sourceId ?? null,
  })

  // Streak bonus
  if (newStreak === 3) {
    await db.insert(pointsHistory).values({ pointsId: ep.id, amount: POINT_RULES.streak_3, reason: "streak_3" })
    await db.update(employeePoints).set({ totalPoints: newTotal + POINT_RULES.streak_3 }).where(eq(employeePoints.id, ep.id))
  } else if (newStreak === 7) {
    await db.insert(pointsHistory).values({ pointsId: ep.id, amount: POINT_RULES.streak_7, reason: "streak_7" })
    await db.update(employeePoints).set({ totalPoints: newTotal + POINT_RULES.streak_7 }).where(eq(employeePoints.id, ep.id))
  }

  // Check badges
  const newBadges: string[] = []
  const allBadges = await db
    .select()
    .from(badges)
    .where(eq(badges.tenantId, tenantId))

  // Also system badges (tenantId = null)
  const systemBadges = await db
    .select()
    .from(badges)
    .where(eq(badges.tenantId, null as unknown as string))

  const earnedBadgeIds = (await db
    .select({ badgeId: employeeBadges.badgeId })
    .from(employeeBadges)
    .where(eq(employeeBadges.pointsId, ep.id))
  ).map(r => r.badgeId)

  for (const badge of [...systemBadges, ...allBadges]) {
    if (earnedBadgeIds.includes(badge.id)) continue
    const check = BADGE_CHECKS[badge.slug]
    if (!check) continue
    if (check({ reason, totalPoints: newTotal, streak: newStreak })) {
      await db.insert(employeeBadges).values({ pointsId: ep.id, badgeId: badge.id }).catch(() => {})
      newBadges.push(badge.slug)
    }
  }

  return { points: amount, newLevel, newBadges }
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export async function getEmployeeProgress(tenantId: string, employeeId: string) {
  const [ep] = await db
    .select()
    .from(employeePoints)
    .where(and(eq(employeePoints.tenantId, tenantId), eq(employeePoints.employeeId, employeeId)))
    .limit(1)

  if (!ep) return null

  const earnedBadges = await db
    .select({ badge: badges, earnedAt: employeeBadges.earnedAt })
    .from(employeeBadges)
    .innerJoin(badges, eq(employeeBadges.badgeId, badges.id))
    .where(eq(employeeBadges.pointsId, ep.id))
    .orderBy(desc(employeeBadges.earnedAt))

  const history = await db
    .select()
    .from(pointsHistory)
    .where(eq(pointsHistory.pointsId, ep.id))
    .orderBy(desc(pointsHistory.createdAt))
    .limit(10)

  const total = ep.totalPoints ?? 0
  const level = ep.level ?? 1
  const next = nextLevelPoints(total)
  const current = LEVELS.find(l => l.level === level)?.min ?? 0

  return {
    ...ep,
    levelName: levelInfo(level).name,
    nextLevelPoints: next,
    currentLevelMin: current,
    progressToNext: next > current ? Math.round(((total - current) / (next - current)) * 100) : 100,
    earnedBadges,
    history,
  }
}

export async function getLeaderboard(tenantId: string, limit = 10) {
  const rows = await db
    .select()
    .from(employeePoints)
    .where(eq(employeePoints.tenantId, tenantId))
    .orderBy(desc(employeePoints.totalPoints))
    .limit(limit)

  return rows.map((r, i) => ({
    rank: i + 1,
    ...r,
    levelName: levelInfo(r.level ?? 1).name,
  }))
}
