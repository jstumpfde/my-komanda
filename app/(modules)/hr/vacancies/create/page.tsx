"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createVacancyApi } from "@/lib/vacancy-storage"

const FORMATS = [
  { value: "office", label: "Офис" },
  { value: "remote", label: "Удалёнка" },
  { value: "hybrid", label: "Гибрид" },
] as const

export default function CreateVacancyPage() {
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [city, setCity] = useState("")
  const [format, setFormat] = useState<string>("office")
  const [salaryMin, setSalaryMin] = useState("")
  const [salaryMax, setSalaryMax] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = title.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)

    try {
      const result = await createVacancyApi({
        title: title.trim(),
        description: description.trim() || undefined,
        city: city.trim() || undefined,
        format,
        salary_min: salaryMin ? parseInt(salaryMin.replace(/\s/g, ""), 10) : undefined,
        salary_max: salaryMax ? parseInt(salaryMax.replace(/\s/g, ""), 10) : undefined,
      }) as { data?: { id: string }; id?: string }

      const id = result.data?.id ?? result.id
      toast.success("Вакансия создана")
      router.push(id ? `/hr/vacancies/${id}` : "/hr/vacancies")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка"
      toast.error(`Не удалось создать вакансию: ${msg}`)
      setSubmitting(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="max-w-xl mx-auto p-4 sm:p-6">

            <div className="mb-6">
              <h1 className="text-xl font-bold text-foreground">Новая вакансия</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Заполните основное — остальное можно дополнить позже
              </p>
            </div>

            <div className="space-y-5">
              {/* Название должности */}
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Название должности <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Менеджер по продажам"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Город */}
              <div className="space-y-1.5">
                <Label htmlFor="city">Город</Label>
                <Input
                  id="city"
                  placeholder="Москва"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>

              {/* Формат работы */}
              <div className="space-y-1.5">
                <Label>Формат работы</Label>
                <div className="flex gap-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFormat(f.value)}
                      className={cn(
                        "flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors",
                        format === f.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Зарплата */}
              <div className="space-y-1.5">
                <Label>Зарплата</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      inputMode="numeric"
                      placeholder="от"
                      value={salaryMin}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "")
                        setSalaryMin(raw ? parseInt(raw, 10).toLocaleString("ru-RU") : "")
                      }}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">₽</span>
                  </div>
                  <span className="text-muted-foreground text-sm shrink-0">—</span>
                  <div className="relative flex-1">
                    <Input
                      inputMode="numeric"
                      placeholder="до"
                      value={salaryMax}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "")
                        setSalaryMax(raw ? parseInt(raw, 10).toLocaleString("ru-RU") : "")
                      }}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">₽</span>
                  </div>
                </div>
              </div>

              {/* Описание */}
              <div className="space-y-1.5">
                <Label htmlFor="description">Краткое описание</Label>
                <Textarea
                  id="description"
                  placeholder="Чем предстоит заниматься, что важно для вас в кандидате..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Кнопка создания */}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создаём...
                  </>
                ) : (
                  "Создать вакансию"
                )}
              </Button>

              {/* Ссылка на подробный визард */}
              <div className="text-center pt-1">
                <Link
                  href="/hr/vacancies/create/wizard"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Заполнить подробную анкету для AI-скоринга
                </Link>
              </div>
            </div>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
