"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { useVacancy } from "@/hooks/use-vacancies"

const FORMATS = [
  { value: "office", label: "Офис" },
  { value: "remote", label: "Удалёнка" },
  { value: "hybrid", label: "Гибрид" },
] as const

const STATUSES = [
  { value: "draft", label: "Черновик" },
  { value: "active", label: "Активна" },
  { value: "published", label: "Опубликована" },
  { value: "paused", label: "Приостановлена" },
  { value: "closed", label: "Закрыта" },
] as const

export default function EditVacancyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { vacancy, loading } = useVacancy(id)

  const [title, setTitle] = useState("")
  const [city, setCity] = useState("")
  const [format, setFormat] = useState("office")
  const [status, setStatus] = useState("draft")
  const [salaryMin, setSalaryMin] = useState("")
  const [salaryMax, setSalaryMax] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!vacancy) return
    setTitle(vacancy.title)
    setCity(vacancy.city ?? "")
    setFormat(vacancy.format ?? "office")
    setStatus(vacancy.status ?? "draft")
    setSalaryMin(vacancy.salaryMin ? vacancy.salaryMin.toLocaleString("ru-RU") : "")
    setSalaryMax(vacancy.salaryMax ? vacancy.salaryMax.toLocaleString("ru-RU") : "")
    setDescription((vacancy as unknown as { description?: string }).description ?? "")
  }, [vacancy])

  const handleSave = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          city: city.trim() || null,
          format,
          status,
          salary_min: salaryMin ? parseInt(salaryMin.replace(/\s/g, ""), 10) : null,
          salary_max: salaryMax ? parseInt(salaryMax.replace(/\s/g, ""), 10) : null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("Вакансия сохранена")
      router.push(`/hr/vacancies/${id}`)
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const fmtChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "")
    return digits ? parseInt(digits, 10).toLocaleString("ru-RU") : ""
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6">
            {/* Back link */}
            <Link href={`/hr/vacancies/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft className="size-4" />Назад к вакансии
            </Link>

            <h1 className="text-xl font-semibold text-foreground mb-6">Редактирование вакансии</h1>

            {loading ? (
              <div className="space-y-4 max-w-xl">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="max-w-xl space-y-5">
                {/* Название */}
                <div className="space-y-1.5">
                  <Label htmlFor="title">Название должности <span className="text-destructive">*</span></Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                    className="border border-gray-300 rounded-lg h-10" />
                </div>

                {/* Город */}
                <div className="space-y-1.5">
                  <Label htmlFor="city">Город</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)}
                    className="border border-gray-300 rounded-lg h-10" />
                </div>

                {/* Формат работы */}
                <div className="space-y-1.5">
                  <Label>Формат работы</Label>
                  <div className="flex gap-2">
                    {FORMATS.map((f) => (
                      <button key={f.value} type="button" onClick={() => setFormat(f.value)}
                        className={cn(
                          "flex-1 py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors",
                          format === f.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-gray-300 bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20"
                        )}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Статус */}
                <div className="space-y-1.5">
                  <Label>Статус</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="border border-gray-300 rounded-lg h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Зарплата */}
                <div className="space-y-1.5">
                  <Label>Зарплата</Label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input inputMode="numeric" placeholder="от" value={salaryMin}
                        onChange={(e) => setSalaryMin(fmtChange(e.target.value))}
                        className="pr-8 border border-gray-300 rounded-lg h-10" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">₽</span>
                    </div>
                    <span className="text-muted-foreground">—</span>
                    <div className="relative flex-1">
                      <Input inputMode="numeric" placeholder="до" value={salaryMax}
                        onChange={(e) => setSalaryMax(fmtChange(e.target.value))}
                        className="pr-8 border border-gray-300 rounded-lg h-10" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">₽</span>
                    </div>
                  </div>
                </div>

                {/* Описание */}
                <div className="space-y-1.5">
                  <Label htmlFor="desc">Описание</Label>
                  <Textarea id="desc" rows={4} value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="border border-gray-300 rounded-lg" />
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={handleSave} disabled={!title.trim() || saving}>
                    {saving ? <><Loader2 className="size-4 mr-2 animate-spin" />Сохраняем...</>
                      : <><Save className="size-4 mr-2" />Сохранить</>}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/hr/vacancies/${id}`}>Отмена</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
