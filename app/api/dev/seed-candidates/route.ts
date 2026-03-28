import { NextResponse } from "next/server"
import { eq, and, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, users } from "@/lib/db/schema"
import { generateCandidateToken } from "@/lib/candidate-tokens"

// POST /api/dev/seed-candidates — только в development
// Генерирует 300 демо-кандидатов для первой вакансии компании

const FIRST_NAMES = [
  "Александр", "Дмитрий", "Максим", "Сергей", "Андрей",
  "Алексей", "Артём", "Илья", "Кирилл", "Михаил",
  "Никита", "Роман", "Павел", "Евгений", "Владимир",
  "Иван", "Фёдор", "Денис", "Виктор", "Тимур",
  "Анна", "Мария", "Елена", "Ольга", "Наталья",
  "Татьяна", "Екатерина", "Юлия", "Светлана", "Ирина",
  "Наталия", "Валерия", "Дарья", "Полина", "Алина",
  "Вера", "Галина", "Людмила", "Нина", "Жанна",
  "Антон", "Константин", "Леонид", "Станислав", "Валентин",
  "Пётр", "Борис", "Геннадий", "Олег", "Владислав",
]

const LAST_NAMES = [
  "Иванов", "Петров", "Сидоров", "Смирнов", "Кузнецов",
  "Попов", "Васильев", "Соколов", "Михайлов", "Новиков",
  "Федоров", "Морозов", "Волков", "Алексеев", "Лебедев",
  "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов",
  "Николаев", "Орлов", "Андреев", "Макаров", "Никитин",
  "Захаров", "Зайцев", "Соловьёв", "Борисов", "Яковлев",
  "Григорьев", "Романов", "Воробьёв", "Герасимов", "Тимофеев",
  "Виноградов", "Кузьмин", "Титов", "Ершов", "Кириллов",
  "Белов", "Жуков", "Комаров", "Беляев", "Баранов",
  "Фролов", "Гусев", "Матвеев", "Чернов", "Данилов",
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function weighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function randomPhone(): string {
  const d = () => Math.floor(Math.random() * 10)
  return `+7 9${d()}${d()} ${d()}${d()}${d}-${d()}${d}-${d()}${d()}`
}

function randomDate(daysBack: number): Date {
  const ms = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000)
  return new Date(Date.now() - ms)
}

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Берём первого пользователя с компанией
  const [userRow] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.companyId)))
    .limit(1)

  if (!userRow?.companyId) {
    return NextResponse.json({ error: "Нет компании в БД. Сначала выполните /api/dev/login" }, { status: 400 })
  }

  // Первая вакансия компании
  const [vacancy] = await db
    .select({ id: vacancies.id, title: vacancies.title })
    .from(vacancies)
    .where(eq(vacancies.companyId, userRow.companyId))
    .limit(1)

  if (!vacancy) {
    return NextResponse.json({ error: "Нет вакансий. Создайте хотя бы одну." }, { status: 400 })
  }

  // Удаляем существующих кандидатов этой вакансии
  await db.delete(candidates).where(eq(candidates.vacancyId, vacancy.id))

  const STAGES = ["new", "demo", "scheduled", "interviewed", "hired", "rejected"]
  const STAGE_WEIGHTS = [40, 25, 15, 10, 5, 5]

  const SOURCES = ["hh", "avito", "referral", "telegram", "site"]
  const SOURCE_WEIGHTS = [40, 20, 15, 15, 10]

  const batch = Array.from({ length: 300 }, () => {
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    // Склоняем фамилию для женских имён (простая эвристика — имена оканчивающиеся на "а" или "я")
    const isFemale = firstName.endsWith("а") || firstName.endsWith("я")
    const surname = isFemale
      ? lastName.endsWith("ов") ? lastName.slice(0, -2) + "ова"
        : lastName.endsWith("ев") ? lastName.slice(0, -2) + "ева"
        : lastName.endsWith("ин") ? lastName + "а"
        : lastName
      : lastName

    const name = `${surname} ${firstName}`
    const emailFirst = firstName.toLowerCase()
      .replace(/ё/g, "e").replace(/й/g, "y").replace(/ъ/g, "").replace(/ь/g, "")
      .replace(/[^a-z]/g, "x")
    const emailLast = surname.toLowerCase()
      .replace(/ё/g, "e").replace(/й/g, "y").replace(/ъ/g, "").replace(/ь/g, "")
      .replace(/[^a-z]/g, "x")
    const email = `${emailFirst}.${emailLast}@example.com`

    const stage = weighted(STAGES, STAGE_WEIGHTS)
    const source = weighted(SOURCES, SOURCE_WEIGHTS)
    const score = Math.floor(Math.random() * 5) + 1
    const createdAt = randomDate(30)

    return {
      vacancyId: vacancy.id,
      name,
      phone: randomPhone(),
      email,
      source,
      stage,
      score: score * 20,   // score в БД 0–100, показываем как 1–5
      token: generateCandidateToken(),
      createdAt,
      updatedAt: createdAt,
    }
  })

  // Вставляем батчами по 50 (avoid query size limits)
  for (let i = 0; i < batch.length; i += 50) {
    await db.insert(candidates).values(batch.slice(i, i + 50))
  }

  return NextResponse.json({
    ok: true,
    vacancyId: vacancy.id,
    vacancyTitle: vacancy.title,
    count: batch.length,
  })
}
