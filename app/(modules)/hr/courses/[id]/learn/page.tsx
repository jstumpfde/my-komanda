"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, CheckCircle2, Circle, BookOpen, Video, HelpCircle, ClipboardList,
  ChevronRight, Trophy, Clock, Award,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Lesson {
  id: string
  title: string
  type: string
  durationMin: number | null
  isRequired: boolean
  sortOrder: number
  content: Record<string, unknown> | null
}

interface CourseDetail {
  id: string
  title: string
  description: string | null
  durationMin: number | null
  isRequired: boolean
  lessons: Lesson[]
}

interface Certificate {
  id: string
  number: string
  issuedAt: string
}

const LESSON_ICONS: Record<string, React.ElementType> = {
  content: BookOpen,
  video: Video,
  quiz: HelpCircle,
  assignment: ClipboardList,
}

export default function CourseLearnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null)
  const [activeLessonIdx, setActiveLessonIdx] = useState(0)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const [completing, setCompleting] = useState(false)
  const [certificate, setCertificate] = useState<Certificate | null>(null)

  useEffect(() => {
    fetch(`/api/modules/hr/courses/${id}`)
      .then(r => r.json())
      .then(async (c) => {
        setCourse(c)
        // auto-enroll
        const r = await fetch(`/api/modules/hr/courses/${id}/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        const e = await r.json()
        setEnrollmentId(e.id || e.enrollmentId)
      })
      .finally(() => setLoading(false))
  }, [id])

  const pct = course ? Math.round((completedLessons.size / Math.max(course.lessons.length, 1)) * 100) : 0

  async function handleComplete() {
    if (!course || !enrollmentId) return
    const lesson = course.lessons[activeLessonIdx]
    if (!lesson || completedLessons.has(lesson.id)) {
      // move to next
      if (activeLessonIdx < course.lessons.length - 1) setActiveLessonIdx(i => i + 1)
      return
    }

    setCompleting(true)
    const res = await fetch(`/api/modules/hr/courses/${id}/complete-lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentId, lessonId: lesson.id }),
    })
    const data = await res.json()
    setCompletedLessons(prev => new Set([...prev, lesson.id]))
    if (data.certificate) setCertificate(data.certificate)
    if (activeLessonIdx < course.lessons.length - 1) setActiveLessonIdx(i => i + 1)
    setCompleting(false)
  }

  if (loading || !course) return (
    <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>
  )

  const activeLesson = course.lessons[activeLessonIdx]
  const isFinished = pct === 100 || certificate !== null

  if (isFinished && certificate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="mb-6 flex items-center justify-center size-20 rounded-full bg-yellow-50">
          <Trophy className="size-10 text-yellow-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Курс завершён!</h2>
        <p className="text-muted-foreground mb-6">Вы прошли курс «{course.title}» и получили сертификат.</p>
        <div className="border rounded-xl p-6 bg-card max-w-sm w-full space-y-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Award className="size-8 text-yellow-500" />
            <div className="text-left">
              <p className="font-semibold text-sm">{course.title}</p>
              <p className="text-xs text-muted-foreground">Сертификат № {certificate.number}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Выдан: {new Date(certificate.issuedAt).toLocaleDateString("ru-RU")}
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={() => router.push("/hr/courses")}>К каталогу</Button>
          <Button onClick={() => router.push("/hr/certificates")}>Мои сертификаты</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left panel — lessons list */}
      <div className="w-72 border-r flex flex-col shrink-0">
        <div className="p-4 border-b space-y-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 -ml-1 text-muted-foreground" onClick={() => router.push("/hr/courses")}>
            <ArrowLeft className="size-3.5 mr-1" />
            К каталогу
          </Button>
          <h2 className="font-semibold text-sm leading-snug line-clamp-2">{course.title}</h2>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedLessons.size} / {course.lessons.length} уроков</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {course.lessons.map((lesson, idx) => {
            const Icon = LESSON_ICONS[lesson.type] ?? BookOpen
            const done = completedLessons.has(lesson.id)
            const active = idx === activeLessonIdx
            return (
              <button
                key={lesson.id}
                onClick={() => setActiveLessonIdx(idx)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors",
                  active ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                )}
              >
                {done
                  ? <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                  : <Circle className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground/40")} />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{lesson.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {lesson.type === "content" ? "Текст" : lesson.type === "video" ? "Видео" : lesson.type === "quiz" ? "Тест" : "Задание"}
                    {lesson.durationMin ? ` · ${lesson.durationMin} мин` : ""}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          {activeLesson ? (
            <div className="max-w-2xl space-y-6">
              <div className="space-y-2">
                <Badge variant="secondary" className="text-xs">
                  {activeLessonIdx + 1} из {course.lessons.length}
                </Badge>
                <h1 className="text-2xl font-bold">{activeLesson.title}</h1>
                {activeLesson.durationMin && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-4" />
                    {activeLesson.durationMin} мин
                  </p>
                )}
              </div>

              {activeLesson.content && (
                <div className="prose prose-sm max-w-none">
                  {activeLesson.type === "content" || activeLesson.type === "video" ? (
                    <p className="text-muted-foreground leading-relaxed">
                      {(activeLesson.content as { text?: string }).text || "Материал урока"}
                    </p>
                  ) : activeLesson.type === "quiz" ? (
                    <QuizBlock content={activeLesson.content as { questions?: QuizQuestion[] }} />
                  ) : (
                    <p className="text-muted-foreground">Выполните задание и нажмите «Завершить».</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">Выберите урок</div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setActiveLessonIdx(i => Math.max(0, i - 1))}
            disabled={activeLessonIdx === 0}
          >
            Назад
          </Button>
          <Button onClick={handleComplete} disabled={completing}>
            {completing ? "Сохранение..." : completedLessons.has(activeLesson?.id ?? "") ? (
              <>Следующий <ChevronRight className="size-4 ml-1" /></>
            ) : (
              <>Завершить урок <CheckCircle2 className="size-4 ml-1" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface QuizQuestion {
  q: string
  options: string[]
  answer: number
}

function QuizBlock({ content }: { content: { questions?: QuizQuestion[] } }) {
  const questions = content.questions || []
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [checked, setChecked] = useState(false)

  if (questions.length === 0) return <p className="text-muted-foreground">Вопросы не заданы.</p>

  return (
    <div className="space-y-6">
      {questions.map((q, qi) => (
        <div key={qi} className="space-y-3">
          <p className="font-medium">{q.q}</p>
          <div className="space-y-2">
            {q.options.map((opt, oi) => {
              const isSelected = answers[qi] === oi
              const isCorrect = checked && oi === q.answer
              const isWrong = checked && isSelected && oi !== q.answer
              return (
                <button
                  key={oi}
                  onClick={() => !checked && setAnswers(a => ({ ...a, [qi]: oi }))}
                  className={cn(
                    "w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors",
                    isCorrect ? "border-green-500 bg-green-50 text-green-700" :
                    isWrong ? "border-red-400 bg-red-50 text-red-700" :
                    isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {!checked && (
        <Button variant="outline" onClick={() => setChecked(true)} disabled={Object.keys(answers).length < questions.length}>
          Проверить ответы
        </Button>
      )}
      {checked && (
        <p className="text-sm text-muted-foreground">
          Правильных ответов: {questions.filter((q, i) => answers[i] === q.answer).length} из {questions.length}
        </p>
      )}
    </div>
  )
}
