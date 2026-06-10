// lib/stages.ts
//
// ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ для всех статусов воронки (Ф2 рефакторинга 2026-05-10).
// Любые компоненты, фильтры, AI-логика, hh-синхронизация — всё импортирует
// только отсюда. НЕ ХАРДКОДИТЬ статусы в других файлах.
//
// Структура pipeline сохраняется в vacancies.description_json.pipeline (v2),
// см. VacancyPipelineV2 ниже. До Ф3 запись/чтение этого поля — minimal:
// parsePipeline(null) даёт дефолтный pipeline на основе пресета "standard".

// ───────────────────────────────────────────────────────────────────
// Slug
// ───────────────────────────────────────────────────────────────────

export type StageSlug =
  | "new"
  | "primary_contact"
  | "demo_opened"
  | "anketa_filled"
  | "ai_screening"
  | "test_task_sent"
  | "test_task_done"
  | "test_passed"
  | "test_failed"
  | "internship"
  | "scheduled"
  | "interview"
  | "reference_check"
  | "decision"
  | "offer_sent"
  | "hired"
  | "rejected"

export type HhAction = "invitation" | "discard" | "assessment" | null

export type StageColor =
  | "slate"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "amber"
  | "orange"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "rose"
  | "red"

export interface StageDefinition {
  slug: StageSlug
  defaultLabel: string
  defaultColor: StageColor
  defaultHhAction: HhAction
  isSystem: boolean         // true = нельзя выключить в настройках вакансии
  isTerminal: boolean       // true = финальная стадия
  sortOrder: number
  description: string       // подсказка для HR в UI
}

// ───────────────────────────────────────────────────────────────────
// Маппинг StageColor → Tailwind-классы для бейджей
// ───────────────────────────────────────────────────────────────────

export const STAGE_COLOR_CLASSES: Record<StageColor, string> = {
  slate:   "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800",
  blue:    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  indigo:  "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
  violet:  "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800",
  purple:  "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  orange:  "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  yellow:  "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  lime:    "bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-200 dark:border-lime-800",
  green:   "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  rose:    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800",
  red:     "bg-destructive/10 text-destructive border-destructive/20",
}

// ───────────────────────────────────────────────────────────────────
// 16 стадий воронки (14 базовых + 2 исхода теста: test_passed/test_failed)
// ───────────────────────────────────────────────────────────────────

