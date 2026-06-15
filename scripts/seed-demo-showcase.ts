/**
 * seed-demo-showcase.ts — наполняет демо-тенант COMPANY24.PRO показательными
 * данными для демонстрации платформы клиентам.
 *
 * Идемпотентен: при повторном запуске СНАЧАЛА чистит HR-воронку демо-компании
 * (вакансии/кандидаты/интервью/контакты/резерв), затем создаёт заново.
 * Трогает ТОЛЬКО компанию DEMO_COMPANY_ID — реальные тенанты не задевает.
 *
 * Что делает:
 *  - ставит пароль демо-директору (director@company24.pro)
 *  - изолирует компанию от кронов (ai_chatbot_killed = true; демо-кандидаты без hh-id)
 *  - 4 вакансии (2 активные, 1 закрытая, 1 на паузе)
 *  - ~75 кандидатов по ВСЕМ стадиям, с резюме/AI-баллами, фото, городами, датами
 *  - интервью в календаре (прошлые + ближайшие)
 *  - созвоны (candidate_contacts), резерв (talent_pool_entries)
 *
 * Запуск (staging/prod, безопасно — только демо-компания):
 *   npx tsx scripts/seed-demo-showcase.ts
 */

import { eq, inArray } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db, pgClient } from "@/lib/db"
import {
  companies, users, vacancies, candidates,
  calendarEvents, candidateContacts, talentPoolEntries,
} from "@/lib/db/schema"

const DEMO_COMPANY_ID = "ae75117f-a3b7-49f5-abf3-8b3fbd9e3de9"
const DEMO_DIRECTOR_EMAIL = "director@company24.pro"
const DEMO_DIRECTOR_PASSWORD = "Reset2026!"

// ── Детерминированный PRNG (mulberry32) — повторный запуск даёт те же данные ──
let _seed = 20260615
function rnd(): number {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rnd() * arr.length)] }
function int(min: number, max: number): number { return Math.floor(rnd() * (max - min + 1)) + min }
function chance(p: number): boolean { return rnd() < p }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86400000) }
function daysFromNow(d: number): Date { return new Date(Date.now() + d * 86400000) }

// ── Пулы данных ──────────────────────────────────────────────────────────────
const MALE = [
  ["Александр", "Иванов"], ["Дмитрий", "Соколов"], ["Сергей", "Кузнецов"],
  ["Андрей", "Попов"], ["Алексей", "Лебедев"], ["Максим", "Новиков"],
  ["Иван", "Морозов"], ["Михаил", "Волков"], ["Николай", "Зайцев"],
  ["Павел", "Соловьёв"], ["Роман", "Васильев"], ["Кирилл", "Петров"],
  ["Егор", "Смирнов"], ["Владимир", "Фёдоров"], ["Артём", "Михайлов"],
]
const FEMALE = [
  ["Анна", "Смирнова"], ["Мария", "Кузнецова"], ["Екатерина", "Волкова"],
  ["Ольга", "Новикова"], ["Наталья", "Морозова"], ["Татьяна", "Лебедева"],
  ["Юлия", "Козлова"], ["Елена", "Орлова"], ["Светлана", "Белова"],
  ["Дарья", "Павлова"], ["Ирина", "Голубева"], ["Полина", "Крылова"],
  ["Виктория", "Сорокина"], ["Ксения", "Фомина"], ["Алина", "Гусева"],
]
const CITIES = [
  "Москва", "Санкт-Петербург", "Краснодар", "Новосибирск", "Екатеринбург",
  "Казань", "Нижний Новгород", "Ростов-на-Дону", "Самара", "Челябинск",
  "Пермь", "Воронеж", "Тольятти", "Уфа", "Рязань",
]
const EDU = ["secondary", "specialized", "higher", "higher", "mba"] as const
const FMT = ["office", "hybrid", "remote"] as const

interface VacancyDef {
  slug: string; shortCode: string; title: string; status: string
  city: string; format: string; salaryMin: number; salaryMax: number
  requiredExperience: string; createdDaysAgo: number; hhArchived?: boolean
  skills: string[]
}
const VACANCIES: VacancyDef[] = [
  {
    slug: "demo-sales-manager", shortCode: "D24V0001", title: "Менеджер по продажам",
    status: "published", city: "Москва", format: "office", salaryMin: 80000, salaryMax: 150000,
    requiredExperience: "1-3", createdDaysAgo: 40,
    skills: ["Продажи B2B", "CRM", "Переговоры", "Работа с возражениями", "Холодные звонки"],
  },
  {
    slug: "demo-frontend-react", shortCode: "D24V0002", title: "Frontend-разработчик (React)",
    status: "published", city: "Санкт-Петербург", format: "remote", salaryMin: 150000, salaryMax: 280000,
    requiredExperience: "3-6", createdDaysAgo: 28,
    skills: ["React", "TypeScript", "Next.js", "Tailwind", "REST API", "Git"],
  },
  {
    slug: "demo-accountant", shortCode: "D24V0003", title: "Бухгалтер",
    status: "closed", city: "Краснодар", format: "hybrid", salaryMin: 70000, salaryMax: 110000,
    requiredExperience: "3-6", createdDaysAgo: 75, hhArchived: true,
    skills: ["1С:Бухгалтерия", "Налоговый учёт", "Первичная документация", "Отчётность"],
  },
  {
    slug: "demo-call-operator", shortCode: "D24V0004", title: "Оператор call-центра",
    status: "paused", city: "Новосибирск", format: "remote", salaryMin: 45000, salaryMax: 70000,
    requiredExperience: "none", createdDaysAgo: 18,
    skills: ["Телефония", "Скрипты продаж", "Грамотная речь", "Стрессоустойчивость"],
  },
]

