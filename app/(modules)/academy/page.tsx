"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { GraduationCap, Clock, ChevronRight, BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

// «Академия продукта» — внутреннее обучение сотрудников Company24 (владельца
// платформы). Доступ ограничен requireAcademyAccess на API (владелец-полигон),
// пункт меню виден только isOwner (components/dashboard/sidebar.tsx).
// Движок — те же таблицы courses/lessons, что и app/(modules)/hr/courses
// (клиентская HR-фича), но отдельные роуты /api/modules/academy/* с owner-гейтом.

interface Course {
  id: string
  title: string
  description: string | null
  category: string
  difficulty: string
  durationMin: number | null
  isPublished: boolean
  isRequired: boolean
  passingScorePercent: number | null
  lessonsCount: number
  createdAt: string
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "Продукт", sales: "Продажи", soft_skills: "Soft skills",
  compliance: "Compliance", custom: "Разное",
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый",
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-yellow-100 text-yellow-700",
  advanced: "bg-red-100 text-red-700",
}

export default function AcademyPage() {
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    fetch("/api/modules/academy/courses")
      .then(async (r) => {
        if (r.status === 403 || r.status === 401) { setForbidden(true); return [] }
        return r.json()
      })
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <SidebarProvider><DashboardSidebar /><SidebarInset><DashboardHeader />
      <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>
    </SidebarInset></SidebarProvider>
  )

  if (forbidden) return (
    <SidebarProvider><DashboardSidebar /><SidebarInset><DashboardHeader />
      <div className="p-6 text-sm text-muted-foreground">Раздел недоступен.</div>
    </SidebarInset></SidebarProvider>
  )

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="pt-6 pb-6 px-4 sm:px-14 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Академия продукта</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Внутреннее обучение по HR-платформе Company24 — только для сотрудников компании-владельца
              </p>
            </div>

            {courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BookOpen className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Курсов пока нет</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Запустите scripts/seed-product-academy.ts</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses.map((course) => (
                  <Card
                    key={course.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => router.push(`/academy/${course.id}/learn`)}
                  >
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm leading-snug">{course.title}</h3>
                        <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      {course.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", DIFFICULTY_COLORS[course.difficulty])}>
                          {DIFFICULTY_LABELS[course.difficulty] ?? course.difficulty}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {CATEGORY_LABELS[course.category] ?? course.category}
                        </Badge>
                        {course.passingScorePercent != null && (
                          <Badge variant="outline" className="text-[10px]">
                            Порог сдачи {course.passingScorePercent}%
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                        <span className="flex items-center gap-1"><BookOpen className="size-3.5" />{course.lessonsCount} уроков</span>
                        {course.durationMin && (
                          <span className="flex items-center gap-1"><Clock className="size-3.5" />{course.durationMin} мин</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
