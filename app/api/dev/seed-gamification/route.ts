import { NextResponse } from "next/server"
import { eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { badges } from "@/lib/db/schema"

const SYSTEM_BADGES = [
  { slug: "first_step",      name: "Первый шаг",       icon: "🎯", points: 10,  description: "Выполните первый шаг адаптации" },
  { slug: "first_day",       name: "Первый день",       icon: "🌅", points: 25,  description: "Завершите первый день адаптации" },
  { slug: "quiz_master",     name: "Мастер тестов",     icon: "🧠", points: 50,  description: "Пройдите тест на 100%" },
  { slug: "streak_3",        name: "3 дня подряд",      icon: "🔥", points: 30,  description: "Активность 3 дня подряд" },
  { slug: "streak_7",        name: "Неделя огня",       icon: "⚡", points: 75,  description: "Активность 7 дней подряд" },
  { slug: "adaptation_done", name: "Адаптация пройдена",icon: "🏆", points: 200, description: "Завершите программу адаптации" },
  { slug: "helpful",         name: "Наставник",         icon: "🤝", points: 100, description: "Стать наставником для нового сотрудника" },
  { slug: "fast_learner",    name: "Быстрый ученик",    icon: "🚀", points: 150, description: "Наберите 500 очков" },
]

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Delete old system badges
  await db.delete(badges).where(isNull(badges.tenantId))

  // Insert fresh
  const inserted = await db.insert(badges).values(
    SYSTEM_BADGES.map(b => ({
      tenantId: null,
      slug: b.slug,
      name: b.name,
      description: b.description,
      icon: b.icon,
      points: b.points,
      condition: { type: b.slug },
    }))
  ).returning()

  return NextResponse.json({ ok: true, count: inserted.length, badges: inserted.map(b => b.slug) })
}
