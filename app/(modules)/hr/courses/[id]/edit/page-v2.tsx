"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Plus, Trash2, GripVertical, Loader2, Eye } from "lucide-react"

interface Lesson { id: string; title: string; type: string; sortOrder: number | null }
interface Course {
  id: string; title: string; description: string | null
  isPublished: boolean | null; difficulty: string | null
  lessons: Lesson[]
}

const LESSON_TYPES: Record<string, string> = {
  content: "Контент", video: "Видео", quiz: "Тест", assignment: "Задание",
}

export default function CourseEditPageV2() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newLesson, setNewLesson] = useState({ title: "", type: "content" })
  const [addingLesson, setAddingLesson] = useState(false)

  const load = () => {
    fetch(`/api/modules/hr/courses-v2/${id}`)
      .then((r) => r.json())
      .then((d) => { setCourse(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const handleSave = async () => {
    if (!course) return
    setSaving(true)
    await fetch(`/api/modules/hr/courses-v2/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: course.title,
        description: course.description,
        isPublished: course.isPublished,
        difficulty: course.difficulty,
      }),
    })
    setSaving(false)
  }

  const handleAddLesson = async () => {
    if (!newLesson.title.trim()) return
    setAddingLesson(true)
    await fetch(`/api/modules/hr/courses-v2/${id}?action=addLesson`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLesson),
    })
    setNewLesson({ title: "", type: "content" })
    load()
    setAddingLesson(false)
  }

  const handleDelete = async () => {
    setSaving(true)
    await fetch(`/api/modules/hr/courses-v2/${id}`, { method: "DELETE" })
    router.push("/hr/courses")
  }

  if (loading || !course) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar /><SidebarInset><DashboardHeader />
        <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/hr/courses"><ArrowLeft className="w-4 h-4 mr-1" />Курсы</Link>
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Конструктор курса</h1>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/hr/courses/${id}/learn`}><Eye className="w-4 h-4 mr-1" />Предпросмотр</Link>
              </Button>
              <Button onClick={handleSave} size="sm" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Сохранить
              </Button>
            </div>
          </div>

          {/* Основные поля */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Название</label>
              <Input
                value={course.title}
                onChange={(e) => setCourse((c) => c ? { ...c, title: e.target.value } : c)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Описание</label>
              <Textarea
                value={course.description ?? ""}
                onChange={(e) => setCourse((c) => c ? { ...c, description: e.target.value } : c)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Уровень сложности</label>
                <Select
                  value={course.difficulty ?? "beginner"}
                  onValueChange={(v) => setCourse((c) => c ? { ...c, difficulty: v } : c)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Начинающий</SelectItem>
                    <SelectItem value="intermediate">Средний</SelectItem>
                    <SelectItem value="advanced">Продвинутый</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant={course.isPublished ? "outline" : "default"}
                  onClick={() => setCourse((c) => c ? { ...c, isPublished: !c.isPublished } : c)}
                  className="w-full"
                >
                  {course.isPublished ? "Снять с публикации" : "Опубликовать"}
                </Button>
              </div>
            </div>
          </div>

          {/* Уроки */}
          <div className="space-y-2">
            <h2 className="font-semibold">Уроки ({course.lessons.length})</h2>
            {course.lessons.length === 0 ? (
              <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
                Уроков пока нет
              </div>
            ) : (
              <div className="space-y-1.5">
                {course.lessons.map((lesson, i) => (
                  <div key={lesson.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
                    <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30" />
                    <span className="flex-1 text-sm">{lesson.title}</span>
                    <Badge variant="outline" className="text-xs">{LESSON_TYPES[lesson.type] ?? lesson.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Добавить урок */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-sm font-medium">Добавить урок</p>
            <div className="grid grid-cols-[1fr_130px] gap-2">
              <Input
                placeholder="Название урока..."
                value={newLesson.title}
                onChange={(e) => setNewLesson((s) => ({ ...s, title: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAddLesson()}
              />
              <Select value={newLesson.type} onValueChange={(v) => setNewLesson((s) => ({ ...s, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LESSON_TYPES).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddLesson} disabled={!newLesson.title.trim() || addingLesson} size="sm">
              {addingLesson ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Добавить
            </Button>
          </div>

          {/* Удалить курс */}
          <div className="pt-4 border-t">
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saving} className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4 mr-1" />
              Удалить курс
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
