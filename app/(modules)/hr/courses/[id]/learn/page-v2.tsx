"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { DashboardSidebarV2 } from "@/components/dashboard/sidebar-v2"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, CheckCircle2, ChevronRight, Award, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Lesson { id: string; title: string; type: string; content: unknown }
interface Certificate { number: string; issuedAt: string }
interface Course { id: string; title: string; lessons: Lesson[] }

const LESSON_TYPE_LABELS: Record<string, string> = {
  content: "Контент", video: "Видео", quiz: "Тест", assignment: "Задание",
}

export default function CourseLearnPageV2() {
  const { id } = useParams<{ id: string }>()
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [enrolling, setEnrolling] = useState(false)
  const [enrolled, setEnrolled] = useState(false)
  const [certificate, setCertificate] = useState<Certificate | null>(null)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    fetch(`/api/modules/hr/courses-v2/${id}`)
      .then((r) => r.json())
      .then((d) => { setCourse(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  const handleEnroll = async () => {
    setEnrolling(true)
    await fetch(`/api/modules/hr/courses-v2/${id}/enroll`, { method: "POST" })
    setEnrolled(true)
    setEnrolling(false)
  }

  const handleCompleteLesson = async () => {
    if (!course) return
    const lesson = course.lessons[currentIdx]
    setCompleting(true)

    const res = await fetch(`/api/modules/hr/courses-v2/${id}/complete-lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId: lesson.id }),
    })

    if (res.ok) {
      const data = await res.json()
      setCompleted((prev) => new Set([...prev, lesson.id]))
      if (data.certificate) setCertificate(data.certificate)
      if (currentIdx < course.lessons.length - 1) {
        setCurrentIdx(currentIdx + 1)
      }
    }
    setCompleting(false)
  }

  if (loading || !course) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebarV2 /><SidebarInset><DashboardHeader />
        <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const lesson = course.lessons[currentIdx]
  const allCompleted = course.lessons.every((l) => completed.has(l.id))

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebarV2 />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex h-[calc(100vh-56px)]">
          {/* Боковая панель уроков */}
          <div className="w-72 border-r bg-muted/30 flex flex-col">
            <div className="p-4 border-b">
              <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
                <Link href="/hr/courses"><ArrowLeft className="w-4 h-4 mr-1" />Курсы</Link>
              </Button>
              <h2 className="font-semibold text-sm line-clamp-2">{course.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {completed.size}/{course.lessons.length} уроков
              </p>
              <div className="h-1 bg-muted rounded-full mt-2">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${course.lessons.length > 0 ? Math.round((completed.size / course.lessons.length) * 100) : 0}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {course.lessons.map((l, i) => (
                <button
                  key={l.id}
                  onClick={() => setCurrentIdx(i)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex items-center gap-2 text-sm transition-colors",
                    i === currentIdx ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                    completed.has(l.id) && "text-muted-foreground",
                  )}
                >
                  {completed.has(l.id) ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border-2 border-current shrink-0 flex items-center justify-center text-xs">
                      {i + 1}
                    </span>
                  )}
                  <span className="truncate">{l.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Основной контент */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            {certificate && (
              <div className="m-6 rounded-xl border bg-emerald-500/5 border-emerald-500/20 p-5 flex items-center gap-4">
                <Award className="w-10 h-10 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Поздравляем! Курс пройден</p>
                  <p className="text-sm text-muted-foreground">Сертификат: {certificate.number}</p>
                </div>
              </div>
            )}

            {!enrolled && !allCompleted && (
              <div className="m-6 rounded-xl border bg-card p-5 flex items-center justify-between">
                <div>
                  <p className="font-medium">Запишитесь, чтобы отслеживать прогресс</p>
                  <p className="text-sm text-muted-foreground">Результаты будут сохранены</p>
                </div>
                <Button onClick={handleEnroll} disabled={enrolling}>
                  {enrolling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Записаться
                </Button>
              </div>
            )}

            {lesson ? (
              <div className="flex-1 p-6 space-y-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{LESSON_TYPE_LABELS[lesson.type] ?? lesson.type}</p>
                  <h1 className="text-xl font-semibold">{lesson.title}</h1>
                </div>

                <div className="rounded-xl border bg-card p-5 min-h-[200px]">
                  {lesson.type === "content" && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {(lesson.content as { text?: string } | null)?.text ?? "Содержимое урока ещё не добавлено."}
                    </p>
                  )}
                  {lesson.type === "video" && (
                    <p className="text-sm text-muted-foreground">
                      {(lesson.content as { url?: string } | null)?.url
                        ? "Видео-урок"
                        : "Видео ещё не добавлено."}
                    </p>
                  )}
                  {(lesson.type === "quiz" || lesson.type === "assignment") && (
                    <p className="text-sm text-muted-foreground">
                      Задание для этого урока откроется в ближайшее время.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
                    disabled={currentIdx === 0}
                  >
                    Назад
                  </Button>
                  <Button
                    onClick={handleCompleteLesson}
                    disabled={completing || (!enrolled && !allCompleted)}
                  >
                    {completing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {completed.has(lesson.id) ? "Следующий" : "Отметить выполненным"}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground">Уроков пока нет</p>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
