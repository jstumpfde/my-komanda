// ─── Company Storage ────────────────────────────────────────────────────────
// localStorage CRUD for Company, CompanyProduct, Vacancy, and WizardDraft.
// All functions are SSR-safe (check typeof window before accessing localStorage).

import type {
  Company,
  CompanyProduct,
  Vacancy,
  VacancySnapshot,
  WizardDraft,
  WorkFormat,
} from "@/lib/company-types"

// ─── Storage Keys ───────────────────────────────────────────────────────────

export const COMPANY_KEY = "mk_company"
export const PRODUCTS_KEY = "mk_products"
export const VACANCIES_KEY = "mk_vacancies"
export const WIZARD_DRAFT_KEY = "mk_wizard_draft"

// ─── Helpers ────────────────────────────────────────────────────────────────

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function safeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage errors (e.g. private browsing quota)
  }
}

// ─── Company ────────────────────────────────────────────────────────────────

export function getCompany(): Company | null {
  return safeGet<Company>(COMPANY_KEY)
}

export function saveCompany(company: Company): void {
  safeSet(COMPANY_KEY, company)
}

export function updateCompany(updates: Partial<Company>): void {
  const existing = getCompany()
  if (existing) {
    saveCompany({ ...existing, ...updates })
  }
}

// ─── Products ───────────────────────────────────────────────────────────────

function getAllProducts(): CompanyProduct[] {
  return safeGet<CompanyProduct[]>(PRODUCTS_KEY) ?? []
}

export function getProducts(companyId: string): CompanyProduct[] {
  return getAllProducts().filter((p) => p.company_id === companyId)
}

export function saveProduct(product: CompanyProduct): void {
  const all = getAllProducts()
  const idx = all.findIndex((p) => p.id === product.id)
  if (idx >= 0) {
    all[idx] = product
  } else {
    all.push(product)
  }
  safeSet(PRODUCTS_KEY, all)
}

export function deleteProduct(productId: string): void {
  const all = getAllProducts().filter((p) => p.id !== productId)
  safeSet(PRODUCTS_KEY, all)
}

// ─── Vacancies ──────────────────────────────────────────────────────────────

function getAllVacancies(): Vacancy[] {
  return safeGet<Vacancy[]>(VACANCIES_KEY) ?? []
}

export function getVacancies(companyId: string): Vacancy[] {
  return getAllVacancies().filter((v) => v.company_id === companyId)
}

export function getVacancy(id: string): Vacancy | null {
  return getAllVacancies().find((v) => v.id === id) ?? null
}

export function saveVacancy(vacancy: Vacancy): void {
  const all = getAllVacancies()
  const idx = all.findIndex((v) => v.id === vacancy.id)
  if (idx >= 0) {
    all[idx] = vacancy
  } else {
    all.push(vacancy)
  }
  safeSet(VACANCIES_KEY, all)
}

// ─── Wizard Draft ────────────────────────────────────────────────────────────

export function getWizardDraft(): WizardDraft | null {
  return safeGet<WizardDraft>(WIZARD_DRAFT_KEY)
}

export function saveWizardDraft(draft: WizardDraft): void {
  safeSet(WIZARD_DRAFT_KEY, draft)
}

export function clearWizardDraft(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(WIZARD_DRAFT_KEY)
}

// ─── Computed Helpers ────────────────────────────────────────────────────────

export function computeSnapshot(
  vacancy: Pick<Vacancy, "position_title" | "salary_fix" | "work_format" | "leads_per_month">,
  company: Pick<Company, "name">,
  product?: Pick<CompanyProduct, "name">
): VacancySnapshot {
  return {
    captured_at: new Date().toISOString(),
    company_name: company.name,
    product_name: product?.name,
    position_title: vacancy.position_title,
    salary_fix: vacancy.salary_fix,
    work_format: vacancy.work_format as WorkFormat,
    leads_per_month: vacancy.leads_per_month,
  }
}

export function computeCompletionPct(draft: WizardDraft): number {
  const { company, product, vacancy } = draft

  // 13 required fields — each counts as 1 point
  const required = [
    !!company.name,
    !!company.industry,
    !!company.city,
    !!(company.founded_year && company.founded_year >= 1900),
    !!product.name,
    !!product.description,
    !!vacancy.position_title,
    !!(vacancy.headcount && vacancy.headcount >= 1),
    !!(vacancy.hiring_goals && vacancy.hiring_goals.length >= 1),
    !!(vacancy.functions && vacancy.functions.length >= 1),
    !!(vacancy.salary_fix && vacancy.salary_fix > 0),
    !!vacancy.work_format,
    !!vacancy.experience,
  ]

  // 10 bonus optional fields — push score toward 100%
  const bonus = [
    !!vacancy.main_goal,
    !!vacancy.main_pain,
    !!vacancy.core_function,
    !!vacancy.mandatory_criteria,
    !!vacancy.bonus_description,
    !!(vacancy.leads_per_month && vacancy.leads_per_month > 0),
    !!vacancy.ideal_candidate,
    !!vacancy.first_month_expectations,
    !!company.revenue_range,
    !!(company.crm_status && company.crm_status !== undefined),
  ]

  const filledRequired = required.filter(Boolean).length
  const filledBonus = bonus.filter(Boolean).length
  const total = required.length + bonus.length // 23
  return Math.round(((filledRequired + filledBonus) / total) * 100)
}

// ─── API CRUD (fetch-based, replaces localStorage company operations) ─────────
// These functions map to the API routes in app/api/companies/

export interface ApiCompanyUpdatePayload {
  name?: string
  inn?: string
  kpp?: string
  legal_address?: string
  city?: string
  industry?: string
  postal_code?: string
  founded_year?: number
  revenue_range?: string
  website?: string
  crm_status?: string
  crm_name?: string
  sales_scripts?: string
  training_system?: string
  trainer?: string
  sales_manager_type?: string
  is_multi_product?: boolean
  logo_url?: string
  brand_primary_color?: string
  brand_bg_color?: string
  brand_text_color?: string
  custom_theme?: Record<string, string>
}

/** GET /api/companies — fetch the current user's company from the DB */
export async function fetchCompanyApi() {
  const res = await fetch("/api/companies")
  if (!res.ok) {
    const d = await res.json() as { error?: string }
    throw new Error(d.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<unknown>
}

/** PUT /api/companies — update the current user's company */
export async function updateCompanyApi(payload: ApiCompanyUpdatePayload) {
  const res = await fetch("/api/companies", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const d = await res.json() as { error?: string }
    throw new Error(d.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<unknown>
}

/** GET /api/companies/by-inn?inn=... — server-proxied DaData lookup */
export async function fetchCompanyByInn(inn: string) {
  const res = await fetch(`/api/companies/by-inn?inn=${encodeURIComponent(inn)}`)
  if (!res.ok) {
    const d = await res.json() as { error?: string }
    throw new Error(d.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<unknown>
}

/** GET /api/companies/by-inn proxied suggest (uses ?inn= with partial name query) */
export async function suggestCompaniesByName(query: string) {
  // The by-inn endpoint is for exact INN lookup; for name suggestions we
  // need a separate endpoint. For now return empty — full suggest endpoint
  // can be added later as /api/companies/suggest
  return [] as unknown[]
}
