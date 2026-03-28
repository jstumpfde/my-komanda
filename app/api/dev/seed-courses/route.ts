import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import { courses, lessons } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  let user: { companyId: string; id?: string }
  try { user = await requireCompany() } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  // Check if already seeded
  const existing = await db.select({ id: courses.id }).from(courses)
    .where(eq(courses.tenantId, user.companyId))

  if (existing.length > 0) {
    return NextResponse.json({ message: "Already seeded", count: existing.length })
  }

  const userId = (user as { id?: string }).id || null

  // Course 1: Продукт компании
  const [c1] = await db.insert(courses).values({
    tenantId: user.companyId,
    title: "Продукт компании",
    description: "Базовый курс о продукте, миссии и ценностях компании. Обязателен для всех новых сотрудников.",
    category: "product",
    difficulty: "beginner",
    durationMin: 60,
    isPublished: true,
    isRequired: true,
    sortOrder: 0,
    createdBy: userId,
  }).returning()

  await db.insert(lessons).values([
    { courseId: c1.id, title: "О компании", sortOrder: 0, type: "content", durationMin: 10, content: { text: "История, миссия и ценности компании." } },
    { courseId: c1.id, title: "Наш продукт", sortOrder: 1, type: "content", durationMin: 15, content: { text: "Обзор продукта и ключевых функций." } },
    { courseId: c1.id, title: "Клиенты и рынок", sortOrder: 2, type: "content", durationMin: 10, content: { text: "Целевая аудитория и конкурентная среда." } },
    { courseId: c1.id, title: "Процессы и инструменты", sortOrder: 3, type: "content", durationMin: 15, content: { text: "Внутренние процессы, инструменты и системы." } },
    { courseId: c1.id, title: "Проверка знаний", sortOrder: 4, type: "quiz", durationMin: 10, content: {
      questions: [
        { q: "В каком году основана компания?", options: ["2018", "2019", "2020", "2021"], answer: 1 },
        { q: "Сколько сотрудников в компании?", options: ["10-50", "50-200", "200-500", "500+"], answer: 1 },
      ]
    }},
  ])

  // Course 2: Техника продаж B2B
  const [c2] = await db.insert(courses).values({
    tenantId: user.companyId,
    title: "Техника продаж B2B",
    description: "Практический курс по корпоративным продажам: от квалификации лида до закрытия сделки.",
    category: "sales",
    difficulty: "intermediate",
    durationMin: 105,
    isPublished: true,
    isRequired: false,
    sortOrder: 1,
    createdBy: userId,
  }).returning()

  await db.insert(lessons).values([
    { courseId: c2.id, title: "Воронка B2B продаж", sortOrder: 0, type: "content", durationMin: 15, content: { text: "Этапы B2B воронки и ключевые метрики." } },
    { courseId: c2.id, title: "Квалификация лида (BANT)", sortOrder: 1, type: "content", durationMin: 15, content: { text: "Метод BANT: Budget, Authority, Need, Timeline." } },
    { courseId: c2.id, title: "Выявление потребностей (SPIN)", sortOrder: 2, type: "content", durationMin: 20, content: { text: "SPIN-методология: Situation, Problem, Implication, Need-Payoff." } },
    { courseId: c2.id, title: "Работа с возражениями", sortOrder: 3, type: "content", durationMin: 15, content: { text: "Техники работы с типичными возражениями клиентов." } },
    { courseId: c2.id, title: "Переговоры и закрытие", sortOrder: 4, type: "content", durationMin: 20, content: { text: "Техники закрытия сделок и согласования условий." } },
    { courseId: c2.id, title: "CRM и отчётность", sortOrder: 5, type: "content", durationMin: 10, content: { text: "Работа в CRM-системе, ведение сделок и отчёты." } },
    { courseId: c2.id, title: "Финальный тест", sortOrder: 6, type: "quiz", durationMin: 10, content: {
      questions: [
        { q: "Что означает буква A в BANT?", options: ["Amount", "Authority", "Availability", "Approval"], answer: 1 },
        { q: "На каком этапе выявляются бизнес-потребности?", options: ["Лид", "Квалификация", "Презентация", "Закрытие"], answer: 1 },
      ]
    }},
  ])

  return NextResponse.json({ seeded: 2, courses: [c1.id, c2.id] })
}
