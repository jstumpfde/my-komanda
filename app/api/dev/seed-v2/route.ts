/**
 * Seed v2 — реалистичные демо-данные для smoke-теста
 * GET /api/dev/seed-v2
 *
 * Создаёт:
 * - 3 вакансии
 * - 20 кандидатов (по вакансиям, разные стадии)
 * - 2 плана адаптации (с шагами)
 * - 5 назначений адаптации
 * - 1 курс с 5 уроками
 * - 5 зачислений на курс
 * - 2 сертификата
 */
import { NextResponse } from "next/server"
import { requireCompany } from "@/lib/api-helpers"
import { db } from "@/lib/db"
import {
  vacancies, candidates,
  adaptationPlans, adaptationSteps, adaptationAssignments, stepCompletions,
  courses, lessons, courseEnrollments, lessonCompletions, certificates,
  companies, users,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { randomBytes } from "crypto"

const DEV_MODE = process.env.ALLOW_DEV_LOGIN === "true"

function token() { return randomBytes(16).toString("hex") }
function certNum() {
  return "MK-2026-" + Math.floor(10000 + Math.random() * 90000)
}
function slug(title: string, suffix: string) {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",
    й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",
    у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",
    э:"e",ю:"yu",я:"ya"," ":"-",
  }
  return title.toLowerCase().split("").map(c => map[c] ?? c).join("")
    .replace(/[^a-z0-9-]/g,"").replace(/-+/g,"-").replace(/^-|-$/g,"")
    + "-" + suffix
}

const STAGES = ["new","screening","demo","interview","offer","hired","rejected"] as const
const SOURCES = ["hh","avito","telegram","site","referral","manual"]
const CITIES = ["Москва","Санкт-Петербург","Казань","Новосибирск","Екатеринбург"]

