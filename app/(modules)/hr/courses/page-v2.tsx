"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, BookOpen, Clock, GraduationCap } from "lucide-react"
import { cn } from "@/lib/utils"

interface Course {
  id: string
  title: string
  description: string | null
  category: string | null
  difficulty: string | null
  durationMin: number | null
  isPublished: boolean | null
  lessonsCount: number
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Начинающий", intermediate: "Средний", advanced: "Продвинутый",
}
const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-emerald-500/15 text-emerald-700",
  intermediate: "bg-amber-500/15 text-amber-700",
  advanced: "bg-red-500/15 text-red-700",
}
const CATEGORY_LABELS: Record<string, string> = {
  sales: "Продажи", product: "Продукт", soft_skills: "Soft skills",
  compliance: "Комплаенс", custom: "Прочее",
}

export default function CoursesPageV2() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)

  const load = () => {
    fetch("/api/modules/hr/courses-v2")
      .then((r) => r.json())
      .then((d) => { setCourses(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    const res = await fetch("/api/modules/hr/courses-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    })
    if (res.ok) {
      const course = await res.json()
      setOpen(false)
      setNewTitle("")
      window.location.href = `/hr/courses/${course.id}/edit`
    }
    setCreating(false)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Курсы</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{courses.length} курсов</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Создать курс</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Новый курс</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <Label>Название курса</Label>
                    <Input
                      placeholder="Введение в компанию"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                      autoFocus
                    />
                  </div>
                  <Button onClick={handleCreate} disabled={!newTitle.trim() || creating} className="w-full">
                    Создать и открыть конструктор
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <GraduationCap className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Курсов пока нет</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => (
                <div key={course.id} className="group rounded-xl border bg-card overflow-hidden hover:border-primary/50 hover:shadow-sm transition-all">
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
                        {course.title}
                      </h3>
                      <Badge
                        variant="secondary"
                        className={cn("shrink-0 text-xs", !course.isPublished && "opacity-50")}
                      >
                        {course.isPublished ? "Опубликован" : "Черновик"}
                      </Badge>
                    </div>

                    {course.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {course.difficulty && (
                        <Badge variant="secondary" className={cn("text-xs", DIFFICULTY_COLORS[course.difficulty] ?? "")}>
                          {DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty}
                        </Badge>
                      )}
                      {course.category && course.category !== "custom" && (
                        <span className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[course.category] ?? course.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        {course.lessonsCount} уроков
                      </span>
                      {course.durationMin && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {course.durationMin} мин
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex border-t">
                    <Link
                      href={`/hr/courses/${course.id}/edit`}
                      className="flex-1 px-4 py-2 text-xs text-center text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                    >
                      Редактировать
                    </Link>
                    <div className="w-px bg-border" />
                    <Link
                      href={`/hr/courses/${course.id}/learn`}
                      className="flex-1 px-4 py-2 text-xs text-center text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                    >
                      Пройти
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
