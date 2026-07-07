// Реестр контекстов разбора модуля «Типология» + справочники глубины и
// аудитории. Данные (не тексты методики) — используются UI для выбора
// кнопок и слоем промптов (lib/tip/prompt.ts) для подстановки system-слоя
// context:<slug>.
//
// Слаги и группировка — по списку Юрия (10 в «main», остальные в «more»).

export type TipContextGroup = "main" | "more"

export interface TipContext {
  slug: string
  /** Русское название для кнопки в UI. */
  title: string
  emoji?: string
  group: TipContextGroup
  /** Порядок отображения внутри группы. */
  order: number
  /** Поддерживает парный разбор (совместимость двух дат). */
  pairCapable: boolean
  /** Разрешён разбор для несовершеннолетней даты рождения. */
  minorAllowed: boolean
  /**
   * Романтический/интимный парный контекст (сейчас — только «Личные
   * отношения»). Используется возрастным гейтом (lib/tip/prompt.ts) вместо
   * сравнения по строке-слагу — так что новый романтический контекст в
   * будущем не проскочит гейт по забывчивости.
   */
  romantic?: boolean
}

export const TIP_CONTEXTS: TipContext[] = [
  // ── main (10) ──────────────────────────────────────────────────────────
  {
    slug: "personal_map",
    title: "Личная карта развития",
    emoji: "🧭",
    group: "main",
    order: 1,
    pairCapable: false,
    minorAllowed: true,
  },
  {
    slug: "entrepreneur",
    title: "Предприниматель",
    emoji: "🚀",
    group: "main",
    order: 2,
    pairCapable: false,
    minorAllowed: false,
  },
  {
    slug: "employee",
    title: "Наёмный сотрудник",
    emoji: "💼",
    group: "main",
    order: 3,
    pairCapable: false,
    minorAllowed: false,
  },
  {
    slug: "manager",
    title: "Руководитель",
    emoji: "🧑‍💼",
    group: "main",
    order: 4,
    pairCapable: false,
    minorAllowed: false,
  },
  {
    slug: "business_partnership",
    title: "Бизнес-партнёрство",
    emoji: "🤝",
    group: "main",
    order: 5,
    pairCapable: true,
    minorAllowed: false,
  },
  {
    slug: "life_partnership",
    title: "Личные отношения",
    emoji: "❤️",
    group: "main",
    order: 6,
    pairCapable: true,
    minorAllowed: false,
    romantic: true,
  },
  {
    slug: "friends",
    title: "Друзья / окружение",
    emoji: "👥",
    group: "main",
    order: 7,
    pairCapable: true,
    minorAllowed: true,
  },
  {
    slug: "career",
    title: "Карьера / профессия",
    emoji: "🎯",
    group: "main",
    order: 8,
    pairCapable: false,
    minorAllowed: true,
  },
  {
    slug: "money",
    title: "Деньги",
    emoji: "💰",
    group: "main",
    order: 9,
    pairCapable: false,
    minorAllowed: false,
  },
  {
    slug: "full",
    title: "Полный разбор",
    emoji: "📖",
    group: "main",
    order: 10,
    pairCapable: false,
    minorAllowed: true,
  },
  // ── more (6) ───────────────────────────────────────────────────────────
  {
    slug: "homemaker",
    title: "Домохозяйка / семья / быт",
    emoji: "🏡",
    group: "more",
    order: 11,
    pairCapable: false,
    minorAllowed: false,
  },
  {
    slug: "teenager",
    title: "Подросток / молодой человек",
    emoji: "🧑‍🎓",
    group: "more",
    order: 12,
    pairCapable: false,
    minorAllowed: true,
  },
  {
    slug: "parenting",
    title: "Родитель / семья / дети",
    emoji: "👶",
    group: "more",
    order: 13,
    pairCapable: true,
    minorAllowed: true,
  },
  {
    slug: "sales_negotiations",
    title: "Продажи / переговоры",
    emoji: "🗣️",
    group: "more",
    order: 14,
    pairCapable: false,
    minorAllowed: false,
  },
  {
    slug: "team",
    title: "Команда",
    emoji: "🧩",
    group: "more",
    order: 15,
    pairCapable: true,
    minorAllowed: false,
  },
  {
    slug: "conflict",
    title: "Конфликт / сложные отношения",
    emoji: "⚡",
    group: "more",
    order: 16,
    pairCapable: true,
    minorAllowed: true,
  },
]

export function getTipContext(slug: string): TipContext | undefined {
  return TIP_CONTEXTS.find(c => c.slug === slug)
}

export function getTipContextsByGroup(group: TipContextGroup): TipContext[] {
  return TIP_CONTEXTS.filter(c => c.group === group).sort((a, b) => a.order - b.order)
}

// ── Глубина разбора ─────────────────────────────────────────────────────

export type TipDepth = "short" | "detailed" | "full"

export interface TipDepthOption {
  slug: TipDepth
  title: string
}

export const DEPTHS: TipDepthOption[] = [
  { slug: "short", title: "Коротко (1–2 стр.)" },
  { slug: "detailed", title: "Подробно (полный документ)" },
  { slug: "full", title: "Максимально полно (все разделы)" },
]

// ── Аудитория / назначение разбора ─────────────────────────────────────

export type TipAudience = "self" | "send_to_person" | "hiring_analysis"

export interface TipAudienceOption {
  slug: TipAudience
  title: string
}

export const AUDIENCES: TipAudienceOption[] = [
  { slug: "self", title: "Для себя" },
  { slug: "send_to_person", title: "Можно отправить человеку" },
  { slug: "hiring_analysis", title: "Для найма" },
]

export function getDepth(slug: string): TipDepthOption | undefined {
  return DEPTHS.find(d => d.slug === slug)
}

export function getAudience(slug: string): TipAudienceOption | undefined {
  return AUDIENCES.find(a => a.slug === slug)
}
