// ТЗ №2: контент первого системного шаблона роли «Менеджер продаж B2B».
// Идемпотентный сид: создаёт/обновляет системную анкету (questionnaire_templates),
// короткое демо (demo_templates) и строку роли (role_templates, slug уникален).
// Контент уложен в реальные типы проекта (Question / CandidateSpec / FunnelV2Stage).
// Токены {{...}} хранятся как есть — подстановка профиля продукта в ТЗ №3.

import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { roleTemplates, questionnaireTemplates, demoTemplates } from "@/lib/db/schema"
import { makeStage, type FunnelV2Stage, type StageActionType } from "@/lib/funnel-v2/types"
import type { CandidateSpec } from "@/lib/core/spec/types"
import type { Question } from "@/lib/course-types"
import type { RoleScoringFormula } from "./types"

export const SALES_MANAGER_B2B_SLUG = "sales-manager-b2b"
const QUESTIONNAIRE_NAME = "Менеджер продаж B2B — анкета (системная)"
const DEMO_NAME = "Менеджер продаж B2B — короткое демо (системное)"

// ─── Анкета (Question[]) ─────────────────────────────────────────────────────
// 6 смысловых вопросов ТЗ. «Варианты + парный короткий текст» расщеплены на два
// вопроса: выбор + короткий-открытый. Анти-гейминг живёт в aiCriteria короткого
// (textMatchMode:"ai") — реально заходит в скоринг, а не мёртвое поле.

function q(p: Partial<Question> & Pick<Question, "id" | "text" | "answerType">): Question {
  return { required: true, options: [], ...p }
}

export const SALES_B2B_QUESTIONS: Question[] = [
  q({
    id: "q1_what", text: "Какие продукты/услуги вы продавали?", answerType: "multiple", points: 0,
    options: [
      "SaaS/облачные сервисы", "CRM/ERP/автоматизация", "AI/IT/ПО", "Digital/реклама/SEO",
      "Внедрение CRM/интеграции", "B2B-услуги для бизнеса", "Оборудование/товары",
      "B2C-продукты", "Другое",
    ],
    otherOptions: [8], otherPlaceholder: "Что именно",
  }),
  q({
    id: "q1_example", text: "Назовите 1 продукт, который продавали чаще всего: что это и кому.",
    answerType: "short", textMatchMode: "ai",
    aiCriteria: "Сверь с отмеченными вариантами в вопросе про продукты (анти-гейминг). " +
      "Если отмечены IT/SaaS/CRM, а пример про простой товар или B2C — оценивай по примеру, " +
      "а не по галочкам. Широкие галочки без подтверждения в тексте → ниже балл.",
  }),
  q({
    id: "q2_check", text: "Средний чек сделки", answerType: "single", points: 0,
    options: ["до 30к", "30–100к", "100–300к", "300к–1млн", ">1млн", "не помню"],
  }),
  q({
    id: "q2_cycle", text: "Типичный цикл сделки", answerType: "single", points: 0,
    options: ["1 день", "2–7 дней", "1–4 недели", "1–3 мес", ">3 мес", "не помню"],
  }),
  q({
    id: "q2_example", text: "Пример сделки: чек и кто принимал решение.",
    answerType: "short", textMatchMode: "ai",
    aiCriteria: "«Не помню» по чеку — снижать. Чек оценивай по сложности B2B-сделки, " +
      "не по величине цифры: recurring 30–100к и разовые 500к+ оба релевантны; " +
      "резать только мелкий разовый чек уровня B2C.",
  }),
  q({
    id: "q3_dm", text: "С кем вы чаще всего закрывали сделку?", answerType: "single", points: 0,
    options: [
      "Собственник", "CEO/гендир", "Коммерческий директор", "РОП", "HRD",
      "Директор по маркетингу", "IT-директор", "Закупки", "Администраторы/исполнители", "Физлица",
    ],
  }),
  q({
    id: "q3_how", text: "Как вы выходили на этого человека?", answerType: "short", textMatchMode: "ai",
    aiCriteria: "Оценивай реальный уровень ЛПР и канал выхода. Собственник/директор + " +
      "самостоятельный выход (холодный/нетворк) → выше; «давали входящие/база» → ниже.",
  }),
  q({
    id: "q4_role", text: "Ваша роль в сделке", answerType: "single", points: 0,
    options: [
      "Сам искал, выходил на ЛПР, вёл и закрывал",
      "Работал с холодными, но закрывал другой",
      "Только входящие заявки",
      "Только демо/презентации",
      "Только сопровождение текущих",
    ],
  }),
  q({
    id: "q4_describe", text: "Опишите вашу роль в сделке от контакта до оплаты.",
    answerType: "long", textMatchMode: "ai",
    aiCriteria: "Полный цикл (поиск→ЛПР→демо→закрытие) → выше. Только входящие или только " +
      "сопровождение → ниже. Сверь с выбранным вариантом роли.",
  }),
  q({
    id: "q5_best_deal",
    text: "Опишите лучшую сделку коротко: 1) Что продали и кому (должность)? " +
      "2) Какое было главное возражение и как сняли? 3) Чек? 4) Срок закрытия?",
    answerType: "long", textMatchMode: "ai",
    aiCriteria: "Оцени конкретность: реальные детали (должность ЛПР, конкретное возражение и " +
      "приём его снятия, цифры чека и срока) → выше. Общие слова без деталей → ниже.",
  }),
  q({
    id: "q6_numbers",
    text: "Ваши цифры за последний месяц: план/факт, встречи, сделки, выручка, конверсия — что помните.",
    answerType: "long", textMatchMode: "ai",
    aiCriteria: "«Не знаю/не помню» по KPI — снижать. Знание хотя бы чек/конверсия/план — плюс. " +
      "Конкретные числа → выше, чем общие фразы.",
  }),
]

