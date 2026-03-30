"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"

// ─── Шаги визарда ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Должность" },
  { id: 2, label: "Условия" },
  { id: 3, label: "Описание" },
  { id: 4, label: "Требования" },
  { id: 5, label: "Публикация" },
]

interface FormData {
  title: string
  category: string
  city: string
  format: string
  employment: string
  salaryMin: string
  salaryMax: string
  description: string
  requirements: string
  status: string
}

const EMPTY: FormData = {
  title: "", category: "", city: "", format: "", employment: "",
  salaryMin: "", salaryMax: "", description: "", requirements: "", status: "draft",
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function CreateVacancyPageV2() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const set = (field: keyof FormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const canNext = () => {
    if (step === 1) return form.title.trim().length > 0
    return true
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError("")
    try {
      const descriptionJson = form.description || form.requirements
        ? {
            blocks: [
              form.description ? { type: "text", content: form.description } : null,
              form.requirements ? { type: "text", content: `**Требования:**\n${form.requirements}` } : null,
            ].filter(Boolean),
          }
        : null

      const res = await fetch("/api/modules/hr/vacancies-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category || null,
          city: form.city || null,
          format: form.format || null,
          employment: form.employment || null,
          salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
          salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
          descriptionJson,
          status: form.status,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? "Ошибка сохранения")
        return
      }
      const vacancy = await res.json()
      router.push(`/hr/vacancies/${vacancy.id}`)
    } catch {
      setError("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col items-center min-h-[calc(100vh-56px)] bg-muted/30 p-6">
          <div className="w-full max-w-2xl">
            {/* Заголовок */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold">Новая вакансия</h1>
              <p className="text-muted-foreground text-sm mt-1">Шаг {step} из {STEPS.length}</p>
            </div>

            {/* Прогресс */}
            <div className="flex items-center gap-2 mb-8">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => s.id < step && setStep(s.id)}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 transition-colors",
                      s.id < step && "bg-primary text-primary-foreground cursor-pointer",
                      s.id === step && "bg-primary text-primary-foreground",
                      s.id > step && "bg-muted text-muted-foreground",
                    )}
                  >
                    {s.id < step ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                  </button>
                  <span className={cn(
                    "text-xs truncate",
                    s.id <= step ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className={cn("h-px flex-1 mx-1", s.id < step ? "bg-primary" : "bg-border")} />
                  )}
                </div>
              ))}
            </div>

            {/* Шаг 1: Должность */}
            {step === 1 && (
              <div className="space-y-4 bg-card border rounded-xl p-6">
                <h2 className="font-semibold text-lg">Должность</h2>
                <div className="space-y-2">
                  <Label htmlFor="title">Название должности *</Label>
                  <Input
                    id="title"
                    placeholder="Например: Менеджер по продажам"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Категория</Label>
                  <Select value={form.category} onValueChange={(v) => set("category", v)}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Выберите категорию" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Продажи</SelectItem>
                      <SelectItem value="it">IT / Разработка</SelectItem>
                      <SelectItem value="hr">HR / Персонал</SelectItem>
                      <SelectItem value="marketing">Маркетинг</SelectItem>
                      <SelectItem value="finance">Финансы</SelectItem>
                      <SelectItem value="operations">Операции / Логистика</SelectItem>
                      <SelectItem value="management">Управление</SelectItem>
                      <SelectItem value="other">Другое</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Шаг 2: Условия */}
            {step === 2 && (
              <div className="space-y-4 bg-card border rounded-xl p-6">
                <h2 className="font-semibold text-lg">Условия работы</h2>
                <div className="space-y-2">
                  <Label htmlFor="city">Город</Label>
                  <Input
                    id="city"
                    placeholder="Москва"
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Формат работы</Label>
                    <Select value={form.format} onValueChange={(v) => set("format", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="office">Офис</SelectItem>
                        <SelectItem value="hybrid">Гибрид</SelectItem>
                        <SelectItem value="remote">Удалённо</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Занятость</Label>
                    <Select value={form.employment} onValueChange={(v) => set("employment", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Полная</SelectItem>
                        <SelectItem value="part">Частичная</SelectItem>
                        <SelectItem value="project">Проектная</SelectItem>
                        <SelectItem value="internship">Стажировка</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="salaryMin">Зарплата от (₽)</Label>
                    <Input
                      id="salaryMin"
                      type="number"
                      placeholder="50000"
                      value={form.salaryMin}
                      onChange={(e) => set("salaryMin", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salaryMax">Зарплата до (₽)</Label>
                    <Input
                      id="salaryMax"
                      type="number"
                      placeholder="100000"
                      value={form.salaryMax}
                      onChange={(e) => set("salaryMax", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Шаг 3: Описание */}
            {step === 3 && (
              <div className="space-y-4 bg-card border rounded-xl p-6">
                <h2 className="font-semibold text-lg">Описание вакансии</h2>
                <div className="space-y-2">
                  <Label htmlFor="description">Чем предстоит заниматься</Label>
                  <Textarea
                    id="description"
                    placeholder="Опишите задачи, обязанности, проект..."
                    rows={8}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Шаг 4: Требования */}
            {step === 4 && (
              <div className="space-y-4 bg-card border rounded-xl p-6">
                <h2 className="font-semibold text-lg">Требования к кандидату</h2>
                <div className="space-y-2">
                  <Label htmlFor="requirements">Навыки и опыт</Label>
                  <Textarea
                    id="requirements"
                    placeholder="— Опыт работы от 2 лет&#10;— Знание Excel&#10;— Коммуникабельность"
                    rows={8}
                    value={form.requirements}
                    onChange={(e) => set("requirements", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Шаг 5: Публикация */}
            {step === 5 && (
              <div className="space-y-4 bg-card border rounded-xl p-6">
                <h2 className="font-semibold text-lg">Публикация</h2>
                <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                  <p className="font-medium">{form.title}</p>
                  {form.city && <p className="text-sm text-muted-foreground">{form.city}{form.format ? ` · ${form.format}` : ""}</p>}
                  {(form.salaryMin || form.salaryMax) && (
                    <p className="text-sm text-muted-foreground">
                      {form.salaryMin ? `от ${parseInt(form.salaryMin).toLocaleString("ru")} ₽` : ""}
                      {form.salaryMax ? ` до ${parseInt(form.salaryMax).toLocaleString("ru")} ₽` : ""}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Статус после создания</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Черновик (сохранить, не публиковать)</SelectItem>
                      <SelectItem value="published">Опубликовать сразу</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
            )}

            {/* Навигация */}
            <div className="flex justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => step > 1 ? setStep(step - 1) : router.push("/hr/vacancies")}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {step === 1 ? "Отмена" : "Назад"}
              </Button>

              {step < STEPS.length ? (
                <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                  Далее
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Создать вакансию
                </Button>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
