"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Check, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"

import type { Company, CompanyProduct, Vacancy, WizardDraft, Industry } from "@/lib/company-types"
import { EMPTY_WIZARD_DRAFT } from "@/lib/company-types"
import {
  getWizardDraft,
  saveCompany,
  saveProduct,
  saveVacancy,
  saveWizardDraft,
  clearWizardDraft,
  computeSnapshot,
  computeCompletionPct,
  generateId,
  updateCompanyApi,
  fetchCompanyApi,
} from "@/lib/company-storage"
import { addVacancyToCategory, createVacancyApi } from "@/lib/vacancy-storage"

import { StepCompany } from "@/components/vacancies/create/step-company"
import { StepProduct } from "@/components/vacancies/create/step-product"
import { StepVacancy } from "@/components/vacancies/create/step-vacancy"
import { StepFunnel } from "@/components/vacancies/create/step-funnel"
import { StepCandidate } from "@/components/vacancies/create/step-candidate"

// ─── Steps config ────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: "Компания" },
  { id: 2, title: "Продукт" },
  { id: 3, title: "Вакансия" },
  { id: 4, title: "Воронка" },
  { id: 5, title: "Кандидат" },
] as const

// Map industry to sidebar section name
function industryToSection(industry: Industry | undefined): string {
  const map: Partial<Record<Industry, string>> = {
    "IT":             "IT",
    "Логистика":      "Логистика",
    "Строительство":  "Строительство",
    "Торговля":       "Розница",
    "Производство":   "Металлоконструкции",
    "Финансы":        "Продажи",
    "Услуги":         "Продажи",
    "Другое":         "Продажи",
  }
  return (industry ? map[industry] : undefined) ?? "Продажи"
}

// ─── Completion badge ─────────────────────────────────────────────────────────

function CompletionBadge({ pct }: { pct: number }) {
  if (pct === 0) return null
  if (pct >= 80) {
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 font-normal text-xs">
        {pct}% — Отлично!
      </Badge>
    )
  }
  if (pct >= 50) {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 font-normal text-xs">
        {pct}% — Минимум для публикации
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="font-normal text-xs">
      {pct}% — Недостаточно для публикации
    </Badge>
  )
}

// Shape returned by GET /api/companies
interface ApiCompany {
  id: string
  name: string
  city: string | null
  industry: string | null
}

// Shape returned by POST /api/vacancies
interface ApiVacancy {
  id: string
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CreateVacancyPage() {
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_WIZARD_DRAFT)
  const [completionPct, setCompletionPct] = useState(0)
  const [isPublishing, setIsPublishing] = useState(false)

  // Loading state while company data is being fetched from API on mount
  const [companyLoading, setCompanyLoading] = useState(true)
  // Saving state while step 1 data is being PUT to API on "Далее"
  const [stepSaving, setStepSaving] = useState(false)

  // Company modal (Scenario 2: company data changed since draft)
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [savedCompanyForModal, setSavedCompanyForModal] = useState<Company | null>(null)

  // Mounted flag to prevent SSR flash
  const [mounted, setMounted] = useState(false)

