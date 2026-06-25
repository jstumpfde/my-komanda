// ТЗ №3: применение шаблона роли к вакансии (снимок, не ссылка).
// Разворачивает контент шаблона в вакансию атомарно (одна транзакция):
// демо → стадии Воронки v2 (с привязкой contentBlockId к демо) → Портрет
// (vacancy_specs.spec) → анкета (descriptionJson.anketa.questions), подставив
// значения профиля продукта в токены. Метки происхождения — в descriptionJson.
//
// Двухволновой сценарий: если в funnelV2Template стадиях заданы
// _demoTemplateId или _questionnaireTemplateId, apply создаёт отдельную
// запись в demos для каждой стадии и проставляет contentBlockId.

import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  vacancies, vacancySpecs, demos, roleTemplates, questionnaireTemplates, demoTemplates, companies,
  type CompanyHiringDefaults,
} from "@/lib/db/schema"
import { saveSpec } from "@/lib/core/spec/store"
import { CandidateSpecSchema, type CandidateSpec } from "@/lib/core/spec/types"
import type { FunnelV2Stage } from "@/lib/funnel-v2/types"
import type { Question } from "@/lib/course-types"
import {
  DEAL_CYCLES, SALES_CHANNELS, normalizeProductProfiles, type ProductProfile,
} from "@/lib/hiring/product-profile"

// ─── Форматтеры enum → человекочитаемо ───────────────────────────────────────

const ruNum = (n: number) => n.toLocaleString("ru-RU")

export function formatCheckRange(cr: ProductProfile["checkRange"]): string {
  const { min, max, recurring } = cr
  let base: string
  if (min && max) base = `${ruNum(min)}–${ruNum(max)} ₽`
  else if (min && !max) base = `от ${ruNum(min)} ₽ и выше`
  else if (!min && max) base = `до ${ruNum(max)} ₽`
  else base = "не указан"
  return recurring && base !== "не указан" ? `${base} /мес (подписка)` : base
}

export function formatDealCycle(v: string): string {
  return DEAL_CYCLES.find((c) => c.v === v)?.label ?? v
}

export function formatChannels(chs: string[]): string {
  if (!Array.isArray(chs) || chs.length === 0) return ""
  return chs.map((c) => SALES_CHANNELS.find((x) => x.v === c)?.label ?? c).join(", ")
}

// ─── Подстановка токенов ─────────────────────────────────────────────────────

export type TokenMap = Record<string, string>

export function buildTokenMap(p: ProductProfile): TokenMap {
  return {
    productName:        p.name ?? "",
    productDescription: p.productDescription ?? "",
    salesType:          p.salesType ?? "",           // уже человекочитаемо (свободный ввод)
    checkRange:         formatCheckRange(p.checkRange),
    dealCycle:          formatDealCycle(p.dealCycle),
    icp:                p.icp ?? "",
    channels:           formatChannels(p.channels),
    objection1:         p.objections?.[0] ?? "",
    objection2:         p.objections?.[1] ?? "",
    objection3:         p.objections?.[2] ?? "",
  }
}

/** Строковая подстановка с чистой вырезкой отсутствующих возражений. */
export function substituteString(s: string | undefined | null, map: TokenMap): string {
  if (!s) return s ?? ""
  let out = s
  // Возражения: если значения нет — убрать «, {{objectionN}}» вместе с запятой.
  for (const n of [3, 2, 1]) {
    const key = `objection${n}`
    const val = map[key] ?? ""
    out = val
      ? out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val)
      : out.replace(new RegExp(`,?\\s*\\{\\{${key}\\}\\}`, "g"), "")
  }
  // Остальные ПРОДУКТОВЫЕ токены.
  for (const [k, v] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v ?? "")
  }
  // ВАЖНО: нераспознанные {{...}} НЕ трогаем — это рантайм-токены кандидата
  // ({{имя}}/{{должность}}/{{компания}}/{{город}}/{{зарплата_*}}/{{ссылка_на_демо}}…),
  // которые обязаны дожить до снимка и подставляются позже на каждого кандидата
  // (lib/template-renderer.ts). Слепая вырезка ломала бы приветствие демо.
  // Подчистка артефактов только от вырезанных возражений.
  out = out
    .replace(/\(\s*,\s*/g, "(")
    .replace(/,\s*\)/g, ")")
    .replace(/:\s*\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  return out
}