// ─── Критерии оценки (Partial<CandidateSpec>) ────────────────────────────────
// scoringWeights — реальные 9 фиксированных осей (sales-настройка). Семантические
// 6 критериев ТЗ (Σ=100) сохранены в customCriteria, чтобы приоритеты роли были
// явными и не потерялись. passingScore 60 → anketaThresholds.lowerThreshold.

export const SALES_B2B_SPEC: Partial<CandidateSpec> = {
  mustHave: [
    { text: "B2B-продажи от 2 лет (не B2C, не розница)", hard: true },
    { text: "Опыт продажи сложного/нематериального продукта (SaaS/IT/CRM/digital/услуги для бизнеса)", hard: true },
    { text: "Полный или почти полный цикл сделки (не только входящие)", hard: true },
    { text: "Оперирует своими цифрами (хотя бы чек/конверсия/план)", hard: true },
  ],
  niceToHave: [
    { text: "Прямой опыт SaaS/CRM/AI/автоматизации", importance: "very" },
    { text: "Опыт с собственниками/директорами SMB (= {{icp}})", importance: "important" },
    { text: "Холодный поиск и самостоятельный выход на ЛПР", importance: "important" },
    { text: "Уверенная работа в CRM (Bitrix24/AmoCRM/HubSpot)", importance: "nice" },
    { text: "Проводил демо сложного продукта", importance: "nice" },
  ],
  dealBreakers: [
    { text: "Только B2C/розница/простые товары", hard: true },
    { text: "Только входящие, нет самостоятельного создания продаж", hard: true },
    { text: "Не знает ни одной своей цифры, не может описать ни одной сделки", hard: true },
  ],
  idealProfile:
    "Продавал B2B SaaS/CRM/digital собственникам и руководителям SMB по полному циклу, " +
    "сам находил клиентов и выходил на ЛПР, оперирует цифрами (конверсия, чек, выручка), " +
    "умеет объяснить сложный продукт ({{productName}}) через бизнес-ценность.",
  anketaThresholds: { enabled: true, upperThreshold: 80, lowerThreshold: 60 },
  scoringWeights: {
    relevant_experience: 35,
    results_in_numbers:  20,
    soft_skills_fit:     15,
    hard_skills:         10,
    company_size_match:   5,
    managerial_match:     5,
    tenure_stability:     3,
    location_readiness:   4,
    education:            3,
  },
  customCriteria: [
    { key: "relevant_sales_experience", label: "Релевантный опыт продаж (тип продукта + B2B)", weight: "critical",  importance: 30, hardness: "soft", aiMode: "instruction", hint: "тип продаваемого продукта (сложный/нематериальный) + именно B2B" },
    { key: "deal_independence",         label: "Самостоятельность в сделке (полный цикл, не входящие)", weight: "important", importance: 20, hardness: "soft", aiMode: "instruction" },
    { key: "work_with_dm",              label: "Работа с ЛПР", weight: "important", importance: 15, hardness: "soft", aiMode: "instruction" },
    { key: "numbers_results",           label: "Цифры/результаты (знает чек, цикл, KPI)", weight: "important", importance: 15, hardness: "soft", aiMode: "instruction" },
    { key: "best_deal_specificity",     label: "Конкретность лучшей сделки", weight: "nice", importance: 10, hardness: "soft", aiMode: "context" },
    { key: "complex_product_readiness", label: "Готовность к сложному продукту / обучаемость", weight: "nice", importance: 10, hardness: "soft", aiMode: "context" },
  ],
}