export async function GET() {
  let user: { companyId: string; id: string }
  if (DEV_MODE) {
    // В dev-режиме берём первую компанию и первого пользователя из БД
    const [company] = await db.select({ id: companies.id }).from(companies).limit(1)
    const [u] = await db.select({ id: users.id }).from(users).limit(1)
    if (!company || !u) {
      return NextResponse.json({ error: "No company/user in DB. Run /api/dev/login first." }, { status: 400 })
    }
    user = { companyId: company.id, id: u.id }
  } else {
    try { user = await requireCompany() as { companyId: string; id: string } }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const cId = user.companyId
  const uId = user.id
  const results: string[] = []

  // ── 1. Вакансии ─────────────────────────────────────────────────────────────
  const vacancyDefs = [
    {
      title: "Менеджер по продажам",
      city: "Москва",
      format: "hybrid",
      employment: "full",
      category: "sales",
      salaryMin: 80000, salaryMax: 150000,
      status: "published",
    },
    {
      title: "HR-менеджер",
      city: "Санкт-Петербург",
      format: "remote",
      employment: "full",
      category: "hr",
      salaryMin: 70000, salaryMax: 120000,
      status: "published",
    },
    {
      title: "Разработчик Python",
      city: "Екатеринбург",
      format: "remote",
      employment: "full",
      category: "tech",
      salaryMin: 150000, salaryMax: 250000,
      status: "draft",
    },
  ]

  const createdVacancies = []
  for (const v of vacancyDefs) {
    const [existing] = await db.select({ id: vacancies.id })
      .from(vacancies)
      .where(eq(vacancies.companyId, cId))
      .limit(1)
    if (!existing) {
      const s = slug(v.title, cId.slice(0, 8))
      const [vac] = await db.insert(vacancies).values({
        companyId: cId, createdBy: uId,
        title: v.title, city: v.city,
        format: v.format, employment: v.employment,
        category: v.category,
        salaryMin: v.salaryMin, salaryMax: v.salaryMax,
        status: v.status, slug: s,
        descriptionJson: { blocks: [{ type: "paragraph", text: `Описание вакансии: ${v.title}. Мы ищем опытного специалиста для работы в нашей команде.` }] },
      }).returning()
      createdVacancies.push(vac)
    } else {
      createdVacancies.push(existing)
    }
  }

  // Если вакансии уже были — подгружаем первые три
  if (createdVacancies.length === 0) {
    const existing = await db.select({ id: vacancies.id })
      .from(vacancies).where(eq(vacancies.companyId, cId)).limit(3)
    createdVacancies.push(...existing)
  }

  results.push(`vacancies: ${createdVacancies.length}`)

  // ── 2. Кандидаты ─────────────────────────────────────────────────────────────
  const candidateNames = [
    "Иван Петров","Мария Сидорова","Алексей Козлов","Елена Новикова","Дмитрий Волков",
    "Анна Морозова","Сергей Лебедев","Ольга Попова","Андрей Соколов","Юлия Михайлова",
    "Николай Зайцев","Татьяна Борисова","Павел Орлов","Наталья Федорова","Роман Смирнов",
    "Ксения Кузнецова","Артём Макаров","Светлана Васильева","Игорь Новак","Вера Тихонова",
  ]

  const [existingCand] = await db.select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.vacancyId, createdVacancies[0]?.id))
    .limit(1)

  if (!existingCand && createdVacancies[0]?.id) {
    const stage7 = STAGES.length
    for (let i = 0; i < candidateNames.length; i++) {
      const vacIdx = i % Math.max(createdVacancies.length, 1)
      const vacId = createdVacancies[vacIdx]?.id ?? createdVacancies[0]!.id
      const stage = STAGES[i % stage7]
      const source = SOURCES[i % SOURCES.length]
      const city = CITIES[i % CITIES.length]
      await db.insert(candidates).values({
        vacancyId: vacId,
        name: candidateNames[i],
        phone: `+7 (9${String(10 + i).padStart(2, "0")}) ${String(100 + i * 7).padStart(3, "0")}-${String(10 + i * 3).padStart(2, "0")}-${String(10 + i).padStart(2, "0")}`,
        email: `${candidateNames[i].split(" ")[0].toLowerCase()}@example.com`,
        city,
        source,
        stage,
        score: 60 + Math.floor(Math.random() * 40),
        salaryMin: 80000 + i * 5000,
        salaryMax: 130000 + i * 5000,
        experience: `${1 + (i % 8)} лет`,
        skills: ["Коммуникабельность", "Работа в команде", "MS Office"].slice(0, 1 + (i % 3)),
        token: token(),
      })
    }
    results.push("candidates: 20")
  } else {
    results.push("candidates: already exist, skipped")
  }

  // ── 3. Планы адаптации ───────────────────────────────────────────────────────
  const [existingPlan] = await db.select({ id: adaptationPlans.id })
    .from(adaptationPlans).where(eq(adaptationPlans.tenantId, cId)).limit(1)

  let planIds: string[] = []

  if (!existingPlan) {
    const planDefs = [
      {
        title: "Онбординг: Отдел продаж",
        description: "Стандартный план адаптации для менеджеров по продажам",
        durationDays: 14,
        planType: "onboarding",
        steps: [
          { day: 1, title: "Знакомство с командой", type: "meeting" },
          { day: 1, title: "Экскурсия по офису", type: "task" },
          { day: 2, title: "Изучение продуктов компании", type: "lesson" },
          { day: 3, title: "Тест по продуктам", type: "quiz" },
          { day: 5, title: "Первый звонок с наставником", type: "meeting" },
          { day: 7, title: "Итоги первой недели", type: "task" },
          { day: 10, title: "Видео: техники продаж", type: "video" },
          { day: 14, title: "Итоговая аттестация", type: "quiz" },
        ],
      },
      {
        title: "Онбординг: IT-отдел",
        description: "План адаптации для разработчиков и аналитиков",
        durationDays: 21,
        planType: "onboarding",
        steps: [
          { day: 1, title: "Настройка рабочего окружения", type: "task" },
          { day: 1, title: "Доступы и безопасность", type: "lesson" },
          { day: 2, title: "Архитектура проекта", type: "lesson" },
          { day: 3, title: "Git workflow и CI/CD", type: "lesson" },
          { day: 5, title: "Первый PR с наставником", type: "task" },
          { day: 7, title: "Code review практика", type: "task" },
          { day: 14, title: "Самостоятельная задача", type: "task" },
          { day: 21, title: "Ретроспектива адаптации", type: "meeting" },
        ],
      },
    ]

    for (const p of planDefs) {
      const [plan] = await db.insert(adaptationPlans).values({
        tenantId: cId, createdBy: uId,
        title: p.title, description: p.description,
        durationDays: p.durationDays, planType: p.planType,
        isTemplate: false, isActive: true,
      }).returning()

      for (let i = 0; i < p.steps.length; i++) {
        const s = p.steps[i]
        await db.insert(adaptationSteps).values({
          planId: plan.id,
          dayNumber: s.day,
          sortOrder: i,
          title: s.title,
          type: s.type,
          content: { text: `Содержание шага: ${s.title}` },
          durationMin: 30 + (i % 3) * 15,
          isRequired: true,
        })
      }

      planIds.push(plan.id)
    }
    results.push(`adaptation plans: ${planIds.length}`)
  } else {
    planIds = [existingPlan.id]
    results.push("adaptation plans: already exist, skipped")
  }

  // ── 4. Назначения адаптации ──────────────────────────────────────────────────
  const [existingAssign] = await db.select({ id: adaptationAssignments.id })
    .from(adaptationAssignments)
    .where(eq(adaptationAssignments.planId, planIds[0]))
    .limit(1)

  const DEMO_EMPLOYEES = [
    "aaaabbbb-0001-4000-a000-000000000001",
    "aaaabbbb-0001-4000-a000-000000000002",
    "aaaabbbb-0001-4000-a000-000000000003",
    "aaaabbbb-0001-4000-a000-000000000004",
    "aaaabbbb-0001-4000-a000-000000000005",
  ]

  if (!existingAssign && planIds[0]) {
    const steps = await db.select({ id: adaptationSteps.id })
      .from(adaptationSteps)
      .where(eq(adaptationSteps.planId, planIds[0]))

    const total = steps.length || 8
    const assignDefs = [
      { empIdx: 0, pct: 75, day: 10, status: "active" as const, daysAgo: 10 },
      { empIdx: 1, pct: 30, day: 4,  status: "active" as const, daysAgo: 4  },
      { empIdx: 2, pct: 100, day: 14, status: "completed" as const, daysAgo: 20 },
      { empIdx: 3, pct: 0,  day: 1,  status: "active" as const, daysAgo: 1  },
      { empIdx: 4, pct: 50, day: 7,  status: "paused" as const, daysAgo: 14 },
    ]

    for (const def of assignDefs) {
      const planId = planIds[def.empIdx % planIds.length] ?? planIds[0]
      const [assign] = await db.insert(adaptationAssignments).values({
        planId,
        employeeId: DEMO_EMPLOYEES[def.empIdx],
        buddyId: def.empIdx < 2 ? uId : undefined,
        startDate: new Date(Date.now() - def.daysAgo * 86400_000),
        status: def.status,
        currentDay: def.day,
        completionPct: def.pct,
        totalSteps: total,
        completedSteps: Math.round(total * def.pct / 100),
        completedAt: def.status === "completed" ? new Date() : undefined,
      }).returning()

      // Создаём stepCompletions для части шагов
      const completedCount = Math.round(steps.length * def.pct / 100)
      for (let si = 0; si < completedCount; si++) {
        const step = steps[si]
        if (!step) continue
        await db.insert(stepCompletions).values({
          assignmentId: assign.id,
          stepId: step.id,
          status: "completed",
          completedAt: new Date(Date.now() - (def.daysAgo - si) * 86400_000),
        }).onConflictDoNothing()
      }
    }
    results.push("assignments: 5")
  } else {
    results.push("assignments: already exist, skipped")
  }

  // ── 5. Курс с уроками ────────────────────────────────────────────────────────
  const [existingCourse] = await db.select({ id: courses.id })
    .from(courses).where(eq(courses.tenantId, cId)).limit(1)

  let courseId: string | null = null

  if (!existingCourse) {
    const [course] = await db.insert(courses).values({
      tenantId: cId, createdBy: uId,
      title: "Введение в компанию",
      description: "Базовый курс для всех новых сотрудников. Узнайте о миссии, ценностях и процессах компании.",
      category: "compliance",
      difficulty: "beginner",
      durationMin: 90,
      isPublished: true,
      isRequired: true,
    }).returning()

    courseId = course.id

    const lessonDefs = [
      { title: "История и миссия компании", type: "content", text: "Наша компания основана в 2018 году с целью создания лучших инструментов для бизнеса. Мы верим в прозрачность, инновации и уважение к каждому сотруднику." },
      { title: "Структура организации", type: "content", text: "Компания состоит из 5 департаментов: Продажи, IT, Маркетинг, HR, Финансы. Каждый департамент возглавляет опытный руководитель." },
      { title: "Ценности и культура", type: "video", url: null },
      { title: "Правила безопасности", type: "quiz", text: "Проверьте свои знания о правилах безопасности." },
      { title: "Итоговое задание", type: "assignment", text: "Напишите короткое эссе о ваших ожиданиях от работы в компании." },
    ]

    for (let i = 0; i < lessonDefs.length; i++) {
      const l = lessonDefs[i]
      const content = l.type === "video"
        ? { url: null }
        : l.type === "quiz"
        ? { questions: [{ id: "q1", text: l.text, options: ["Верно","Неверно"], correct: 0 }] }
        : { text: l.text }

      await db.insert(lessons).values({
        courseId, title: l.title,
        sortOrder: i,
        type: l.type,
        content,
        durationMin: 15 + i * 5,
        isRequired: true,
      })
    }
    results.push("course: 1, lessons: 5")
  } else {
    courseId = existingCourse.id
    results.push("course: already exists, skipped")
  }

  // ── 6. Зачисления + сертификаты ──────────────────────────────────────────────
  if (courseId) {
    const [existingEnroll] = await db.select({ id: courseEnrollments.id })
      .from(courseEnrollments)
      .where(eq(courseEnrollments.courseId, courseId))
      .limit(1)

    if (!existingEnroll) {
      const courseLessons = await db.select({ id: lessons.id })
        .from(lessons).where(eq(lessons.courseId, courseId))

      const enrollDefs = [
        { emp: DEMO_EMPLOYEES[0], pct: 100, status: "completed" as const, cert: true },
        { emp: DEMO_EMPLOYEES[1], pct: 60,  status: "in_progress" as const, cert: false },
        { emp: DEMO_EMPLOYEES[2], pct: 100, status: "completed" as const, cert: true },
        { emp: DEMO_EMPLOYEES[3], pct: 20,  status: "in_progress" as const, cert: false },
        { emp: DEMO_EMPLOYEES[4], pct: 0,   status: "enrolled" as const, cert: false },
      ]

      let certCount = 0
      for (const def of enrollDefs) {
        const [enroll] = await db.insert(courseEnrollments).values({
          courseId,
          employeeId: def.emp,
          status: def.status,
          completionPct: def.pct,
          enrolledAt: new Date(Date.now() - 30 * 86400_000),
          startedAt: def.pct > 0 ? new Date(Date.now() - 25 * 86400_000) : undefined,
          completedAt: def.status === "completed" ? new Date(Date.now() - 5 * 86400_000) : undefined,
          lastAccessAt: new Date(Date.now() - 2 * 86400_000),
        }).returning().onConflictDoNothing()

        if (!enroll) continue

        const completedLessonsCount = Math.round(courseLessons.length * def.pct / 100)
        for (let li = 0; li < completedLessonsCount; li++) {
          const lesson = courseLessons[li]
          if (!lesson) continue
          await db.insert(lessonCompletions).values({
            enrollmentId: enroll.id,
            lessonId: lesson.id,
            status: "completed",
            completedAt: new Date(Date.now() - (20 - li) * 86400_000),
          }).onConflictDoNothing()
        }

        if (def.cert) {
          await db.insert(certificates).values({
            courseId,
            employeeId: def.emp,
            number: certNum(),
            issuedAt: new Date(Date.now() - 4 * 86400_000),
          }).onConflictDoNothing()
          certCount++
        }
      }
      results.push(`enrollments: 5, certificates: ${certCount}`)
    } else {
      results.push("enrollments: already exist, skipped")
    }
  }

  return NextResponse.json({
    ok: true,
    seeded: results,
    message: "Демо-данные v2 созданы",
  })
}
