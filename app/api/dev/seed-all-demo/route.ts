/**
 * POST /api/dev/seed-all-demo
 * Полный идемпотентный демо-сид для production-среды.
 * Требует NODE_ENV=development ИЛИ ALLOW_DEV_LOGIN=true в .env
 */
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { eq, and, or, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  companies, users, plans, planModules, tenantModules,
  vacancies, candidates,
  adaptationPlans, adaptationSteps, adaptationAssignments, stepCompletions,
  employeePoints, pointsHistory, badges, employeeBadges,
  courses, lessons, courseEnrollments, lessonCompletions, certificates,
  skills, assessments, skillAssessments, assessmentReviewers,
} from "@/lib/db/schema"
import { generateCandidateToken } from "@/lib/candidate-tokens"

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
  if (!isDevAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const log: string[] = []

  // ── 1. Компания + тариф Pro ─────────────────────────────────────────────────
  let company = await db.select().from(companies).limit(1).then(r => r[0])
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

  return NextResponse.json({ ok: true, log })
}
