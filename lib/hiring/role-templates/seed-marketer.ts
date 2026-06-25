// ТЗ №2 (продолжение): контент системного шаблона роли «Маркетолог (B2B)».
// Идемпотентный сид по образцу seed-sales-manager-b2b.ts.
// Структура 1-в-1: Question[] / CandidateSpec / FunnelV2Stage[] / демо-секции / seed-функция.
// Токены {{productName}}/{{icp}} подставляет ТЗ №3 (профиль продукта).
//
// РАСХОЖДЕНИЯ С ТЗ (решения Юрия, зафиксированы явно):
// - В3 (опыт B2B): черновик предлагал hard-отсев «Нет», ТЗ переопределило →
//   НЕ dealBreaker, НЕ structural stop, scored-вопрос + ручной просмотр.
// - anketaThresholds.lowerThreshold = 25 (не авто-отказ), чтобы почти никого
//   не резало автоматом; «спорное → ручной».
// - mustHave [] / dealBreakers [] мягкие — никакого жёсткого авто-стопа.
// - Воронка: 5 стадий (prequalification → demo → test → interview → offer),
//   test с мягким порогом (autoReject:false) — ручной просмотр.

import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { roleTemplates, questionnaireTemplates, demoTemplates } from "@/lib/db/schema"
import { makeStage, dozhimChainFor, type FunnelV2Stage, type StageActionType } from "@/lib/funnel-v2/types"
import type { CandidateSpec } from "@/lib/core/spec/types"
import type { Question } from "@/lib/course-types"
import type { RoleScoringFormula } from "./types"

export const MARKETER_SLUG = "marketer"
const QUESTIONNAIRE_NAME = "Маркетолог (B2B) — анкета (системная)"
const DEMO_NAME = "Маркетолог (B2B) — короткое демо (системное)"

// ─── Вспомогательная функция вопроса ─────────────────────────────────────────

function q(p: Partial<Question> & Pick<Question, "id" | "text" | "answerType">): Question {
  return { required: true, options: [], ...p }
}

// ─── Анкета (Question[]) — 6 вопросов ─────────────────────────────────────────
// В1 multiple: каналы. В2 short/ai: лучший канал с цифрами (антигейминг v В1).
// В3 single: опыт B2B — scored, НЕ hard-стоп (решение Юрия: ручной просмотр).
// В4 long/ai: кейс запуска канала или смены позиционирования.
// В5 multiple: что умеет руками без подрядчика.
// В6 short/ai: метрики — бизнес (CAC/LTV) выше, охваты/лайки ниже.

export const MARKETER_QUESTIONS: Question[] = [
  q({
    id: "q1_channels",
    text: "Какие маркетинговые каналы вы вели самостоятельно?",
    answerType: "multiple",
    points: 0,
    options: [
      "Яндекс.Директ / Google Ads",
      "SEO (органический поиск)",
      "Контент / блог / статьи",
      "Email-маркетинг / рассылки",
      "Соцсети (SMM / таргет)",
      "Партнёрский маркетинг",
      "PR / СМИ / нативная реклама",
      "PLG / продуктовый маркетинг",
      "Другое",
    ],
    otherOptions: [8], otherPlaceholder: "Укажите канал",
  }),
  q({
    id: "q2_best_channel",
    text: "Назовите 1 канал, который дал вам максимум лидов или клиентов. " +
      "Укажите цифры: CPL, объём лидов или конверсию — что помните.",
    answerType: "short",
    textMatchMode: "ai",
    aiCriteria:
      "Антигейминг: сверь канал с отмеченными вариантами в В1. Если в В1 не отмечено " +
      "SEO, а пример про SEO — засчитывай ответ, но ниже балл за непоследовательность. " +
      "Ключевое: есть ли конкретные цифры (CPL, объём, конверсия). " +
      "«Не помню»/общие слова без цифр → ниже. Широкие галочки без числового подтверждения → ниже.",
  }),
  q({
    id: "q3_b2b_exp",
    text: "Какой у вас опыт работы в маркетинге B2B-продуктов или услуг?",
    answerType: "single",
    points: 0,
    options: [
      "Нет опыта в B2B",
      "Меньше 1 года",
      "1–2 года",
      "2–4 года",
      "Более 4 лет",
    ],
    // НЕ hard-стоп и НЕ autoReject — scored-вопрос, спорное на ручной просмотр (решение Юрия).
  }),
  q({
    id: "q4_case",
    text: "Опишите кейс, когда вы запускали новый канал или меняли позиционирование продукта: " +
      "что именно сделали и какой получили результат.",
    answerType: "long",
    textMatchMode: "ai",
    aiCriteria:
      "Оцени по схеме гипотеза→действие→измеримый результат. " +
      "Конкретная гипотеза + конкретные шаги + цифры результата → выше. " +
      "Только общее описание без цифр → ниже. " +
      "Кейс B2B и/или сложного продукта — дополнительный плюс.",
  }),
  q({
    id: "q5_hands_on",
    text: "Что из перечисленного вы умеете делать без подрядчика — своими руками?",
    answerType: "multiple",
    points: 0,
    options: [
      "Писать статьи / тексты",
      "Email-письма и автосерии",
      "Посты для соцсетей",
      "Landing-страницы (конструкторы / no-code)",
      "Кейсы и презентации",
      "Видео и reels",
      "Подкасты",
      "Ничего из перечисленного",
    ],
    otherOptions: [],
  }),
  q({
    id: "q6_metrics",
    text: "Какие маркетинговые метрики вы отслеживали на последнем месте работы?",
    answerType: "short",
    textMatchMode: "ai",
    aiCriteria:
      "Оцени зрелость метрик: бизнес-ориентированные (CAC, LTV, CPL, MQL→SQL-конверсия, " +
      "ROI канала, Pipeline) → выше. Промежуточные (CTR, CR, трафик) → средне. " +
      "Только охваты, лайки, показы без связи с бизнес-результатом → ниже. " +
      "«Не знаю / не отслеживали» → ниже.",
  }),
]

