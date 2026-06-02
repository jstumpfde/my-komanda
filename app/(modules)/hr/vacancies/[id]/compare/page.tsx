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
import { useAuth } from "@/lib/auth"
import { ArrowLeft, Columns3, Rows3, Loader2, Star, Check, X, Trash2, ExternalLink, Ban, ChevronDown, Download, Share2 } from "lucide-react"

interface QItem { id: string; text: string; points?: number }
interface Ans { value: string | null; awarded?: number | null; correct?: boolean | null }
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
}
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

  const { role } = useAuth()
  const canDelete = (["platform_admin", "platform_manager", "director"] as string[]).includes(role)

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

  const trashCandidate = async (c: CandidateHead) => {
    if (typeof window !== "undefined" && !window.confirm(`Удалить «${nameOf(c)}» в корзину?`)) return
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/modules/hr/candidates/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: [c.id], action: "trash" }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "")
      setHeads((hs) => hs.filter((h) => h.id !== c.id))
      toast.success("Удалено в корзину")
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : "Не удалось удалить") } finally { setBusyId(null) }
  }

  const removeFromView = (id: string) => setHeads((hs) => hs.filter((h) => h.id !== id))

  // Выгрузка сравнения в CSV (открывается в Excel; BOM для кириллицы).
  const exportCsv = () => {
    if (!data) return
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`
    const cell = (a?: Ans): string => {
      if (!a) return ""
      const parts: string[] = []
      if (typeof a.awarded === "number") parts.push(`[${a.awarded} б${a.correct === false ? ", неверно" : a.correct ? ", верно" : ""}]`)
      if (a.value) parts.push(a.value.split("|||").map((s) => s.trim()).filter(Boolean).join("; "))
      return parts.join(" ")
    }
    const rows: string[] = []
    rows.push(["Вопрос", ...candidates.map(nameOf)].map(esc).join(","))
    for (const section of data.sections) {
      rows.push(esc(section.title.toUpperCase()))
      for (const q of section.questions) {
        rows.push([q.text, ...candidates.map((c) => cell(section.answers[c.id]?.[q.id]))].map(esc).join(","))
      }
    }
    const csv = "﻿" + rows.join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "Сравнение_кандидатов.csv"
    a.click()
    URL.revokeObjectURL(url)
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
      <div className="flex items-center gap-0.5 mt-1.5">
        <button type="button" title="В избранное" disabled={busy}
          onClick={() => toggleFavorite(c)}
          className={cn("p-1 rounded hover:bg-muted disabled:opacity-40", c.isFavorite ? "text-amber-500" : "text-muted-foreground")}>
          <Star className={cn("size-3.5", c.isFavorite && "fill-amber-400")} />
        </button>
        <button type="button" title="Пригласить на интервью" disabled={busy}
          onClick={() => changeStage(c, "interview", `Приглашён: ${nameOf(c)}`)}
          className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40">
          <Check className="size-3.5" />
        </button>
        <button type="button" title={rejected ? "Уже отказан" : "Отказать"} disabled={busy || rejected}
          onClick={() => changeStage(c, "rejected", `Отказано: ${nameOf(c)}`)}
          className="p-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-40">
          <Ban className="size-3.5" />
        </button>
        <a href={`/hr/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" title="Открыть карточку"
          className="p-1 rounded text-muted-foreground hover:bg-muted">
          <ExternalLink className="size-3.5" />
        </a>
        {canDelete && (
          <button type="button" title="Удалить в корзину" disabled={busy}
            onClick={() => trashCandidate(c)}
            className="p-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-40">
            <Trash2 className="size-3.5" />
          </button>
        )}
        <button type="button" title="Убрать из сравнения" disabled={busy}
          onClick={() => removeFromView(c.id)}
          className="p-1 rounded text-muted-foreground hover:bg-muted ml-auto">
          <X className="size-3.5" />
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
                          <th key={c.id} className="text-left font-medium p-2.5 align-bottom w-[260px] min-w-[260px] border-l">
                            <div className="flex items-center gap-1.5">
                              <div className="truncate max-w-[200px]" title={nameOf(c)}>{nameOf(c)}</div>
                              {c.stage === "rejected" && <Badge variant="outline" className="text-[10px] h-4 px-1 text-destructive border-destructive/40">отказ</Badge>}
                              {c.stage === "interview" && <Badge variant="outline" className="text-[10px] h-4 px-1 text-emerald-600 border-emerald-300">интервью</Badge>}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-0.5 items-center">
                              {c.testScore != null && (
                                <Badge className={cn(
                                  "text-[11px] h-5 px-1.5 font-semibold border",
                                  c.testScore >= 70 ? "bg-success/10 text-success border-success/30"
                                    : c.testScore >= 40 ? "bg-amber-500/10 text-amber-600 border-amber-300"
                                    : "bg-destructive/10 text-destructive border-destructive/30",
                                )}>
                                  Балл {c.testScore}{c.testPoints ? ` (${c.testPoints.got}/${c.testPoints.max})` : ""}
                                </Badge>
                              )}
                              {c.resumeScore != null && <Badge variant="outline" className="text-[10px] h-4 px-1">резюме {c.resumeScore}</Badge>}
                              {c.aiScore != null && <Badge variant="outline" className="text-[10px] h-4 px-1">AI {c.aiScore}</Badge>}
                            </div>
                            <CandidateActions c={c} />
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
