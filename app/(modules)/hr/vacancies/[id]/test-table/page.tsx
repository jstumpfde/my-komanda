"use client"

// Режим «Тест»: таблица кандидаты × вопросы теста (строки — кандидаты,
// колонки — вопросы, в ячейках ответы и баллы). Открывается из меню «Вид».
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, Loader2 } from "lucide-react"

interface QItem { id: string; text: string; points?: number }
interface Ans { value: string | null; awarded?: number | null; max?: number | null; correct?: boolean | null }
interface Row {
  id: string; name: string | null; testScore: number | null
  testPoints: { got: number; max: number } | null; resumeScore: number | null
  answers: Record<string, Ans>
}
interface Data { vacancyTitle: string | null; questions: QItem[]; candidates: Row[] }

function Cell({ a }: { a?: Ans }) {
  if (!a || (a.value == null && a.awarded == null)) return <span className="text-muted-foreground/40 text-xs italic">—</span>
  // Бейдж балла: полный = «верно» (зелёный), 0 = «неверно» (красный),
  // между — «частично» (янтарный), с дробью awarded/max.
  const hasMax = typeof a.max === "number" && a.max > 0
  const full = a.correct === true || (hasMax && (a.awarded ?? 0) >= (a.max as number))
  const zero = (a.awarded ?? 0) <= 0
  const label = hasMax ? `${a.awarded}/${a.max} б` : `${a.awarded} б`
  const word = full ? " · верно" : zero ? " · неверно" : " · частично"
  return (
    <div className="space-y-1">
      {typeof a.awarded === "number" && (
        <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5",
          full ? "text-success border-success/40" : zero ? "text-destructive border-destructive/40" : "text-amber-600 border-amber-300")}>
          {label}{word}
        </Badge>
      )}
      {a.value != null && (() => {
        const parts = a.value.split("|||").map((s) => s.trim()).filter(Boolean)
        if (parts.length > 1) return <ul className="space-y-0.5">{parts.map((p, i) => <li key={i} className="text-sm flex gap-1.5"><span className="text-muted-foreground">•</span><span className="break-words">{p}</span></li>)}</ul>
        return <p className="text-sm whitespace-pre-wrap break-words">{a.value}</p>
      })()}
    </div>
  )
}

export default function TestTablePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const vacancyId = params.id
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!vacancyId) return
    let alive = true
    fetch(`/api/modules/hr/vacancies/${vacancyId}/test-table`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Ошибка"); return r.json() as Promise<Data> })
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Ошибка") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vacancyId])

  const nameOf = (c: Row) => c.name?.trim() || "Без имени"
  const scoreColor = (s: number | null) => s == null ? "" : s >= 70 ? "text-success" : s >= 40 ? "text-amber-600" : "text-destructive"

  return (
    <div className="p-4 md:p-6 w-full">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`/hr/vacancies/${vacancyId}`)}>
          <ArrowLeft className="size-4" /> К вакансии
        </Button>
        <h1 className="text-lg font-semibold">Тест — ответы кандидатов{data ? ` (${data.candidates.length})` : ""}</h1>
        {data?.vacancyTitle && <span className="text-sm text-muted-foreground">· {data.vacancyTitle}</span>}
      </div>

      {loading && <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center"><Loader2 className="size-4 animate-spin" /> Загрузка…</div>}
      {error && !loading && <div className="text-center text-muted-foreground py-12">{error}</div>}

      {!loading && !error && data && (
        data.questions.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">У вакансии нет теста или вопросов.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left font-medium p-2.5 align-bottom sticky left-0 z-20 bg-muted border-r shadow-[2px_0_4px_rgba(0,0,0,0.04)] w-[240px] min-w-[240px] max-w-[240px]">
                    Кандидат
                  </th>
                  {data.questions.map((q) => (
                    <th key={q.id} className="text-left font-medium p-2.5 align-bottom w-[260px] min-w-[260px] border-l">
                      <div className="text-[13px]">{q.text}</div>
                      {typeof q.points === "number" && q.points > 0 && <div className="text-[11px] text-muted-foreground font-normal">макс. {q.points} б</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c, ri) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className={cn("p-2.5 sticky left-0 z-10 border-r shadow-[2px_0_4px_rgba(0,0,0,0.04)] w-[240px] min-w-[240px] max-w-[240px]", ri % 2 ? "bg-muted" : "bg-card")}>
                      <div className="font-medium text-[13px] truncate" title={nameOf(c)}>{nameOf(c)}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-1.5">
                        <span>тест <b className={cn("font-semibold", scoreColor(c.testScore) || "text-foreground")}>{c.testScore != null ? c.testScore : "—"}</b>{c.testPoints ? ` (${c.testPoints.got}/${c.testPoints.max})` : ""}</span>
                        {c.resumeScore != null && <span>· резюме <b className="text-foreground">{c.resumeScore}</b></span>}
                      </div>
                    </td>
                    {data.questions.map((q) => (
                      <td key={q.id} className={cn("p-2.5 border-l align-top w-[260px] min-w-[260px]", ri % 2 && "bg-muted/30")}>
                        <Cell a={c.answers[q.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