// ─── Критерии оценки (Partial<CandidateSpec>) ────────────────────────────────
// mustHave [] и dealBreakers [] — мягкие, без жёсткого авто-стопа (решение Юрия).
// anketaThresholds: upperThreshold=70 (зелёный/авто-подсветка), lowerThreshold=25
// (почти не режет — спорное на ручной просмотр). enabled: true для подсветки+сортировки.

export const MARKETER_SPEC: Partial<CandidateSpec> = {
  mustHave: [],    // без жёсткого авто-стопа: решение Юрия
  niceToHave: [
    { text: "Опыт B2B-маркетинга от 1 года", importance: "very" },
    { text: "Самостоятельное ведение хотя бы 2 каналов (платный + органика)", importance: "very" },
    { text: "Знает бизнес-метрики: CAC/LTV/CPL/MQL→SQL", importance: "important" },
    { text: "Релевантный кейс: запуск канала или смена позиционирования с цифрами", importance: "important" },
    { text: "Работал с продуктом для SMB или собственников/директоров (= {{icp}})", importance: "important" },
    { text: "Умеет создавать контент руками (тексты, посты, кейсы)", importance: "nice" },
    { text: "Опыт с {{productName}} или смежными продуктами (SaaS/HRTech/автоматизация)", importance: "nice" },
  ],
  dealBreakers: [],  // без жёсткого авто-стопа: решение Юрия
  idealProfile:
    "Маркетолог с опытом в B2B, который сам ведёт каналы (Директ, SEO, контент, email), " +
    "думает метриками (CAC/CPL/MQL), умеет объяснить ценность сложного продукта ({{productName}}) " +
    "через бизнес-результат для {{icp}}, и готов тестировать гипотезы без большой команды.",
  // lowerThreshold=25 — практически не режет автоматом; upper=70 — зелёная зона.
  anketaThresholds: { enabled: true, upperThreshold: 70, lowerThreshold: 25 },
  scoringWeights: {
    relevant_experience: 30,
    results_in_numbers:  20,
    hard_skills:         15,
    soft_skills_fit:     15,
    tenure_stability:    5,
    company_size_match:  5,
    managerial_match:    3,
    location_readiness:  4,
    education:           3,
  },
  customCriteria: [
    {
      key: "b2b_marketing_experience",
      label: "Опыт маркетинга B2B (тип продукта + аудитория)",
      weight: "critical",
      importance: 30,
      hardness: "soft",
      aiMode: "instruction",
      hint: "Фокус: есть ли реальный B2B-маркетинг (не B2C/розница); тип продукта (SaaS/услуги/digital)",
    },
    {
      key: "channel_ownership",
      label: "Самостоятельное владение каналами (не только надзор)",
      weight: "important",
      importance: 25,
      hardness: "soft",
      aiMode: "instruction",
      hint: "Кандидат сам настраивал, вёл, оптимизировал — не просто управлял подрядчиком",
    },
    {
      key: "metrics_results",
      label: "Метрики и результаты (бизнес-уровень, не охваты)",
      weight: "important",
      importance: 20,
      hardness: "soft",
      aiMode: "instruction",
      hint: "CAC/LTV/CPL/MQL→SQL — знает и применял; охваты/лайки без бизнес-связи — снижать",
    },
    {
      key: "case_quality",
      label: "Качество кейса (гипотеза→действие→цифры)",
      weight: "important",
      importance: 15,
      hardness: "soft",
      aiMode: "instruction",
      hint: "Конкретный кейс с измеримым результатом → выше; общие слова → ниже",
    },
    {
      key: "hands_on_skills",
      label: "Hands-on навыки без подрядчика",
      weight: "nice",
      importance: 10,
      hardness: "soft",
      aiMode: "context",
      hint: "Создаёт контент / настраивает рекламу / делает лендинги сам",
    },
  ],
}

