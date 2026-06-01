"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ClipboardList, Sparkles, ChevronRight, CheckCircle2, XCircle,
  Loader2, FileQuestion, Check, X,
} from "lucide-react"

// ─── Типы ответа эндпоинта /api/modules/hr/candidates/[id]/test-submission ──

interface TestStructuredAnswer {
  blockId:    string
  questionId: string
  answerType: string
  value:      string
}

interface ObjectivePerQuestion {
  questionId: string
  answerType: string
  points:     number
  awarded:    number
  correct:    boolean
}

interface TestObjective {
  gradedCount?: number
  maxPoints?:   number
  gotPoints?:   number
  score?:       number
  perQuestion?: ObjectivePerQuestion[]
}

interface TestAnswersJson {
  answers?:   TestStructuredAnswer[]
  objective?: TestObjective | null
}

interface TestSubmissionRow {
  id:          string
  answerText:  string | null
  fileUrl:     string | null
  answersJson: TestAnswersJson | null
  aiScore:     number | null
  aiReasoning: string | null
  submittedAt: string | null
}

interface TestQuestionMeta {
  id:         string
  text:       string
  answerType: string
  points:     number | null
}

interface TestSubmissionData {
  submission: TestSubmissionRow | null
  checkMode:  "auto" | "assisted" | "manual"
  stage:      string | null
  questions:  TestQuestionMeta[]
}

// ─── Утилиты ────────────────────────────────────────────────────────────────

const ANSWER_TYPE_LABEL: Record<string, string> = {
  short: "Короткий ответ",
  long: "Развёрнутый ответ",
  text: "Текст",
  yesno: "Да/Нет",
  single: "Один вариант",
  multiple: "Несколько вариантов",
  sort: "Сортировка",
  video: "Видео",
}

// 70+ зелёный, 40–70 жёлтый, <40 красный (как в остальной платформе).
function scoreClasses(score: number): string {
  if (score >= 70) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
  if (score >= 40) return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
  return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
}

function formatAnswerValue(a: TestStructuredAnswer): string {
  if (a.answerType === "yesno") return a.value === "yes" ? "Да" : a.value === "no" ? "Нет" : a.value
  return a.value.split("|||").join(", ")
}