function subQuestions(qs: Question[], map: TokenMap): Question[] {
  return (qs ?? []).map((q) => ({
    ...q,
    text: substituteString(q.text, map),
    options: Array.isArray(q.options) ? q.options.map((o) => substituteString(o, map)) : q.options,
    otherPlaceholder: q.otherPlaceholder ? substituteString(q.otherPlaceholder, map) : q.otherPlaceholder,
    aiCriteria: q.aiCriteria ? substituteString(q.aiCriteria, map) : q.aiCriteria,
  }))
}

type CritEntry = string | { text: string; [k: string]: unknown }
function subCritList(list: CritEntry[] | undefined, map: TokenMap): CritEntry[] | undefined {
  if (!Array.isArray(list)) return list
  // Пустые после подстановки пункты выкидываем — иначе z.string().min(1) уронит parse.
  return list
    .map((e) => typeof e === "string" ? substituteString(e, map) : { ...e, text: substituteString(e.text, map) })
    .filter((e) => (typeof e === "string" ? e : e.text).trim() !== "")
}

function subSpec(spec: Partial<CandidateSpec>, map: TokenMap): Partial<CandidateSpec> {
  return {
    ...spec,
    idealProfile: substituteString(spec.idealProfile, map),
    mustHave: subCritList(spec.mustHave as CritEntry[] | undefined, map) as CandidateSpec["mustHave"],
    niceToHave: subCritList(spec.niceToHave as CritEntry[] | undefined, map) as CandidateSpec["niceToHave"],
    dealBreakers: subCritList(spec.dealBreakers as CritEntry[] | undefined, map) as CandidateSpec["dealBreakers"],
    customCriteria: Array.isArray(spec.customCriteria)
      ? spec.customCriteria
          .map((c) => ({ ...c, label: substituteString(c.label, map), hint: c.hint ? substituteString(c.hint, map) : c.hint }))
          .filter((c) => c.label.trim() !== "")
      : spec.customCriteria,
  }
}

type Block = Record<string, unknown>
type Lesson = { id: string; emoji?: string; title?: string; blocks?: Block[] }
function subSections(sections: Lesson[], map: TokenMap): Lesson[] {
  return (sections ?? []).map((l) => ({
    ...l,
    title: l.title ? substituteString(l.title, map) : l.title,
    blocks: Array.isArray(l.blocks)
      ? l.blocks.map((b) => typeof b.content === "string" ? { ...b, content: substituteString(b.content, map) } : b)
      : l.blocks,
  }))
}

function subStages(stages: FunnelV2Stage[], map: TokenMap): FunnelV2Stage[] {
  return (stages ?? []).map((s) => ({
    ...s,
    title: s.title ? substituteString(s.title, map) : s.title,
    rule: {
      ...s.rule,
      passCriteria: s.rule?.passCriteria ? substituteString(s.rule.passCriteria, map) : s.rule?.passCriteria,
      rejectText: s.rule?.rejectText ? substituteString(s.rule.rejectText, map) : s.rule?.rejectText,
    },
  }))
}

// ─── Сбор данных профиля продукта ────────────────────────────────────────────

/** Продукты, релевантные вакансии: бренд (если выбран и есть его продукты) или основная. */
export function resolveVacancyProducts(hd: CompanyHiringDefaults, brandCompanyId?: string): ProductProfile[] {
  if (brandCompanyId && hd.brandProductProfiles?.[brandCompanyId]?.length) {
    return normalizeProductProfiles(hd.brandProductProfiles[brandCompanyId])
  }
  return normalizeProductProfiles(hd.productProfiles)
}

// ─── Двухволновые вспомогательные функции ────────────────────────────────────

/**
 * Упаковать массив Question[] в lessonsJson-формат (один урок, один task-блок).
 * calc-stage-score.ts читает вопросы именно так: blocks[].type="task" + questions[].
 * Рантайм (resolve-content) отдаёт этот lessonsJson клиенту при action=prequalification/test.
 */
function questionsToLessonsJson(questions: Question[], title: string): Lesson[] {
  return [
    {
      id: "lesson-questions",
      emoji: "📋",
      title,
      blocks: [
        {
          id:               "block-questions",
          type:             "task",
          content:          "",
          questions,
          // Поля-заглушки, обязательные для совместимости с blk()-форматом демо-редактора:
          imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
          videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
          audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
          fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
          infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
          buttonText: "", buttonUrl: "", buttonVariant: "primary", buttonColor: "",
          buttonIconBefore: "", buttonIconAfter: "",
          taskTitle: title, taskDescription: "",
        },
      ],
    },
  ]
}