  // ── On mount: load company from API, then restore/prefill draft ──
  useEffect(() => {
    setMounted(true)

    const existingDraft = getWizardDraft()

    fetchCompanyApi()
      .then((json) => {
        const apiData = (json as { data?: ApiCompany }).data ?? (json as ApiCompany)

        // Build a partial Company from the API response to prefill step 1
        const apiCompanyPartial: Partial<Company> = {
          name: apiData.name ?? undefined,
          city: apiData.city ?? undefined,
          industry: (apiData.industry as Company["industry"]) ?? undefined,
        }

        if (existingDraft) {
          setDraft(existingDraft)
          // Show modal if API company name differs from draft name
          const draftName = existingDraft.company.name
          if (draftName && apiData.name && draftName !== apiData.name) {
            setSavedCompanyForModal({ ...existingDraft.company, ...apiCompanyPartial } as Company)
            setShowCompanyModal(true)
          }
        } else {
          // Fresh wizard — prefill company data from API
          setDraft((prev) => ({
            ...prev,
            company: { ...prev.company, ...apiCompanyPartial },
          }))
        }
      })
      .catch(() => {
        // API unavailable or no company yet — fall back to localStorage draft
        if (existingDraft) {
          setDraft(existingDraft)
        }
      })
      .finally(() => {
        setCompanyLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave + recompute completion on every draft change ──
  useEffect(() => {
    if (!mounted) return
    saveWizardDraft(draft)
    setCompletionPct(computeCompletionPct(draft))
  }, [draft, mounted])

  // ── Step validation ──────────────────────────────────────────

  const canGoNext = (): boolean => {
    const { company, product, vacancy } = draft
    if (step === 1) {
      return !!(
        company.name?.trim() &&
        company.industry &&
        company.city?.trim() &&
        company.founded_year &&
        company.founded_year >= 1900
      )
    }
    if (step === 2) {
      if (company.is_multi_product && draft.selected_product_id) return true
      return !!(
        product.name?.trim() &&
        product.description?.trim() &&
        product.sales_type &&
        product.deal_cycle &&
        product.segments &&
        product.segments.length >= 1
      )
    }
    if (step === 3) {
      const ropFunctions = (vacancy.adaptive_fields?.rop_functions as string[] | undefined) ?? []
      const hasFunctions = (vacancy.functions?.length ?? 0) >= 1 || ropFunctions.length >= 1
      return !!(
        vacancy.position_title?.trim() &&
        vacancy.headcount &&
        vacancy.headcount >= 1 &&
        vacancy.hiring_goals &&
        vacancy.hiring_goals.length >= 1 &&
        hasFunctions &&
        vacancy.salary_fix &&
        vacancy.salary_fix > 0 &&
        vacancy.work_format &&
        vacancy.experience
      )
    }
    // Steps 4 and 5 are optional — always allow next
    return true
  }

  const getMissingStep3 = (): string[] => {
    const { vacancy } = draft
    const missing: string[] = []
    if (!vacancy.position_title?.trim()) missing.push("Должность")
    if (!vacancy.hiring_goals?.length) missing.push("Цели найма")
    const ropFunctions = (vacancy.adaptive_fields?.rop_functions as string[] | undefined) ?? []
    if (!((vacancy.functions?.length ?? 0) >= 1 || ropFunctions.length >= 1)) missing.push("Функционал")
    if (!vacancy.salary_fix || vacancy.salary_fix <= 0) missing.push("Оклад")
    if (!vacancy.work_format) missing.push("Формат работы")
    if (!vacancy.experience) missing.push("Опыт в продажах")
    return missing
  }

  const handleNext = useCallback(async () => {
    if (!canGoNext()) return

    // On step 1: save company data to API before advancing
    if (step === 1) {
      setStepSaving(true)
      try {
        await updateCompanyApi({
          name: draft.company.name?.trim(),
          city: draft.company.city?.trim(),
          industry: draft.company.industry,
        })
      } catch {
        // Non-critical: wizard can continue even if API save fails
        toast.error("Не удалось сохранить данные компании в базе", { duration: 3000 })
      } finally {
        setStepSaving(false)
      }
    }

    if (step < 5) setStep((s) => s + 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft.company])

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  // ── Save draft explicitly ────────────────────────────────────

  const handleSaveDraft = () => {
    saveWizardDraft(draft)
    toast.success("Черновик сохранён")
  }

  // ── Publish ──────────────────────────────────────────────────

  const handlePublish = async () => {
    if (isPublishing) return
    setIsPublishing(true)

    try {
      const now = new Date().toISOString()

      // 1. Build & persist company locally
      const companyId = draft.company.id ?? generateId("comp")
      const company: Company = {
        id: companyId,
        name: draft.company.name ?? "",
        industry: draft.company.industry ?? "Другое",
        industry_custom: draft.company.industry_custom,
        city: draft.company.city ?? "",
        founded_year: draft.company.founded_year ?? new Date().getFullYear(),
        revenue_range: draft.company.revenue_range,
        website: draft.company.website,
        crm_status: draft.company.crm_status ?? "none",
        crm_name: draft.company.crm_name,
        sales_scripts: draft.company.sales_scripts ?? "no",
        training_system: draft.company.training_system ?? "no",
        trainer: draft.company.trainer,
        sales_manager_type: draft.company.sales_manager_type ?? "none",
        is_multi_product: draft.company.is_multi_product ?? false,
      }
      saveCompany(company)

      // 2. Save product locally
      let productId: string | undefined = draft.selected_product_id
      let product: CompanyProduct | undefined

      if (!productId && draft.product.name) {
        productId = draft.product.id ?? generateId("prod")
        product = {
          id: productId,
          company_id: companyId,
          name: draft.product.name ?? "",
          description: draft.product.description ?? "",
          avg_check: draft.product.avg_check,
          margin_pct: draft.product.margin_pct,
          sales_type: draft.product.sales_type ?? "mixed",
          deal_cycle: draft.product.deal_cycle ?? "medium_1_4w",
          segments: draft.product.segments ?? [],
        }
        saveProduct(product)
      }

      // 3. Build & persist vacancy locally
      const localVacancyId = generateId("vac")
      const vacancy: Vacancy = {
        id: localVacancyId,
        company_id: companyId,
        product_id: productId,
        status: "active",
        completion_pct: completionPct,
        hiring_goals: draft.vacancy.hiring_goals ?? [],
        main_goal: draft.vacancy.main_goal,
        current_problems: draft.vacancy.current_problems ?? [],
        main_pain: draft.vacancy.main_pain,
        leads_per_month: draft.vacancy.leads_per_month,
        conversion_to_meeting_pct: draft.vacancy.conversion_to_meeting_pct,
        conversion_to_deal_pct: draft.vacancy.conversion_to_deal_pct,
        sales_per_month: draft.vacancy.sales_per_month,
        revenue_per_manager: draft.vacancy.revenue_per_manager,
        position_title: draft.vacancy.position_title ?? "",
        headcount: draft.vacancy.headcount ?? 1,
        hiring_urgency: draft.vacancy.hiring_urgency,
        plan_sales_per_month: draft.vacancy.plan_sales_per_month,
        plan_revenue_per_month: draft.vacancy.plan_revenue_per_month,
        functions: draft.vacancy.functions ?? [],
        core_function: draft.vacancy.core_function,
        experience: draft.vacancy.experience ?? "none",
        segment_experience: draft.vacancy.segment_experience ?? [],
        mandatory_criteria: draft.vacancy.mandatory_criteria,
        dealbreakers: draft.vacancy.dealbreakers,
        salary_fix: draft.vacancy.salary_fix ?? 0,
        bonus_description: draft.vacancy.bonus_description,
        avg_income: draft.vacancy.avg_income,
        max_income: draft.vacancy.max_income,
        work_format: draft.vacancy.work_format ?? "office",
        extra_conditions: draft.vacancy.extra_conditions,
        expected_revenue_per_employee: draft.vacancy.expected_revenue_per_employee,
        hiring_investment: draft.vacancy.hiring_investment,
        payback_period: draft.vacancy.payback_period,
        ideal_candidate: draft.vacancy.ideal_candidate,
        first_month_expectations: draft.vacancy.first_month_expectations,
        snapshot: computeSnapshot(
          {
            position_title: draft.vacancy.position_title ?? "",
            salary_fix: draft.vacancy.salary_fix ?? 0,
            work_format: draft.vacancy.work_format ?? "office",
            leads_per_month: draft.vacancy.leads_per_month,
          },
          company,
          product
        ),
        created_at: now,
        updated_at: now,
      }
      saveVacancy(vacancy)

      // 4. API calls: company → vacancy → demo (sequential)
      let redirectId = localVacancyId

      try {
        // 4a. Sync company to DB (best-effort)
        await updateCompanyApi({
          name: company.name,
          city: company.city,
          industry: company.industry,
        }).catch(() => { /* non-critical */ })

        // 4b. Create vacancy in DB — must succeed for real ID
        const vacancyResult = await createVacancyApi({
          title: vacancy.position_title,
          city: company.city || undefined,
          format: vacancy.work_format,
          salary_min: vacancy.salary_fix > 0 ? vacancy.salary_fix : undefined,
          salary_max: vacancy.avg_income ?? undefined,
        }) as { data?: ApiVacancy } | ApiVacancy

        const apiVacancy =
          (vacancyResult as { data?: ApiVacancy }).data ?? (vacancyResult as ApiVacancy)

        if (apiVacancy?.id) {
          redirectId = apiVacancy.id

          // 4c. Create a blank demo linked to the real vacancy ID
          await fetch("/api/demos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vacancy_id: apiVacancy.id,
              title: `${vacancy.position_title} — Демонстрация должности`,
              lessons_json: [],
            }),
          }).catch(() => { /* demo creation is non-critical */ })
        }
      } catch (apiErr) {
        // API failed — keep local ID (vacancy is in localStorage as fallback)
        console.warn("[CreateVacancy] API error, using local ID:", apiErr)
        toast.error("Сервер недоступен — вакансия сохранена локально")
      }

      // 5. Add to sidebar in-memory categories
      addVacancyToCategory(
        industryToSection(company.industry as Industry),
        redirectId,
        vacancy.position_title
      )

      // 6. Cleanup + redirect
      clearWizardDraft()
      toast.success("Вакансия опубликована!")

      setTimeout(() => {
        router.push(`/vacancies/${redirectId}`)
      }, 800)
    } catch (err) {
      console.error("Publish error:", err)
      toast.error("Ошибка при публикации. Попробуйте ещё раз.")
      setIsPublishing(false)
    }
  }

  // ── Company update modal handlers ─────────────────────────────

  const handleCompanyModalUpdate = () => {
    if (savedCompanyForModal) {
      setDraft((prev) => ({ ...prev, company: savedCompanyForModal }))
    }
    setShowCompanyModal(false)
  }

  const handleCompanyModalKeep = () => {
    setShowCompanyModal(false)
  }

  // ─────────────────────────────────────────────────────────────

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-3xl mx-auto p-4 sm:p-6">

            {/* ── Page title ── */}
            <div className="mb-6">
              <h1 className="text-xl font-bold text-foreground">Создание вакансии</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Заполните анкету — данные используются для AI-скоринга кандидатов
              </p>
            </div>

            {/* ── Progress stepper ── */}
            <div className="flex items-center gap-1 mb-4">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => s.id < step && setStep(s.id)}
                    className={cn(
                      "flex items-center gap-2 flex-shrink-0",
                      s.id < step ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                        s.id < step && "bg-primary/20 text-primary border-2 border-primary",
                        s.id === step && "bg-primary text-primary-foreground",
                        s.id > step && "bg-muted text-muted-foreground"
                      )}
                    >
                      {s.id < step ? <Check className="w-4 h-4" /> : s.id}
                    </div>
                    <span className={cn(
                      "text-xs font-medium hidden lg:block",
                      s.id === step ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {s.title}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-2 rounded-full transition-colors",
                      s.id < step ? "bg-primary/40" : "bg-muted"
                    )} />
                  )}
                </div>
              ))}
            </div>

            {/* ── Completion badge ── */}
            <div className="flex items-center justify-between mb-6">
              <CompletionBadge pct={completionPct} />
              <button
                type="button"
                onClick={handleSaveDraft}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Сохранить черновик
              </button>
            </div>

            {/* ── Step content ── */}
            <div className="mb-8">
              {step === 1 && (
                <StepCompany
                  data={draft.company}
                  onChange={(company) => setDraft((prev) => ({ ...prev, company }))}
                  isLoading={companyLoading}
                />
              )}
              {step === 2 && (
                <StepProduct
                  data={draft.product}
                  onChange={(product) => setDraft((prev) => ({ ...prev, product }))}
                  isMultiProduct={draft.company.is_multi_product ?? false}
                  companyId={draft.company.id}
                  selectedProductId={draft.selected_product_id}
                  onSelectProduct={(id) =>
                    setDraft((prev) => ({ ...prev, selected_product_id: id }))
                  }
                />
              )}
              {step === 3 && (
                <StepVacancy
                  data={draft.vacancy}
                  onChange={(vacancy) => setDraft((prev) => ({ ...prev, vacancy }))}
                />
              )}
              {step === 4 && (
                <StepFunnel
                  data={draft.vacancy}
                  onChange={(vacancy) => setDraft((prev) => ({ ...prev, vacancy }))}
                  salaryFix={draft.vacancy.salary_fix}
                />
              )}
              {step === 5 && (
                <StepCandidate
                  data={draft.vacancy}
                  onChange={(vacancy) => setDraft((prev) => ({ ...prev, vacancy }))}
                  completionPct={completionPct}
                  onPublish={handlePublish}
                  onSaveDraft={handleSaveDraft}
                  isPublishing={isPublishing}
                />
              )}
            </div>

            {/* ── Navigation bar (hidden on step 5 — handled inside StepCandidate) ── */}
            {step < 5 && (
              <div className="flex items-center justify-between border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={step === 1}
                  className="gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Назад
                </Button>

                <span className="text-xs text-muted-foreground">
                  Шаг {step} из {STEPS.length}
                </span>

                <div
                  onClickCapture={() => {
                    if (step === 3 && !canGoNext()) {
                      const missing = getMissingStep3()
                      toast.error(`Заполните обязательные поля: ${missing.join(", ")}`)
                    }
                  }}
                >
                <Button
                  onClick={() => { void handleNext() }}
                  disabled={!canGoNext() || stepSaving}
                  className="gap-1.5"
                >
                  {stepSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Сохраняем...
                    </>
                  ) : (
                    <>
                      Далее
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
                </div>
              </div>
            )}

          </div>
        </main>
      </SidebarInset>

      {/* ── Company update modal (Scenario 2) ── */}
      <Dialog open={showCompanyModal} onOpenChange={setShowCompanyModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Данные компании изменились</DialogTitle>
            <DialogDescription>
              Профиль компании был обновлён с момента последнего черновика. Что сделать?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={handleCompanyModalUpdate}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="w-4 h-4 rounded-full border-2 border-primary mt-0.5 flex-shrink-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Обновить данные компании в черновике</p>
                <p className="text-xs text-muted-foreground mt-0.5">Использовать актуальные данные из профиля</p>
              </div>
            </button>
            <button
              type="button"
              onClick={handleCompanyModalKeep}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Оставить данные из черновика</p>
                <p className="text-xs text-muted-foreground mt-0.5">Продолжить с теми данными, что были в черновике</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </SidebarProvider>
  )
}
