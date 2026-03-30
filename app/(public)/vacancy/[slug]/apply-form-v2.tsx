"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Loader2 } from "lucide-react"

interface Props {
  slug: string
  vacancyTitle: string
}

export function ApplyFormV2({ slug, vacancyTitle }: Props) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "" })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const set = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError("Укажите имя"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/public/apply-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? "Ошибка при отправке")
        return
      }
      setDone(true)
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
        <h3 className="font-semibold text-lg">Отклик отправлен!</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          Мы получили ваш отклик на вакансию «{vacancyTitle}» и свяжемся с вами в ближайшее время.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Имя и фамилия *</Label>
        <Input
          id="name"
          placeholder="Иван Иванов"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="ivan@example.com"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Телефон</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+7 (999) 123-45-67"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="city">Город</Label>
        <Input
          id="city"
          placeholder="Москва"
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Откликнуться
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Нажимая «Откликнуться», вы соглашаетесь с обработкой персональных данных.
      </p>
    </form>
  )
}