/**
 * Признак двухволнового шаблона: хотя бы одна стадия в воронке имеет
 * _demoTemplateId или _questionnaireTemplateId.
 */
function isTwoWaveTemplate(stages: FunnelV2Stage[]): boolean {
  return stages.some((s) => s._demoTemplateId || s._questionnaireTemplateId)
}

/**
 * Загрузить все demoTemplates и questionnaireTemplates, на которые ссылаются
 * стадии через _demoTemplateId / _questionnaireTemplateId.
 * Возвращает маппинги id → данные.
 */
async function loadTwoWaveTemplateData(stages: FunnelV2Stage[]): Promise<{
  demoTmplById: Map<string, { sections: unknown; name: string }>
  questTmplById: Map<string, { questions: unknown }>
}> {
  const demoIds = [...new Set(
    stages.map((s) => s._demoTemplateId).filter((id): id is string => !!id)
  )]
  const questIds = [...new Set(
    stages.map((s) => s._questionnaireTemplateId).filter((id): id is string => !!id)
  )]

  const demoTmplById = new Map<string, { sections: unknown; name: string }>()
  const questTmplById = new Map<string, { questions: unknown }>()

  if (demoIds.length > 0) {
    const rows = await db.select({ id: demoTemplates.id, sections: demoTemplates.sections, name: demoTemplates.name })
      .from(demoTemplates)
      .where(inArray(demoTemplates.id, demoIds))
    for (const r of rows) demoTmplById.set(r.id, { sections: r.sections, name: r.name })
  }

  if (questIds.length > 0) {
    const rows = await db.select({ id: questionnaireTemplates.id, questions: questionnaireTemplates.questions })
      .from(questionnaireTemplates)
      .where(inArray(questionnaireTemplates.id, questIds))
    for (const r of rows) questTmplById.set(r.id, { questions: r.questions })
  }

  return { demoTmplById, questTmplById }
}

// ─── Применение ──────────────────────────────────────────────────────────────

export type ApplyResult = { ok: true; demoId: string } | { ok: false; reason: "needs_confirm" | "no_products" | "not_found" | "no_profile" }