// ─── Стадии Воронки v2 (FunnelV2Stage[]) ─────────────────────────────────────
// Action'ы — только из реального enum. Скан резюме → prequalification (мягко),
// анкета-гейт → test (несёт threshold+AI-проверку), скрининг/интервью →
// interview+phone (Call-Agent — заглушка, ТЗ §4), решение → offer.

function stage(action: StageActionType, seed: string, over: Partial<FunnelV2Stage>): FunnelV2Stage {
  const base = makeStage(action, seed)
  return { ...base, ...over, rule: { ...base.rule, ...(over.rule ?? {}) } }
}

export const SALES_B2B_FUNNEL: FunnelV2Stage[] = [
  stage("prequalification", "smb2b-1-scan", {
    title: "Отклик → скан резюме",
    dozhim: "off",
    rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60, passCriteria: "Критерии из Портрета (spec). Порог мягкий: пусто → проходят дальше." },
  }),
  stage("demo", "smb2b-2-demo", {
    title: "Демонстрация",
    contentBlockId: null,
    dozhim: "strong",
    rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 },
  }),
  stage("test", "smb2b-3-anketa", {
    title: "Анкета + AI-скрининг",
    dozhim: "standard",
    rule: { autoAdvance: false, autoReject: true, threshold: 60, rejectDelayMinutes: 60, passCriteria: "Анкета ≥60 (passingScore). Ниже порога → не проходит — ключевой автоотсев." },
  }),
  stage("interview", "smb2b-4-screen", {
    title: "Скрининг (голос)",
    interviewMode: "phone",
    scheduling: ["bot", "self_link"],
    dozhim: "soft",
    rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60, passCriteria: "Звонок → транскрипт → скоринг через Call-Agent. Вес в финале 0.4." },
  }),
  stage("interview", "smb2b-5-interview", {
    title: "Интервью (голос)",
    interviewMode: "phone",
    scheduling: ["bot", "self_link"],
    dozhim: "soft",
    rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60, passCriteria: "Ролёвки → транскрипт → скоринг через Call-Agent. Вес в финале 0.6." },
  }),
  stage("offer", "smb2b-6-offer", {
    title: "Решение / оффер",
    dozhim: "off",
    rule: { autoAdvance: false, autoReject: false, rejectDelayMinutes: 60 },
  }),
]

// ─── Формула финала (RoleScoringFormula) ─────────────────────────────────────
export const SALES_B2B_FORMULA: RoleScoringFormula = {
  weights: { screening: 0.4, interview: 0.6 },
  statuses: { suitable: 80, review: 65 },
  anketaGate: { passingScore: 60 },
  note: "Анкета — гейт (≥60). Финал = скрининг·0.4 + интервью·0.6. " +
    "≥80 подходит · 65–79 рассмотреть · <65 не подходит.",
}

// ─── Демо (Lesson[]) — короткое, 4 блока ─────────────────────────────────────
// Контент с токенами профиля продукта; подстановка — ТЗ №3.

function p(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((para) => `<p style="margin:0 0 12px 0;line-height:1.55">${para.replace(/\n/g, "<br/>")}</p>`)
    .join("")
}

function blk(id: string, type: string, content: string, extras: Record<string, unknown> = {}) {
  return {
    id, type, content,
    imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
    videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
    audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
    fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
    infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
    buttonText: "Подробнее", buttonUrl: "", buttonVariant: "primary", buttonColor: "",
    buttonIconBefore: "", buttonIconAfter: "",
    taskTitle: "", taskDescription: "", questions: [],
    ...extras,
  }
}

function lesson(id: string, emoji: string, title: string, blocks: ReturnType<typeof blk>[]) {
  return { id, emoji, title, blocks }
}

export const SALES_B2B_DEMO_SECTIONS = [
  lesson("l1", "👋", "Приветствие", [
    blk("b1", "text", p(
      "Здравствуйте, {{имя}}! Рады, что вы откликнулись на вакансию «{{должность}}» в {{компания}}.\n\n" +
      "Это короткое демо за пару минут расскажет, что мы продаём, кому и какой будет ваша роль. " +
      "В конце — пара вопросов."
    )),
  ]),
  lesson("l2", "📦", "О продукте", [
    blk("b2", "text", p(
      "Мы продаём: {{productName}}.\n\n{{productDescription}}\n\n" +
      "Наши клиенты ({{icp}}) покупают это, чтобы решать конкретную бизнес-задачу — " +
      "ваша работа объяснить ценность через их выгоду, а не через фичи."
    )),
  ]),
  lesson("l3", "🎯", "Ваша роль", [
    blk("b3", "text", p(
      "Тип продаж: {{salesType}}. Средний чек: {{checkRange}}. Цикл сделки: {{dealCycle}}.\n\n" +
      "Вы ведёте сделку по полному циклу: выход на ЛПР → демонстрация → снятие возражений " +
      "(частые: {{objection1}}, {{objection2}}) → закрытие. Каналы: {{channels}}."
    )),
  ]),
  lesson("l4", "✍️", "Вопросы (часть 1)", [
    blk("b4", "text", p(
      "Дальше — короткая анкета о вашем опыте продаж. Отвечайте честно и конкретно: " +
      "нам важны реальные сделки и ваши цифры, а не общие формулировки."
    )),
  ]),
]

