/**
 * Sidebar v2 — только рабочие разделы v1.
 * Marketing / Sales / Logistics показываются как "Скоро".
 * HR показывает только: Найм, Адаптация, Обучение.
 */

export interface MenuItemV2 {
  href: string
  label: string
  icon?: string
  disabled?: boolean
  badge?: string
}

export interface MenuGroupV2 {
  label: string
  items: MenuItemV2[]
}

// ─── HR — только рабочие разделы ──────────────────────────────────────────────

export const HR_MENU_GROUPS_V2: MenuGroupV2[] = [
  {
    label: "Найм",
    items: [
      { href: "/hr/vacancies", label: "Вакансии" },
      { href: "/hr/candidates", label: "Кандидаты" },
      { href: "/hr/funnel", label: "Воронка" },
      { href: "/hr/demo-editor", label: "Демо-редактор" },
      { href: "/hr/interviews", label: "Интервью" },
      { href: "/hr/calendar", label: "Календарь" },
    ],
  },
  {
    label: "Адаптация",
    items: [
      { href: "/hr/onboarding", label: "Онбординг" },
      { href: "/hr/adaptation/plans", label: "Планы" },
      { href: "/hr/adaptation/assignments", label: "Назначения" },
      { href: "/hr/adaptation/analytics", label: "Аналитика адаптации" },
    ],
  },
  {
    label: "Обучение",
    items: [
      { href: "/hr/courses", label: "Курсы" },
      { href: "/hr/certificates", label: "Сертификаты" },
    ],
  },
]

// ─── Прочие модули — заглушки "Скоро" ────────────────────────────────────────

export const COMING_SOON_MODULES = [
  { id: "marketing", label: "Маркетинг", icon: "📣" },
  { id: "sales",     label: "Продажи",   icon: "💼" },
  { id: "logistics", label: "Логистика", icon: "🚚" },
]
