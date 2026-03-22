// ─── Company Types ─────────────────────────────────────────────────────────
// Interfaces and constants for the company profile, products, and vacancies.
// Used by the /vacancies/create wizard and shared with /settings/company.

// ─── Constants / Enums ─────────────────────────────────────────────────────

export const INDUSTRIES = [
  "Строительство",
  "IT",
  "Логистика",
  "Производство",
  "Услуги",
  "Торговля",
  "Финансы",
  "Другое",
] as const
export type Industry = (typeof INDUSTRIES)[number]

export const REVENUE_RANGES = [
  { value: "<1M",     label: "До 1 млн ₽/мес" },
  { value: "1M-5M",   label: "1–5 млн ₽/мес" },
  { value: "5M-15M",  label: "5–15 млн ₽/мес" },
  { value: "15M-50M", label: "15–50 млн ₽/мес" },
  { value: "50M+",    label: "50+ млн ₽/мес" },
] as const
export type RevenueRange = "<1M" | "1M-5M" | "5M-15M" | "15M-50M" | "50M+"

export const SALES_TYPES = [
  { value: "cold",    label: "Холодные продажи" },
  { value: "warm",    label: "Тёплые лиды" },
  { value: "inbound", label: "Входящий поток" },
  { value: "mixed",   label: "Смешанный" },
] as const
export type SalesType = "cold" | "warm" | "inbound" | "mixed"

export const DEAL_CYCLES = [
  { value: "short_1_3d",  label: "Короткий (1–3 дня)" },
  { value: "medium_1_4w", label: "Средний (1–4 недели)" },
  { value: "long_1_6m",   label: "Длинный (1–6 месяцев)" },
] as const
export type DealCycle = "short_1_3d" | "medium_1_4w" | "long_1_6m"

export const SEGMENTS = ["B2C", "B2B", "B2G"] as const
export type Segment = (typeof SEGMENTS)[number]

export const HIRING_GOALS = [
  { value: "build_dept",    label: "Строим отдел с нуля" },
  { value: "scale",         label: "Масштабируем команду" },
  { value: "replace",       label: "Замена сотрудника" },
  { value: "unload_owner",  label: "Разгрузить собственника" },
  { value: "new_direction", label: "Новое направление" },
] as const
export type HiringGoal = "build_dept" | "scale" | "replace" | "unload_owner" | "new_direction"

export const CURRENT_PROBLEMS = [
  { value: "no_leads",       label: "Мало лидов / заявок" },
  { value: "low_conversion", label: "Низкая конверсия в сделку" },
  { value: "no_system",      label: "Нет системы продаж" },
  { value: "weak_closing",   label: "Слабое закрытие сделок" },
  { value: "no_crm",         label: "Не используем CRM" },
  { value: "long_cycle",     label: "Долгий цикл сделки" },
  { value: "cant_hire",      label: "Не можем нанять нужных людей" },
] as const
export type CurrentProblem = "no_leads" | "low_conversion" | "no_system" | "weak_closing" | "no_crm" | "long_cycle" | "cant_hire"

export const FUNCTIONS = [
  { value: "prospecting",         label: "Холодный поиск клиентов (prospecting)" },
  { value: "inbound_processing",  label: "Обработка входящих заявок" },
  { value: "meetings",            label: "Проведение встреч / демо" },
  { value: "closing",             label: "Закрытие сделок" },
  { value: "crm_reporting",       label: "Отчётность в CRM" },
  { value: "account_management",  label: "Ведение и развитие клиентов" },
  { value: "debt_control",        label: "Контроль дебиторской задолженности" },
] as const
export type VacancyFunction = "prospecting" | "inbound_processing" | "meetings" | "closing" | "crm_reporting" | "account_management" | "debt_control"

export const EXPERIENCE_OPTIONS = [
  { value: "none",  label: "Без опыта" },
  { value: "1_3y",  label: "1–3 года" },
  { value: "3plus", label: "3+ лет" },
] as const
export type Experience = "none" | "1_3y" | "3plus"

export const WORK_FORMATS = [
  { value: "office", label: "Офис" },
  { value: "remote", label: "Удалённо" },
  { value: "hybrid", label: "Гибрид" },
] as const
export type WorkFormat = "office" | "remote" | "hybrid"