export async function applyRoleTemplateToVacancy(opts: {
  vacancyId: string
  companyId: string
  roleTemplateId: string
  productProfileId?: string
  userId?: string
  overwrite?: boolean
}): Promise<ApplyResult> {
  const { vacancyId, companyId, roleTemplateId, productProfileId, userId, overwrite } = opts

  // Вакансия (с проверкой тенанта)
  const [vac] = await db.select({ descriptionJson: vacancies.descriptionJson })
    .from(vacancies)
    .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))
    .limit(1)
  if (!vac) return { ok: false, reason: "not_found" }

  // Шаблон роли (системный или тенанта, не из корзины)
  const [role] = await db.select().from(roleTemplates)
    .where(and(eq(roleTemplates.id, roleTemplateId), isNull(roleTemplates.deletedAt))).limit(1)
  if (!role || (!role.isSystem && role.tenantId !== companyId)) return { ok: false, reason: "not_found" }

  // Профиль продукта
  const [company] = await db.select({ hd: companies.hiringDefaultsJson })
    .from(companies).where(eq(companies.id, companyId)).limit(1)
  const hd = (company?.hd ?? {}) as CompanyHiringDefaults
  const desc = (vac.descriptionJson ?? {}) as Record<string, unknown>
  const anketa = (desc.anketa ?? {}) as Record<string, unknown>
  const brandCompanyId = typeof anketa.brandCompanyId === "string" ? anketa.brandCompanyId : undefined
  const products = resolveVacancyProducts(hd, brandCompanyId)
  if (products.length === 0) return { ok: false, reason: "no_products" }

  // Дефолт бренд-аварно (как в route GET), иначе дефолт основной компании.
  const fallbackDefaultId = brandCompanyId
    ? hd.brandDefaultProductProfileIds?.[brandCompanyId]
    : hd.defaultProductProfileId
  const profile = (productProfileId && products.find((p) => p.id === productProfileId))
    || products.find((p) => p.id === fallbackDefaultId)
    || products[0]
  if (!profile) return { ok: false, reason: "no_profile" }

  // Шаблон воронки
  const stagesTemplate = (role.funnelV2Template ?? []) as FunnelV2Stage[]

  // Проверка перезаписи: есть ли уже непустой контент. Пустой spec-row у свежей
  // вакансии за «контент» не считаем (иначе предупреждение о перезаписи выскакивало
  // бы на ПЕРВОМ применении к черновику) — смотрим непустой Портрет.
  const existingAnketaQs = Array.isArray(anketa.questions) ? (anketa.questions as unknown[]).length : 0
  const existingFunnel = (desc.funnelV2 as { stages?: unknown[] } | undefined)?.stages?.length ?? 0
  const [existingSpec] = await db.select({ spec: vacancySpecs.spec }).from(vacancySpecs).where(eq(vacancySpecs.vacancyId, vacancyId)).limit(1)
  const sp = (existingSpec?.spec ?? {}) as Partial<CandidateSpec>
  const specHasContent = !!(sp.mustHave?.length || sp.niceToHave?.length || sp.dealBreakers?.length || sp.customCriteria?.length || (sp.idealProfile ?? "").trim())
  const [existingDemo] = await db.select({ id: demos.id }).from(demos).where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo"))).limit(1)
  const hasContent = existingAnketaQs > 0 || existingFunnel > 0 || specHasContent || !!existingDemo
  if (hasContent && !overwrite) return { ok: false, reason: "needs_confirm" }

  // Подстановка токенов
  const map = buildTokenMap(profile)
  // Прогоняем через Zod-схему: снимок — полный валидный CandidateSpec с дефолтами
  // (Partial из шаблона дополняется недостающими полями), чтобы скоринг не споткнулся.
  const spec = CandidateSpecSchema.parse(subSpec((role.specTemplate ?? {}) as Partial<CandidateSpec>, map))
  const stagesRaw = subStages(stagesTemplate, map)

  // Двухволновой сценарий: хотя бы одна стадия имеет _demoTemplateId или
  // _questionnaireTemplateId → создаём отдельные demos-записи на каждую стадию.
  const twoWave = isTwoWaveTemplate(stagesTemplate)

  // Для одноволнового: загружаем данные из role.questionnaireTemplateId + role.demoTemplateId.
  // Для двухволнового: загружаем данные из _demoTemplateId / _questionnaireTemplateId стадий.
  const [qtmpl] = (!twoWave && role.questionnaireTemplateId)
    ? await db.select({ questions: questionnaireTemplates.questions }).from(questionnaireTemplates).where(eq(questionnaireTemplates.id, role.questionnaireTemplateId)).limit(1)
    : [undefined]
  const [dtmpl] = (!twoWave && role.demoTemplateId)
    ? await db.select({ sections: demoTemplates.sections, name: demoTemplates.name }).from(demoTemplates).where(eq(demoTemplates.id, role.demoTemplateId)).limit(1)
    : [undefined]

  // Загрузка шаблонов для двухволнового сценария (один запрос на тип).
  const twoWaveData = twoWave
    ? await loadTwoWaveTemplateData(stagesRaw)
    : { demoTmplById: new Map(), questTmplById: new Map() }

  // Одноволновой: вопросы анкеты (для descriptionJson.anketa.questions) и секции демо.
  const questions = !twoWave
    ? subQuestions((qtmpl?.questions as Question[]) ?? [], map)
    : []
  const sections = !twoWave
    ? subSections((dtmpl?.sections as Lesson[]) ?? [], map)
    : []

  // Атомарно
  const demoId = await db.transaction(async (tx) => {

    // ── ДВУХВОЛНОВОЙ ПУТЬ ────────────────────────────────────────────────────
    if (twoWave) {
      // Для каждой стадии с _demoTemplateId или _questionnaireTemplateId создаём
      // отдельную запись в demos и запоминаем stageId → blockId.
      // kind='block:demo' — демо-секции; kind='block:questionnaire' — вопросы анкеты.
      // Рантайм (resolve-content) ищет demos WHERE id=contentBlockId — kind не важен.

      const stageBlockMap = new Map<string, string>() // stageId → demos.id

      // id первой demo-стадии с _demoTemplateId — получит kind='demo' для
      // совместимости с legacy /demo маршрутом (он ищет demos WHERE kind='demo').
      const firstDemoStageId = stagesRaw.find((s) => s.action === "demo" && s._demoTemplateId)?.id

      for (const s of stagesRaw) {
        const demoTmplId = s._demoTemplateId
        const questTmplId = s._questionnaireTemplateId

        if (demoTmplId) {
          // Демо-блок для этой стадии.
          // Первая demo-стадия → kind='demo' (legacy-маршрут /demo [token] берёт
          // первый kind='demo' при отсутствии contentBlockId в v2-состоянии кандидата).
          // Последующие → kind='block:demo' (не мешают legacy-запросу).
          const tmpl = twoWaveData.demoTmplById.get(demoTmplId)
          const blockSections = subSections((tmpl?.sections as Lesson[]) ?? [], map)
          const blockTitle = substituteString(tmpl?.name ?? `Демо — ${role.name}`, map)
          const kind = s.id === firstDemoStageId ? "demo" : "block:demo"

          // Upsert: ищем существующий блок по kind+vacancyId для этой стадии.
          // Для двухволновых используем kind='block:demo' + title как discriminator.
          // Для первой demo-стадии — kind='demo' (стандартный одноволновой upsert).
          let blockId: string
          if (kind === "demo") {
            const [existing] = await tx.select({ id: demos.id }).from(demos)
              .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo"))).limit(1)
            if (existing) {
              blockId = existing.id
              await tx.update(demos).set({ title: blockTitle, lessonsJson: blockSections, contentType: "presentation", updatedAt: new Date() }).where(eq(demos.id, blockId))
            } else {
              const [row] = await tx.insert(demos).values({ vacancyId, kind, title: blockTitle, lessonsJson: blockSections, contentType: "presentation", status: "draft", sortOrder: 0 }).returning({ id: demos.id })
              blockId = row.id
            }
          } else {
            // kind='block:demo': upsert по title+kind+vacancyId.
            const [existing] = await tx.select({ id: demos.id }).from(demos)
              .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, kind), eq(demos.title, blockTitle))).limit(1)
            if (existing) {
              blockId = existing.id
              await tx.update(demos).set({ lessonsJson: blockSections, contentType: "presentation", updatedAt: new Date() }).where(eq(demos.id, blockId))
            } else {
              const [row] = await tx.insert(demos).values({ vacancyId, kind, title: blockTitle, lessonsJson: blockSections, contentType: "presentation", status: "draft", sortOrder: 0 }).returning({ id: demos.id })
              blockId = row.id
            }
          }
          stageBlockMap.set(s.id, blockId)
        }

        if (questTmplId) {
          // Блок с вопросами для этой стадии (хранится как demos с kind='block:questionnaire').
          // lessonsJson — задачный урок (task-блок), calc-stage-score читает его через
          // collectTaskQuestions(blocks[].type="task" + questions[]).
          const tmpl = twoWaveData.questTmplById.get(questTmplId)
          const qs = subQuestions((tmpl?.questions as Question[]) ?? [], map)
          const blockTitle = `Вопросы — ${s.title ?? s.action} (${s.id})`
          const lessonsJson = questionsToLessonsJson(qs, s.title ?? "Анкета")

          // Upsert по kind='block:questionnaire' + stageId в title (стабильный discriminator).
          const [existing] = await tx.select({ id: demos.id }).from(demos)
            .where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "block:questionnaire"), eq(demos.title, blockTitle))).limit(1)
          let blockId: string
          if (existing) {
            blockId = existing.id
            await tx.update(demos).set({ lessonsJson, contentType: "presentation", updatedAt: new Date() }).where(eq(demos.id, blockId))
          } else {
            const [row] = await tx.insert(demos).values({ vacancyId, kind: "block:questionnaire", title: blockTitle, lessonsJson, contentType: "presentation", status: "draft", sortOrder: 0 }).returning({ id: demos.id })
            blockId = row.id
          }
          stageBlockMap.set(s.id, blockId)
        }
      }

      // Собираем итоговые стадии: contentBlockId из stageBlockMap; _demoTemplateId /
      // _questionnaireTemplateId зачищаем — в descriptionJson они не нужны (рантайм
      // читает только contentBlockId).
      const stages: FunnelV2Stage[] = stagesRaw.map((s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _demoTemplateId, _questionnaireTemplateId, ...rest } = s
        const contentBlockId = stageBlockMap.get(s.id) ?? null
        return { ...rest, contentBlockId }
      })

      // Портрет
      await saveSpec(vacancyId, spec as CandidateSpec, userId, tx)

      // Для двухволновых anketa.questions = вопросы волны 1 (первая questionnaire-стадия).
      // Это сохраняет совместимость с legacy-путём скоринга (lib/ai-screen-candidate.ts
      // читает descriptionJson.anketa.questions). Рантайм v2 использует contentBlockId.
      const firstQuestStage = stagesRaw.find((s) => s._questionnaireTemplateId)
      let anketaQuestions: Question[] = []
      if (firstQuestStage?._questionnaireTemplateId) {
        const tmpl = twoWaveData.questTmplById.get(firstQuestStage._questionnaireTemplateId)
        anketaQuestions = subQuestions((tmpl?.questions as Question[]) ?? [], map)
      }

      const nextDesc = {
        ...desc,
        funnelV2: { enabled: true, stages },
        anketa: { ...anketa, questions: anketaQuestions },
        appliedRoleTemplate: {
          roleTemplateId: role.id,
          roleTemplateSlug: role.slug,
          productProfileId: profile.id,
          appliedAt: new Date().toISOString(),
          appliedBy: userId ?? null,
          twoWave: true,
        },
      }
      await tx.update(vacancies)
        .set({ descriptionJson: nextDesc, portraitScoring: true, updatedAt: new Date() })
        .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))

      // Возвращаем id первого demo-блока (совместимость с ApplyResult.demoId).
      const firstDemoStage = stagesRaw.find((s) => s.action === "demo" && s._demoTemplateId)
      return firstDemoStage ? (stageBlockMap.get(firstDemoStage.id) ?? "") : ""
    }

    // ── ОДНОВОЛНОВОЙ ПУТЬ (без изменений) ───────────────────────────────────

    // 1) Демо (upsert по kind='demo' — одна запись на вакансию). existingDemo
    //    перечитываем ВНУТРИ tx, чтобы при гонке не создать второй demo-блок.
    let id: string
    const demoTitle = substituteString(dtmpl?.name ?? `Демо — ${role.name}`, map)
    const [demoInTx] = await tx.select({ id: demos.id }).from(demos).where(and(eq(demos.vacancyId, vacancyId), eq(demos.kind, "demo"))).limit(1)
    if (demoInTx) {
      id = demoInTx.id
      await tx.update(demos).set({ title: demoTitle, lessonsJson: sections, contentType: "presentation", updatedAt: new Date() }).where(eq(demos.id, id))
    } else {
      const [row] = await tx.insert(demos).values({ vacancyId, kind: "demo", title: demoTitle, lessonsJson: sections, contentType: "presentation", status: "draft", sortOrder: 0 }).returning({ id: demos.id })
      id = row.id
    }

    // 2) Воронка v2: стадии demo → созданный блок; у остальных contentBlockId
    //    обнуляем (тест-блоки шаблона не копируются — не оставляем висячих ссылок).
    const stages = stagesRaw.map((s) => s.action === "demo" ? { ...s, contentBlockId: id } : { ...s, contentBlockId: null })

    // 3) Портрет (в той же транзакции)
    await saveSpec(vacancyId, spec as CandidateSpec, userId, tx)

    // 4) Анкета (мерж: только questions, остальной джоб-постинг не трогаем) +
    //    воронка + метки происхождения + включение контура Портрета. descriptionJson
    //    мержим по верхним ключам. portraitScoring=true — применяем полный снимок
    //    Портрета (иначе на старых черновиках пороги/действия Spec мертвы).
    const nextDesc = {
      ...desc,
      funnelV2: { enabled: true, stages },
      anketa: { ...anketa, questions },
      appliedRoleTemplate: {
        roleTemplateId: role.id,
        roleTemplateSlug: role.slug,
        productProfileId: profile.id,
        appliedAt: new Date().toISOString(),
        appliedBy: userId ?? null,
      },
    }
    await tx.update(vacancies)
      .set({ descriptionJson: nextDesc, portraitScoring: true, updatedAt: new Date() })
      .where(and(eq(vacancies.id, vacancyId), eq(vacancies.companyId, companyId)))

    return id
  })

  return { ok: true, demoId }
}
