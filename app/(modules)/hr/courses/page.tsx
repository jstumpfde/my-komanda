"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, Plus, Clock, Users, Award, Filter, ChevronRight, Layers, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

interface Course {
  id: string
  title: string
  description: string | null
  category: string
  difficulty: string
  durationMin: number | null
  isPublished: boolean
  isRequired: boolean
  lessonsCount: number
  createdAt: string
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "Продукт",
  sales: "Продажи",
  soft_skills: "Soft skills",
  compliance: "Compliance",
  custom: "Разное",
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Начальный",
  intermediate: "Средний",
  advanced: "Продвинутый",
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  advanced: "bg-red-100 text-red-700",
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [difficultyFilter, setDifficultyFilter] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", category: "custom", difficulty: "beginner" })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch("/api/modules/hr/courses")
      .then(r => r.json())
      .then(setCourses)
      .finally(() => setLoading(false))
  }, [])

  const filtered = courses.filter(c => {
    if (categoryFilter !== "all" && c.category !== categoryFilter) return false
    if (difficultyFilter !== "all" && c.difficulty !== difficultyFilter) return false
    return true
  })

  async function handleCreate() {
    if (!form.title.trim()) return
    setCreating(true)
    const res = await fetch("/api/modules/hr/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const course = await res.json()
      setCourses(prev => [course, ...prev])
      setCreateOpen(false)
      setForm({ title: "", description: "", category: "custom", difficulty: "beginner" })
    }
    setCreating(false)
  }

  if (loading) return (
    <SidebarProvider><DashboardSidebar /><SidebarInset><DashboardHeader />
    <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>
    </SidebarInset></SidebarProvider>
  )

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Курсы обучения</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{courses.length} курсов в базе</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/api/dev/seed-courses">Загрузить демо</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/hr/courses/ai-generate">
              <Sparkles className="size-4 mr-1" />
              AI-генерация
            </Link>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" />
            Создать курс
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Уровень" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все уровни</SelectItem>
            {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Courses grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Курсов нет</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Создайте первый курс или загрузите демо-данные</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(course => (
            <Card key={course.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm leading-snug truncate">{course.title}</h3>
                    {course.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{course.description}</p>
                    )}
                  </div>
                  {course.isRequired && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">Обязательный</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", DIFFICULTY_COLORS[course.difficulty])}>
                    {DIFFICULTY_LABELS[course.difficulty]}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {CATEGORY_LABELS[course.category] ?? course.category}
                  </span>
                  {!course.isPublished && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">Черновик</span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Layers className="size-3" />
                    {course.lessonsCount} урок{course.lessonsCount === 1 ? "" : course.lessonsCount < 5 ? "а" : "ов"}
                  </span>
                  {course.durationMin && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {course.durationMin} мин
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" asChild>
                    <Link href={`/hr/courses/${course.id}/edit`}>Редактировать</Link>
                  </Button>
                  <Button size="sm" className="flex-1 h-7 text-xs" asChild>
                    <Link href={`/hr/courses/${course.id}/learn`}>
                      Пройти
                      <ChevronRight className="size-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый курс</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Название *</Label>
              <Input
                placeholder="Название курса"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Описание</Label>
              <Textarea
                placeholder="Краткое описание курса"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Категория</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Уровень</Label>
                <Select value={form.difficulty} onValueChange={v => setForm(f => ({ ...f, difficulty: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={creating || !form.title.trim()}>
              {creating ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
    </SidebarInset>
    </SidebarProvider>
  )
}