export const PLATFORM_STAGES: Record<StageSlug, StageDefinition> = {
  new: {
    slug: "new",
    defaultLabel: "Новый",
    defaultColor: "blue",
    defaultHhAction: null,
    isSystem: true,           // нельзя выключить — входная точка воронки
    isTerminal: false,
    sortOrder: 1,
    description: "Кандидат только что откликнулся, ещё не обработан",
  },
  primary_contact: {
    slug: "primary_contact",
    defaultLabel: "Пер. контакт",
    defaultColor: "blue",
    defaultHhAction: "invitation",
    isSystem: false,
    isTerminal: false,
    sortOrder: 2,
    description: "Отправлено приглашение в hh-чат",
  },
  demo_opened: {
    slug: "demo_opened",
    defaultLabel: "Демо открыто",
    defaultColor: "indigo",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 3,
    description: "Кандидат открыл ссылку на демо-курс",
  },
  anketa_filled: {
    slug: "anketa_filled",
    defaultLabel: "Анкета",
    defaultColor: "orange",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 4,
    description: "Кандидат заполнил анкету после демо",
  },
  ai_screening: {
    slug: "ai_screening",
    defaultLabel: "AI-скрининг",
    defaultColor: "emerald",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 5,
    description: "AI проверяет ответы кандидата по требованиям вакансии",
  },
  test_task_sent: {
    slug: "test_task_sent",
    defaultLabel: "Тест отправлен",
    defaultColor: "yellow",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 6,
    description: "HR отправил тестовое задание",
  },
  test_task_done: {
    slug: "test_task_done",
    defaultLabel: "Задание выполн.",
    defaultColor: "lime",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 7,
    description: "Кандидат прислал результат тестового",
  },
  test_passed: {
    slug: "test_passed",
    defaultLabel: "Тест пройден",
    defaultColor: "green",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 7.5,           // между «Задание выполн.» и «Интервью наз.»
    description: "Тестовое задание принято (AI/HR), кандидат двигается дальше",
  },
  test_failed: {
    slug: "test_failed",
    defaultLabel: "Тест не пройден",
    defaultColor: "rose",     // отличаем от жёсткого «Отказ» (red)
    defaultHhAction: null,    // без авто-discard — HR сам решает по hh
    isSystem: false,
    isTerminal: true,
    sortOrder: 7.6,
    description: "Тестовое задание отклонено по результатам проверки",
  },
  internship: {
    slug: "internship",
    defaultLabel: "Стажировка",
    defaultColor: "orange",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 7.8,           // между «Тест не пройден» и «Интервью наз.»
    description: "Кандидат проходит оплачиваемую практику / мини-ГПХ перед оффером",
  },
  scheduled: {
    slug: "scheduled",
    defaultLabel: "Интервью наз.",
    defaultColor: "violet",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 8,
    description: "Согласована дата интервью",
  },
  interview: {
    slug: "interview",
    defaultLabel: "Интервью",
    defaultColor: "purple",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 9,
    description: "Интервью прошло, ждём решения",
  },
  reference_check: {
    slug: "reference_check",
    defaultLabel: "Рекомендации",
    defaultColor: "amber",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 10,
    description: "Проверка рекомендаций и предыдущего опыта",
  },
  decision: {
    slug: "decision",
    defaultLabel: "Решение",
    defaultColor: "amber",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 11,
    description: "Финальное решение по кандидату",
  },
  offer_sent: {
    slug: "offer_sent",
    defaultLabel: "Оффер",
    defaultColor: "emerald",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: false,
    sortOrder: 12,
    description: "Оффер отправлен, ждём ответа",
  },
  hired: {
    slug: "hired",
    defaultLabel: "Нанят",
    defaultColor: "green",
    defaultHhAction: null,
    isSystem: false,
    isTerminal: true,
    sortOrder: 13,
    description: "Кандидат принят на работу",
  },
  rejected: {
    slug: "rejected",
    defaultLabel: "Отказ",
    defaultColor: "red",
    defaultHhAction: "discard",
    isSystem: true,           // нельзя выключить — терминальный
    isTerminal: true,
    sortOrder: 99,            // всегда последний
    description: "Отказ кандидату на любой стадии",
  },
}

export const ALL_STAGE_SLUGS: StageSlug[] = (Object.keys(PLATFORM_STAGES) as StageSlug[])
  .sort((a, b) => PLATFORM_STAGES[a].sortOrder - PLATFORM_STAGES[b].sortOrder)

export const SYSTEM_STAGE_SLUGS: StageSlug[] = ALL_STAGE_SLUGS.filter(
  s => PLATFORM_STAGES[s].isSystem,
)

export const TERMINAL_STAGE_SLUGS: StageSlug[] = ALL_STAGE_SLUGS.filter(
  s => PLATFORM_STAGES[s].isTerminal,
)

// #13/#14: группы стадий для метрик. Используется в lib/vacancy-stats.ts,
// в шапке вакансии и в аналитике/дашборде.
//
//   inProgress — кандидат в активной части воронки (сообщение отправлено,
//                демо открыто, анкета сдана и т.д. — НЕ new, НЕ rejected,
//                НЕ hired). Метрика "в работе".
//   anketaFilled — кандидаты, заполнившие финальную анкету
//                  (anketa_filled и всё что идёт ПОСЛЕ).
//   demoOpened — открыли демо (demo_opened и далее, кроме rejected).
//                Эта группа шире чем reзonate demo_progress_json IS NOT NULL.
export const IN_PROGRESS_STAGE_SLUGS: StageSlug[] = [
  "primary_contact", "demo_opened", "anketa_filled",
  "ai_screening", "test_task_sent", "test_task_done", "test_passed",
  "internship", "scheduled", "interview", "reference_check", "decision",
  "offer_sent",
]
export const ANKETA_FILLED_STAGE_SLUGS: StageSlug[] = [
  "anketa_filled", "ai_screening", "test_task_sent", "test_task_done", "test_passed",
  "internship", "scheduled", "interview", "reference_check", "decision",
  "offer_sent", "hired",
]
export const DEMO_OPENED_STAGE_SLUGS: StageSlug[] = [
  "demo_opened", "anketa_filled", "ai_screening", "test_task_sent",
  "test_task_done", "test_passed", "internship", "scheduled", "interview", "reference_check",
  "decision", "offer_sent", "hired",
]

