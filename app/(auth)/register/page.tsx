"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useSession } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Briefcase, ArrowRight, Eye, EyeOff, Search } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

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
  }
}

interface DadataResponse {
  suggestions: DadataParty[]
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const { update: updateSession } = useSession()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [inn, setInn] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [city, setCity] = useState("")
  const [kpp, setKpp] = useState("")
  const [legalAddress, setLegalAddress] = useState("")
  const [innLoading, setInnLoading] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

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
      if (!res.ok) throw new Error()
      const data = await res.json() as DadataResponse
      const s = data.suggestions?.[0]
      if (!s) { setError("Компания не найдена по ИНН"); return }
      const fullName = s.data.name.full_with_opf || s.data.name.full || s.data.name.short_with_opf || ""
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
    if (digits.length === 10 || digits.length === 12) handleInnSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inn])

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) { setError("Введите имя"); return }
    if (!email.trim()) { setError("Введите email"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Некорректный формат email"); return }
    if (!companyName.trim()) { setError("Введите название компании"); return }
    if (!city.trim()) { setError("Введите город"); return }
    if (!password) { setError("Введите пароль"); return }
    if (password.length < 6) { setError("Пароль должен содержать минимум 6 символов"); return }
    if (password !== confirm) { setError("Пароли не совпадают"); return }

    setLoading(true)
    try {
      // 1. Register user
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? "Ошибка регистрации"); return }

      // 2. Auto-login
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

      // 3. Create company
      const companyRes = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyName.trim(),
          inn: inn || undefined,
          kpp: kpp || undefined,
          legal_address: legalAddress || undefined,
          city: city.trim(),
        }),
      })
      if (!companyRes.ok) {
        const err = await companyRes.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || "Ошибка создания компании")
      }
      const company = await companyRes.json() as { id: string }

      // 4. Bind company to user
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      })

      // 5. Refresh session and go to dashboard
      document.cookie = "mk_onboarded=1; path=/; max-age=604800; SameSite=Lax"
      await updateSession()
      router.push("/")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения. Попробуйте ещё раз.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Моя Команда</h1>
            <p className="text-sm text-muted-foreground mt-0.5">HR-платформа для найма</p>
          </div>
        </div>

        {/* Card */}
        <Card className="border shadow-xl">
          <CardContent className="pt-6 pb-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Создать аккаунт</h2>
              <p className="text-sm text-muted-foreground">Начните нанимать бесплатно — 7 дней Trial</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Name */}
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

              {/* Email */}
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

              {/* INN */}
              <div className="space-y-1.5">
                <Label htmlFor="reg-inn" className="text-sm font-medium">ИНН компании</Label>
                <div className="flex gap-2">
                  <Input
                    id="reg-inn"
                    value={inn}
                    onChange={e => {
                      setInn(e.target.value.replace(/\D/g, "").slice(0, 12))
                      setError("")
                    }}
                    placeholder="7707083893"
                    className="font-mono"
                    autoComplete="off"
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
                <p className="text-xs text-muted-foreground">10 цифр — ООО/АО, 12 цифр — ИП. Данные заполнятся автоматически.</p>
              </div>

              {/* Company name */}
              <div className="space-y-1.5">
                <Label htmlFor="reg-company" className="text-sm font-medium">
                  Название компании <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reg-company"
                  value={companyName}
                  onChange={e => { setCompanyName(e.target.value); setError("") }}
                  placeholder="ООО «Ромашка»"
                />
              </div>

              {/* City */}
              <div className="space-y-1.5">
                <Label htmlFor="reg-city" className="text-sm font-medium">
                  Город <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reg-city"
                  value={city}
                  onChange={e => { setCity(e.target.value); setError("") }}
                  placeholder="Москва"
                />
              </div>

              {/* Password */}
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

              {/* Confirm password */}
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

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <span className="text-base">⚠️</span> {error}
                </p>
              )}

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2"><Spinner /> Создаём аккаунт...</span>
                ) : (
                  <span className="flex items-center gap-2">Создать аккаунт <ArrowRight className="w-4 h-4" /></span>
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
      </div>
    </div>
  )
}
