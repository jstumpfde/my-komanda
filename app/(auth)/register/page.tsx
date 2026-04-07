"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Briefcase, Send, CheckCircle2, ArrowLeft } from "lucide-react"
import Link from "next/link"

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)

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
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!name.trim()) { setError("Введите имя"); return }
    if (!email.trim()) { setError("Введите email"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Некорректный email"); return }

    setLoading(true)
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone || null,
          companyName: companyName.trim() || null,
          comment: comment.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Ошибка отправки"); return }
      setSubmitted(true)
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.")
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
            <h1 className="text-2xl font-bold text-foreground">Company24</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI Business OS</p>
          </div>
        </div>

        <Card className="border">
          <CardContent className="pt-6 pb-6 space-y-5">
            {submitted ? (
              /* Success state */
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Заявка отправлена</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Мы свяжемся с вами в ближайшее время для подключения к платформе
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="outline" className="gap-2 mt-2">
                    <ArrowLeft className="w-4 h-4" />
                    Вернуться на страницу входа
                  </Button>
                </Link>
              </div>
            ) : (
              /* Form */
              <>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Заявка на подключение</h2>
                  <p className="text-sm text-muted-foreground">Оставьте заявку — мы подключим вашу компанию вручную</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="req-name">Имя *</Label>
                    <Input
                      id="req-name"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setError("") }}
                      placeholder="Иван Иванов"
                      autoFocus
                      autoComplete="name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="req-email">Email *</Label>
                    <Input
                      id="req-email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError("") }}
                      placeholder="you@company.ru"
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="req-phone">Телефон</Label>
                    <Input
                      id="req-phone"
                      type="tel"
                      value={formatPhone(phone)}
                      onChange={handlePhoneChange}
                      placeholder="+7 (___) ___-__-__"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="req-company">Компания</Label>
                    <Input
                      id="req-company"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="ООО Компания"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="req-comment">Комментарий</Label>
                    <Textarea
                      id="req-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Расскажите о вашей компании или задаче..."
                      rows={3}
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive flex items-center gap-1.5">
                      <span>&#9888;&#65039;</span> {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2"><Spinner /> Отправляем...</span>
                    ) : (
                      <span className="flex items-center gap-2"><Send className="w-4 h-4" /> Отправить заявку</span>
                    )}
                  </Button>
                </form>

                <p className="text-center text-sm text-muted-foreground">
                  Уже есть аккаунт?{" "}
                  <Link href="/login" className="text-primary hover:underline font-medium">Войти</Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">&copy; 2026 Company24. Все права защищены.</p>
      </div>
    </div>
  )
}