function formatSubmittedAt(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// Технический id (q-1778... ) HR не показываем — даём «Вопрос N».
const TECH_ID_RE = /^q-\d+(?:-[a-z0-9]+)*$/i

// ─── Компонент ────────────────────────────────────────────────────────────────

export function TestTab({ candidateId }: { candidateId?: string }) {
  const [data, setData] = useState<TestSubmissionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [reasoningExpanded, setReasoningExpanded] = useState(false)
  const [verdictBusy, setVerdictBusy] = useState(false)

  useEffect(() => {
    if (!candidateId) { setData(null); return }
    let cancelled = false
    setLoading(true)
    setReasoningExpanded(false)
    ;(async () => {
      try {
        const res = await fetch(`/api/modules/hr/candidates/${candidateId}/test-submission`)
        const json = res.ok ? await res.json() : null
        const d = (json?.data ?? json) as TestSubmissionData | null
        if (!cancelled) setData(d ?? null)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [candidateId])

  const submitVerdict = async (verdict: "pass" | "fail") => {
    if (!candidateId) return
    setVerdictBusy(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/test-submission`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ verdict }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const d = (json?.data ?? json) as { stage?: string }
      setData(prev => prev ? { ...prev, stage: d.stage ?? prev.stage } : prev)
      toast.success(verdict === "pass" ? "Тест принят — кандидат двигается дальше" : "Тест отклонён")
    } catch {
      toast.error("Не удалось сохранить решение")
    } finally {
      setVerdictBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!data?.submission) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ClipboardList className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm text-center">
          {data?.stage && ["test_task_sent"].includes(data.stage)
            ? "Тест отправлен — кандидат ещё не ответил"
            : "Кандидат не проходил тест"}
        </p>
      </div>
    )
  }

  const sub = data.submission
  const obj = sub.answersJson?.objective ?? null
  const hasObjective = !!obj && (obj.maxPoints ?? 0) > 0
  const answers = Array.isArray(sub.answersJson?.answers) ? sub.answersJson!.answers! : []
  const answerByQid = new Map(answers.map(a => [a.questionId, a]))
  const objByQid = new Map((obj?.perQuestion ?? []).map(p => [p.questionId, p]))
  const showVerdict = data.checkMode === "assisted" && data.stage === "test_task_done"

  // Если в тесте есть определение вопросов — идём по нему (с текстом).
  // Иначе fallback: показываем «сырые» ответы по структуре submission.
  const questions = data.questions.length > 0
    ? data.questions
    : answers.map((a, i) => ({ id: a.questionId, text: `Вопрос ${i + 1}`, answerType: a.answerType, points: null as number | null }))

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Шапка: общий балл ─────────────────────────────────────── */}
      <div className="rounded-lg border border-border p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Результат теста</span>
            {data.stage === "test_passed" && (
              <Badge variant="outline" className="text-[11px] border-emerald-300 text-emerald-700">Принят</Badge>
            )}
            {data.stage === "test_failed" && (
              <Badge variant="outline" className="text-[11px] border-red-300 text-red-600">Отклонён</Badge>
            )}
          </div>
          {sub.aiScore != null ? (
            <div className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold", scoreClasses(sub.aiScore))}>
              <Sparkles className="w-3.5 h-3.5" /> {sub.aiScore}<span className="opacity-60 font-medium">/100</span>
            </div>
          ) : data.checkMode === "manual" ? (
            <span className="text-xs text-muted-foreground">Проверка вручную</span>
          ) : (
            <span className="text-xs text-muted-foreground">AI ещё не оценил</span>
          )}
        </div>

        {hasObjective && (
          <p className="text-xs text-muted-foreground">
            Автопроверка: <span className="font-semibold text-foreground">{obj!.gotPoints ?? 0} из {obj!.maxPoints} баллов</span> ({obj!.score ?? 0}%)
          </p>
        )}

        {sub.submittedAt && (
          <p className="text-[11px] text-muted-foreground">Отправлено: {formatSubmittedAt(sub.submittedAt)}</p>
        )}

        {/* AI-обоснование */}
        {sub.aiReasoning && (
          <div>
            <button
              onClick={() => setReasoningExpanded(v => !v)}
              className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
            >
              <ChevronRight className={cn("w-3 h-3 transition-transform", reasoningExpanded && "rotate-90")} />
              {reasoningExpanded ? "Скрыть обоснование AI" : "Обоснование AI"}
            </button>
            {reasoningExpanded && (
              <p className="mt-2 text-sm text-foreground bg-muted/50 border rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap">{sub.aiReasoning}</p>
            )}
          </div>
        )}

        {/* Принять / Отклонить — только assisted + стадия test_task_done */}
        {showVerdict && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button size="sm" disabled={verdictBusy} onClick={() => submitVerdict("pass")}
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
              {verdictBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Принять
            </Button>
            <Button size="sm" variant="outline" disabled={verdictBusy} onClick={() => submitVerdict("fail")}
              className="h-8 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10">
              <XCircle className="w-3.5 h-3.5" /> Отклонить
            </Button>
          </div>
        )}
      </div>

      {/* ── Вопросы и ответы ──────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Вопросы и ответы
        </p>
        <div className="space-y-3">
          {questions.map((q, i) => {
            const a = answerByQid.get(q.id)
            const graded = objByQid.get(q.id)
            const label = q.text && !TECH_ID_RE.test(q.text) ? q.text : `Вопрос ${i + 1}`
            const value = a && a.value?.trim() ? formatAnswerValue(a) : ""
            return (
              <div key={q.id} className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-1.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground break-words min-w-0">
                    <span className="text-muted-foreground">{i + 1}. </span>{label}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {graded && (
                      graded.correct ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 rounded px-1.5 py-0.5">
                          <Check className="w-3 h-3" /> {graded.awarded}/{graded.points}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 bg-red-100 dark:bg-red-950 dark:text-red-400 rounded px-1.5 py-0.5">
                          <X className="w-3 h-3" /> 0/{graded.points}
                        </span>
                      )
                    )}
                    <span className="text-[10px] text-muted-foreground">{ANSWER_TYPE_LABEL[q.answerType] || q.answerType}</span>
                  </div>
                </div>
                {value ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{value}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic flex items-center gap-1">
                    <FileQuestion className="w-3 h-3" /> нет ответа
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
