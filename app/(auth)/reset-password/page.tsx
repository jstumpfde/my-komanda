"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Briefcase, ArrowLeft, ArrowRight, Eye, EyeOff, AlertCircle } from "lucide-react"

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Пароль должен быть не короче 8 символов"
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw)) return "Пароль должен содержать хотя бы одну букву"
  if (!/[0-9]/.test(pw)) return "Пароль должен содержать хотя бы одну цифру"
  return null
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [tokenInvalid, setTokenInvalid] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const pwError = validatePassword(password)
    if (pwError) { setError(pwError); return }
    if (password !== confirm) { setError("Пароли не совпадают"); return }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        if (data.error === "invalid_or_expired_token") {
          setTokenInvalid(true)
          return
        }
        setError(data.error || "Не удалось обновить пароль")
        return
      }
      toast.success("Пароль обновлён")
      router.push("/login")
    } catch {
      setError("Ошибка сети. Попробуйте позже.")
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
            <h1 className="text-2xl font-bold text-foreground">Company24</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI Business OS</p>
          </div>
        </div>

        <Card className="border">
          <CardContent className="pt-6 pb-6 space-y-5">
            {(!token || tokenInvalid) ? (
              <div className="text-center space-y-4 py-2">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {tokenInvalid ? "Ссылка недействительна или истекла" : "Невалидная ссылка"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Запросите новую ссылку на восстановление пароля.
                  </p>
                </div>
                <Link href="/forgot-password" className="inline-flex items-center justify-center gap-1.5 text-sm text-primary hover:underline">
                  Запросить новую ссылку <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Новый пароль</h2>
                  <p className="text-sm text-muted-foreground">Минимум 8 символов, хотя бы 1 буква и 1 цифра</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">Новый пароль</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError("") }}
                        autoFocus
                        autoComplete="new-password"
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

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Повторите пароль</Label>
                    <Input
                      id="confirm-password"
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setError("") }}
                      autoComplete="new-password"
                      className={error ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive flex items-center gap-1.5">
                      <span>⚠️</span> {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                    {loading
                      ? <span className="flex items-center gap-2"><Spinner /> Сохраняем...</span>
                      : <span>Установить пароль</span>
                    }
                  </Button>
                </form>
              </>
            )}

            <div className="text-center">
              <Link href="/login" className="text-sm text-primary hover:underline flex items-center justify-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Вернуться ко входу
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">© 2026 Company24. Все права защищены.</p>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
