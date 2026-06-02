"use client"

// Страница сравнения ответов кандидатов: /hr/vacancies/[id]/compare?ids=a,b,c
// Два режима: «Матрица» (вопросы × кандидаты) и «По вопросам» (один вопрос —
// ответы всех). Данные — GET /api/modules/hr/vacancies/[id]/compare.
import { Suspense, useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ArrowLeft, Columns3, Rows3, Loader2, Star, Check, X, ExternalLink, Ban, ChevronDown, Download, Share2 } from "lucide-react"

interface QItem { id: string; text: string; points?: number }
interface Ans { value: string | null; awarded?: number | null; max?: number | null; correct?: boolean | null }
interface Section {
  key: "test" | "demo" | "anketa"
  title: string
  scored: boolean
  questions: QItem[]
  answers: Record<string, Record<string, Ans>>
}
interface CandidateHead {
  id: string; name: string | null; aiScore: number | null; resumeScore: number | null
  isFavorite?: boolean; stage?: string | null
  testScore?: number | null; testPoints?: { got: number; max: number } | null
  demoPercent?: number | null
  city?: string | null; birthDate?: string | null
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

// Единая строка скоров под именем: резюме | демо | тест (| AI).
function ScoreLine({ c }: { c: CandidateHead }) {
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
interface CompareData { candidates: CandidateHead[]; sections: Section[] }

function AnswerCell({ a }: { a: Ans | undefined }) {
  if (!a || (a.value == null && a.awarded == null)) {
    return <span className="text-muted-foreground/40 text-xs italic">—</span>
  }
  const hasMax = typeof a.max === "number" && a.max > 0
  const full = a.correct === true || (hasMax && (a.awarded ?? 0) >= (a.max as number))
  const zero = (a.awarded ?? 0) <= 0
  return (
    <div className="space-y-1">
      {typeof a.awarded === "number" && (
        <Badge
          variant="outline"
          className={cn(
            "text-[12px] h-5 px-1.5 font-semibold",
            full ? "text-success border-success/40" : zero ? "text-destructive border-destructive/40" : "text-amber-600 border-amber-300",
          )}
        >
          {hasMax ? `${a.awarded}/${a.max} б` : `${a.awarded} б`}
        </Badge>
      )}
      {a.value != null && (() => {
        // Множественный выбор приходит склеенным через «|||» — показываем
        // аккуратным списком с маркерами вместо сырых разделителей.
        const parts = a.value.split("|||").map((s) => s.trim()).filter(Boolean)
        if (parts.length > 1) {
          return (
            <ul className="space-y-0.5">
              {parts.map((p, i) => (
                <li key={i} className="text-sm flex gap-1.5">
                  <span className="text-muted-foreground">•</span>
                  <span className="break-words">{p}</span>
                </li>
              ))}
            </ul>
          )
        }
        return <p className="text-sm whitespace-pre-wrap break-words">{a.value}</p>
      })()}
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
  const [heads, setHeads] = useState<CandidateHead[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"matrix" | "byQuestion">("matrix")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleSection = (key: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  useEffect(() => {
    if (!vacancyId || ids.length === 0) { setLoading(false); setError("Не выбраны кандидаты"); return }
    let alive = true
    setLoading(true)
    fetch(`/api/modules/hr/vacancies/${vacancyId}/compare?ids=${ids.join(",")}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Ошибка загрузки")
        return r.json() as Promise<CompareData>
      })
      .then((d) => { if (alive) { setData(d); setHeads(d.candidates); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Ошибка") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vacancyId, ids])

  const candidates = heads
  const nameOf = (c: CandidateHead) => c.name?.trim() || "Без имени"

  const patchHead = (id: string, patch: Partial<CandidateHead>) =>
    setHeads((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)))

  const toggleFavorite = async (c: CandidateHead) => {
    const next = !c.isFavorite
    patchHead(c.id, { isFavorite: next })
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/modules/hr/candidates/${c.id}/favorite`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFavorite: next }),
      })
      if (!r.ok) throw new Error()
      toast.success(next ? "В избранном" : "Убрано из избранного")
    } catch { patchHead(c.id, { isFavorite: !next }); toast.error("Не удалось") } finally { setBusyId(null) }
  }

  const changeStage = async (c: CandidateHead, stage: string, okMsg: string) => {
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/modules/hr/candidates/${c.id}/stage`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }),
      })
      if (!r.ok) throw new Error()
      patchHead(c.id, { stage })
      toast.success(okMsg)
    } catch { toast.error("Не удалось") } finally { setBusyId(null) }
  }


  const removeFromView = (id: string) => setHeads((hs) => hs.filter((h) => h.id !== id))

  // Выгрузка в настоящий .xlsx через сервер (Excel открывает нативно, без
  // проблем с разделителем/кодировкой, в отличие от CSV).
  const exportCsv = () => {
    if (candidates.length === 0) return
    const idsParam = candidates.map((c) => c.id).join(",")
    window.location.href = `/api/modules/hr/vacancies/${vacancyId}/compare/export?ids=${idsParam}`
  }

  // Создать публичную ссылку (без логина, 7 дней) и скопировать в буфер.
  const [sharing, setSharing] = useState(false)
  const shareLink = async () => {
    if (candidates.length === 0) return
    setSharing(true)
    try {
      const r = await fetch(`/api/modules/hr/vacancies/${vacancyId}/compare/share`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: candidates.map((c) => c.id) }),
      })
      const j = await r.json().catch(() => null) as { token?: string; error?: string } | null
      if (!r.ok || !j?.token) throw new Error(j?.error || "Не удалось создать ссылку")
      const link = `${window.location.origin}/compare/${j.token}`
      try { await navigator.clipboard.writeText(link) } catch { /* clipboard может быть недоступен */ }
      toast.success("Ссылка скопирована (действует 7 дней)", { description: link, duration: 8000 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
    } finally { setSharing(false) }
  }

  // Иконочная панель действий под именем кандидата (режим «Матрица»).
  function CandidateActions({ c }: { c: CandidateHead }) {
    const busy = busyId === c.id
    const rejected = c.stage === "rejected"
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <button type="button" title="В избранное" disabled={busy}
          onClick={() => toggleFavorite(c)}
          className={cn("p-1.5 rounded hover:bg-muted disabled:opacity-40", c.isFavorite ? "text-amber-500" : "text-muted-foreground")}>
          <Star className={cn("size-[18px]", c.isFavorite && "fill-amber-400")} />
        </button>
        <button type="button" title="Пригласить на интервью" disabled={busy}
          onClick={() => changeStage(c, "interview", `Приглашён: ${nameOf(c)}`)}
          className="p-1.5 rounded text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40">
          <Check className="size-[18px]" />
        </button>
        <button type="button" title={rejected ? "Уже отказан" : "Отказать"} disabled={busy || rejected}
          onClick={() => changeStage(c, "rejected", `Отказано: ${nameOf(c)}`)}
          className="p-1.5 rounded text-destructive hover:bg-destructive/10 disabled:opacity-40">
          <Ban className="size-[18px]" />
        </button>
        <a href={`/hr/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" title="Открыть карточку"
          className="p-1.5 rounded text-muted-foreground hover:bg-muted">
          <ExternalLink className="size-[18px]" />
        </a>
        <button type="button" title="Убрать из сравнения" disabled={busy}
          onClick={() => removeFromView(c.id)}
          className="p-1.5 rounded text-muted-foreground hover:bg-muted">
          <X className="size-[18px]" />
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 w-full">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`/hr/vacancies/${vacancyId}`)}>
            <ArrowLeft className="size-4" /> К вакансии
          </Button>
          <h1 className="text-lg font-semibold">Сравнение кандидатов ({candidates.length})</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={exportCsv}
            disabled={!data}
          >
            <Download className="size-3.5" /> Скачать Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={shareLink}
            disabled={!data || sharing}
          >
            {sharing ? <Loader2 className="size-3.5 animate-spin" /> : <Share2 className="size-3.5" />} Поделиться
          </Button>
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
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="flex items-center gap-2 mb-3 text-base font-semibold hover:opacity-80"
              >
                <ChevronDown className={cn("size-4 transition-transform text-muted-foreground", collapsed.has(section.key) && "-rotate-90")} />
                {section.title}
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{section.questions.length}</Badge>
              </button>

              {!collapsed.has(section.key) && (<>
              {/* ─── Матрица: вопросы × кандидаты ─── */}
              {mode === "matrix" ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left font-medium p-2.5 align-bottom sticky left-0 z-20 bg-muted border-r shadow-[2px_0_4px_rgba(0,0,0,0.04)] w-[300px] min-w-[300px] max-w-[300px]">
                          Вопрос
                        </th>
                        {candidates.map((c) => (
                          <th key={c.id} className="text-left font-medium p-2.5 align-top w-[260px] min-w-[260px] border-l h-full">
                            <div className="flex flex-col h-full">
                              {/* Имя + скоры в блоке фикс. высоты — чтобы ряд иконок был
                                  на одной линии во всех колонках (даже где есть строка AI). */}
                              <div className="min-h-24">
                                <div className="flex items-center gap-1.5">
                                  <div className="truncate max-w-[200px]" title={nameOf(c)}>{nameOf(c)}</div>
                                  {c.stage === "rejected" && <Badge variant="outline" className="text-[10px] h-4 px-1 text-destructive border-destructive/40">отказ</Badge>}
                                  {c.stage === "interview" && <Badge variant="outline" className="text-[10px] h-4 px-1 text-emerald-600 border-emerald-300">интервью</Badge>}
                                </div>
                                {c.city?.trim() && <div className="mt-0.5 text-[11px] font-normal text-muted-foreground truncate" title={c.city}>{c.city}</div>}
                                {(() => {
                                  const { age, date } = birthInfo(c.birthDate)
                                  if (age == null && !date) return null
                                  return (
                                    <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                                      {age != null && `${age} ${yearsWord(age)}`}{age != null && date && " · "}{date}
                                    </div>
                                  )
                                })()}
                                <ScoreLine c={c} />
                              </div>
                              {/* Иконки прижаты к низу — ряд действий ровный во всех колонках */}
                              <div className="mt-auto"><CandidateActions c={c} /></div>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.questions.map((q, qi) => (
                        <tr key={q.id} className="border-t align-top">
                          <td className={cn(
                            "p-2.5 sticky left-0 z-10 border-r shadow-[2px_0_4px_rgba(0,0,0,0.04)] w-[300px] min-w-[300px] max-w-[300px]",
                            qi % 2 ? "bg-muted" : "bg-card",
                          )}>
                            <div className="font-medium text-[13px]">{q.text}</div>
                            {typeof q.points === "number" && q.points > 0 && (
                              <div className="text-[11px] text-muted-foreground">макс. {q.points} б</div>
                            )}
                          </td>
                          {candidates.map((c) => (
                            <td key={c.id} className={cn("p-2.5 border-l align-top w-[260px] min-w-[260px]", qi % 2 && "bg-muted/30")}>
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
              </>)}
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
