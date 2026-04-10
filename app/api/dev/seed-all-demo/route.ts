/**
 * POST /api/dev/seed-all-demo
 * Полный идемпотентный демо-сид для production-среды.
 * Требует NODE_ENV=development ИЛИ ALLOW_DEV_LOGIN=true в .env
 */
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { eq, and, or, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies, users, plans, planModules, tenantModules,
  vacancies, candidates,
  adaptationPlans, adaptationSteps, adaptationAssignments, stepCompletions,
  employeePoints, pointsHistory, badges, employeeBadges,
  courses, lessons, courseEnrollments, lessonCompletions, certificates,
  skills, assessments, skillAssessments, assessmentReviewers,
  knowledgeCategories, knowledgeArticles, demoTemplates,
  learningPlans, learningAssignments, aiUsageLog,
  salesCompanies, salesContacts,
} from "@/lib/db/schema"
import { generateCandidateToken } from "@/lib/candidate-tokens"
import { auth } from "@/auth"

const isDevAllowed =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_DEV_LOGIN === "true" ||
  process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true"

// ── helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function weighted<T>(items: T[], weights: number[]): T {
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i] }
  return items[items.length - 1]
}

function phone(): string {
  const d = () => Math.floor(Math.random() * 10)
  return `+7 9${d()}${d()} ${d()}${d()}${d()}-${d()}${d()}-${d()}${d()}`
}

function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000) }

const FIRST_NAMES = [
  "Александр","Дмитрий","Максим","Сергей","Андрей","Алексей","Артём","Илья","Кирилл","Михаил",
  "Никита","Роман","Павел","Евгений","Владимир","Антон","Константин","Тимур","Денис","Иван",
  "Анна","Мария","Елена","Ольга","Наталья","Татьяна","Екатерина","Юлия","Светлана","Дарья",
]
const LAST_NAMES = [
  "Иванов","Петров","Сидоров","Смирнов","Кузнецов","Попов","Васильев","Соколов","Михайлов","Новиков",
  "Федоров","Морозов","Волков","Алексеев","Лебедев","Семёнов","Козлов","Степанов","Андреев","Захаров",
]