// ───────────────────────────────────────────────────────────────────
// Legacy slug → читаемый лейбл
// ───────────────────────────────────────────────────────────────────
// В исторических данных и в части пайплайна встречаются slug, которых нет в
// PLATFORM_STAGES. По проду на 2026-05-29 они ЖИВЫЕ (а не нулевые, как было
// в Ф2): demo=437, interviewed=85, final_decision=5, offer=100, preboarding=1.
// Это вторая, параллельная система статусов (см. баг B9/Г1) — пока канон с ней
// не объединён, этот словарь даёт читаемый fallback в getStageLabel, чтобы в UI
// нигде не светился сырой slug.
//
// offer — алиас канонического offer_sent (не отдельная стадия).
// preboarding — этап между оффером и выходом; держим как алиас, не каноним.
// Удалить можно после Г1, когда переписывание hh/sync и фильтра окончательно
// уберёт упоминания этих slug из новых записей.
export const LEGACY_STAGE_LABELS: Record<string, string> = {
  demo: "На демо",
  interviewed: "Прошёл интервью",
  final_decision: "Финальное решение",
  wants_contact: "Хочет контакт",
  offer: "Оффер",
  preboarding: "Пребординг",
  talent_pool: "Резерв",      // цель кнопки «В резерв» в карточке кандидата
  pending: "Ожидание",
}

// Цвет для legacy-slug — выравниваем по каноническому «родственнику», чтобы
// бейджи выглядели одинаково во всех экранах через getStageColorClasses.
export const LEGACY_STAGE_COLORS: Record<string, StageColor> = {
  demo: "indigo",           // = demo_opened
  interviewed: "purple",    // = interview
  final_decision: "amber",  // = decision
  offer: "emerald",         // = offer_sent
  preboarding: "lime",      // между «Оффер» и «Нанят»
  wants_contact: "slate",
  talent_pool: "blue",
  pending: "slate",
}

// ───────────────────────────────────────────────────────────────────
// Пресеты воронки
// ───────────────────────────────────────────────────────────────────

export type FunnelPreset = "fast" | "standard" | "deep" | "custom"

export interface FunnelPresetDefinition {
  id: FunnelPreset
  label: string
  emoji: string
  description: string
  enabledStages: StageSlug[]
}

export const FUNNEL_PRESETS: Record<Exclude<FunnelPreset, "custom">, FunnelPresetDefinition> = {
  fast: {
    id: "fast",
    label: "Быстрый найм",
    emoji: "🚀",
    description: "Массовый найм, линейный персонал. 5 стадий, 3-5 дней.",
    enabledStages: ["new", "primary_contact", "demo_opened", "ai_screening", "hired", "rejected"],
  },
  standard: {
    id: "standard",
    label: "Стандартный",
    emoji: "📋",
    description: "Специалисты и менеджеры. 8 стадий, 7-14 дней.",
    enabledStages: [
      "new", "primary_contact", "demo_opened", "anketa_filled", "ai_screening",
      "interview", "decision", "hired", "rejected",
    ],
  },
  deep: {
    id: "deep",
    label: "Глубокий отбор",
    emoji: "🔬",
    description: "Руководители и ключевые позиции. 13 стадий, 14-30 дней.",
    enabledStages: ALL_STAGE_SLUGS,
  },
}

// ───────────────────────────────────────────────────────────────────
// Pipeline v2 (хранение в vacancies.description_json.pipeline)
// ───────────────────────────────────────────────────────────────────