export const HIRING_URGENCIES = [
  { value: "urgent_2w",  label: "Срочно — в течение 2 недель" },
  { value: "1month",     label: "В течение месяца" },
  { value: "2_3months",  label: "2–3 месяца" },
] as const
export type HiringUrgency = "urgent_2w" | "1month" | "2_3months"

export const PAYBACK_PERIODS = [
  { value: "1month",    label: "До 1 месяца" },
  { value: "2_3months", label: "2–3 месяца" },
  { value: "3_6months", label: "3–6 месяцев" },
] as const
export type PaybackPeriod = "1month" | "2_3months" | "3_6months"

export const SALES_MANAGER_TYPES = [
  { value: "rop",   label: "РОП (руководитель отдела продаж)" },
  { value: "owner", label: "Собственник" },
  { value: "none",  label: "Отсутствует" },
] as const
export type SalesManagerType = "rop" | "owner" | "none"

export const YES_PARTIAL_NO = [
  { value: "yes",     label: "Да, есть" },
  { value: "partial", label: "Частично" },
  { value: "no",      label: "Нет" },
] as const

export const CRM_STATUSES = [
  { value: "active",          label: "Активно используем" },
  { value: "exists_unused",   label: "Есть, но не используем" },
  { value: "none",            label: "Нет CRM" },
] as const

// ─── Core Interfaces ────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  industry: Industry
  industry_custom?: string
  city: string
  founded_year: number
  revenue_range?: RevenueRange
  website?: string
  crm_status: "active" | "exists_unused" | "none"
  crm_name?: string
  sales_scripts: "yes" | "partial" | "no"
  training_system: "yes" | "partial" | "no"
  trainer?: string
  sales_manager_type: SalesManagerType
  is_multi_product: boolean
}

export interface CompanyProduct {
  id: string
  company_id: string
  name: string
  description: string
  avg_check?: number
  margin_pct?: number
  sales_type: SalesType
  deal_cycle: DealCycle
  segments: Segment[]
}

export interface VacancySnapshot {
  captured_at: string
  company_name: string
  product_name?: string
  position_title: string
  salary_fix: number
  work_format: WorkFormat
  leads_per_month?: number
}

export interface Vacancy {
  id: string
  company_id: string
  product_id?: string
  custom_product?: CompanyProduct
  status: "draft" | "active" | "paused" | "closed"
  completion_pct: number
  // Hiring goals
  hiring_goals: HiringGoal[]
  main_goal?: string
  current_problems: CurrentProblem[]
  main_pain?: string
  // Funnel
  leads_per_month?: number
  conversion_to_meeting_pct?: number
  conversion_to_deal_pct?: number
  sales_per_month?: number
  revenue_per_manager?: number
  // Position
  position_title: string
  headcount: number
  hiring_urgency?: HiringUrgency
  plan_sales_per_month?: number
  plan_revenue_per_month?: number
  // Functions
  functions: VacancyFunction[]
  core_function?: string
  // Requirements
  experience: Experience
  segment_experience: Segment[]
  mandatory_criteria?: string
  dealbreakers?: string
  // Conditions
  salary_fix: number
  bonus_description?: string
  avg_income?: number
  max_income?: number
  work_format: WorkFormat
  extra_conditions?: string
  // Economics
  expected_revenue_per_employee?: number
  hiring_investment?: number
  payback_period?: PaybackPeriod
  // Candidate portrait
  ideal_candidate?: string
  first_month_expectations?: string
  // Meta
  snapshot?: VacancySnapshot
  created_at: string
  updated_at: string
}

// ─── Wizard Draft ───────────────────────────────────────────────────────────

export interface WizardDraft {
  company: Partial<Company>
  product: Partial<CompanyProduct>
  vacancy: Partial<Vacancy>
  selected_product_id?: string  // for multi-product: chosen existing product id
}

export const EMPTY_WIZARD_DRAFT: WizardDraft = {
  company: {},
  product: { segments: [] },
  vacancy: {
    hiring_goals: [],
    current_problems: [],
    functions: [],
    segment_experience: [],
    headcount: 1,
    salary_fix: 0,
  },
}
