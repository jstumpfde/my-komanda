"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useSession } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Briefcase, ArrowRight, Eye, EyeOff, ChevronDown } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// ─── Блок входа по номеру телефона ────────────────────────────────────────────

function PhoneLoginBlock() {
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

  const formatPhone = (digits: string) => {
    if (digits.length === 0) return ""
    let result = "+7"
    if (digits.length > 1) result += ` (${digits.slice(1, 4)}`
    if (digits.length >= 4) result += `) ${digits.slice(4, 7)}`
    if (digits.length >= 7) result += `-${digits.slice(7, 9)}`
    if (digits.length >= 9) result += `-${digits.slice(9, 11)}`
    return result
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const digits = raw.replace(/\D/g, "")
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
      const result = await signIn("dev", { userId: data.userId, redirect: false })
      if (result?.error) {
        setError("Не удалось войти. Попробуйте снова.")
        return
      }
      router.push("/settings/company")
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
        <span>Зарегистрироваться по номеру телефона</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-sms-phone" className="text-sm font-medium">Номер телефона</Label>
            <Input
              id="reg-sms-phone"
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
                <Label htmlFor="reg-sms-code" className="text-sm font-medium">Код из SMS</Label>
                <Input
                  id="reg-sms-code"
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

// ─── Основная страница ─────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter()
  const { update: updateSession } = useSession()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!name.trim()) { setError("Введите имя"); return }
    if (!email.trim()) { setError("Введите email"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Некорректный формат email"); return }
    if (!password) { setError("Введите пароль"); return }
    if (password.length < 6) { setError("Пароль должен содержать минимум 6 символов"); return }
    if (password !== confirm) { setError("Пароли не совпадают"); return }
    if (!acceptTerms) { setError("Примите условия использования"); return }
    if (!acceptPrivacy) { setError("Примите политику конфиденциальности"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? "Ошибка регистрации"); return }
      const result = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false })
      if (result?.error) { setError("Аккаунт создан, но не удалось войти. Попробуйте войти вручную."); router.push("/login"); return }
      document.cookie = "mk_onboarded=1; path=/; max-age=604800; SameSite=Lax"
      await updateSession()
      router.push("/settings/company")
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Моя Команда</h1>
            <p className="text-sm text-muted-foreground mt-0.5">HR-платформа для найма</p>
          </div>
        </div>
        <Card className="border shadow-xl">
          <CardContent className="pt-6 pb-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Создать аккаунт</h2>
              <p className="text-sm text-muted-foreground">Начните нанимать бесплатно — 14 дней Trial</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Имя</Label>
                <Input id="reg-name" type="text" value={name} onChange={e => { setName(e.target.value); setError("") }} placeholder="Иван Иванов" autoFocus autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input id="reg-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError("") }} placeholder="you@company.ru" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Пароль</Label>
                <div className="relative">
                  <Input id="reg-password" type={showPw ? "text" : "password"} value={password} onChange={e => { setPassword(e.target.value); setError("") }} placeholder="Минимум 6 символов" autoComplete="new-password" className="pr-10" />
                  <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm">Подтвердите пароль</Label>
                <div className="relative">
                  <Input id="reg-confirm" type={showConfirm ? "text" : "password"} value={confirm} onChange={e => { setConfirm(e.target.value); setError("") }} placeholder="Повторите пароль" autoComplete="new-password" className={cn("pr-10", confirm && confirm !== password ? "border-destructive" : "")} />
                  <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm && confirm !== password && <p className="text-xs text-destructive">Пароли не совпадают</p>}
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-2.5">
                  <Checkbox id="terms" checked={acceptTerms} onCheckedChange={v => { setAcceptTerms(!!v); setError("") }} className="mt-0.5 shrink-0" />
                  <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                    Я принимаю <Link href="/terms" className="text-primary hover:underline">условия использования</Link>
                  </label>
                </div>
                <div className="flex items-start gap-2.5">
                  <Checkbox id="privacy" checked={acceptPrivacy} onCheckedChange={v => { setAcceptPrivacy(!!v); setError("") }} className="mt-0.5 shrink-0" />
                  <label htmlFor="privacy" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                    Я согласен с <Link href="/privacy" className="text-primary hover:underline">политикой конфиденциальности</Link>
                  </label>
                </div>
              </div>
              {error && <p className="text-sm text-destructive flex items-center gap-1.5"><span>⚠️</span> {error}</p>}
              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || !acceptTerms || !acceptPrivacy}>
                {loading ? <span className="flex items-center gap-2"><Spinner /> Создаём аккаунт...</span> : <span className="flex items-center gap-2">Создать аккаунт <ArrowRight className="w-4 h-4" /></span>}
              </Button>
            </form>

            {/* Разделитель */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">или</span>
              </div>
            </div>

            {/* OAuth кнопки */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex items-center gap-2 text-sm font-medium"
                onClick={() => signIn("google", { callbackUrl: "/settings/company" })}
              >
                <GoogleIcon />
                Google
              </Button>
              <Button
                type="button"
                className="h-10 flex items-center gap-2 text-sm font-medium bg-[#0077FF] hover:bg-[#0066DD] text-white border-0"
                onClick={() => signIn("vk", { callbackUrl: "/settings/company" })}
              >
                <span className="font-bold text-base leading-none">VK</span>
                ВКонтакте
              </Button>
            </div>

            {/* Вход по телефону */}
            <PhoneLoginBlock />

            <p className="text-center text-sm text-muted-foreground">
              Уже есть аккаунт?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">Войти</Link>
            </p>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">© 2026 Моя Команда. Все права защищены.</p>
      </div>
    </div>
  )
}
