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
import { SUPPORT_EMAIL } from "@/lib/constants"

// ─── VK / Яндекс иконки (простые монохром-бейджи в брендовых цветах) ──────────

function VkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#0077FF" />
      <path d="M12.8 17c-4.7 0-7.4-3.2-7.5-8.6h2.4c.1 3.7 1.7 5.3 3 5.6V8.4h2.2v3.4c1.3-.1 2.6-1.6 3.1-3.4h2.2c-.4 2.2-2 3.9-3.1 4.6 1.1.6 3 2 3.7 4.6h-2.4c-.5-1.7-1.9-3-3.5-3.1V17h-.1Z" fill="#fff" />
    </svg>
  )
}

function YandexIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
      <path d="M13.4 6h-1.9c-2.4 0-4 1.4-4 3.6 0 1.6.8 2.6 2.2 3.4l-2.5 4.9h2.1l2.2-4.5h1v4.5h1.9V6Zm-1.9 6.1h-.3c-1.1 0-1.7-.7-1.7-2 0-1.4.7-2.1 1.9-2.1h.1v4.1Z" fill="#fff" />
    </svg>
  )
}

// ─── Основная форма ────────────────────────────────────────────────────────────

function LoginForm({ vkEnabled, yandexEnabled }: { vkEnabled: boolean; yandexEnabled: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/"
  const oauthError = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<"vk" | "yandex" | null>(null)
  const [error, setError] = useState("")

  const handleOAuth = (provider: "vk" | "yandex") => {
    setOauthLoading(provider)
    signIn(provider, { callbackUrl })
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
      const code = result.code ?? ""
      if (code === "rate_limited") {
        setError("Слишком много попыток входа. Подождите ~15 минут или сбросьте пароль.")
      } else if (code.startsWith("bad_credentials:")) {
        const left = code.split(":")[1]
        setError(`Неверный логин или пароль. Осталось попыток: ${left}`)
      } else {
        setError("Неверный логин или пароль")
      }
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
            <h1 className="text-2xl font-bold text-foreground">Company24.Pro</h1>
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

            {(vkEnabled || yandexEnabled) && (
              <div className="space-y-2">
                {vkEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-2"
                    onClick={() => handleOAuth("vk")}
                    disabled={oauthLoading !== null}
                  >
                    <VkIcon />
                    {oauthLoading === "vk" ? "Входим через VK..." : "Войти через VK"}
                  </Button>
                )}
                {yandexEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-2"
                    onClick={() => handleOAuth("yandex")}
                    disabled={oauthLoading !== null}
                  >
                    <YandexIcon />
                    {oauthLoading === "yandex" ? "Входим через Яндекс..." : "Войти через Яндекс"}
                  </Button>
                )}
                <div className="relative pt-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">или паролем</span></div>
                </div>
              </div>
            )}

            {oauthError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <span className="text-base">⚠️</span> Аккаунт с этим email не найден на платформе. Войдите паролем или обратитесь к администратору.
              </p>
            )}

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

              <p className="text-xs text-muted-foreground text-center mt-4">
                <a href={`mailto:${SUPPORT_EMAIL}`}>Нужна помощь?</a>
              </p>
            </form>

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

export function LoginFormWithSuspense({ vkEnabled, yandexEnabled }: { vkEnabled: boolean; yandexEnabled: boolean }) {
  return (
    <Suspense fallback={null}>
      <LoginForm vkEnabled={vkEnabled} yandexEnabled={yandexEnabled} />
    </Suspense>
  )
}