// Стадии и их распределение (больше вверху воронки, меньше внизу).
const STAGE_PLAN: { stage: string; count: number }[] = [
  { stage: "new", count: 12 },
  { stage: "primary_contact", count: 9 },
  { stage: "demo_opened", count: 8 },
  { stage: "anketa_filled", count: 7 },
  { stage: "ai_screening", count: 6 },
  { stage: "test_task_sent", count: 3 },
  { stage: "test_task_done", count: 2 },
  { stage: "test_passed", count: 3 },
  { stage: "test_failed", count: 2 },
  { stage: "interview", count: 5 },
  { stage: "reference_check", count: 2 },
  { stage: "decision", count: 3 },
  { stage: "offer_sent", count: 2 },
  { stage: "hired", count: 3 },
  { stage: "started_work", count: 2 },
  { stage: "rejected", count: 8 },
]
// Стадии «после анкеты» — у них есть AI-оценка (aiScore), не только резюме.
const POST_ANKETA = new Set([
  "anketa_filled", "ai_screening", "test_task_sent", "test_task_done",
  "test_passed", "test_failed", "internship", "scheduled", "interview",
  "reference_check", "decision", "offer_sent", "hired", "started_work",
])
const REJECTION_REASONS = ["salary", "experience", "location", "no_answer", "other_offer", "skills"]

function avatar(name: string, i: number): string {
  return `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(name + "-" + i)}&size=240`
}

