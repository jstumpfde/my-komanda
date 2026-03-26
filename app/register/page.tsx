"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { signIn, useSession } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Briefcase,
  ArrowRight,
  Eye,
  EyeOff,
  Building2,
  PartyPopper,
  Search,
  Check,
  SkipForward,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

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
      data?: {
        city?: string
        settlement?: string
        region_with_type?: string
      }
    }
    state?: {
      registration_date?: number
    }
  }
}

interface DadataResponse {
  suggestions: DadataParty[]
}

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: "Аккаунт" },
  { num: 2, label: "Компания" },
  { num: 3, label: "Вакансия" },
  { num: 4, label: "Готово" },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1">
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
                "w-6 sm:w-8 h-0.5 mx-1.5 rounded-full transition-all",
                current > s.num ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin w-4 h-4", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter()
  const { data: session, update: updateSession } = useSession()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // If the user is already authenticated (e.g. redirected by middleware after
  // registration without a company), skip directly to the company step.
  useEffect(() => {
    if (session?.user && !session.user.companyId && step === 1) {
      setStep(2)
    }
  }, [session, step])

  // Step 1 — Account
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState("")

  // Step 2 — Company
  const [companyName, setCompanyName] = useState("")
  const [inn, setInn] = useState("")
  const [kpp, setKpp] = useState("")
  const [legalAddress, setLegalAddress] = useState("")
  const [city, setCity] = useState("")
  const [industry, setIndustry] = useState("")
  const [innLoading, setInnLoading] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const innRef = useRef<HTMLInputElement>(null)

  // Step 3 — Vacancy
  const [vacancyTitle, setVacancyTitle] = useState("")
  const [vacancyCity, setVacancyCity] = useState("")
  const [vacancyFormat, setVacancyFormat] = useState<"office" | "hybrid" | "remote" | "">("")
  const [salaryMin, setSalaryMin] = useState("")
  const [salaryMax, setSalaryMax] = useState("")
  const [vacancySkipped, setVacancySkipped] = useState(false)
  const [vacancyId, setVacancyId] = useState<string | null>(null)

  // ── INN autofill via DaData ───────────────────────────────────────────────

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
      const fullName =
        s.data.name.full_with_opf ||
        s.data.name.full ||
        s.data.name.short_with_opf ||
        ""
      setCompanyName(fullName)
      setKpp(s.data.kpp ?? "")
      setLegalAddress(s.data.address?.value ?? "")
      const addrData = s.data.address?.data
      const extractedCity = addrData?.city || addrData?.settlement || addrData?.region_with_type || ""
      if (extractedCity) setCity(extractedCity)
      setInn(digits)
    } catch {
      setError("Не удалось загрузить данные из DaData")
    } finally {
      setInnLoading(false)
    }
  }

  useEffect(() => {
    const digits = inn.replace(/\D/g, "")
    if (digits.length === 10 || digits.length === 12) {
      handleInnSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inn])

  // ── Step 1: Register + auto-login ─────────────────────────────────────────

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) { setError("Введите имя"); return }
    if (!email.trim()) { setError("Введите email"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Некорректный формат email"); return }
    if (!password) { setError("Введите пароль"); return }
    if (password.length < 6) { setError("Пароль должен содержать минимум 6 символов"); return }
    if (password !== confirm) { setError("Пароли не совпадают"); return }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        setError(data.error ?? "Ошибка регистрации")
        return
      }

      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      })
      if (result?.error) {
        setError("Аккаунт создан, но не удалось войти. Попробуйте войти вручную.")
        router.push("/login")
        return
      }

      setRegisteredEmail(email.trim().toLowerCase())
      setStep(2)
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Save company ──────────────────────────────────────────────────

  const handleStep2 = async () => {
    if (!companyName.trim() || !city.trim()) {
      setError("Заполните название компании и город")
      return
    }
    setError("")
    setLoading(true)
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
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errBody.error || `Ошибка сервера (${res.status})`)
      }
      const company = await res.json() as { id: string; name: string }

      const patchRes = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      })
      if (!patchRes.ok) {
        const errBody = await patchRes.json().catch(() => ({})) as { error?: string }
        throw new Error(errBody.error || `Не удалось привязать компанию (${patchRes.status})`)
      }

      await updateSession()
      setCompanyId(company.id)
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения данных компании")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Save vacancy or skip ─────────────────────────────────────────

  const handleStep3 = async (skip: boolean) => {
    if (!skip && !vacancyTitle.trim()) {
      setError("Введите название должности")
      return
    }
    setError("")
    if (skip) {
      setVacancySkipped(true)
      setStep(4)
      return
    }
    setLoading(true)
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
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errBody.error || `Ошибка сервера (${res.status})`)
      }
      const vacancy = await res.json() as { id: string }
      setVacancyId(vacancy.id)
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания вакансии")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 4: Finish ────────────────────────────────────────────────────────

  const handleFinish = () => {
    document.cookie = "mk_onboarded=1; path=/; max-age=604800; SameSite=Lax"
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
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 text-right">Шаг {step} из 4</p>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex items-start justify-center p-4 pt-8 pb-12">
        <div className="max-w-lg w-full space-y-6">

          {/* ════ ШАГ 1: Аккаунт ════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mx-auto shadow-lg">
                  <Briefcase className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground mt-3">Создать аккаунт</h1>
                <p className="text-muted-foreground text-sm">Начните нанимать бесплатно — 7 дней Trial</p>
              </div>

              <Card className="border shadow-xl">
                <CardContent className="pt-6 pb-6 space-y-4">
                  <form onSubmit={handleStep1} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-name" className="text-sm font-medium">Имя</Label>
                      <Input
                        id="reg-name"
                        type="text"
                        value={name}
                        onChange={e => { setName(e.target.value); setError("") }}
                        placeholder="Иван Иванов"
                        autoFocus
                        autoComplete="name"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email" className="text-sm font-medium">Email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError("") }}
                        placeholder="you@company.ru"
                        autoComplete="email"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-password" className="text-sm font-medium">Пароль</Label>
                      <div className="relative">
                        <Input
                          id="reg-password"
                          type={showPw ? "text" : "password"}
                          value={password}
                          onChange={e => { setPassword(e.target.value); setError("") }}
                          placeholder="Минимум 6 символов"
                          autoComplete="new-password"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowPw(!showPw)}
                        >
                          {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-confirm" className="text-sm font-medium">Подтвердите пароль</Label>
                      <div className="relative">
                        <Input
                          id="reg-confirm"
                          type={showConfirm ? "text" : "password"}
                          value={confirm}
                          onChange={e => { setConfirm(e.target.value); setError("") }}
                          placeholder="Повторите пароль"
                          autoComplete="new-password"
                          className={cn(
                            "pr-10",
                            confirm && confirm !== password ? "border-destructive focus-visible:ring-destructive" : ""
                          )}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowConfirm(!showConfirm)}
                        >
                          {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {confirm && confirm !== password && (
                        <p className="text-xs text-destructive">Пароли не совпадают</p>
                      )}
                    </div>

                    {error && (
                      <p className="text-sm text-destructive flex items-center gap-1.5">
                        <span className="text-base">⚠️</span> {error}
                      </p>
                    )}

                    <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                      {loading ? (
                        <span className="flex items-center gap-2"><Spinner /> Создаём аккаунт...</span>
                      ) : (
                        <span className="flex items-center gap-2">Далее <ArrowRight className="w-4 h-4" /></span>
                      )}
                    </Button>
                  </form>

                  <p className="text-center text-sm text-muted-foreground">
                    Уже есть аккаунт?{" "}
                    <Link href="/login" className="text-primary hover:underline font-medium">
                      Войти
                    </Link>
                  </p>
                </CardContent>
              </Card>

              <p className="text-center text-xs text-muted-foreground">
                © 2025 Моя Команда. Все права защищены.
              </p>
            </>
          )}

          {/* ════ ШАГ 2: Компания ════════════════════════════════════════ */}
          {step === 2 && (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <Building2 className="w-6 h-6 text-foreground" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground mt-3">Данные компании</h1>
                <p className="text-muted-foreground text-sm">Введите ИНН — данные заполнятся автоматически</p>
              </div>

              <Card>
                <CardContent className="pt-6 pb-6 space-y-4">
                  {/* INN */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-inn" className="text-sm font-medium">ИНН</Label>
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

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-addr" className="text-sm font-medium">Юридический адрес</Label>
                    <Input
                      id="ob-addr"
                      value={legalAddress}
                      onChange={e => setLegalAddress(e.target.value)}
                      placeholder="г. Москва, ул. Ленина, д. 1"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-industry" className="text-sm font-medium">Отрасль</Label>
                    <Input
                      id="ob-industry"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      placeholder="IT, Строительство, Торговля..."
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    className="w-full h-10 font-medium"
                    onClick={handleStep2}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2"><Spinner /> Сохраняем...</span>
                    ) : (
                      <span className="flex items-center gap-2">Далее <ArrowRight className="w-4 h-4" /></span>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ════ ШАГ 3: Первая вакансия ════════════════════════════════ */}
          {step === 3 && (
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

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-vacancy-city" className="text-sm font-medium">Город</Label>
                    <Input
                      id="ob-vacancy-city"
                      value={vacancyCity}
                      onChange={e => setVacancyCity(e.target.value)}
                      placeholder="Москва"
                    />
                  </div>

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

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    className="w-full h-10 font-medium"
                    onClick={() => handleStep3(false)}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2"><Spinner /> Создаём...</span>
                    ) : (
                      <span className="flex items-center gap-2">Далее <ArrowRight className="w-4 h-4" /></span>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground gap-1.5"
                    onClick={() => handleStep3(true)}
                    disabled={loading}
                  >
                    <SkipForward className="w-4 h-4" /> Пропустить — сделаю позже
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ════ ШАГ 4: Готово ══════════════════════════════════════════ */}
          {step === 4 && (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                  <PartyPopper className="w-6 h-6 text-foreground" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground mt-3">Готово!</h1>
                <p className="text-muted-foreground text-sm">Платформа настроена. Начинайте нанимать!</p>
              </div>

              <Card>
                <CardContent className="pt-6 pb-6 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Что создано</p>

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