// ─── Стадии Воронки v2 (FunnelV2Stage[]) ─────────────────────────────────────
// Та же схема что в SALES_B2B_FUNNEL: helper stage() пересчитывает dozhimChain.
// test — без авто-отказа (решение Юрия: ручной просмотр), порог 60 — лишь метка.

function stage(action: StageActionType, seed: string, over: Partial<FunnelV2Stage>): FunnelV2Stage {
  const base = makeStage(action, seed)
  const dozhim = over.dozhim ?? base.dozhim
  return {
    ...base, ...over, dozhim,
    dozhimChain: dozhimChainFor(dozhim, action),
    rule: { ...base.rule, ...(over.rule ?? {}) },
  }
}

export const MARKETER_FUNNEL: FunnelV2Stage[] = [
  stage("prequalification", "mkt-1-scan", {
    title: "Отклик → скан резюме",
    dozhim: "off",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
      passCriteria: "Критерии из Портрета (spec). Порог мягкий: пусто → проходят дальше.",
    },
  }),
  stage("demo", "mkt-2-demo", {
    title: "Демонстрация",
    contentBlockId: null,
    dozhim: "strong",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
    },
  }),
  stage("test", "mkt-3-anketa", {
    title: "Анкета + AI-скрининг",
    dozhim: "standard",
    rule: {
      autoAdvance: false,
      autoReject: false,   // решение Юрия: НЕТ авто-отказа, спорное → ручной просмотр
      threshold: 60,       // метка для UI/отображения, не авто-отсев
      rejectDelayMinutes: 60,
      passCriteria:
        "Анкета ≥70 (зелёный). 25–69 → ручной просмотр HR. " +
        "Авто-отказ отключён намеренно (решение Юрия).",
    },
  }),
  stage("interview", "mkt-4-screen", {
    title: "Скрининг (звонок)",
    interviewMode: "phone",
    scheduling: ["bot", "self_link"],
    dozhim: "soft",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
      passCriteria: "Скрининговый звонок — знакомство и проверка мотивации. Вес в финале 0.4.",
    },
  }),
  stage("offer", "mkt-5-offer", {
    title: "Решение / оффер",
    dozhim: "off",
    rule: {
      autoAdvance: false,
      autoReject: false,
      rejectDelayMinutes: 60,
    },
  }),
]

// ─── Формула финала (RoleScoringFormula) ─────────────────────────────────────
export const MARKETER_FORMULA: RoleScoringFormula = {
  weights: { screening: 0.5, interview: 0.5 },
  statuses: { suitable: 70, review: 50 },
  anketaGate: { passingScore: 60 },
  note:
    "Анкета — мягкий гейт (≥70 зелёный, 25–69 ручной просмотр, авто-отказ ВЫКЛ). " +
    "Финал = скрининг·0.5 + интервью·0.5. " +
    "≥70 подходит · 50–69 рассмотреть · <50 не подходит.",
}

// ─── Демо (5 разделов, текст с токенами) ─────────────────────────────────────
// PDF-питч — блок, который HR добавляет самостоятельно в свой демо-шаблон
// (per-company); здесь не фабрикуем. Если в шаблоне потребуется — добавить
// блок type:"pdf" в нужный lesson ниже.

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

