"use client"

// Режим «Тест»: таблица кандидаты × вопросы теста (строки — кандидаты,
// колонки — вопросы, в ячейках ответы и баллы). Открывается из меню «Вид».
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, Loader2, Star, Check, Ban, ExternalLink, X } from "lucide-react"
import { toast } from "sonner"

interface QItem { id: string; text: string; points?: number }
interface Ans { value: string | null; awarded?: number | null; max?: number | null; correct?: boolean | null }
interface Row {
  id: string; name: string | null; testScore: number | null
  testPoints: { got: number; max: number } | null; resumeScore: number | null
  isFavorite?: boolean; stage?: string | null
  city?: string | null; birthDate?: string | null
  answers: Record<string, Ans>
}

// Возраст + ДР из birth_date (pg date → "YYYY-MM-DD").
function yearsWord(n: number): string {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return "лет"
  if (b === 1) return "год"
  if (b >= 2 && b <= 4) return "года"
  return "лет"
}
function birthInfo(b?: string | null): { age: number | null; date: string | null } {
  if (!b) return { age: null, date: null }
  const d = new Date(b)
  if (isNaN(d.getTime())) return { age: null, date: null }
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
  return { age: age >= 0 && age < 120 ? age : null, date }
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
  return (
    <div className="space-y-1">
      {typeof a.awarded === "number" && (
        <Badge variant="outline" className={cn("text-[12px] h-5 px-1.5 font-semibold",
          full ? "text-success border-success/40" : zero ? "text-destructive border-destructive/40" : "text-amber-600 border-amber-300")}>
          {label}
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

  // ── Действия по кандидату (как в сравнении) ──
  const [busyId, setBusyId] = useState<string | null>(null)
  const patchRow = (id: string, patch: Partial<Row>) =>
    setData((d) => d ? { ...d, candidates: d.candidates.map((c) => c.id === id ? { ...c, ...patch } : c) } : d)

  const toggleFavorite = async (c: Row) => {
    const next = !c.isFavorite
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/modules/hr/candidates/${c.id}/favorite`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFavorite: next }),
      })
      if (!r.ok) throw new Error()
      patchRow(c.id, { isFavorite: next })
    } catch { toast.error("Не удалось") } finally { setBusyId(null) }
  }
  const changeStage = async (c: Row, stage: string, okMsg: string) => {
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/modules/hr/candidates/${c.id}/stage`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }),
      })
      if (!r.ok) throw new Error()
      patchRow(c.id, { stage })
      toast.success(okMsg)
    } catch { toast.error("Не удалось") } finally { setBusyId(null) }
  }
  const removeFromView = (id: string) =>
    setData((d) => d ? { ...d, candidates: d.candidates.filter((c) => c.id !== id) } : d)

  function Actions({ c }: { c: Row }) {
    const busy = busyId === c.id
    const rejected = c.stage === "rejected"
    return (
      <div className="flex items-center gap-0.5 mt-1.5">
        <button type="button" title="В избранное" disabled={busy} onClick={() => toggleFavorite(c)}
          className={cn("p-1 rounded hover:bg-muted disabled:opacity-40", c.isFavorite ? "text-amber-500" : "text-muted-foreground")}>
          <Star className={cn("size-4", c.isFavorite && "fill-amber-400")} />
        </button>
        <button type="button" title="Пригласить на интервью" disabled={busy} onClick={() => changeStage(c, "interview", `Приглашён: ${nameOf(c)}`)}
          className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40">
          <Check className="size-4" />
        </button>
        <button type="button" title={rejected ? "Уже отказан" : "Отказать"} disabled={busy || rejected} onClick={() => changeStage(c, "rejected", `Отказано: ${nameOf(c)}`)}
          className="p-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-40">
          <Ban className="size-4" />
        </button>
        <a href={`/hr/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" title="Открыть карточку"
          className="p-1 rounded text-muted-foreground hover:bg-muted">
          <ExternalLink className="size-4" />
        </a>
        <button type="button" title="Убрать из таблицы" disabled={busy} onClick={() => removeFromView(c.id)}
          className="p-1 rounded text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
    )
  }

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
                    <th key={q.id} className="text-left font-medium p-2.5 align-top w-[260px] min-w-[260px] border-l h-full">
                      {/* Название вопроса — вверху-слева; «макс. N б» прижато к низу-слева. */}
                      <div className="flex flex-col h-full">
                        <div className="text-[13px]">{q.text}</div>
                        {typeof q.points === "number" && q.points > 0 && <div className="mt-auto pt-1 text-[11px] text-muted-foreground font-normal">макс. {q.points} б</div>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c, ri) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className={cn("p-2.5 sticky left-0 z-10 border-r shadow-[2px_0_4px_rgba(0,0,0,0.04)] w-[240px] min-w-[240px] max-w-[240px]", ri % 2 ? "bg-muted" : "bg-card")}>
                      <div className="flex items-center gap-1.5">
                        <div className="font-medium text-[13px] truncate" title={nameOf(c)}>{nameOf(c)}</div>
                        {c.stage === "rejected" && <Badge variant="outline" className="text-[10px] h-4 px-1 text-destructive border-destructive/40">отказ</Badge>}
                        {c.stage === "interview" && <Badge variant="outline" className="text-[10px] h-4 px-1 text-emerald-600 border-emerald-300">интервью</Badge>}
                      </div>
                      {c.city?.trim() && <div className="mt-0.5 text-[11px] text-muted-foreground truncate" title={c.city}>{c.city}</div>}
                      {(() => {
                        const { age, date } = birthInfo(c.birthDate)
                        if (age == null && !date) return null
                        return (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {age != null && `${age} ${yearsWord(age)}`}{age != null && date && " · "}{date}
                          </div>
                        )
                      })()}
                      <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-1.5">
                        <span>тест <b className={cn("font-semibold", scoreColor(c.testScore) || "text-foreground")}>{c.testScore != null ? c.testScore : "—"}</b>{c.testPoints ? ` (${c.testPoints.got}/${c.testPoints.max})` : ""}</span>
                        {c.resumeScore != null && <span>· резюме <b className="text-foreground">{c.resumeScore}</b></span>}
                      </div>
                      <Actions c={c} />
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
