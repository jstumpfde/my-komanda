"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Briefcase, ArrowRight, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [devLoading, setDevLoading] = useState(false)
  const [error, setError] = useState("")

  // NEXT_PUBLIC_ нужен для client-компонентов; сервер может читать ALLOW_DEV_LOGIN
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true"

  const handleDevLogin = async () => {
    setDevLoading(true)
    setError("")
    try {
      const res = await fetch("/api/dev/login", { method: "POST" })
      const { userId } = await res.json()
      const result = await signIn("dev", { userId, redirect: false })
      if (result?.error) {
        setError("Dev-вход не удался")
        return
      }
      window.location.href = callbackUrl
    } catch {
      setError("Dev-вход не удался")
    } finally {
      setDevLoading(false)
    }
  }

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
            <h1 className="text-2xl font-bold text-foreground">Моя Команда</h1>
            <p className="text-sm text-muted-foreground mt-0.5">HR-платформа для найма</p>
          </div>
        </div>

        {/* Card */}
        <Card className="border shadow-xl">
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
                <div className="flex items-center justify-between"><Label htmlFor="password" className="text-sm font-medium">Пароль</Label><Link href="/forgot-password" className="text-xs text-primary hover:underline">Забыли пароль?</Link></div>
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

            <p className="text-center text-sm text-muted-foreground">
              Нет аккаунта?{" "}
              <Link href="/register" className="text-primary hover:underline font-medium">
                Зарегистрироваться
              </Link>
            </p>

            {isDev && (
              <div className="border-t pt-4 space-y-2">
                <p className="text-center text-xs text-muted-foreground font-mono">⚙ DEV MODE</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 text-sm font-medium border-dashed border-slate-400 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  onClick={handleDevLogin}
                  disabled={devLoading}
                >
                  {devLoading ? "Входим..." : "🔧 Войти как демо"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © 2026 Моя Команда. Все права защищены.
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
