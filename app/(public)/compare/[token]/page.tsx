"use client"

// Публичная страница сравнения по share-токену (без логина, только чтение).
// Данные — GET /api/public/compare/[token].
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Columns3, Rows3, Loader2, ChevronDown } from "lucide-react"

interface QItem { id: string; text: string; points?: number }
interface Ans { value: string | null; awarded?: number | null; max?: number | null; correct?: boolean | null }
interface Section { key: string; title: string; scored: boolean; questions: QItem[]; answers: Record<string, Record<string, Ans>> }
interface Head { id: string; name: string | null; aiScore: number | null; resumeScore: number | null; testScore?: number | null; testPoints?: { got: number; max: number } | null; demoPercent?: number | null }

function ScoreLine({ c }: { c: Head }) {
  const testColor = c.testScore == null ? "" : c.testScore >= 70 ? "text-success" : c.testScore >= 40 ? "text-amber-600" : "text-destructive"
  return (
    <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span>резюме <b className="text-foreground">{c.resumeScore ?? "—"}</b></span>
      <span className="text-muted-foreground/40">|</span>
      <span>демо <b className="text-foreground">{c.demoPercent != null ? `${c.demoPercent}%` : "—"}</b></span>
      <span className="text-muted-foreground/40">|</span>
      <span>тест <b className={cn("font-semibold", testColor || "text-foreground")}>{c.testScore != null ? c.testScore : "—"}</b></span>
      {c.aiScore != null && <><span className="text-muted-foreground/40">|</span><span>AI <b className="text-foreground">{c.aiScore}</b></span></>}
    </div>
  )
}
interface Data { candidates: Head[]; sections: Section[]; vacancyTitle?: string | null }

function AnswerCell({ a }: { a?: Ans }) {
  if (!a || (a.value == null && a.awarded == null)) return <span className="text-muted-foreground/40 text-xs italic">—</span>
  const hasMax = typeof a.max === "number" && a.max > 0
  const full = a.correct === true || (hasMax && (a.awarded ?? 0) >= (a.max as number))
  const zero = (a.awarded ?? 0) <= 0
  return (
    <div className="space-y-1">
      {typeof a.awarded === "number" && (
        <Badge variant="outline" className={cn("text-[12px] h-5 px-1.5 font-semibold",
          full ? "text-success border-success/40" : zero ? "text-destructive border-destructive/40" : "text-amber-600 border-amber-300")}>
          {hasMax ? `${a.awarded}/${a.max} б` : `${a.awarded} б`}
        </Badge>
      )}
      {a.value != null && (() => {
        const parts = a.value.split("|||").map((s) => s.trim()).filter(Boolean)
        if (parts.length > 1) return (
          <ul className="space-y-0.5">{parts.map((p, i) => <li key={i} className="text-sm flex gap-1.5"><span className="text-muted-foreground">•</span><span className="break-words">{p}</span></li>)}</ul>
        )
        return <p className="text-sm whitespace-pre-wrap break-words">{a.value}</p>
      })()}
    </div>
  )
}

export default function PublicComparePage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"matrix" | "byQuestion">("matrix")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleSection = (k: string) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  useEffect(() => {
    if (!token) return
    let alive = true
    fetch(`/api/public/compare/${token}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Ошибка"); return r.json() as Promise<Data> })
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Ошибка") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [token])

  const candidates = useMemo(() => data?.candidates ?? [], [data])
  const nameOf = (c: Head) => c.name?.trim() || "Без имени"

  return (
    <div className="p-4 md:p-6 w-full min-h-screen">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Сравнение кандидатов{data ? ` (${candidates.length})` : ""}</h1>
          {data?.vacancyTitle && <p className="text-sm text-muted-foreground">{data.vacancyTitle}</p>}
        </div>
        {data && (
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <Button size="sm" variant={mode === "matrix" ? "default" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={() => setMode("matrix")}><Columns3 className="size-3.5" /> Матрица</Button>
            <Button size="sm" variant={mode === "byQuestion" ? "default" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={() => setMode("byQuestion")}><Rows3 className="size-3.5" /> По вопросам</Button>
          </div>
        )}
      </div>

      {loading && <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center"><Loader2 className="size-4 animate-spin" /> Загрузка…</div>}
      {error && !loading && <div className="text-center text-muted-foreground py-12">{error}</div>}

      {!loading && !error && data && (
        <div className="space-y-8">
          {data.sections.map((section) => (
            <section key={section.key}>
              <button type="button" onClick={() => toggleSection(section.key)} className="flex items-center gap-2 mb-3 text-base font-semibold hover:opacity-80">
                <ChevronDown className={cn("size-4 transition-transform text-muted-foreground", collapsed.has(section.key) && "-rotate-90")} />
                {section.title}
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{section.questions.length}</Badge>
              </button>
              {!collapsed.has(section.key) && (mode === "matrix" ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left font-medium p-2.5 align-bottom sticky left-0 z-20 bg-muted border-r shadow-[2px_0_4px_rgba(0,0,0,0.04)] w-[300px] min-w-[300px] max-w-[300px]">Вопрос</th>
                        {candidates.map((c) => (
                          <th key={c.id} className="text-left font-medium p-2.5 align-bottom w-[260px] min-w-[260px] border-l">
                            <div className="truncate max-w-[240px]" title={nameOf(c)}>{nameOf(c)}</div>
                            <ScoreLine c={c} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.questions.map((q, qi) => (
                        <tr key={q.id} className="border-t align-top">
                          <td className={cn("p-2.5 sticky left-0 z-10 border-r shadow-[2px_0_4px_rgba(0,0,0,0.04)] w-[300px] min-w-[300px] max-w-[300px]", qi % 2 ? "bg-muted" : "bg-card")}>
                            <div className="font-medium text-[13px]">{q.text}</div>
                            {typeof q.points === "number" && q.points > 0 && <div className="text-[11px] text-muted-foreground">макс. {q.points} б</div>}
                          </td>
                          {candidates.map((c) => (
                            <td key={c.id} className={cn("p-2.5 border-l align-top w-[260px] min-w-[260px]", qi % 2 && "bg-muted/30")}><AnswerCell a={section.answers[c.id]?.[q.id]} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-4">
                  {section.questions.map((q) => (
                    <div key={q.id} className="rounded-lg border overflow-hidden">
                      <div className="bg-muted/40 p-2.5 font-medium text-[13px] flex items-center gap-2">{q.text}{typeof q.points === "number" && q.points > 0 && <Badge variant="outline" className="text-[10px] h-4 px-1">макс. {q.points} б</Badge>}</div>
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
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