async function main() {
  console.log(`[demo-showcase] старт — компания ${DEMO_COMPANY_ID}`)

  // ── 0. Демо-директор: пароль + изоляция компании ──────────────────────────
  const [dir] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, DEMO_DIRECTOR_EMAIL)).limit(1)
  if (!dir) throw new Error(`Нет пользователя ${DEMO_DIRECTOR_EMAIL} — создайте сначала`)
  const passwordHash = await bcrypt.hash(DEMO_DIRECTOR_PASSWORD, 10)
  await db.update(users).set({ passwordHash, role: "director" }).where(eq(users.id, dir.id))
  await db.update(companies).set({ aiChatbotKilled: true }).where(eq(companies.id, DEMO_COMPANY_ID))
  console.log(`[demo-showcase] пароль директора обновлён, ai_chatbot_killed=true`)

  // ── 1. Чистка прежней демо-воронки (только этой компании) ─────────────────
  const oldVacs = await db.select({ id: vacancies.id }).from(vacancies)
    .where(eq(vacancies.companyId, DEMO_COMPANY_ID))
  await db.delete(candidateContacts).where(eq(candidateContacts.tenantId, DEMO_COMPANY_ID))
  await db.delete(calendarEvents).where(eq(calendarEvents.companyId, DEMO_COMPANY_ID))
  await db.delete(talentPoolEntries).where(eq(talentPoolEntries.companyId, DEMO_COMPANY_ID))
  if (oldVacs.length) {
    await db.delete(candidates).where(inArray(candidates.vacancyId, oldVacs.map(v => v.id)))
    await db.delete(vacancies).where(eq(vacancies.companyId, DEMO_COMPANY_ID))
  }
  console.log(`[demo-showcase] очищено: ${oldVacs.length} старых вакансий`)

  // ── 2. Вакансии ───────────────────────────────────────────────────────────
  const vacIds: Record<string, string> = {}
  for (const v of VACANCIES) {
    const [row] = await db.insert(vacancies).values({
      companyId: DEMO_COMPANY_ID,
      createdBy: dir.id,
      title: v.title,
      slug: v.slug,
      shortCode: v.shortCode,
      status: v.status,
      city: v.city,
      format: v.format,
      employment: "full",
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      requiredExperience: v.requiredExperience,
      hiringPlan: int(1, 3),
      hhArchived: v.hhArchived ?? false,
      closedAt: v.status === "closed" ? daysAgo(5) : null,
      aiChatbotEnabled: false,                       // изоляция: бот выключен
      createdAt: daysAgo(v.createdDaysAgo),
      updatedAt: daysAgo(int(0, 3)),
    }).returning({ id: vacancies.id })
    vacIds[v.slug] = row.id
  }
  console.log(`[demo-showcase] создано вакансий: ${VACANCIES.length}`)

  // ── 3. Кандидаты по стадиям ───────────────────────────────────────────────
  // Активные вакансии тянут основную воронку; закрытая — наняты; на паузе — немного.
  const activeSlugs = ["demo-sales-manager", "demo-frontend-react"]
  let globalSeq = 0
  let candCount = 0
  const interviewCandidates: { id: string; name: string; vacId: string; stage: string }[] = []
  const contactCandidates: { id: string; name: string; vacId: string; stage: string }[] = []

  for (const plan of STAGE_PLAN) {
    for (let k = 0; k < plan.count; k++) {
      globalSeq++
      const female = chance(0.5)
      const [first, last] = female ? pick(FEMALE) : pick(MALE)
      const name = `${first} ${last}`
      // Закрытая вакансия — наняты/в работе; остальное — на активные.
      let vacSlug: string
      if (plan.stage === "hired" || plan.stage === "started_work") {
        vacSlug = chance(0.5) ? "demo-accountant" : pick(activeSlugs)
      } else {
        vacSlug = pick(activeSlugs)
      }
      const vacId = vacIds[vacSlug]
      const vac = VACANCIES.find(v => v.slug === vacSlug)!

      const resumeScore = plan.stage === "rejected" ? int(20, 55)
        : plan.stage === "new" ? int(35, 85)
        : int(55, 95)
      const aiScore = POST_ANKETA.has(plan.stage) ? int(50, 95) : null
      const createdDays = int(2, Math.min(vac.createdDaysAgo, 42))
      const stageHistory = buildHistory(plan.stage, createdDays)

      const isRejected = plan.stage === "rejected"
      const [row] = await db.insert(candidates).values({
        vacancyId: vacId,
        name,
        phone: `+79${int(10, 99)}${int(1000000, 9999999)}`,
        email: `${translit(first)}.${translit(last)}${globalSeq}@example.com`,
        city: pick(CITIES),
        source: pick(["hh", "hh", "hh", "avito", "site", "referral"]),
        stage: plan.stage,
        salaryMin: vac.salaryMin + int(-15000, 10000),
        salaryMax: vac.salaryMax + int(-20000, 25000),
        experienceYears: int(0, 14),
        skills: vac.skills.slice(0, int(2, vac.skills.length)),
        keySkills: vac.skills.slice(0, int(2, 4)),
        workFormat: pick(FMT),
        educationLevel: pick(EDU),
        languages: chance(0.5) ? ["russian", "english"] : ["russian"],
        relocationReady: chance(0.4),
        photoUrl: avatar(name, globalSeq),
        token: `demo-tok-${vac.shortCode}-${globalSeq}`,
        shortId: `${vac.shortCode}${String(globalSeq).padStart(4, "0")}`,
        sequenceNumber: globalSeq,
        resumeScore,
        aiScore,
        aiSummary: aiScore ? aiSummaryFor(aiScore, name) : null,
        aiScoredAt: aiScore ? daysAgo(int(1, createdDays)) : null,
        isFavorite: chance(0.12),
        stageHistory,
        demoOpenedAt: ["new", "primary_contact"].includes(plan.stage) ? null : daysAgo(createdDays - 1),
        autoProcessingStopped: isRejected,
        autoProcessingStoppedReason: isRejected ? `manual_reject` : null,
        rejectionReasonCategory: isRejected ? pick(REJECTION_REASONS) : null,
        rejectionInitiator: isRejected ? (chance(0.35) ? "candidate" : "company") : null,
        rejectionAt: isRejected ? daysAgo(int(1, createdDays)) : null,
        createdAt: daysAgo(createdDays),
        updatedAt: daysAgo(int(0, 2)),
      }).returning({ id: candidates.id })
      candCount++

      if (["interview", "scheduled"].includes(plan.stage) || (plan.stage === "hired" && chance(0.6))) {
        interviewCandidates.push({ id: row.id, name, vacId, stage: plan.stage })
      }
      if (["primary_contact", "interview", "decision", "reference_check", "offer_sent", "rejected"].includes(plan.stage)) {
        contactCandidates.push({ id: row.id, name, vacId, stage: plan.stage })
      }
    }
  }
  console.log(`[demo-showcase] создано кандидатов: ${candCount}`)

  // ── 4. Интервью (calendar_events) ─────────────────────────────────────────
  let evCount = 0
  for (const c of interviewCandidates) {
    const upcoming = c.stage !== "hired" && chance(0.7)
    const start = upcoming ? daysFromNow(int(0, 9)) : daysAgo(int(1, 14))
    start.setHours(int(10, 17), pick([0, 30]), 0, 0)
    const end = new Date(start.getTime() + 45 * 60000)
    await db.insert(calendarEvents).values({
      companyId: DEMO_COMPANY_ID,
      title: `Интервью · ${c.name}`,
      type: "interview",
      startAt: start,
      endAt: end,
      createdBy: dir.id,
      status: "confirmed",
      candidateId: c.id,
      vacancyId: c.vacId,
      interviewer: pick(["Анна Смирнова", "Дмитрий Ковалёв", "Тестовый Директор"]),
      interviewType: pick(["HR", "Техническое", "Финальное"]),
      interviewFormat: pick(["Онлайн", "Офис"]),
      interviewStatus: upcoming ? pick(["Подтверждено", "Ожидает"]) : "Пройдено",
      scope: "company",
    })
    evCount++
  }
  console.log(`[demo-showcase] создано интервью: ${evCount}`)

  // ── 5. Созвоны (candidate_contacts) ───────────────────────────────────────
  let ctCount = 0
  for (const c of contactCandidates) {
    const n = int(1, 2)
    for (let i = 0; i < n; i++) {
      const isReject = c.stage === "rejected"
      await db.insert(candidateContacts).values({
        tenantId: DEMO_COMPANY_ID,
        candidateId: c.id,
        vacancyId: c.vacId,
        channel: pick(["call", "call", "video", "meeting"]),
        outcome: isReject ? "no_fit" : pick(["fit", "fit", "pending"]),
        reasonCategory: isReject ? pick(REJECTION_REASONS) : null,
        comment: pick([
          "Договорились о следующем шаге.", "Кандидат заинтересован.",
          "Уточнили ожидания по зарплате.", "Перенесли разговор.",
          "Хорошее впечатление, двигаем дальше.", "",
        ]),
        createdById: dir.id,
        createdAt: daysAgo(int(1, 20)),
      })
      ctCount++
    }
  }
  console.log(`[demo-showcase] создано контактов: ${ctCount}`)

  // ── 6. Резерв (talent_pool_entries) ───────────────────────────────────────
  let tpCount = 0
  for (let i = 0; i < 14; i++) {
    const female = chance(0.5)
    const [first, last] = female ? pick(FEMALE) : pick(MALE)
    await db.insert(talentPoolEntries).values({
      companyId: DEMO_COMPANY_ID,
      name: `${first} ${last}`,
      position: pick(["Менеджер по продажам", "Frontend-разработчик", "Бухгалтер", "Маркетолог", "HR-менеджер"]),
      company: pick(["—", "ООО Альфа", "ИП Сидоров", "ГК Вектор", "—"]),
      source: pick(["hh", "Рекомендация", "LinkedIn", "Прошлая вакансия"]),
      email: `${translit(first)}.${translit(last)}@example.com`,
      phone: `+79${int(10, 99)}${int(1000000, 9999999)}`,
      comment: pick(["Сильный кандидат, не подошёл по локации.", "Вернуться через квартал.", "Хороший фит на будущее.", ""]),
      score: int(40, 95),
      status: pick(["cold", "warming", "hot", "ideal"]),
    })
    tpCount++
  }
  console.log(`[demo-showcase] создано в резерве: ${tpCount}`)

  console.log(`[demo-showcase] ГОТОВО ✅  вакансий=${VACANCIES.length} кандидатов=${candCount} интервью=${evCount} контактов=${ctCount} резерв=${tpCount}`)
}

