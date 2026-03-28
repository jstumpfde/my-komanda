"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Plus, Trash2, GripVertical, BookOpen, Video, HelpCircle, ClipboardList,
  Save, Eye, EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface Lesson {
  id: string
  title: string
  type: string
  durationMin: number | null
  isRequired: boolean
  sortOrder: number
}

interface CourseDetail {
  id: string
  title: string
  description: string | null
  category: string
  difficulty: string
  durationMin: number | null
  isPublished: boolean
  isRequired: boolean
  lessons: Lesson[]
}

const LESSON_TYPE_LABELS: Record<string, string> = {
  content: "Текст",
  video: "Видео",
  quiz: "Тест",
  assignment: "Задание",
}

const LESSON_TYPE_ICONS: Record<string, React.ElementType> = {
  content: BookOpen,
  video: Video,
  quiz: HelpCircle,
  assignment: ClipboardList,
}

export default function CourseEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addingLesson, setAddingLesson] = useState(false)
  const [newLessonTitle, setNewLessonTitle] = useState("")
  const [newLessonType, setNewLessonType] = useState("content")

  useEffect(() => {
    fetch(`/api/modules/hr/courses/${id}`)
      .then(r => r.json())
      .then(setCourse)
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    if (!course) return
    setSaving(true)
    await fetch(`/api/modules/hr/courses/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: course.title,
        description: course.description,
        category: course.category,
        difficulty: course.difficulty,
        durationMin: course.durationMin,
        isPublished: course.isPublished,
        isRequired: course.isRequired,
      }),
    })
    setSaving(false)
  }

  async function handleAddLesson() {
    if (!newLessonTitle.trim()) return
    setAddingLesson(false)
    const res = await fetch(`/api/modules/hr/courses/${id}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newLessonTitle, type: newLessonType }),
    })
    if (res.ok) {
      const lesson = await res.json()
      setCourse(prev => prev ? { ...prev, lessons: [...prev.lessons, lesson] } : prev)
      setNewLessonTitle("")
      setNewLessonType("content")
    }
  }

  async function handleDeleteLesson(lessonId: string) {
    await fetch(`/api/modules/hr/lessons/${lessonId}`, { method: "DELETE" })
    setCourse(prev => prev ? { ...prev, lessons: prev.lessons.filter(l => l.id !== lessonId) } : prev)
  }

  if (loading || !course) return (
    <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>
  )

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push("/hr/courses")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Редактор курса</h1>
            <p className="text-xs text-muted-foreground">{course.lessons.length} уроков</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/hr/courses/${id}/learn`)}>
            <Eye className="size-4 mr-1" />
            Просмотр
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="size-4 mr-1" />
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>

      {/* Course info */}
      <div className="border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium">Основная информация</h2>

        <div className="space-y-1.5">
          <Label className="text-sm">Название</Label>
          <Input value={course.title} onChange={e => setCourse(c => c ? { ...c, title: e.target.value } : c)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Описание</Label>
          <Textarea
            rows={3}
            value={course.description || ""}
            onChange={e => setCourse(c => c ? { ...c, description: e.target.value } : c)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Категория</Label>
            <Select value={course.category} onValueChange={v => setCourse(c => c ? { ...c, category: v } : c)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["product", "sales", "soft_skills", "compliance", "custom"].map(k => (
                  <SelectItem key={k} value={k}>{k === "product" ? "Продукт" : k === "sales" ? "Продажи" : k === "soft_skills" ? "Soft skills" : k === "compliance" ? "Compliance" : "Разное"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Уровень</Label>
            <Select value={course.difficulty} onValueChange={v => setCourse(c => c ? { ...c, difficulty: v } : c)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Начальный</SelectItem>
                <SelectItem value="intermediate">Средний</SelectItem>
                <SelectItem value="advanced">Продвинутый</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Длительность (мин)</Label>
            <Input
              type="number"
              value={course.durationMin || ""}
              onChange={e => setCourse(c => c ? { ...c, durationMin: parseInt(e.target.value) || null } : c)}
            />
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={course.isPublished}
              onCheckedChange={v => setCourse(c => c ? { ...c, isPublished: v } : c)}
            />
            <Label className="text-sm">Опубликован</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={course.isRequired}
              onCheckedChange={v => setCourse(c => c ? { ...c, isRequired: v } : c)}
            />
            <Label className="text-sm">Обязательный</Label>
          </div>
        </div>
      </div>

      {/* Lessons */}
      <div className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Уроки</h2>
          <Button variant="outline" size="sm" onClick={() => setAddingLesson(true)}>
            <Plus className="size-4 mr-1" />
            Добавить урок
          </Button>
        </div>

        {course.lessons.length === 0 && !addingLesson && (
          <p className="text-sm text-muted-foreground text-center py-4">Уроков пока нет</p>
        )}

        <div className="space-y-2">
          {course.lessons.map((lesson, idx) => {
            const Icon = LESSON_TYPE_ICONS[lesson.type] ?? BookOpen
            return (
              <div key={lesson.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20 group">
                <GripVertical className="size-4 text-muted-foreground/30 shrink-0" />
                <div className="flex items-center justify-center size-7 rounded bg-primary/10 shrink-0">
                  <Icon className="size-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{lesson.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {LESSON_TYPE_LABELS[lesson.type]}
                    {lesson.durationMin ? ` · ${lesson.durationMin} мин` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground/50">{idx + 1}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteLesson(lesson.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>

        {addingLesson && (
          <div className="border rounded-lg p-3 bg-muted/10 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Название урока"
                value={newLessonTitle}
                onChange={e => setNewLessonTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddLesson()}
                autoFocus
                className="flex-1"
              />
              <Select value={newLessonType} onValueChange={setNewLessonType}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LESSON_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddLesson} disabled={!newLessonTitle.trim()}>Добавить</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingLesson(false); setNewLessonTitle("") }}>Отмена</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
