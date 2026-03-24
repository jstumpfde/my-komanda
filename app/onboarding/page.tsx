"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  Building2,
  Briefcase,
  PartyPopper,
  ArrowRight,
  Search,
  Loader2,
  Check,
  SkipForward,
  CheckCircle2,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DadataParty {
  value: string
  data: {
    inn: string
    kpp?: string
    name: {
      full_with_opf?: string
      full?: string
      short_with_opf?: string
    }
    address?: {
      value?: string
    }
    state?: {
      registration_date?: number
    }
  }
}

interface DadataResponse {
  suggestions: DadataParty[]
}

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: "Компания" },
  { num: 2, label: "Вакансия" },
  { num: 3, label: "Готово" },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                current > s.num
                  ? "bg-primary text-primary-foreground"
                  : current === s.num
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {current > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
            </div>
            <span
              className={cn(
                "text-xs font-medium hidden sm:block",
                current === s.num ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "w-8 sm:w-12 h-0.5 mx-2 rounded-full transition-all",
                current > s.num ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin w-4 h-4", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const { update: updateSession } = useSession()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Step 1 — Company
  const [companyName, setCompanyName] = useState("")
  const [inn, setInn] = useState("")
  const [kpp, setKpp] = useState("")
  const [legalAddress, setLegalAddress] = useState("")
  const [city, setCity] = useState("")
  const [industry, setIndustry] = useState("")
  const [innLoading, setInnLoading] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

  // Step 2 — Vacancy
  const [vacancyTitle, setVacancyTitle] = useState("")
  const [vacancyCity, setVacancyCity] = useState("")
  const [vacancyFormat, setVacancyFormat] = useState<"office" | "hybrid" | "remote" | "">("")
  const [salaryMin, setSalaryMin] = useState("")
  const [salaryMax, setSalaryMax] = useState("")
  const [vacancySkipped, setVacancySkipped] = useState(false)
  const [vacancyId, setVacancyId] = useState<string | null>(null)

  const innRef = useRef<HTMLInputElement>(null)

  // ── INN autofill ──────────────────────────────────────────────────────────

  const handleInnSearch = async () => {
    const digits = inn.replace(/\D/g, "")
    if (digits.length !== 10 && digits.length !== 12) {
      setError("ИНН должен содержать 10 цифр (ООО/АО) или 12 цифр (ИП)")
      return
    }
    setError("")
    setInnLoading(true)
    try {
      const res = await fetch(`/api/companies/by-inn?inn=${digits}`)
      if (!res.ok) throw new Error("DaData error")
      const data = await res.json() as DadataResponse
      const s = data.suggestions?.[0]
      if (!s) {
        setError("Компания не найдена по ИНН")
        return
      }
      // Support both ООО (10 digits) and ИП (12 digits)
      const fullName =
        s.data.name.full_with_opf ||
        s.data.name.full ||
        s.data.name.short_with_opf ||
        ""
      setCompanyName(fullName)
      // KPP only exists for legal entities (10-digit INN), not for IP
      setKpp(s.data.kpp ?? "")
      setLegalAddress(s.data.address?.value ?? "")
      // Extract city from address
      const addressParts = (s.data.address?.value ?? "").split(",")
      const cityPart = addressParts.find(p => p.trim().startsWith("г."))
      if (cityPart) setCity(cityPart.trim().replace(/^г\.\s*/, ""))
      setInn(digits)
    } catch {
      setError("Не удалось загрузить данные из DaData")
    } finally {
      setInnLoading(false)
    }
  }

  // Auto-search when INN reaches required length
  useEffect(() => {
    const digits = inn.replace(/\D/g, "")
    if (digits.length === 10 || digits.length === 12) {
      handleInnSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inn])

  // ── Step 1: Save company ──────────────────────────────────────────────────

  const handleStep1 = async () => {
    if (!companyName.trim() || !city.trim()) {
      setError("Заполните название компании и город")
      return
    }
    setError("")
    setSaving(true)
    try {
      let id: string | null = null

      // Try API — if unavailable (no auth / no DB), fall back to localStorage
      try {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: companyName.trim(),
            inn: inn || undefined,
            kpp: kpp || undefined,
            legal_address: legalAddress || undefined,
            city: city.trim(),
            industry: industry || undefined,
          }),
        })

        if (res.ok) {
          const company = await res.json() as { id: string }
          id = company.id

          // Update user's companyId (best-effort)
          await fetch("/api/auth/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId: company.id }),
          }).catch(() => {})

          // Refresh session (best-effort)
          await updateSession().catch(() => {})
        }
      } catch {
        // API unavailable — will use localStorage fallback
      }

      // localStorage fallback (demo mode)
      if (!id) {
        id = `company_${Date.now()}`
        try {
          localStorage.setItem("onboarding_company", JSON.stringify({
            id,
            name: companyName.trim(),
            inn: inn || undefined,
            kpp: kpp || undefined,
            legalAddress: legalAddress || undefined,
            city: city.trim(),
            industry: industry || undefined,
          }))
        } catch { /* ignore */ }
      }

      setCompanyId(id)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  // ── Step 2: Save vacancy or skip ─────────────────────────────────────────

  const handleStep2 = async (skip: boolean) => {
    if (!skip && !vacancyTitle.trim()) {
      setError("Введите название должности")
      return
    }
    setError("")
    if (skip) {
      setVacancySkipped(true)
      setStep(3)
      return
    }
    setSaving(true)
    try {
      let id: string | null = null

      // Try API — fall back to localStorage if unavailable
      try {
        const res = await fetch("/api/vacancies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: vacancyTitle.trim(),
            city: vacancyCity || undefined,
            format: vacancyFormat || undefined,
            salary_min: salaryMin ? parseInt(salaryMin) : undefined,
            salary_max: salaryMax ? parseInt(salaryMax) : undefined,
          }),
        })
        if (res.ok) {
          const v = await res.json() as { id: string }
          id = v.id
        }
      } catch {
        // API unavailable — will use localStorage fallback
      }

      // localStorage fallback (demo mode)
      if (!id) {
        id = `vacancy_${Date.now()}`
        try {
          localStorage.setItem("onboarding_vacancy", JSON.stringify({
            id,
            title: vacancyTitle.trim(),
            city: vacancyCity || undefined,
            format: vacancyFormat || undefined,
            salary_min: salaryMin ? parseInt(salaryMin) : undefined,
            salary_max: salaryMax ? parseInt(salaryMax) : undefined,
          }))
        } catch { /* ignore */ }
      }

      setVacancyId(id)
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  // ── Enter dashboard ───────────────────────────────────────────────────────

  const handleFinish = () => {
    // Ставим куку, чтобы middleware не редиректил обратно на /onboarding
    // пока сессия ещё не обновилась (или в демо-режиме без бэкенда)
    document.cookie = "mk_onboarded=1; path=/; max-age=604800; SameSite=Lax"

    // vacancyId из localStorage (демо-режим) начинается с "vacancy_"
    // — страницы /vacancies/<localId> не существует, идём на главную
    if (vacancyId && !vacancyId.startsWith("vacancy_")) {
      router.push(`/vacancies/${vacancyId}`)
    } else {
      router.push("/")
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Header ── */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold text-foreground">Моя Команда</span>
          </div>
          <StepIndicator current={step} />
        </div>

        {/* Progress bar */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 text-right">Шаг {step} из 3</p>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex items-start justify-center p-4 pt-8 pb-12">
        <div className="max-w-lg w-full space-y-6">

          {/* ════ ШАГ 1: Данные компании ════════════════════════════════ */}
          {step === 1 && (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <Building2 className="w-6 h-6 text-foreground" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground mt-3">Данные компании</h1>
                <p className="text-muted-foreground text-sm">Введите ИНН — остальное заполним автоматически</p>
              </div>

              <Card>
                <CardContent className="pt-6 pb-6 space-y-4">

                  {/* INN */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-inn" className="text-sm font-medium">
                      ИНН
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="ob-inn"
                        ref={innRef}
                        value={inn}
                        onChange={e => {
                          setInn(e.target.value.replace(/\D/g, "").slice(0, 12))
                          setError("")
                        }}
                        placeholder="7707083893 (ООО) или 123456789012 (ИП)"
                        className="font-mono"
                        autoFocus
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={handleInnSearch}
                        disabled={innLoading}
                      >
                        {innLoading ? <Spinner /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">10 цифр — ООО/АО, 12 цифр — ИП</p>
                  </div>

                  {/* Company name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-name" className="text-sm font-medium">
                      Название компании <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="ob-name"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="ООО «Ромашка»"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* KPP */}
                    <div className="space-y-1.5">
                      <Label htmlFor="ob-kpp" className="text-sm font-medium">КПП</Label>
                      <Input
                        id="ob-kpp"
                        value={kpp}
                        onChange={e => setKpp(e.target.value.replace(/\D/g, "").slice(0, 9))}
                        placeholder="770701001"
                        className="font-mono"
                      />
                    </div>

                    {/* City */}
                    <div className="space-y-1.5">
                      <Label htmlFor="ob-city" className="text-sm font-medium">
                        Город <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="ob-city"
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        placeholder="Москва"
                      />
                    </div>
                  </div>

                  {/* Legal address */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-addr" className="text-sm font-medium">
                      Юридический адрес
                    </Label>
                    <Input
                      id="ob-addr"
                      value={legalAddress}
                      onChange={e => setLegalAddress(e.target.value)}
                      placeholder="г. Москва, ул. Ленина, д. 1"
                    />
                  </div>

                  {/* Industry */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-industry" className="text-sm font-medium">Отрасль</Label>
                    <Input
                      id="ob-industry"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      placeholder="IT, Строительство, Торговля..."
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button
                    className="w-full h-10 font-medium"
                    onClick={handleStep1}
                    disabled={saving}
                  >
                    {saving ? (
                      <span className="flex items-center gap-2"><Spinner /> Сохраняем...</span>
                    ) : (
                      <span className="flex items-center gap-2">Далее <ArrowRight className="w-4 h-4" /></span>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ════ ШАГ 2: Первая вакансия ════════════════════════════════ */}
          {step === 2 && (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <Briefcase className="w-6 h-6 text-foreground" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground mt-3">Первая вакансия</h1>
                <p className="text-muted-foreground text-sm">Создайте вакансию, чтобы начать принимать кандидатов</p>
              </div>

              <Card>
                <CardContent className="pt-6 pb-6 space-y-4">

                  {/* Position title */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-vacancy-title" className="text-sm font-medium">
                      Название должности <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="ob-vacancy-title"
                      value={vacancyTitle}
                      onChange={e => { setVacancyTitle(e.target.value); setError("") }}
                      placeholder="Менеджер по продажам"
                      autoFocus
                    />
                  </div>

                  {/* City */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-vacancy-city" className="text-sm font-medium">Город</Label>
                    <Input
                      id="ob-vacancy-city"
                      value={vacancyCity}
                      onChange={e => setVacancyCity(e.target.value)}
                      placeholder="Москва"
                    />
                  </div>

                  {/* Format */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Формат работы</Label>
                    <div className="flex gap-2">
                      {([
                        { value: "office", label: "Офис" },
                        { value: "hybrid", label: "Гибрид" },
                        { value: "remote", label: "Удалённо" },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setVacancyFormat(opt.value)}
                          className={cn(
                            "flex-1 py-2 rounded-md border text-sm font-medium transition-colors",
                            vacancyFormat === opt.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-input text-muted-foreground hover:border-ring hover:text-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Salary range */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Зарплата, ₽/мес</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        value={salaryMin}
                        onChange={e => setSalaryMin(e.target.value)}
                        placeholder="от 80 000"
                        min={0}
                      />
                      <Input
                        type="number"
                        value={salaryMax}
                        onChange={e => setSalaryMax(e.target.value)}
                        placeholder="до 150 000"
                        min={0}
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button
                    className="w-full h-10 font-medium"
                    onClick={() => handleStep2(false)}
                    disabled={saving}
                  >
                    {saving ? (
                      <span className="flex items-center gap-2"><Spinner /> Создаём...</span>
                    ) : (
                      <span className="flex items-center gap-2">Далее <ArrowRight className="w-4 h-4" /></span>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground gap-1.5"
                    onClick={() => handleStep2(true)}
                    disabled={saving}
                  >
                    <SkipForward className="w-4 h-4" /> Пропустить — сделаю позже
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ════ ШАГ 3: Готово ════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <PartyPopper className="w-6 h-6 text-foreground" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground mt-3">Готово!</h1>
                <p className="text-muted-foreground text-sm">Платформа настроена. Начинайте нанимать!</p>
              </div>

              {/* Summary card */}
              <Card>
                <CardContent className="pt-6 pb-6 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Что создано</p>

                  {/* Company summary */}
                  {companyName && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <div className="w-8 h-8 rounded-lg bg-background border flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Компания</p>
                        <p className="text-sm font-semibold text-foreground truncate">{companyName}</p>
                        {city && <p className="text-xs text-muted-foreground">{city}</p>}
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0 ml-auto" />
                    </div>
                  )}

                  {/* Vacancy summary */}
                  {!vacancySkipped && vacancyTitle && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <div className="w-8 h-8 rounded-lg bg-background border flex items-center justify-center shrink-0">
                        <Briefcase className="w-4 h-4 text-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Вакансия</p>
                        <p className="text-sm font-semibold text-foreground truncate">{vacancyTitle}</p>
                        {vacancyCity && <p className="text-xs text-muted-foreground">{vacancyCity}</p>}
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0 ml-auto" />
                    </div>
                  )}

                  {vacancySkipped && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-dashed">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Вакансия</p>
                        <p className="text-sm text-muted-foreground">Пропущено — создайте позже</p>
                      </div>
                      <SkipForward className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                size="lg"
                className="w-full h-11 text-base font-medium"
                onClick={handleFinish}
              >
                Войти в кабинет <ArrowRight className="w-5 h-5 ml-1" />
              </Button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