function buildHistory(stage: string, createdDays: number): { stage: string; date: string; note?: string }[] {
  const order = ["new", "primary_contact", "demo_opened", "anketa_filled", "ai_screening",
    "test_passed", "interview", "decision", "offer_sent", "hired"]
  const idx = order.indexOf(stage)
  const path = idx >= 0 ? order.slice(0, idx + 1) : ["new", stage]
  const span = createdDays
  return path.map((s, i) => ({
    stage: s,
    date: daysAgo(Math.round(span - (span * i) / Math.max(path.length, 1))).toISOString(),
  }))
}

function aiSummaryFor(score: number, name: string): string {
  if (score >= 80) return `${name}: сильное соответствие — релевантный опыт, уверенные ответы, рекомендуем к интервью.`
  if (score >= 65) return `${name}: хорошее соответствие, есть зоны для уточнения на интервью.`
  return `${name}: частичное соответствие, требует дополнительной проверки.`
}

const TR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
}
function translit(s: string): string {
  return s.toLowerCase().split("").map(ch => TR[ch] ?? ch).join("")
}

main()
  .then(async () => { await pgClient.end(); process.exit(0) })
  .catch(async (e) => { console.error("[demo-showcase] ОШИБКА:", e); await pgClient.end(); process.exit(1) })
