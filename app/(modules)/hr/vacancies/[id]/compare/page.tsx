"use client"

// Страница сравнения ответов кандидатов: /hr/vacancies/[id]/compare?ids=a,b,c
// Два режима: «Матрица» (вопросы × кандидаты) и «По вопросам» (один вопрос —
// ответы всех). Данные — GET /api/modules/hr/vacancies/[id]/compare.
import { Suspense, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ArrowLeft, Columns3, Rows3, Loader2 } from "lucide-react"

interface QItem { id: string; text: string; points?: number }
interface Ans { value: string | null; awarded?: number | null; correct?: boolean | null }
interface Section {
  key: "test" | "demo" | "anketa"
  title: string
  scored: boolean
  questions: QItem[]
  answers: Record<string, Record<string, Ans>>
}
interface CandidateHead { id: string; name: string | null; aiScore: number | null; resumeScore: number | null }
interface CompareData { candidates: CandidateHead[]; sections: Section[] }

function AnswerCell({ a }: { a: Ans | undefined }) {
  if (!a || (a.value == null && a.awarded == null)) {
    return <span className="text-muted-foreground/40 text-xs italic">—</span>
  }
  return (
    <div className="space-y-1">
      {typeof a.awarded === "number" && (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] h-4 px-1.5",
            a.correct ? "text-success border-success/40" : "text-amber-600 border-amber-300",
          )}
        >
          {a.awarded} б{a.correct === false ? " · неверно" : a.correct ? " · верно" : ""}
        </Badge>
      )}
      {a.value != null && <p className="text-sm whitespace-pre-wrap break-words">{a.value}</p>}
    </div>
  )
}

function CompareInner() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const vacancyId = params.id
  const ids = useMemo(() => (search.get("ids") ?? "").split(",").filter(Boolean), [search])

  const [data, setData] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"matrix" | "byQuestion">("matrix")

  useEffect(() => {
    if (!vacancyId || ids.length === 0) { setLoading(false); setError("Не выбраны кандидаты"); return }
    let alive = true
    setLoading(true)
    fetch(`/api/modules/hr/vacancies/${vacancyId}/compare?ids=${ids.join(",")}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Ошибка загрузки")
        return r.json() as Promise<CompareData>
      })
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Ошибка") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vacancyId, ids])

  const candidates = data?.candidates ?? []
  const nameOf = (c: CandidateHead) => c.name?.trim() || "Без имени"

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`/hr/vacancies/${vacancyId}`)}>
            <ArrowLeft className="size-4" /> К вакансии
          </Button>
          <h1 className="text-lg font-semibold">Сравнение кандидатов ({candidates.length})</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <Button
            size="sm"
            variant={mode === "matrix" ? "default" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setMode("matrix")}
          >
            <Columns3 className="size-3.5" /> Матрица
          </Button>
          <Button
            size="sm"
            variant={mode === "byQuestion" ? "default" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setMode("byQuestion")}
          >
            <Rows3 className="size-3.5" /> По вопросам
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="size-4 animate-spin" /> Загрузка…
        </div>
      )}
      {error && !loading && (
        <div className="text-center text-muted-foreground py-12">{error}</div>
      )}

      {!loading && !error && data && (
        <div className="space-y-8">
          {data.sections.length === 0 && (
            <div className="text-center text-muted-foreground py-12">Нет ответов для сравнения.</div>
          )}

          {data.sections.map((section) => (
            <section key={section.key}>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                {section.title}
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{section.questions.length}</Badge>
              </h2>

              {/* ─── Матрица: вопросы × кандидаты ─── */}
              {mode === "matrix" ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="text-left font-medium p-2.5 align-bottom sticky left-0 bg-muted/40 min-w-[220px] max-w-[320px]">
                          Вопрос
                        </th>
                        {candidates.map((c) => (
                          <th key={c.id} className="text-left font-medium p-2.5 align-bottom min-w-[200px] border-l">
                            <div className="truncate max-w-[220px]" title={nameOf(c)}>{nameOf(c)}</div>
                            <div className="flex gap-1 mt-0.5">
                              {c.resumeScore != null && <Badge variant="outline" className="text-[10px] h-4 px-1">резюме {c.resumeScore}</Badge>}
                              {c.aiScore != null && <Badge variant="outline" className="text-[10px] h-4 px-1">AI {c.aiScore}</Badge>}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.questions.map((q, qi) => (
                        <tr key={q.id} className={cn("border-t align-top", qi % 2 && "bg-muted/15")}>
                          <td className="p-2.5 sticky left-0 bg-inherit min-w-[220px] max-w-[320px]">
                            <div className="font-medium text-[13px]">{q.text}</div>
                            {typeof q.points === "number" && q.points > 0 && (
                              <div className="text-[11px] text-muted-foreground">макс. {q.points} б</div>
                            )}
                          </td>
                          {candidates.map((c) => (
                            <td key={c.id} className="p-2.5 border-l align-top">
                              <AnswerCell a={section.answers[c.id]?.[q.id]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* ─── По вопросам: вопрос → ответы всех ─── */
                <div className="space-y-4">
                  {section.questions.map((q) => (
                    <div key={q.id} className="rounded-lg border overflow-hidden">
                      <div className="bg-muted/40 p-2.5 font-medium text-[13px] flex items-center gap-2">
                        {q.text}
                        {typeof q.points === "number" && q.points > 0 && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">макс. {q.points} б</Badge>
                        )}
                      </div>
                      <div className="divide-y">
                        {candidates.map((c) => (
                          <div key={c.id} className="p-2.5 grid grid-cols-[180px_1fr] gap-3">
                            <div className="text-sm font-medium truncate" title={nameOf(c)}>{nameOf(c)}</div>
                            <AnswerCell a={section.answers[c.id]?.[q.id]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Загрузка…</div>}>
      <CompareInner />
    </Suspense>
  )
}
