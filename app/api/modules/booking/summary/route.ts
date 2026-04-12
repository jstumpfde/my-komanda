import { NextRequest } from "next/server"
import { eq, and, gte, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings } from "@/lib/db/schema"
import { requireCompany, apiError, apiSuccess } from "@/lib/api-helpers"

export async function GET(_req: NextRequest) {
  try {
    const user = await requireCompany()
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    // Начало недели (пн)
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + mondayOffset)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    // Начало месяца
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const base = eq(bookings.tenantId, user.companyId)

    // Записей сегодня
    const [todayResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(base, eq(bookings.date, today), eq(bookings.status, "confirmed")))

    // На этой неделе
    const [weekResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(
        base,
        gte(bookings.date, weekStart.toISOString().slice(0, 10)),
        lte(bookings.date, weekEnd.toISOString().slice(0, 10)),
        eq(bookings.status, "confirmed"),
      ))

    // Выручка за месяц (completed + isPaid)
    const [revenueResult] = await db
      .select({ total: sql<number>`coalesce(sum(${bookings.price}), 0)::int` })
      .from(bookings)
      .where(and(
        base,
        gte(bookings.date, monthStart.toISOString().slice(0, 10)),
        lte(bookings.date, monthEnd.toISOString().slice(0, 10)),
        eq(bookings.status, "completed"),
      ))

    // Отмены за месяц
    const [cancelledResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(
        base,
        gte(bookings.date, monthStart.toISOString().slice(0, 10)),
        lte(bookings.date, monthEnd.toISOString().slice(0, 10)),
        eq(bookings.status, "cancelled"),
      ))

    const [totalMonthResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(
        base,
        gte(bookings.date, monthStart.toISOString().slice(0, 10)),
        lte(bookings.date, monthEnd.toISOString().slice(0, 10)),
      ))

    const cancelPct = (totalMonthResult?.count ?? 0) > 0
      ? Math.round(((cancelledResult?.count ?? 0) / (totalMonthResult?.count ?? 1)) * 100)
      : 0

    return apiSuccess({
      todayCount: todayResult?.count ?? 0,
      weekCount: weekResult?.count ?? 0,
      monthRevenue: revenueResult?.total ?? 0,
      cancelPct,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return apiError("Internal server error", 500)
  }
}