export interface VacancyStageConfig {
  slug: StageSlug
  enabled: boolean
  customLabel: string | null      // null = использовать defaultLabel
  customColor: StageColor | null  // null = использовать defaultColor
  hhAction: HhAction              // переопределяет defaultHhAction
}

export interface VacancyPipelineV2 {
  version: 2
  preset: FunnelPreset            // "fast" | "standard" | "deep" | "custom"
  stages: VacancyStageConfig[]
}

// Company-level дефолты hh-действий по стадиям (hiringDefaults.stageHhActions).
export type CompanyStageHhActions = Partial<Record<StageSlug, HhAction>>

// Company-level палитра: переименовать/перекрасить стадии разом
// (hiringDefaults.stageLabels / hiringDefaults.stageColors).
// Применяется как soft-дефолт — per-vacancy customLabel/customColor перекрывает.
export type CompanyStagePalette = {
  labels?: Partial<Record<StageSlug, string>>
  colors?: Partial<Record<StageSlug, StageColor>>
}

/** hh-действие стадии: company-дефолт (если задан) перекрывает платформенный. */
function defaultHhActionFor(slug: StageSlug, companyHhActions?: CompanyStageHhActions): HhAction {
  if (companyHhActions && slug in companyHhActions) {
    const v = companyHhActions[slug]
    return v === "invitation" || v === "discard" || v === "assessment" ? v : null
  }
  return PLATFORM_STAGES[slug].defaultHhAction
}

/** Дефолтный pipeline для новой вакансии (с учётом company-маппинга hh и палитры). */
export function getDefaultPipeline(
  preset: Exclude<FunnelPreset, "custom"> = "standard",
  companyHhActions?: CompanyStageHhActions,
  companyPalette?: CompanyStagePalette,
): VacancyPipelineV2 {
  const presetDef = FUNNEL_PRESETS[preset]
  return {
    version: 2,
    preset,
    stages: ALL_STAGE_SLUGS.map(slug => ({
      slug,
      enabled: presetDef.enabledStages.includes(slug),
      customLabel: companyPalette?.labels?.[slug] ?? null,
      customColor: companyPalette?.colors?.[slug] ?? null,
      hhAction: defaultHhActionFor(slug, companyHhActions),
    })),
  }
}

const STAGE_COLOR_SET: Set<StageColor> = new Set(Object.keys(STAGE_COLOR_CLASSES) as StageColor[])
const STAGE_SLUG_SET: Set<StageSlug> = new Set(ALL_STAGE_SLUGS)
const FUNNEL_PRESET_SET: Set<FunnelPreset> = new Set(["fast", "standard", "deep", "custom"])

/**
 * Парсит сохранённый pipeline из vacancies.description_json.pipeline.
 * Невалидные/устаревшие/null значения → дефолт на пресете "standard".
 * Гарантирует, что в результате присутствуют ВСЕ 16 слугов воронки,
 * даже если в сохранёнке кого-то не было.
 */
