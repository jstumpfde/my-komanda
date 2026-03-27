"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useSession } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Briefcase, ArrowRight, Eye, EyeOff } from "lucide-react"
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
