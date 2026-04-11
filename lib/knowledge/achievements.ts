import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { userAchievements, users } from "@/lib/db/schema"

// Геймификация: начисление баллов + лидерборд.
//
// Баллы:
//   lesson        → +10  (прохождение урока)
//   course        → +50  (завершение курса)
//   test_perfect  → +30  (тест со 100% результатом)
//   training      → +20  (завершение тренировки)
//
// awardPoints не дублирует начисления, если передан sourceId (уникальная
// комбинация tenant+user+type+sourceId).

export type AchievementType = "lesson" | "course" | "test_perfect" | "training"

export const POINTS_BY_TYPE: Record<AchievementType, number> = {
  lesson: 10,
  course: 50,
  test_perfect: 30,
  training: 20,
}

export async function awardPoints(
  tenantId: string,
  userId: string,
  type: AchievementType,
  sourceId?: string | null,
  note?: string | null,
): Promise<{ awarded: boolean; points: number }> {
  const points = POINTS_BY_TYPE[type]

  // Идемпотентность по sourceId — нельзя получить одно и то же дважды
  if (sourceId) {
    const [existing] = await db
      .select({ id: userAchievements.id })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.tenantId, tenantId),
          eq(userAchievements.userId, userId),
          eq(userAchievements.type, type),
          eq(userAchievements.sourceId, sourceId),
        ),
      )
      .limit(1)
    if (existing) return { awarded: false, points: 0 }
  }

  await db.insert(userAchievements).values({
    tenantId,
    userId,
    type,
    points,
    sourceId: sourceId ?? null,
    note: note ?? null,
  })

  return { awarded: true, points }
}

export interface LeaderboardEntry {
  userId: string
  name: string
  position: string | null
  totalPoints: number
  lessons: number
  courses: number
  tests: number
  trainings: number
}

export async function getLeaderboard(
  tenantId: string,
  limit: number = 5,
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: userAchievements.userId,
      name: users.name,
      position: users.position,
      totalPoints: sql<number>`sum(${userAchievements.points})::int`,
      lessons: sql<number>`sum(case when ${userAchievements.type} = 'lesson' then 1 else 0 end)::int`,
      courses: sql<number>`sum(case when ${userAchievements.type} = 'course' then 1 else 0 end)::int`,
      tests: sql<number>`sum(case when ${userAchievements.type} = 'test_perfect' then 1 else 0 end)::int`,
      trainings: sql<number>`sum(case when ${userAchievements.type} = 'training' then 1 else 0 end)::int`,
    })
    .from(userAchievements)
    .leftJoin(users, eq(users.id, userAchievements.userId))
    .where(eq(userAchievements.tenantId, tenantId))
    .groupBy(userAchievements.userId, users.name, users.position)
    .orderBy(desc(sql`sum(${userAchievements.points})`))
    .limit(limit)

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? "—",
    position: r.position ?? null,
    totalPoints: Number(r.totalPoints ?? 0),
    lessons: Number(r.lessons ?? 0),
    courses: Number(r.courses ?? 0),
    tests: Number(r.tests ?? 0),
    trainings: Number(r.trainings ?? 0),
  }))
}