export function parsePipeline(
  raw: unknown,
  companyHhActions?: CompanyStageHhActions,
  companyPalette?: CompanyStagePalette,
): VacancyPipelineV2 {
  if (!raw || typeof raw !== "object") return getDefaultPipeline("standard", companyHhActions, companyPalette)
  const obj = raw as Record<string, unknown>
  if (obj.version !== 2 || !Array.isArray(obj.stages)) {
    return getDefaultPipeline("standard", companyHhActions, companyPalette)
  }

  const savedByslug = new Map<StageSlug, Record<string, unknown>>()
  for (const s of obj.stages) {
    if (s && typeof s === "object") {
      const item = s as Record<string, unknown>
      const slug = item.slug
      if (typeof slug === "string" && STAGE_SLUG_SET.has(slug as StageSlug)) {
        savedByslug.set(slug as StageSlug, item)
      }
    }
  }

  const stages: VacancyStageConfig[] = ALL_STAGE_SLUGS.map(slug => {
    const saved = savedByslug.get(slug)
    if (!saved) {
      const defaultEnabled = FUNNEL_PRESETS.standard.enabledStages.includes(slug)
      return {
        slug,
        enabled: defaultEnabled,
        customLabel: companyPalette?.labels?.[slug] ?? null,
        customColor: companyPalette?.colors?.[slug] ?? null,
        hhAction: defaultHhActionFor(slug, companyHhActions),
      }
    }
    // Per-vacancy customLabel > company palette label > null
    const customLabel = typeof saved.customLabel === "string" && saved.customLabel.trim().length > 0
      ? saved.customLabel.trim()
      : (companyPalette?.labels?.[slug] ?? null)
    // Per-vacancy customColor > company palette color > null
    const savedColor = saved.customColor
    const customColor = typeof savedColor === "string" && STAGE_COLOR_SET.has(savedColor as StageColor)
      ? (savedColor as StageColor)
      : (companyPalette?.colors?.[slug] ?? null)
    const hhAction: HhAction =
      saved.hhAction === "invitation" || saved.hhAction === "discard" || saved.hhAction === "assessment"
        ? saved.hhAction
        : null
    return {
      slug,
      enabled: !!saved.enabled,
      customLabel,
      customColor,
      hhAction,
    }
  })

  const preset: FunnelPreset =
    typeof obj.preset === "string" && FUNNEL_PRESET_SET.has(obj.preset as FunnelPreset)
      ? (obj.preset as FunnelPreset)
      : "custom"

  return { version: 2, preset, stages }
}

// ───────────────────────────────────────────────────────────────────
// Хелперы для UI / hh / фильтра
// ───────────────────────────────────────────────────────────────────

function findCfg(pipeline: VacancyPipelineV2 | null | undefined, slug: StageSlug): VacancyStageConfig | undefined {
  return pipeline?.stages.find(s => s.slug === slug)
}

export function getStageLabel(slug: string | null | undefined, pipeline?: VacancyPipelineV2 | null): string {
  if (!slug) return ""
  if (STAGE_SLUG_SET.has(slug as StageSlug)) {
    const stageSlug = slug as StageSlug
    const cfg = findCfg(pipeline, stageSlug)
    if (cfg?.customLabel) return cfg.customLabel
    return PLATFORM_STAGES[stageSlug].defaultLabel
  }
  return LEGACY_STAGE_LABELS[slug] ?? slug
}

export function getStageColor(slug: string | null | undefined, pipeline?: VacancyPipelineV2 | null): StageColor {
  if (!slug) return "slate"
  if (!STAGE_SLUG_SET.has(slug as StageSlug)) return LEGACY_STAGE_COLORS[slug] ?? "slate"
  const stageSlug = slug as StageSlug
  const cfg = findCfg(pipeline, stageSlug)
  if (cfg?.customColor) return cfg.customColor
  return PLATFORM_STAGES[stageSlug].defaultColor
}

export function getStageColorClasses(slug: string | null | undefined, pipeline?: VacancyPipelineV2 | null): string {
  return STAGE_COLOR_CLASSES[getStageColor(slug, pipeline)]
}

export function getStageHhAction(slug: string | null | undefined, pipeline?: VacancyPipelineV2 | null): HhAction {
  if (!slug || !STAGE_SLUG_SET.has(slug as StageSlug)) return null
  const stageSlug = slug as StageSlug
  const cfg = findCfg(pipeline, stageSlug)
  if (cfg) return cfg.hhAction
  return PLATFORM_STAGES[stageSlug].defaultHhAction
}

/** Включённые стадии вакансии в порядке sortOrder. Без pipeline → пресет "standard". */
export function getEnabledStages(pipeline?: VacancyPipelineV2 | null): StageSlug[] {
  if (!pipeline) return FUNNEL_PRESETS.standard.enabledStages
  return pipeline.stages
    .filter(s => s.enabled)
    .map(s => s.slug)
    .sort((a, b) => PLATFORM_STAGES[a].sortOrder - PLATFORM_STAGES[b].sortOrder)
}

/** Проверка терминальности (для кнопки «двинуть дальше»). */
export function isTerminalStage(slug: string | null | undefined): boolean {
  if (!slug || !STAGE_SLUG_SET.has(slug as StageSlug)) return false
  return PLATFORM_STAGES[slug as StageSlug].isTerminal
}
