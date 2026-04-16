"use client"

import { Suspense, useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Briefcase, ArrowRight, Eye, EyeOff, ChevronDown } from "lucide-react"
import Link from "next/link"

// ─── Блок входа по номеру телефона ────────────────────────────────────────────

function PhoneLoginBlock({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = () => {
    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const formatPhone = (value: string) => {
    const d = value.replace(/\D/g, "").slice(0, 11)
    if (d.length === 0) return ""
    let result = "+7"
    if (d.length > 1) result += ` (${d.slice(1, 4)}`
    if (d.length >= 4) result += `) ${d.slice(4, 7)}`
    if (d.length >= 7) result += `-${d.slice(7, 9)}`
    if (d.length >= 9) result += `-${d.slice(9, 11)}`
    return result
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const digits = raw.replace(/\D/g, "")
    // Если пользователь вводит 8 в начале — заменяем на 7
    const normalized = digits.startsWith("8") ? "7" + digits.slice(1) : digits.startsWith("7") ? digits : "7" + digits
    setPhone(normalized.slice(0, 11))
    setError("")
  }

  const handleSendCode = async () => {
    if (phone.length !== 11) {
      setError("Введите полный номер телефона")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Ошибка отправки SMS")
        return
      }
      setCodeSent(true)
      startCountdown()
    } catch {
      setError("Ошибка соединения")
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Введите 6-значный код")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/sms/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      })
      const data = await res.json() as { ok?: boolean; userId?: string; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Неверный код")
        return
      }
      // Войти через credentials с userId (dev-provider)
      const result = await signIn("dev", { userId: data.userId, redirect: false })
      if (result?.error) {
        setError("Не удалось войти. Попробуйте снова.")
        return
      }
      router.push(callbackUrl)
      router.refresh()
    } catch {
      setError("Ошибка соединения")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>Войти по номеру телефона</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sms-phone" className="text-sm font-medium">Номер телефона</Label>
            <Input
              id="sms-phone"
              type="tel"
              value={formatPhone(phone)}
              onChange={handlePhoneChange}
              placeholder="+7 (___) ___-__-__"
              disabled={codeSent}
            />
          </div>

          {!codeSent ? (
            <Button
              type="button"
              variant="outline"
              className="w-full h-10"
              onClick={handleSendCode}
              disabled={loading || phone.length !== 11}
            >
              {loading ? "Отправляем..." : "Получить код"}
            </Button>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="sms-code" className="text-sm font-medium">Код из SMS</Label>
                <Input
                  id="sms-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError("") }}
                  placeholder="______"
                  autoFocus
                />
              </div>
              <Button
                type="button"
                className="w-full h-10 font-semibold"
                onClick={handleVerify}
                disabled={loading || code.length !== 6}
              >
                {loading ? "Проверяем..." : "Войти"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                onClick={() => {
                  setCode("")
                  setCodeSent(false)
                  setError("")
                  handleSendCode()
                }}
                disabled={countdown > 0 || loading}
              >
                {countdown > 0 ? `Отправить повторно через ${countdown} с` : "Отправить код повторно"}
              </button>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <span className="text-base">⚠️</span> {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Основная форма ────────────────────────────────────────────────────────────

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email.trim() || !password) {
      setError("Введите email/имя и пароль")
      return
    }

    setLoading(true)

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError("Неверный логин или пароль")
      return
    }

    router.push(callbackUrl)
    router.refresh()
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
            <h1 className="text-2xl font-bold text-foreground">Company24</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI Business OS</p>
          </div>
        </div>

        {/* Card */}
        <Card className="border">
          <CardContent className="pt-6 pb-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Вход в систему</h2>
              <p className="text-sm text-muted-foreground">Введите email или имя и пароль для доступа</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email или имя</Label>
                <Input
                  id="email"
                  type="text"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError("") }}
                  placeholder="you@company.ru или Иван"
                  autoFocus
                  autoComplete="email"
                  className={error ? "border-destructive focus-visible:ring-destructive" : ""}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">Пароль</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">Забыли пароль?</Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError("") }}
                    placeholder="Введите пароль"
                    autoComplete="current-password"
                    className={error ? "border-destructive focus-visible:ring-destructive pr-10" : "pr-10"}
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

              {error && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <span className="text-base">⚠️</span> {error}
                </p>
              )}

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Проверяем...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Войти <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>

            {/* Вход по телефону */}
            <PhoneLoginBlock callbackUrl={callbackUrl} />

            <p className="text-center text-sm text-muted-foreground">
              Нет аккаунта?{" "}
              <Link href="/register" className="text-primary hover:underline font-medium">
                Оставить заявку
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © 2026 Company24. Все права защищены.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