// ─── Идемпотентный сид ───────────────────────────────────────────────────────

type SeedResult = {
  roleTemplateId: string
  questionnaireTemplateId: string
  demoTemplateId: string
  created: boolean
}

/**
 * Создаёт (или обновляет) системный шаблон роли «Менеджер продаж B2B».
 * Идемпотентно: анкета/демо ищутся по имени среди системных, роль — по slug.
 */
export async function seedSalesManagerB2B(createdBy?: string): Promise<SeedResult> {
  // 1) Системная анкета
  const [existingQ] = await db.select({ id: questionnaireTemplates.id })
    .from(questionnaireTemplates)
    .where(and(eq(questionnaireTemplates.isSystem, true), eq(questionnaireTemplates.name, QUESTIONNAIRE_NAME), isNull(questionnaireTemplates.deletedAt)))
    .limit(1)

  let questionnaireTemplateId: string
  if (existingQ) {
    questionnaireTemplateId = existingQ.id
    await db.update(questionnaireTemplates)
      .set({ questions: SALES_B2B_QUESTIONS, updatedAt: new Date() })
      .where(eq(questionnaireTemplates.id, existingQ.id))
  } else {
    const [row] = await db.insert(questionnaireTemplates)
      .values({ name: QUESTIONNAIRE_NAME, type: "candidate", questions: SALES_B2B_QUESTIONS, isSystem: true, tenantId: null })
      .returning({ id: questionnaireTemplates.id })
    questionnaireTemplateId = row.id
  }

  // 2) Системное короткое демо
  const [existingD] = await db.select({ id: demoTemplates.id })
    .from(demoTemplates)
    .where(and(eq(demoTemplates.isSystem, true), eq(demoTemplates.name, DEMO_NAME), isNull(demoTemplates.deletedAt)))
    .limit(1)

  let demoTemplateId: string
  if (existingD) {
    demoTemplateId = existingD.id
    await db.update(demoTemplates)
      .set({ sections: SALES_B2B_DEMO_SECTIONS, updatedAt: new Date() })
      .where(eq(demoTemplates.id, existingD.id))
  } else {
    const [row] = await db.insert(demoTemplates)
      .values({ name: DEMO_NAME, niche: "sales_b2b", length: "short", isSystem: true, tenantId: null, sections: SALES_B2B_DEMO_SECTIONS, audience: ["candidates"] })
      .returning({ id: demoTemplates.id })
    demoTemplateId = row.id
  }

  // 3) Сам шаблон роли (по slug)
  const [existingR] = await db.select({ id: roleTemplates.id })
    .from(roleTemplates)
    .where(eq(roleTemplates.slug, SALES_MANAGER_B2B_SLUG))
    .limit(1)

  const values = {
    slug: SALES_MANAGER_B2B_SLUG,
    name: "Менеджер продаж B2B",
    description: "Системный шаблон роли: B2B-продажник полного цикла. Анкета-гейт, критерии оценки, стадии воронки и короткое демо.",
    roleCategory: "sales",
    isSystem: true,
    tenantId: null,
    questionnaireTemplateId,
    demoTemplateId,
    specTemplate: SALES_B2B_SPEC,
    funnelV2Template: SALES_B2B_FUNNEL,
    scoringFormula: SALES_B2B_FORMULA,
    isPublished: true,
    createdBy: createdBy ?? null,
    updatedAt: new Date(),
  }

  let roleTemplateId: string
  let created = false
  if (existingR) {
    roleTemplateId = existingR.id
    await db.update(roleTemplates).set(values).where(eq(roleTemplates.id, existingR.id))
  } else {
    const [row] = await db.insert(roleTemplates).values(values).returning({ id: roleTemplates.id })
    roleTemplateId = row.id
    created = true
  }

  return { roleTemplateId, questionnaireTemplateId, demoTemplateId, created }
}
