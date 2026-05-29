"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { QuestionEditor } from "@/components/vacancies/anketa-tab"
import { type Question } from "@/lib/course-types"
import { toast } from "sonner"

type AnketaType = "candidate" | "client" | "post_demo"

const TYPE_OPTIONS: { value: AnketaType; label: string }[] = [
  { value: "candidate", label: "Кандидат" },
  { value: "client", label: "Заказчик" },
  { value: "post_demo", label: "После демо" },
]

function AnketaEditorInner() {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get("id")
  const isEdit = !!id

  const [name, setName] = useState("")
  const [type, setType] = useState<AnketaType>("candidate")
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [isSystem, setIsSystem] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/questionnaire-templates/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const row = d?.data ?? d
        if (row) {
          setName(row.name ?? "")
          setType((row.type as AnketaType) ?? "candidate")
          setQuestions(Array.isArray(row.questions) ? row.questions : [])
          setIsSystem(!!row.isSystem)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Введите название анкеты"); return }
    if (isSystem) { toast.error("Системный шаблон нельзя редактировать — создайте копию"); return }
    setSaving(true)
    try {
      const res = await fetch(
        isEdit ? `/api/questionnaire-templates/${id}` : "/api/questionnaire-templates",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), type, questions }),
        },
      )
      if (!res.ok) { toast.error("Не удалось сохранить анкету"); return }
      toast.success(isEdit ? "Анкета сохранена" : "Анкета создана")
      router.push("/hr/library?tab=questionnaires")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-background min-w-0">
      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
              <Link href="/hr/library?tab=questionnaires"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">
                {isEdit ? "Редактировать анкету" : "Новая анкета"}
              </h1>
              <p className="text-sm text-muted-foreground">Шаблон анкеты для библиотеки</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={handleSave} disabled={saving || loading || isSystem}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Загрузка...
          </div>
        ) : (
          <div className="space-y-6">
            {isSystem && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                Это системный шаблон — он доступен только для просмотра. Чтобы изменить, вернитесь и нажмите «Дублировать».
              </div>
            )}

            {/* Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="anketa-name">Название</Label>
                <Input
                  id="anketa-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Анкета кандидата — базовая"
                  disabled={isSystem}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={type} onValueChange={(v) => setType(v as AnketaType)} disabled={isSystem}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-2">
              <Label>Вопросы анкеты</Label>
              <p className="text-xs text-muted-foreground">
                Эти вопросы можно загрузить в анкету любой вакансии через «Загрузить из шаблона».
              </p>
              <QuestionEditor questions={questions} onChange={setQuestions} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AnketaEditorPage() {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <Suspense fallback={null}>
          <AnketaEditorInner />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  )
}
