"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Briefcase, ArrowRight, Eye, EyeOff, Info } from "lucide-react"
import { useAuth } from "@/lib/auth"

// Список пользователей (в реальном проекте — бэкенд)
const USERS = [
  { login: "admin", password: "admin", role: "admin" as const },
  { login: "manager", password: "manager", role: "manager" as const },
  { login: "client", password: "client", role: "client" as const },
]

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [loginVal, setLoginVal] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!loginVal.trim() || !password) {
      setError("Введите логин и пароль")
      return
    }

    setLoading(true)
    await new Promise(r => setTimeout(r, 600))

    const found = USERS.find(u => u.login === loginVal.trim() && u.password === password)
    if (!found) {
      setLoading(false)
      setError("Неверный логин или пароль")
      return
    }

    login(found.role)
    toast.success("Добро пожаловать!")
    router.push("/")
  }

  const fillAdmin = () => {
    setLoginVal("admin")
    setPassword("admin")
    setError("")
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
              <p className="text-sm text-muted-foreground">Введите логин и пароль для доступа</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login" className="text-sm font-medium">Логин</Label>
                <Input
                  id="login"
                  type="text"
                  value={loginVal}
                  onChange={e => { setLoginVal(e.target.value); setError("") }}
                  placeholder="Введите логин"
                  autoFocus
                  autoComplete="username"
                  className={error ? "border-destructive focus-visible:ring-destructive" : ""}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">Пароль</Label>
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

            {/* Hint block */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-semibold">Демо-доступ</span>
              </div>
              <div className="space-y-1">
                {USERS.map(u => (
                  <div key={u.login} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      <span className="font-mono bg-muted/60 px-1 rounded">{u.login}</span>
                      {" / "}
                      <span className="font-mono bg-muted/60 px-1 rounded">{u.password}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setLoginVal(u.login); setPassword(u.password); setError("") }}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-medium"
                    >
                      Заполнить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © 2025 Моя Команда. Все права защищены.
        </p>
      </div>
    </div>
  )
}
