"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Briefcase, ArrowLeft, Mail, CheckCircle2 } from "lucide-react"
import Link from "next/link"

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email.trim()) { setError("Введите email"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Некорректный формат email"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      // Бэкенд намеренно отвечает одинаково независимо от существования email,
      // поэтому показываем успех в любом случае.
      if (!res.ok && res.status !== 200) {
        setError("Ошибка отправки. Попробуйте позже.")
        return
      }
      setSent(true)
    } catch {
      setError("Ошибка отправки. Попробуйте позже.")
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
            {!sent ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Восстановление пароля</h2>
                  <p className="text-sm text-muted-foreground">Введите email — пришлём ссылку для сброса</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError("") }}
                      placeholder="you@company.ru"
                      autoFocus
                      autoComplete="email"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive flex items-center gap-1.5">
                      <span>⚠️</span> {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                    {loading
                      ? <span className="flex items-center gap-2"><Spinner /> Отправляем...</span>
                      : <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> Отправить ссылку</span>
                    }
                  </Button>
                </form>
              </>
            ) : (
              <div className="text-center space-y-4 py-2">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Если такой email зарегистрирован, мы отправили письмо</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Проверьте почту <span className="font-medium text-foreground">{email}</span>, в том числе папку «Спам».
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Ссылка в письме действует 1 час.</p>
              </div>
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