function makeName(i: number) {
  const fn = pick(FIRST_NAMES)
  const ln = pick(LAST_NAMES)
  const isFemale = fn.endsWith("а") || fn.endsWith("я")
  const surname = isFemale
    ? ln.endsWith("ов") ? ln.slice(0, -2) + "ова"
      : ln.endsWith("ев") ? ln.slice(0, -2) + "ева"
      : ln.endsWith("ин") ? ln + "а"
      : ln
    : ln
  return { name: `${surname} ${fn}`, email: `cand${i}@demo-example.com` }
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST() {
  // Требует auth: спец. endpoint для сидирования, доступен авторизованным
  // пользователям любой роли, либо в dev-режиме (env-гейт).
  const session = await auth().catch(() => null)
  if (!isDevAllowed && !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const log: string[] = []

  // ── 1. Компания + тариф Pro ─────────────────────────────────────────────────
  // Prefer the authenticated user's tenant; fall back to the first company in
  // the DB for bootstrap scenarios.
  let company: typeof companies.$inferSelect | undefined
  if (session?.user?.companyId) {
    [company] = await db.select().from(companies).where(eq(companies.id, session.user.companyId)).limit(1)
  }
  if (!company) {
    company = await db.select().from(companies).limit(1).then(r => r[0])
  }
  if (!company) {
    ;[company] = await db.insert(companies).values({
      name: "Демо Компания", city: "Москва", industry: "IT",
      subscriptionStatus: "active",
    }).returning()
    log.push("company:created")
  } else {
    log.push(`company:exists (${company.name})`)
  }

  const [proPlan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.slug, "pro")).limit(1)
  if (proPlan) {
    await db.update(companies)
      .set({ planId: proPlan.id, subscriptionStatus: "active" })
      .where(eq(companies.id, company.id))
    const proModules = await db.select().from(planModules).where(eq(planModules.planId, proPlan.id))
    for (const pm of proModules) {
      await db.insert(tenantModules).values({
        tenantId: company.id, moduleId: pm.moduleId, isActive: true, activatedAt: new Date(),
        maxVacancies: pm.maxVacancies, maxCandidates: pm.maxCandidates,
        maxEmployees: pm.maxEmployees, maxScenarios: pm.maxScenarios, maxUsers: pm.maxUsers,
      }).onConflictDoUpdate({
        target: [tenantModules.tenantId, tenantModules.moduleId],
        set: { isActive: true, activatedAt: new Date() },
      })
    }
    log.push(`plan:pro assigned (${proModules.length} modules)`)
  } else {
    log.push("plan:pro not found — billing seed needed")
  }

  // ── 2. Пользователи ─────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("demo123", 10)

  const DEMO_USERS = [
    { email: "ivan@demo.ru",   name: "Иван Петров",    role: "director" },
    { email: "maria@demo.ru",  name: "Мария Сидорова", role: "hr_lead" },
    { email: "alex@demo.ru",   name: "Алексей Козлов", role: "hr_manager" },
    { email: "olga@demo.ru",   name: "Ольга Новикова", role: "department_head" },
    { email: "dmitry@demo.ru", name: "Дмитрий Волков", role: "observer" },
    { email: "elena@demo.ru",  name: "Елена Морозова", role: "observer" },
  ] as const

  const uMap: Record<string, string> = {}
  for (const u of DEMO_USERS) {
    const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1)
    if (ex) {
      uMap[u.email] = ex.id
    } else {
      const [cr] = await db.insert(users).values({
        ...u, passwordHash, isActive: true, companyId: company.id,
      }).returning()
      uMap[u.email] = cr.id
      log.push(`user:created ${u.email}`)
    }
  }
  log.push(`users:${Object.keys(uMap).length} demo users ready`)

  const ivanId   = uMap["ivan@demo.ru"]
  const mariaId  = uMap["maria@demo.ru"]
  const alexId   = uMap["alex@demo.ru"]
  const olgaId   = uMap["olga@demo.ru"]
  const elenaId  = uMap["elena@demo.ru"]

  // ── 3. Вакансии ─────────────────────────────────────────────────────────────
  const VACANCY_DEFS = [
    {
      title: "Менеджер по продажам B2B", status: "published",
      slug: "manager-prodazh-b2b-demo", format: "hybrid",
      salaryMin: 80_000, salaryMax: 150_000, candidateCount: 300,
    },
    {
      title: "Frontend-разработчик", status: "published",
      slug: "frontend-razrabotchik-demo", format: "remote",
      salaryMin: 120_000, salaryMax: 200_000, candidateCount: 150,
    },
    {
      title: "HR-менеджер", status: "draft",
      slug: "hr-manager-demo", format: "office",
      salaryMin: 70_000, salaryMax: 100_000, candidateCount: 0,
    },
  ] as const

  const vMap: Record<string, string> = {}
  for (const v of VACANCY_DEFS) {
    const [ex] = await db.select({ id: vacancies.id }).from(vacancies).where(eq(vacancies.slug, v.slug)).limit(1)
    if (ex) {
      vMap[v.slug] = ex.id
      log.push(`vacancy:${v.slug}:exists`)
    } else {
      const [cr] = await db.insert(vacancies).values({
        companyId: company.id, createdBy: ivanId,
        title: v.title, status: v.status, slug: v.slug,
        city: "Москва", format: v.format, employment: "full",
        salaryMin: v.salaryMin, salaryMax: v.salaryMax,
      }).returning()
      vMap[v.slug] = cr.id
      log.push(`vacancy:${v.slug}:created`)
    }
  }

  // ── 4. Кандидаты ────────────────────────────────────────────────────────────
  const STAGES  = ["new","demo","scheduled","interviewed","hired","rejected"]
  const STAGE_W = [40, 25, 15, 10, 5, 5]
  const SOURCES  = ["hh","avito","referral","telegram","site"]
  const SOURCE_W = [40, 20, 15, 15, 10]

  for (const v of VACANCY_DEFS) {
    if (v.candidateCount === 0) continue
    const vacId = vMap[v.slug]
    if (!vacId) continue
    const [ex] = await db.select({ id: candidates.id }).from(candidates)
      .where(eq(candidates.vacancyId, vacId)).limit(1)
    if (ex) { log.push(`candidates:${v.slug}:already_seeded`); continue }

    const batch = Array.from({ length: v.candidateCount }, (_, i) => {
      const { name, email } = makeName(i)
      return {
        vacancyId: vacId, name,
        phone: phone(), email: email.replace("demo-example", `${v.slug}`),
        source: weighted(SOURCES, SOURCE_W),
        stage:  weighted(STAGES, STAGE_W),
        score:  (Math.floor(Math.random() * 5) + 1) * 20,
        token:  generateCandidateToken(),
        createdAt: new Date(Date.now() - Math.random() * 30 * 86_400_000),
      }
    })
    for (let i = 0; i < batch.length; i += 50) {
      await db.insert(candidates).values(batch.slice(i, i + 50))
    }
    log.push(`candidates:${v.slug}:${v.candidateCount}`)
  }

  // ── 5. Адаптация — планы ────────────────────────────────────────────────────

  type StepDef = { dayNumber: number; sortOrder: number; title: string; type: string; durationMin: number }

  // Вспомогательная функция для поиска/создания плана
  async function ensurePlan(title: string, days: number, stepsData: StepDef[]) {
    const [ex] = await db.select({ id: adaptationPlans.id }).from(adaptationPlans)
      .where(and(eq(adaptationPlans.tenantId, company.id), eq(adaptationPlans.title, title))).limit(1)
    if (ex) { log.push(`plan:"${title}":exists`); return ex.id }

    const [p] = await db.insert(adaptationPlans).values({
      tenantId: company.id, title,
      description: `${days}-дневная программа адаптации`,
      durationDays: days, planType: "onboarding",
      isTemplate: true, isActive: true, createdBy: mariaId,
    }).returning()
    await db.insert(adaptationSteps).values(
      stepsData.map(s => ({ ...s, planId: p.id, isRequired: true, channel: "auto" }))
    )
    log.push(`plan:"${title}":created (${stepsData.length} steps)`)
    return p.id
  }

  const plan1Id = await ensurePlan("Адаптация менеджера продаж", 14, [
    { dayNumber: 1,  sortOrder: 1, title: "Добро пожаловать в команду",    type: "lesson",    durationMin: 15 },
    { dayNumber: 1,  sortOrder: 2, title: "Видео: Знакомство с компанией", type: "video",     durationMin: 20 },
    { dayNumber: 2,  sortOrder: 1, title: "Знакомство с CRM-системой",     type: "task",      durationMin: 30 },
    { dayNumber: 3,  sortOrder: 1, title: "Тест: Знание продукта",         type: "quiz",      durationMin: 10 },
    { dayNumber: 5,  sortOrder: 1, title: "Скрипты продаж: Основы",        type: "lesson",    durationMin: 25 },
    { dayNumber: 5,  sortOrder: 2, title: "Встреча с наставником",         type: "meeting",   durationMin: 60 },
    { dayNumber: 7,  sortOrder: 1, title: "Чеклист: Первый звонок",        type: "checklist", durationMin: 15 },
    { dayNumber: 10, sortOrder: 1, title: "Видео: Работа с возражениями",  type: "video",     durationMin: 18 },
    { dayNumber: 12, sortOrder: 1, title: "Итоговый тест",                 type: "quiz",      durationMin: 20 },
    { dayNumber: 14, sortOrder: 1, title: "Финальная встреча: итоги",      type: "meeting",   durationMin: 45 },
  ])

  const plan2Id = await ensurePlan("Адаптация разработчика", 21, [
    { dayNumber: 1,  sortOrder: 1, title: "Введение в проект",             type: "lesson",    durationMin: 30 },
    { dayNumber: 1,  sortOrder: 2, title: "Настройка окружения",           type: "task",      durationMin: 60 },
    { dayNumber: 2,  sortOrder: 1, title: "Знакомство с кодовой базой",    type: "lesson",    durationMin: 45 },
    { dayNumber: 2,  sortOrder: 2, title: "Встреча с тимлидом",            type: "meeting",   durationMin: 30 },
    { dayNumber: 3,  sortOrder: 1, title: "Git-flow и процессы",           type: "lesson",    durationMin: 20 },
    { dayNumber: 5,  sortOrder: 1, title: "Первый PR: задача-знакомство",  type: "task",      durationMin: 120 },
    { dayNumber: 7,  sortOrder: 1, title: "Code review: практика",         type: "task",      durationMin: 60 },
    { dayNumber: 7,  sortOrder: 2, title: "Тест: Стандарты кодирования",   type: "quiz",      durationMin: 15 },
    { dayNumber: 10, sortOrder: 1, title: "Архитектура системы",           type: "lesson",    durationMin: 45 },
    { dayNumber: 10, sortOrder: 2, title: "Видео: Деплой и CI/CD",         type: "video",     durationMin: 25 },
    { dayNumber: 12, sortOrder: 1, title: "Самостоятельная задача",        type: "task",      durationMin: 180 },
    { dayNumber: 14, sortOrder: 1, title: "Итоги двух недель",             type: "meeting",   durationMin: 45 },
    { dayNumber: 16, sortOrder: 1, title: "Работа над фичей",              type: "task",      durationMin: 240 },
    { dayNumber: 18, sortOrder: 1, title: "Тест: Знание системы",          type: "quiz",      durationMin: 20 },
    { dayNumber: 21, sortOrder: 1, title: "Финальная аттестация",          type: "meeting",   durationMin: 60 },
  ])

  // ── 5б. Назначения ──────────────────────────────────────────────────────────
  async function ensureAssignment(
    planId: string, employeeId: string, buddyId: string | null,
    status: string, completionPct: number, startDaysAgo: number,
  ) {
    const [ex] = await db.select({ id: adaptationAssignments.id }).from(adaptationAssignments)
      .where(eq(adaptationAssignments.employeeId, employeeId)).limit(1)
    if (ex) { log.push(`assignment:${employeeId}:exists`); return ex.id }

    const steps = await db.select({ id: adaptationSteps.id })
      .from(adaptationSteps).where(eq(adaptationSteps.planId, planId))
    const total = steps.length
    const done  = Math.round(total * completionPct / 100)

    const [a] = await db.insert(adaptationAssignments).values({
      planId, employeeId,
      buddyId: buddyId ?? undefined,
      startDate: daysAgo(startDaysAgo),
      status,
      currentDay: Math.round(startDaysAgo * completionPct / 100) || 1,
      completionPct,
      totalSteps: total,
      completedSteps: done,
      completedAt: status === "completed" ? daysAgo(1) : undefined,
    }).returning()

    for (let i = 0; i < done; i++) {
      try {
        await db.insert(stepCompletions).values({
          assignmentId: a.id, stepId: steps[i].id, status: "completed",
          completedAt: daysAgo(startDaysAgo - i),
        })
      } catch { /* unique constraint — уже есть */ }
    }
    log.push(`assignment:${employeeId}:${status}(${completionPct}%)`)
    return a.id
  }

  await ensureAssignment(plan1Id, alexId,  mariaId, "completed", 100, 16)
  await ensureAssignment(plan1Id, olgaId,  alexId,  "active",     60, 10)
  await ensureAssignment(plan2Id, elenaId, null,    "active",     10,  3)

  // ── 5в. Геймификация для завершённого назначения (Алексей: 500 очков, 3 бейджа) ──
  const [existPts] = await db.select({ id: employeePoints.id }).from(employeePoints)
    .where(and(eq(employeePoints.tenantId, company.id), eq(employeePoints.employeeId, alexId))).limit(1)

  if (!existPts) {
    const DEMO_BADGES_DATA = [
      { slug: "first_step",      name: "Первый шаг",           icon: "👣", points: 50  },
      { slug: "adaptation_done", name: "Адаптация завершена",   icon: "🎓", points: 300 },
      { slug: "fast_learner",    name: "Быстрый старт",         icon: "⚡", points: 150 },
    ]
    const badgeIds: string[] = []
    for (const b of DEMO_BADGES_DATA) {
      const [ex] = await db.select({ id: badges.id }).from(badges).where(eq(badges.slug, b.slug)).limit(1)
      badgeIds.push(ex ? ex.id : (await db.insert(badges).values({ ...b, tenantId: null }).returning())[0].id)
    }

    const [ep] = await db.insert(employeePoints).values({
      tenantId: company.id, employeeId: alexId,
      totalPoints: 500, level: 2, streak: 5, lastActiveDate: daysAgo(2),
    }).returning()

    await db.insert(pointsHistory).values([
      { pointsId: ep.id, amount: 50,  reason: "first_step",      sourceType: "badge", createdAt: daysAgo(16) },
      { pointsId: ep.id, amount: 300, reason: "adaptation_done", sourceType: "badge", createdAt: daysAgo(2)  },
      { pointsId: ep.id, amount: 150, reason: "fast_learner",    sourceType: "badge", createdAt: daysAgo(2)  },
    ])

    for (const badgeId of badgeIds) {
      try { await db.insert(employeeBadges).values({ pointsId: ep.id, badgeId }) } catch {}
    }
    log.push("gamification:alex 500pts 3badges")
  } else {
    log.push("gamification:alex:exists")
  }

  // ── 6. Курсы ────────────────────────────────────────────────────────────────
  type LessonDef = { title: string; sortOrder: number; type: string; durationMin: number }
  type CourseMeta = { description: string; category: string; difficulty: string; durationMin: number; isRequired: boolean }

  async function ensureCourse(title: string, sortOrder: number, meta: CourseMeta, lessonDefs: LessonDef[]) {
    const [ex] = await db.select({ id: courses.id }).from(courses)
      .where(and(eq(courses.tenantId, company.id), eq(courses.title, title))).limit(1)
    if (ex) { log.push(`course:"${title}":exists`); return ex.id }
    const [c] = await db.insert(courses).values({
      tenantId: company.id, title, sortOrder,
      ...meta,
      createdBy: mariaId, isPublished: true,
    }).returning()
    await db.insert(lessons).values(lessonDefs.map(l => ({ ...l, courseId: c.id })))
    log.push(`course:"${title}":created (${lessonDefs.length} lessons)`)
    return c.id
  }

  const course1Id = await ensureCourse("Продукт компании", 0,
    { description: "Базовый курс о продукте, миссии и ценностях.", category: "product", difficulty: "beginner", durationMin: 60, isRequired: true },
    [
      { title: "О компании",            sortOrder: 0, type: "content", durationMin: 10 },
      { title: "Наш продукт",           sortOrder: 1, type: "content", durationMin: 15 },
      { title: "Клиенты и рынок",       sortOrder: 2, type: "content", durationMin: 10 },
      { title: "Процессы и инструменты",sortOrder: 3, type: "content", durationMin: 15 },
      { title: "Проверка знаний",       sortOrder: 4, type: "quiz",    durationMin: 10 },
    ]
  )

  const course2Id = await ensureCourse("Техника продаж B2B", 1,
    { description: "Практический курс по корпоративным продажам.", category: "sales", difficulty: "intermediate", durationMin: 105, isRequired: false },
    [
      { title: "Воронка B2B продаж",         sortOrder: 0, type: "content", durationMin: 15 },
      { title: "Квалификация лида (BANT)",   sortOrder: 1, type: "content", durationMin: 15 },
      { title: "Выявление потребностей",     sortOrder: 2, type: "content", durationMin: 20 },
      { title: "Работа с возражениями",      sortOrder: 3, type: "content", durationMin: 15 },
      { title: "Переговоры и закрытие",      sortOrder: 4, type: "content", durationMin: 20 },
      { title: "CRM и отчётность",           sortOrder: 5, type: "content", durationMin: 10 },
      { title: "Финальный тест",             sortOrder: 6, type: "quiz",    durationMin: 10 },
    ]
  )

  // Enrollment 1: Иван — курс «Продукт компании» — completed + сертификат
  const [exEnr1] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, course1Id), eq(courseEnrollments.employeeId, ivanId))).limit(1)
  if (!exEnr1) {
    const [enr] = await db.insert(courseEnrollments).values({
      courseId: course1Id, employeeId: ivanId,
      status: "completed", completionPct: 100,
      enrolledAt: daysAgo(20), startedAt: daysAgo(20), completedAt: daysAgo(15),
    }).returning()
    const lsns = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, course1Id))
    for (const l of lsns) {
      try {
        await db.insert(lessonCompletions).values({
          enrollmentId: enr.id, lessonId: l.id, status: "completed",
          score: 80 + Math.floor(Math.random() * 20), completedAt: daysAgo(15),
        })
      } catch {}
    }
    const certNum = `MK-${new Date().getFullYear()}-${Math.floor(10_000 + Math.random() * 90_000)}`
    await db.insert(certificates).values({
      courseId: course1Id, employeeId: ivanId, number: certNum, issuedAt: daysAgo(15),
    })
    log.push(`enrollment1:ivan completed + cert ${certNum}`)
  } else {
    log.push("enrollment1:ivan:exists")
  }

  // Enrollment 2: Мария — курс «Техника продаж B2B» — in_progress 40%
  const [exEnr2] = await db.select({ id: courseEnrollments.id }).from(courseEnrollments)
    .where(and(eq(courseEnrollments.courseId, course2Id), eq(courseEnrollments.employeeId, mariaId))).limit(1)
  if (!exEnr2) {
    const [enr] = await db.insert(courseEnrollments).values({
      courseId: course2Id, employeeId: mariaId,
      status: "in_progress", completionPct: 40,
      enrolledAt: daysAgo(7), startedAt: daysAgo(6), lastAccessAt: daysAgo(1),
    }).returning()
    const lsns = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.courseId, course2Id))
    const doneCount = Math.floor(lsns.length * 0.4)
    for (let i = 0; i < doneCount; i++) {
      try {
        await db.insert(lessonCompletions).values({
          enrollmentId: enr.id, lessonId: lsns[i].id, status: "completed",
          completedAt: daysAgo(6 - i),
        })
      } catch {}
    }
    log.push("enrollment2:maria in_progress 40%")
  } else {
    log.push("enrollment2:maria:exists")
  }

  // ── 7. Навыки + Оценки ──────────────────────────────────────────────────────
  const SYSTEM_SKILLS = [
    { name: "Работа с CRM",          category: "tool"   },
    { name: "Холодные звонки",        category: "hard"   },
    { name: "Переговоры",             category: "hard"   },
    { name: "Презентации",            category: "soft"   },
    { name: "Аналитика данных",       category: "hard"   },
    { name: "Управление проектами",   category: "domain" },
    { name: "Excel",                  category: "tool"   },
    { name: "Коммуникация",           category: "soft"   },
    { name: "Тайм-менеджмент",        category: "soft"   },
    { name: "Командная работа",       category: "soft"   },
  ]

  let skillsList = await db.select().from(skills)
    .where(or(isNull(skills.tenantId), eq(skills.tenantId, company.id)))
  if (skillsList.length === 0) {
    skillsList = await db.insert(skills)
      .values(SYSTEM_SKILLS.map(s => ({ ...s, tenantId: null })))
      .returning()
    log.push(`skills:${skillsList.length} created`)
  } else {
    log.push(`skills:${skillsList.length} exist`)
  }

  async function ensureAssessment(
    employeeId: string, type: string, status: string,
    scores: number[], assessorId: string, reviewers?: Array<{ id: string; role: string; status: string }>,
  ) {
    const [ex] = await db.select({ id: assessments.id }).from(assessments)
      .where(and(
        eq(assessments.tenantId, company.id),
        eq(assessments.employeeId, employeeId),
        eq(assessments.type, type),
      )).limit(1)
    if (ex) { log.push(`assessment:${type}:${employeeId}:exists`); return }

    const [a] = await db.insert(assessments).values({
      tenantId: company.id, employeeId, type, status,
      period: "2026-Q1",
      createdBy: assessorId,
      completedAt: status === "completed" ? daysAgo(5) : undefined,
    }).returning()

    if (skillsList.length > 0) {
      await db.insert(skillAssessments).values(
        skillsList.slice(0, scores.length).map((s, i) => ({
          assessmentId: a.id, skillId: s.id, score: scores[i], assessorId,
        }))
      )
    }

    if (reviewers) {
      await db.insert(assessmentReviewers).values(
        reviewers.map(r => ({
          assessmentId: a.id, reviewerId: r.id, role: r.role, status: r.status,
          completedAt: r.status === "completed" ? daysAgo(2) : undefined,
        }))
      )
    }

    log.push(`assessment:${type}:${employeeId}:created (status:${status})`)
  }

  // Оценка 1: type=manager, completed — Иван оценивает Алексея
  await ensureAssessment(alexId, "manager", "completed",
    [4, 3, 5, 4, 2, 3, 4, 5, 3, 4], ivanId)

  // Оценка 2: type=360, in_progress — Ольга (с ревьюерами)
  await ensureAssessment(olgaId, "360", "in_progress",
    [3, 4, 3, 4, 3, 3, 4, 4, 3, 3], alexId,
    [
      { id: alexId,  role: "peer",    status: "completed" },
      { id: ivanId,  role: "manager", status: "pending"   },
      { id: olgaId,  role: "self",    status: "pending"   },
    ])

  // Skills gap: Елена (self-оценка для данных по gap-анализу)
  await ensureAssessment(elenaId, "self", "completed",
    [2, 2, 3, 3, 4, 2, 3, 4, 4, 3], elenaId)

  // ═══════════════════════════════════════════════════════════════════════════
  // ── 8. Расширенный демо-сид: команда, база знаний, планы обучения, AI, CRM ──
  // ═══════════════════════════════════════════════════════════════════════════

  // 8.1. Команда из 12 сотрудников (@demo.company24.pro)
  const TEAM = [
    { email: "alexey.ivanov@demo.company24.pro",    name: "Иванов Алексей",      position: "Директор",                       role: "director" },
    { email: "maria.petrova@demo.company24.pro",    name: "Петрова Мария",       position: "Главный HR",                     role: "hr_lead" },
    { email: "dmitry.sidorov@demo.company24.pro",   name: "Сидоров Дмитрий",     position: "HR-менеджер",                    role: "hr_manager" },
    { email: "anna.kozlova@demo.company24.pro",     name: "Козлова Анна",        position: "Менеджер по продажам",           role: "employee" },
    { email: "sergey.novikov@demo.company24.pro",   name: "Новиков Сергей",      position: "Менеджер по продажам",           role: "employee" },
    { email: "elena.volkova@demo.company24.pro",    name: "Волкова Елена",       position: "Маркетолог",                     role: "employee" },
    { email: "pavel.morozov@demo.company24.pro",    name: "Морозов Павел",       position: "Frontend-разработчик",           role: "employee" },
    { email: "olga.lebedeva@demo.company24.pro",    name: "Лебедева Ольга",      position: "Backend-разработчик",            role: "employee" },
    { email: "artem.sokolov@demo.company24.pro",    name: "Соколов Артём",       position: "Руководитель отдела продаж",     role: "department_head" },
    { email: "natalia.fedorova@demo.company24.pro", name: "Фёдорова Наталья",    position: "Бухгалтер",                      role: "employee" },
    { email: "maksim.grigoriev@demo.company24.pro", name: "Григорьев Максим",    position: "Логист",                         role: "employee" },
    { email: "daria.kuznetsova@demo.company24.pro", name: "Кузнецова Дарья",     position: "Офис-менеджер",                  role: "employee" },
  ]

  const teamIds: string[] = []
  for (const m of TEAM) {
    const [ex] = await db.select({ id: users.id }).from(users).where(eq(users.email, m.email)).limit(1)
    if (ex) {
      teamIds.push(ex.id)
    } else {
      const [cr] = await db.insert(users).values({
        email: m.email, name: m.name, role: m.role, position: m.position,
        passwordHash, isActive: true, companyId: company.id,
      }).returning()
      teamIds.push(cr.id)
      log.push(`team:created ${m.email}`)
    }
  }
  log.push(`team:${teamIds.length} members ready`)

  const [bossId, hrLeadId, hrMgrId, sales1Id, sales2Id, mktId, frontId, backId, salesHeadId, accountantId, logistId, officeId] = teamIds

  // 8.2. Вакансии (добавляем "Бухгалтер", обновляем статусы существующих)
  const VACANCY_DEFS_V2 = [
    {
      slug: "manager-prodazh-b2b-demo", title: "Менеджер по продажам B2B",
      city: "Москва", format: "hybrid", salaryMin: 150_000, salaryMax: 250_000,
      candidateStages: [
        { stage: "new", count: 2 }, { stage: "demo", count: 1 },
        { stage: "scheduled", count: 1 }, { stage: "hired", count: 1 },
      ],
    },
    {
      slug: "frontend-razrabotchik-demo", title: "Frontend-разработчик",
      city: "Удалённо", format: "remote", salaryMin: 200_000, salaryMax: 350_000,
      candidateStages: [
        { stage: "new", count: 2 }, { stage: "demo", count: 1 },
        { stage: "scheduled", count: 1 }, { stage: "interviewed", count: 1 },
      ],
    },
    {
      slug: "hr-manager-demo", title: "HR-менеджер",
      city: "Москва", format: "office", salaryMin: 120_000, salaryMax: 180_000,
      candidateStages: [
        { stage: "new", count: 2 }, { stage: "demo", count: 2 },
        { stage: "scheduled", count: 1 },
      ],
    },
    {
      slug: "buhgalter-demo", title: "Бухгалтер",
      city: "Санкт-Петербург", format: "office", salaryMin: 100_000, salaryMax: 140_000,
      candidateStages: [
        { stage: "new", count: 2 }, { stage: "demo", count: 1 },
        { stage: "interviewed", count: 1 }, { stage: "hired", count: 1 },
      ],
    },
  ]

  const vMap2: Record<string, string> = {}
  for (const v of VACANCY_DEFS_V2) {
    const [ex] = await db.select({ id: vacancies.id }).from(vacancies).where(eq(vacancies.slug, v.slug)).limit(1)
    if (ex) {
      vMap2[v.slug] = ex.id
      // Ensure published
      await db.update(vacancies)
        .set({ status: "published", salaryMin: v.salaryMin, salaryMax: v.salaryMax, city: v.city })
        .where(eq(vacancies.id, ex.id))
    } else {
      const [cr] = await db.insert(vacancies).values({
        companyId: company.id, createdBy: bossId,
        title: v.title, status: "published", slug: v.slug,
        city: v.city, format: v.format, employment: "full",
        salaryMin: v.salaryMin, salaryMax: v.salaryMax,
      }).returning()
      vMap2[v.slug] = cr.id
      log.push(`vacancy-v2:${v.slug}:created`)
    }
  }

  // 8.3. 20 кандидатов с конкретными этапами воронки
  const CANDIDATE_NAMES = [
    "Антонов Роман",   "Белова Светлана", "Васильев Игорь",  "Гаврилова Юлия",
    "Дмитриев Артём",  "Ермолаева Ксения","Жуков Николай",   "Захарова Вера",
    "Ильина Алиса",    "Кравцов Олег",    "Макарова Лидия",  "Наумов Станислав",
    "Орехова Тамара",  "Павлов Руслан",   "Романова Алёна",  "Семенов Владимир",
    "Тихомирова Евгения","Ушаков Антон", "Филатова Карина", "Харитонов Денис",
  ]

  let candIdx = 0
  for (const v of VACANCY_DEFS_V2) {
    const vacId = vMap2[v.slug]
    if (!vacId) continue
    // Проверка: уже есть кандидаты c пометкой v2 для этой вакансии?
    const [existing] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(candidates)
      .where(and(eq(candidates.vacancyId, vacId), sql`${candidates.email} LIKE '%@demo-v2.ru'`))
    if ((existing?.c ?? 0) >= 5) {
      log.push(`candidates-v2:${v.slug}:already_seeded`)
      candIdx += v.candidateStages.reduce((a, s) => a + s.count, 0)
      continue
    }
    const rows: typeof candidates.$inferInsert[] = []
    for (const grp of v.candidateStages) {
      for (let i = 0; i < grp.count; i++) {
        const name = CANDIDATE_NAMES[candIdx % CANDIDATE_NAMES.length]
        const emailSlug = name.toLowerCase().replace(/[^a-zа-я]/g, "").slice(0, 15) || `cand${candIdx}`
        rows.push({
          vacancyId: vacId, name,
          phone: phone(),
          email: `${emailSlug}${candIdx}@demo-v2.ru`,
          source: weighted(["hh", "avito", "referral", "telegram", "site"], [40, 20, 15, 15, 10]),
          stage: grp.stage,
          score: 60 + Math.floor(Math.random() * 40),
          token: generateCandidateToken(),
          createdAt: daysAgo(Math.floor(Math.random() * 25) + 1),
        })
        candIdx++
      }
    }
    if (rows.length > 0) {
      await db.insert(candidates).values(rows)
      log.push(`candidates-v2:${v.slug}:${rows.length}`)
    }
  }

  // 8.4. Кастомные демо-шаблоны (2 шт)
  const CUSTOM_DEMOS = [
    { name: "ГК Орлинк: менеджер продаж", niche: "sales", length: "standard" },
    { name: "IT-компания: разработчик",   niche: "tech",  length: "standard" },
  ]
  for (const d of CUSTOM_DEMOS) {
    const [ex] = await db.select({ id: demoTemplates.id }).from(demoTemplates)
      .where(and(eq(demoTemplates.tenantId, company.id), eq(demoTemplates.name, d.name))).limit(1)
    if (ex) {
      log.push(`demo-template:"${d.name}":exists`)
      continue
    }
    await db.insert(demoTemplates).values({
      tenantId: company.id,
      name: d.name, niche: d.niche, length: d.length,
      isSystem: false,
      sections: [
        { id: `l-${Date.now()}-1`, emoji: "👋", title: "Приветствие", blocks: [] },
        { id: `l-${Date.now()}-2`, emoji: "🏢", title: "О компании",  blocks: [] },
        { id: `l-${Date.now()}-3`, emoji: "🎯", title: "Задачи роли", blocks: [] },
      ],
      audience: ["candidates"],
    })
    log.push(`demo-template:"${d.name}":created`)
  }

  // 8.5. Категории + 8 статей базы знаний
  const KB_CATEGORIES = [
    { name: "Инструкции",   slug: "instructions",  icon: "📖", description: "Пошаговые инструкции по рабочим процессам" },
    { name: "Регламенты",   slug: "regulations",   icon: "📋", description: "Внутренние регламенты и правила" },
    { name: "Продажи",      slug: "sales",         icon: "💼", description: "Материалы для отдела продаж" },
    { name: "HR",           slug: "hr",            icon: "👥", description: "Материалы для HR и адаптации" },
    { name: "Для сайта",    slug: "website",       icon: "🌐", description: "Публичные материалы и политики" },
  ]

  const kbCatIds: Record<string, string> = {}
  for (const c of KB_CATEGORIES) {
    const [ex] = await db.select({ id: knowledgeCategories.id }).from(knowledgeCategories)
      .where(and(eq(knowledgeCategories.tenantId, company.id), eq(knowledgeCategories.name, c.name))).limit(1)
    if (ex) {
      kbCatIds[c.name] = ex.id
    } else {
      const [cr] = await db.insert(knowledgeCategories).values({
        tenantId: company.id, name: c.name, slug: c.slug,
        description: c.description, icon: c.icon,
      }).returning()
      kbCatIds[c.name] = cr.id
      log.push(`kb-category:${c.name}:created`)
    }
  }

  const CRM_ARTICLE_CONTENT = `<h2>Введение</h2>
<p>CRM-система — это центральный инструмент работы менеджера. В ней фиксируется каждое взаимодействие с клиентом: звонки, встречи, переписка, статусы сделок. Корректное ведение CRM напрямую влияет на качество прогнозов и скорость закрытия сделок.</p>
<h2>Первые шаги после логина</h2>
<p>После входа в систему вы попадаете на главный дашборд. Слева расположено меню с основными разделами: Воронка, Клиенты, Контакты, Задачи, Отчёты. Сверху — строка быстрого поиска и кнопка "Создать". Перед началом работы убедитесь, что в правом верхнем углу выбрана правильная организация и ваша роль соответствует задаче.</p>
<h2>Создание и ведение клиента</h2>
<p>Чтобы добавить нового клиента, нажмите "Создать → Компания". Обязательные поля: название, ИНН, отрасль, ответственный менеджер. Заполните максимум данных сразу — это сэкономит время на последующих этапах. Если компания уже есть в базе, система предупредит о дубликате. В карточке компании привяжите контактных лиц и добавьте комментарий с контекстом первого обращения.</p>
<h2>Работа с воронкой продаж</h2>
<p>Все сделки движутся по этапам: Новый лид → Квалификация → Потребности → Предложение → Переговоры → Закрыто. Каждый переход должен сопровождаться фиксацией: что сделано, что обсудили, каковы следующие шаги. Задачи ставятся через кнопку "Новая задача" прямо из карточки сделки — система автоматически привяжет их к клиенту.</p>
<h2>Коммуникации</h2>
<p>Все звонки должны быть записаны с краткими итогами (3-5 предложений). После встречи обязательно добавляйте резюме: о чём говорили, какие возражения, каковы договорённости. Электронная переписка автоматически подтягивается в карточку клиента при отправке с корпоративного ящика.</p>
<h2>Отчёты и аналитика</h2>
<p>Раздел "Отчёты" позволяет в один клик получить статистику: сколько лидов в работе, средний чек, конверсия по этапам, отставание от плана. Руководители отдела проверяют эти показатели еженедельно. Менеджерам рекомендуется самостоятельно смотреть свои метрики каждый понедельник — это помогает видеть свои слабые места и планировать фокус на неделю.</p>
<h2>Типичные ошибки</h2>
<p>Главное, чего делать нельзя: оставлять сделки без движения больше 5 дней, не фиксировать итоги встреч, ставить статус "Закрыто" без документа. Если возникают вопросы — обратитесь к своему руководителю или в службу поддержки через кнопку "Помощь" в нижнем левом углу.</p>
<h2>Заключение</h2>
<p>CRM — это не отчётность для галочки, а рабочий инструмент, который помогает менеджеру держать всё под контролем и ничего не забывать. Потраченные 5 минут на запись после встречи экономят часы на восстановлении контекста через месяц.</p>`

  const KB_ARTICLES = [
    { title: "Как работать в CRM",             status: "published", catName: "Инструкции", excerpt: "Пошаговая инструкция по работе с CRM-системой компании.",           content: CRM_ARTICLE_CONTENT },
    { title: "Регламент работы с клиентами",   status: "published", catName: "Регламенты", excerpt: "Стандарты коммуникации и качества обслуживания.",                   content: null },
    { title: "Техника безопасности на складе", status: "published", catName: "Регламенты", excerpt: "Обязательные правила безопасности для складских сотрудников.",      content: null },
    { title: "Скрипт холодного звонка B2B",    status: "published", catName: "Продажи",    excerpt: "Готовый скрипт первого контакта с корпоративным клиентом.",         content: null },
    { title: "Онбординг нового сотрудника",    status: "published", catName: "HR",         excerpt: "Программа адаптации на первые 30 дней.",                            content: null },
    { title: "Политика конфиденциальности",    status: "published", catName: "Для сайта",  excerpt: "Обработка персональных данных и коммерческой тайны.",               content: null },
    { title: "FAQ по продукту",                status: "draft",     catName: "Продажи",    excerpt: "Ответы на частые вопросы клиентов.",                                content: null },
    { title: "Инструкция по работе с 1С",      status: "review",    catName: "Инструкции", excerpt: "Базовые операции в 1С для новых бухгалтеров.",                      content: null },
  ]

  const articleIds: string[] = []
  const authorPool = [hrLeadId, hrMgrId, bossId, salesHeadId]
  for (let i = 0; i < KB_ARTICLES.length; i++) {
    const a = KB_ARTICLES[i]
    const [ex] = await db.select({ id: knowledgeArticles.id }).from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.tenantId, company.id), eq(knowledgeArticles.title, a.title))).limit(1)
    if (ex) {
      articleIds.push(ex.id)
      continue
    }
    const slug = a.title.toLowerCase()
      .replace(/[а-яё\s]/g, (c) => {
        const map: Record<string, string> = {
          а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"zh", з:"z",
          и:"i", й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r",
          с:"s", т:"t", у:"u", ф:"f", х:"kh", ц:"ts", ч:"ch", ш:"sh",
          щ:"shch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya", " ": "-",
        }
        return map[c] ?? "-"
      })
      .replace(/-{2,}/g, "-").replace(/^-|-$/g, "")
    const [cr] = await db.insert(knowledgeArticles).values({
      tenantId: company.id,
      categoryId: kbCatIds[a.catName] ?? null,
      title: a.title,
      slug,
      excerpt: a.excerpt,
      content: a.content ?? `<p>${a.excerpt}</p><p>Полный текст статьи появится позже.</p>`,
      authorId: authorPool[i % authorPool.length],
      status: a.status,
      audience: ["employees"],
    }).returning()
    articleIds.push(cr.id)
    log.push(`kb-article:"${a.title}":created`)
  }

  // 8.6. Планы обучения (3) + назначения
  const demoTemplateList = await db.select({ id: demoTemplates.id }).from(demoTemplates)
    .where(eq(demoTemplates.tenantId, company.id)).limit(5)
  const demoIds = demoTemplateList.map((d) => d.id)

  const LEARNING_PLANS_DATA = [
    {
      title: "Онбординг менеджера продаж",
      description: "Базовая программа для нового менеджера B2B за 2 недели",
      materialRefs: [
        ...articleIds.slice(0, 3).map((id) => ({ materialId: id, materialType: "article" as const })),
        ...demoIds.slice(0, 2).map((id) => ({ materialId: id, materialType: "demo" as const })),
      ],
      assignees: [sales1Id, sales2Id, salesHeadId].filter(Boolean),
    },
    {
      title: "Базовое обучение IT",
      description: "Вводный курс для новых разработчиков",
      materialRefs: [
        ...articleIds.slice(0, 2).map((id) => ({ materialId: id, materialType: "article" as const })),
        ...demoIds.slice(0, 2).map((id) => ({ materialId: id, materialType: "demo" as const })),
      ],
      assignees: [frontId, backId].filter(Boolean),
    },
    {
      title: "Обязательные регламенты",
      description: "Техника безопасности, политика конфиденциальности и базовые процедуры",
      materialRefs: articleIds.slice(0, 3).map((id) => ({ materialId: id, materialType: "article" as const })),
      assignees: teamIds,
    },
  ]

  const statusCycle: Array<"completed" | "in_progress" | "overdue" | "assigned"> = []
  for (let i = 0; i < 5; i++) statusCycle.push("completed")
  for (let i = 0; i < 8; i++) statusCycle.push("in_progress")
  for (let i = 0; i < 3; i++) statusCycle.push("overdue")
  for (let i = 0; i < 2; i++) statusCycle.push("assigned")

  let statusIdx = 0
  for (const plan of LEARNING_PLANS_DATA) {
    const [exPlan] = await db.select({ id: learningPlans.id }).from(learningPlans)
      .where(and(eq(learningPlans.tenantId, company.id), eq(learningPlans.title, plan.title))).limit(1)
    let planId: string
    if (exPlan) {
      planId = exPlan.id
      log.push(`learning-plan:"${plan.title}":exists`)
    } else {
      const [cr] = await db.insert(learningPlans).values({
        tenantId: company.id,
        title: plan.title,
        description: plan.description,
        materials: plan.materialRefs.map((m, i) => ({ ...m, order: i, required: true })),
        createdBy: hrLeadId,
      }).returning()
      planId = cr.id
      log.push(`learning-plan:"${plan.title}":created`)
    }

    const [assignCount] = await db.select({ c: sql<number>`count(*)::int` }).from(learningAssignments)
      .where(eq(learningAssignments.planId, planId))
    if ((assignCount?.c ?? 0) > 0) continue

    const assignRows: typeof learningAssignments.$inferInsert[] = []
    for (const uid of plan.assignees) {
      if (!uid) continue
      const status = statusCycle[statusIdx % statusCycle.length]
      statusIdx++
      const assignedAt = daysAgo(Math.floor(Math.random() * 25) + 3)
      const progress: Record<string, { started_at?: string; completed_at?: string; score?: number }> = {}
      if (status === "completed") {
        for (const m of plan.materialRefs) {
          progress[m.materialId] = {
            started_at: assignedAt.toISOString(),
            completed_at: daysAgo(1).toISOString(),
            score: 80 + Math.floor(Math.random() * 20),
          }
        }
      } else if (status === "in_progress") {
        const half = Math.max(1, Math.floor(plan.materialRefs.length / 2))
        for (let i = 0; i < half; i++) {
          progress[plan.materialRefs[i].materialId] = {
            started_at: assignedAt.toISOString(),
            completed_at: daysAgo(2).toISOString(),
          }
        }
      }
      assignRows.push({
        planId,
        userId: uid,
        tenantId: company.id,
        status,
        progress,
        assignedAt,
        deadline: status === "overdue" ? daysAgo(2) : null,
        completedAt: status === "completed" ? daysAgo(1) : null,
      })
    }
    if (assignRows.length > 0) {
      await db.insert(learningAssignments).values(assignRows)
      log.push(`learning-assignments:"${plan.title}":${assignRows.length}`)
    }
  }

  // 8.7. AI usage log — 50 записей за последние 30 дней
  const [aiCount] = await db.select({ c: sql<number>`count(*)::int` }).from(aiUsageLog)
    .where(eq(aiUsageLog.tenantId, company.id))
  if ((aiCount?.c ?? 0) < 50) {
    const ACTIONS = [
      { action: "knowledge_ask",   count: 30 },
      { action: "document_parse",  count: 10 },
      { action: "vacancy_generate",count: 10 },
    ]
    const userPool = teamIds.slice(0, 6)
    const aiRows: typeof aiUsageLog.$inferInsert[] = []
    for (const a of ACTIONS) {
      for (let i = 0; i < a.count; i++) {
        const inputTokens = 500 + Math.floor(Math.random() * 4500)
        const outputTokens = 200 + Math.floor(Math.random() * 1800)
        const cost = ((inputTokens * 3) / 1_000_000 + (outputTokens * 15) / 1_000_000).toFixed(6)
        aiRows.push({
          tenantId: company.id,
          userId: userPool[i % userPool.length],
          action: a.action,
          inputTokens,
          outputTokens,
          model: "claude-sonnet-4-20250514",
          costUsd: cost,
          createdAt: daysAgo(Math.floor(Math.random() * 30)),
        })
      }
    }
    for (let i = 0; i < aiRows.length; i += 25) {
      await db.insert(aiUsageLog).values(aiRows.slice(i, i + 25))
    }
    log.push(`ai-usage-log:${aiRows.length} created`)
  } else {
    log.push(`ai-usage-log:already has ${aiCount?.c} rows`)
  }

  // 8.8. CRM — 5 компаний-клиентов + 10 контактов
  const SALES_COMPANIES = [
    { name: "ООО \"ТехноПром\"",    industry: "Производство",   city: "Москва",           inn: "7712345678" },
    { name: "АО \"СтройГарант\"",   industry: "Строительство",  city: "Санкт-Петербург",  inn: "7809876543" },
    { name: "ООО \"РитейлПлюс\"",   industry: "Ритейл",         city: "Екатеринбург",     inn: "6623456789" },
    { name: "ООО \"ЛогистикСервис\"",industry: "Логистика",     city: "Новосибирск",      inn: "5434567890" },
    { name: "ИП \"Смирнов\"",       industry: "Услуги",         city: "Казань",           inn: "166123456789" },
  ]

  const salesCompIds: string[] = []
  for (const c of SALES_COMPANIES) {
    const [ex] = await db.select({ id: salesCompanies.id }).from(salesCompanies)
      .where(and(eq(salesCompanies.tenantId, company.id), eq(salesCompanies.name, c.name))).limit(1)
    if (ex) {
      salesCompIds.push(ex.id)
      continue
    }
    const [cr] = await db.insert(salesCompanies).values({
      tenantId: company.id,
      name: c.name,
      inn: c.inn,
      industry: c.industry,
      city: c.city,
      type: "client",
      status: "active",
    }).returning()
    salesCompIds.push(cr.id)
    log.push(`sales-company:"${c.name}":created`)
  }

  const SALES_CONTACTS = [
    { companyIdx: 0, firstName: "Андрей",   lastName: "Тимофеев",  position: "Генеральный директор" },
    { companyIdx: 0, firstName: "Ольга",    lastName: "Зайцева",   position: "Главный инженер" },
    { companyIdx: 1, firstName: "Виктор",   lastName: "Михайлов",  position: "Коммерческий директор" },
    { companyIdx: 1, firstName: "Ирина",    lastName: "Карпова",   position: "Финансовый директор" },
    { companyIdx: 2, firstName: "Сергей",   lastName: "Борисов",   position: "Директор по закупкам" },
    { companyIdx: 2, firstName: "Юлия",     lastName: "Комарова",  position: "Маркетолог" },
    { companyIdx: 3, firstName: "Николай",  lastName: "Соловьёв",  position: "Руководитель отдела логистики" },
    { companyIdx: 3, firstName: "Екатерина",lastName: "Яковлева",  position: "Менеджер по клиентам" },
    { companyIdx: 4, firstName: "Алексей",  lastName: "Смирнов",   position: "Владелец" },
    { companyIdx: 4, firstName: "Мария",    lastName: "Киселёва",  position: "Ассистент" },
  ]

  for (let i = 0; i < SALES_CONTACTS.length; i++) {
    const c = SALES_CONTACTS[i]
    const email = `${c.lastName.toLowerCase()}.${c.firstName.toLowerCase()}@client-demo.ru`
      .replace(/[а-яё]/g, (ch) => {
        const m: Record<string, string> = {
          а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",
          к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
          х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
        }
        return m[ch] ?? ""
      })
    const [ex] = await db.select({ id: salesContacts.id }).from(salesContacts)
      .where(and(eq(salesContacts.tenantId, company.id), eq(salesContacts.email, email))).limit(1)
    if (ex) continue
    await db.insert(salesContacts).values({
      tenantId: company.id,
      companyId: salesCompIds[c.companyIdx] ?? null,
      firstName: c.firstName,
      lastName: c.lastName,
      position: c.position,
      phone: phone(),
      email,
      isPrimary: i % 2 === 0,
    })
    log.push(`sales-contact:${c.firstName} ${c.lastName}:created`)
  }

  return NextResponse.json({ ok: true, log })
}