export const MARKETER_DEMO_SECTIONS = [
  lesson("l1", "👋", "Приветствие", [
    blk("b1", "text", p(
      "{{имя}}, рады видеть ваш отклик на вакансию «{{должность}}» в {{компания}}!\n\n" +
      "Этот 15–20-минутный обзор расскажет, что за продукт мы строим, кто наши клиенты " +
      "и что предстоит делать маркетологу. В конце — короткая анкета об опыте."
    )),
  ]),
  lesson("l2", "📦", "О компании и продукте", [
    blk("b2", "text", p(
      "Мы создаём: {{productName}}.\n\n{{productDescription}}\n\n" +
      "Наши клиенты — {{icp}}. Они покупают нас, чтобы нанимать быстрее и дешевле, " +
      "не теряя качество. Маркетолог объясняет ценность через конкретный бизнес-результат, " +
      "а не через список фич."
    )),
  ]),
  lesson("l3", "🎯", "Почему интересна роль", [
    blk("b3", "text", p(
      "Три причины, почему это интересно:\n\n" +
      "1. Канал с нуля на работающем продукте — уже есть кейсы, данные и первые клиенты. " +
      "Быстрый старт без «придумываем что продавать».\n\n" +
      "2. Доступ к реальным данным: конверсии воронки, стоимость лида, активация — " +
      "маркетинг здесь измерим от первого касания до оплаты.\n\n" +
      "3. Перформанс с ответственностью за результат. Мы ждём маркетолога, который " +
      "видит в цифрах смысл, а не просто отчитывается ими."
    )),
  ]),
  lesson("l4", "⚙️", "Что предстоит", [
    blk("b4", "text", p(
      "Основные направления:\n\n" +
      "— Лидогенерация: контент-маркетинг + Яндекс.Директ + партнёрский канал.\n\n" +
      "— SEO и органика: статьи под запросы {{icp}}, оптимизация лендингов.\n\n" +
      "— Продуктовый маркетинг: позиционирование, кейсы клиентов, onboarding-материалы.\n\n" +
      "— Аналитика воронки: от первого касания до MRR — знаем где теряем и куда вложить следующее."
    )),
  ]),
  lesson("l5", "➡️", "Что дальше", [
    blk("b5", "text", p(
      "После этого обзора вас ждёт короткая анкета об опыте — 5–7 минут. " +
      "Отвечайте честно и конкретно: нам важны реальные кейсы и ваши цифры.\n\n" +
      "Если ваш профиль совпадёт с тем, кого мы ищем, HR свяжется в течение 1–2 рабочих дней. " +
      "Успехов!"
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
 * Создаёт (или обновляет) системный шаблон роли «Маркетолог (B2B)».
 * Идемпотентно: анкета/демо ищутся по имени среди системных, роль — по slug.
 * Повторный сид достаёт строки из корзины (deletedAt: null reset), а не плодит дубли.
 */
export async function seedMarketer(createdBy?: string): Promise<SeedResult> {
  // 1) Системная анкета
  const [existingQ] = await db.select({ id: questionnaireTemplates.id })
    .from(questionnaireTemplates)
    .where(and(eq(questionnaireTemplates.isSystem, true), eq(questionnaireTemplates.name, QUESTIONNAIRE_NAME)))
    .limit(1)

  let questionnaireTemplateId: string
  if (existingQ) {
    questionnaireTemplateId = existingQ.id
    await db.update(questionnaireTemplates)
      .set({ questions: MARKETER_QUESTIONS, deletedAt: null, updatedAt: new Date() })
      .where(eq(questionnaireTemplates.id, existingQ.id))
  } else {
    const [row] = await db.insert(questionnaireTemplates)
      .values({
        name: QUESTIONNAIRE_NAME,
        type: "candidate",
        questions: MARKETER_QUESTIONS,
        isSystem: true,
        tenantId: null,
      })
      .returning({ id: questionnaireTemplates.id })
    questionnaireTemplateId = row.id
  }

  // 2) Системное короткое демо
  const [existingD] = await db.select({ id: demoTemplates.id })
    .from(demoTemplates)
    .where(and(eq(demoTemplates.isSystem, true), eq(demoTemplates.name, DEMO_NAME)))
    .limit(1)

  let demoTemplateId: string
  if (existingD) {
    demoTemplateId = existingD.id
    await db.update(demoTemplates)
      .set({ sections: MARKETER_DEMO_SECTIONS, deletedAt: null, updatedAt: new Date() })
      .where(eq(demoTemplates.id, existingD.id))
  } else {
    const [row] = await db.insert(demoTemplates)
      .values({
        name: DEMO_NAME,
        niche: "marketing",
        length: "short",
        isSystem: true,
        tenantId: null,
        sections: MARKETER_DEMO_SECTIONS,
        audience: ["candidates"],
      })
      .returning({ id: demoTemplates.id })
    demoTemplateId = row.id
  }

  // 3) Шаблон роли (по slug)
  const [existingR] = await db.select({ id: roleTemplates.id })
    .from(roleTemplates)
    .where(eq(roleTemplates.slug, MARKETER_SLUG))
    .limit(1)

  const values = {
    slug: MARKETER_SLUG,
    name: "Маркетолог",
    description:
      "Системный шаблон роли: B2B-маркетолог. Анкета с мягкими порогами (ручной просмотр), " +
      "критерии по каналам/метрикам/hands-on, стадии воронки и короткое демо.",
    roleCategory: "marketing",
    isSystem: true,
    tenantId: null,
    questionnaireTemplateId,
    demoTemplateId,
    specTemplate: MARKETER_SPEC,
    funnelV2Template: MARKETER_FUNNEL,
    scoringFormula: MARKETER_FORMULA,
    isPublished: true,
    deletedAt: null,
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
