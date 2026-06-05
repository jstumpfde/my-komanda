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
import { ArrowLeft, Columns3, Rows3, Loader2, Star, Check, X, ExternalLink, Ban, ChevronDown, Download, Share2, SlidersHorizontal, ChevronsUpDown, ChevronsDownUp } from "lucide-react"
import { CandidateDrawer } from "@/components/candidates/candidate-drawer"

interface QItem { id: string; text: string; points?: number; answerType?: string }
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

function AnswerCell({ a, clamped, onToggle }: { a: Ans | undefined; clamped?: boolean; onToggle?: () => void }) {
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
        const body = parts.length > 1 ? (
          <ul className="space-y-0.5">
            {parts.map((p, i) => (
              <li key={i} className="text-sm flex gap-1.5">
                <span className="text-muted-foreground">•</span>
                <span className="break-words">{p}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{a.value}</p>
        )
        // По умолчанию свёрнуто до ~8 строк; клик по ячейке — раскрыть/свернуть.
        return (
          <div
            className={cn(clamped && "line-clamp-[8] cursor-pointer", onToggle && "cursor-pointer")}
            onClick={onToggle}
            title={onToggle ? (clamped ? "Нажмите, чтобы раскрыть" : "Нажмите, чтобы свернуть") : undefined}
          >
            {body}
          </div>
        )
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
  const setToken = search.get("set")?.trim() || ""
  // Источник данных: короткий набор (?set=token) приоритетнее явного ?ids=.
  const fetchQuery = setToken ? `set=${encodeURIComponent(setToken)}` : `ids=${ids.join(",")}`
  const hasSource = setToken.length > 0 || ids.length > 0


  const [data, setData] = useState<CompareData | null>(null)
  const [heads, setHeads] = useState<CandidateHead[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"matrix" | "byQuestion">("matrix")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Ячейки ответов по умолчанию свёрнуты (~8 строк). «Раскрыть всё» / клик по ячейке.
  const [expandAll, setExpandAll] = useState(false)
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())
  const toggleCell = (key: string) => setExpandedCells(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })
  // Ручная ширина колонок кандидатов (px). Дефолт — 260.
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const startColResize = (colId: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startW = colWidths[colId] ?? 260
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(140, Math.min(700, startW + (ev.clientX - startX)))
      setColWidths(prev => ({ ...prev, [colId]: w }))
    }
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }
  // ── Фильтр кандидатов (скрывает не подходящих, обратимо) ──
  const [filterOpen, setFilterOpen] = useState(false)
  // questionId → выбранные значения (для выборных) либо "__answered__"/"__empty__" (для текстовых)
  const [answerSel, setAnswerSel] = useState<Record<string, string[]>>({})
  const [testMin, setTestMin] = useState<number | null>(null)
  const [demoMin, setDemoMin] = useState<number | null>(null)
  const [resumeMin, setResumeMin] = useState<number | null>(null)
  const [stageSel, setStageSel] = useState<string[]>([])
  const resetFilter = () => { setAnswerSel({}); setTestMin(null); setDemoMin(null); setResumeMin(null); setStageSel([]) }
  // Боковая карточка кандидата (drawer) поверх сравнения.
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const openCard = (id: string) => { setDrawerId(id); setDrawerOpen(true) }
  const toggleSection = (key: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  useEffect(() => {
    if (!vacancyId || !hasSource) { setLoading(false); setError("Не выбраны кандидаты"); return }
    let alive = true
    setLoading(true)
    fetch(`/api/modules/hr/vacancies/${vacancyId}/compare?${fetchQuery}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Ошибка загрузки")
        return r.json() as Promise<CompareData>
      })
      .then((d) => { if (alive) { setData(d); setHeads(d.candidates); setError(null) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Ошибка") })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [vacancyId, fetchQuery, hasSource])

  const candidates = heads
  const nameOf = (c: CandidateHead) => c.name?.trim() || "Без имени"

  // ── Фасеты фильтра: по каждому вопросу — распределение ответов ──
  // mode "values" — мало уникальных коротких значений (выборные вопросы): чипы
  // вариантов с числом. mode "answered" — свободный текст: «ответил / нет».
  const sectionByQid = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of data?.sections ?? []) for (const q of s.questions) m.set(q.id, s.key)
    return m
  }, [data])
  const answerValueOf = (cid: string, qid: string): string => {
    const sk = sectionByQid.get(qid)
    const sec = data?.sections.find((s) => s.key === sk)
    return (sec?.answers[cid]?.[qid]?.value ?? "").trim()
  }
  const facets = useMemo(() => {
    if (!data) return []
    return data.sections.map((section) => ({
      key: section.key,
      title: section.title,
      questions: section.questions.map((q) => {
        const counts = new Map<string, number>()
        let answered = 0, empty = 0
        for (const c of candidates) {
          const v = (section.answers[c.id]?.[q.id]?.value ?? "").trim()
          if (!v) { empty++; continue }
          answered++
          for (const part of v.split("|||").map((s) => s.trim()).filter(Boolean)) {
            counts.set(part, (counts.get(part) ?? 0) + 1)
          }
        }
        const distinct = [...counts.entries()].sort((a, b) => b[1] - a[1])
        // Режим определяем по типу вопроса (надёжнее эвристики): выборные →
        // всегда чипы вариантов; текстовые → «ответили/без ответа». Для
        // демо/анкеты (тип неизвестен) — эвристика по кардинальности.
        const choiceType = q.answerType === "single" || q.answerType === "multiple" || q.answerType === "yesno" || q.answerType === "sort"
        const textType = q.answerType === "short" || q.answerType === "long" || q.answerType === "text"
        const isValues = choiceType
          ? distinct.length > 0
          : textType
            ? false
            : (distinct.length > 0 && distinct.length <= 12 && distinct.every(([val]) => val.length <= 60))
        // Ограничиваем число чипов (частые сверху); редкие «другое»-ответы не плодим.
        return { id: q.id, text: q.text, mode: isValues ? "values" as const : "answered" as const, values: distinct.slice(0, 25), answered, empty }
      }).filter((q) => q.answered + q.empty > 0),
    })).filter((s) => s.questions.length > 0)
  }, [data, candidates])

  const passesFilter = (c: CandidateHead): boolean => {
    if (testMin != null && (c.testScore == null || c.testScore < testMin)) return false
    if (demoMin != null && (c.demoPercent == null || c.demoPercent < demoMin)) return false
    if (resumeMin != null && (c.resumeScore == null || c.resumeScore < resumeMin)) return false
    if (stageSel.length && !(c.stage && stageSel.includes(c.stage))) return false
    for (const [qid, sel] of Object.entries(answerSel)) {
      if (!sel.length) continue
      const v = answerValueOf(c.id, qid)
      const hasAnswered = sel.includes("__answered__")
      const hasEmpty = sel.includes("__empty__")
      if (hasAnswered || hasEmpty) {
        if (!((v && hasAnswered) || (!v && hasEmpty))) return false
        continue
      }
      const parts = new Set(v.split("|||").map((s) => s.trim()).filter(Boolean))
      if (!sel.some((s) => parts.has(s))) return false
    }
    return true
  }
  const filterActive = Object.values(answerSel).some((a) => a.length) || testMin != null || demoMin != null || resumeMin != null || stageSel.length > 0
  const visible = filterActive ? candidates.filter(passesFilter) : candidates
  const stageOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of candidates) if (c.stage) set.add(c.stage)
    return [...set]
  }, [candidates])
  const toggleAnswerVal = (qid: string, val: string) =>
    setAnswerSel((prev) => {
      const cur = prev[qid] ?? []
      const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
      const out = { ...prev }
      if (next.length) out[qid] = next; else delete out[qid]
      return out
    })

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
    const idsParam = visible.map((c) => c.id).join(",")
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
        body: JSON.stringify({ ids: visible.map((c) => c.id) }),
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
      <div className="flex items-center gap-1.5 mt-1">
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
        <button type="button" title="Открыть карточку" disabled={busy}
          onClick={() => openCard(c.id)}
          className="p-1.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-40">
          <ExternalLink className="size-[18px]" />
        </button>
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
          <h1 className="text-lg font-semibold">
            Сравнение кандидатов ({filterActive ? `${visible.length} из ${candidates.length}` : candidates.length})
          </h1>
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
          <Button
            size="sm"
            variant={expandAll ? "default" : "outline"}
            className="h-8 gap-1.5 text-xs"
            onClick={() => { setExpandAll(v => !v); setExpandedCells(new Set()) }}
            title="Свернуть ответы до ~8 строк / раскрыть все полностью"
          >
            {expandAll ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
            {expandAll ? "Свернуть всё" : "Раскрыть всё"}
          </Button>
          <Button
            size="sm"
            variant={filterActive ? "default" : "outline"}
            className="h-8 gap-1.5 text-xs"
            onClick={() => setFilterOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-3.5" /> Фильтр{filterActive ? ` · ${visible.length}` : ""}
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

      {/* ── Панель фильтра (скрывает не подходящих, обратимо) ── */}
      {filterOpen && data && (
        <div className="mb-4 rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium">
              Фильтр · показано <b>{visible.length}</b> из {candidates.length}
            </span>
            <div className="flex items-center gap-2">
              {filterActive && (
                <button className="text-xs text-primary/70 hover:text-primary underline underline-offset-2" onClick={resetFilter}>
                  Сбросить
                </button>
              )}
              <button className="text-muted-foreground/60 hover:text-foreground" onClick={() => setFilterOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Пороги по баллам + стадия */}
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs">
            {([
              { label: "тест ≥", val: testMin, set: setTestMin },
              { label: "демо % ≥", val: demoMin, set: setDemoMin },
              { label: "резюме ≥", val: resumeMin, set: setResumeMin },
            ] as const).map(({ label, val, set }) => (
              <label key={label} className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{label}</span>
                <input
                  type="number" min={0} max={100} placeholder="—"
                  className="w-16 text-xs border border-border rounded px-2 py-1 outline-none bg-background focus:border-primary/50 text-center"
                  value={val ?? ""}
                  onChange={(e) => { const v = parseInt(e.target.value); set(Number.isFinite(v) ? v : null) }}
                />
              </label>
            ))}
            {stageOptions.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">стадия:</span>
                {stageOptions.map((st) => {
                  const active = stageSel.includes(st)
                  return (
                    <button key={st}
                      onClick={() => setStageSel((p) => p.includes(st) ? p.filter((x) => x !== st) : [...p, st])}
                      className={cn("px-2 py-0.5 rounded border text-[11px]", active ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                      {st}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* По ответам на вопросы */}
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {facets.map((section) => (
              <div key={section.key} className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground/60 font-medium">{section.title}</div>
                {section.questions.map((q) => {
                  const sel = answerSel[q.id] ?? []
                  return (
                    <div key={q.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-foreground/80 mr-1 max-w-[280px] truncate" title={q.text}>{q.text}</span>
                      {q.mode === "values" ? (
                        q.values.map(([val, n]) => {
                          const active = sel.includes(val)
                          return (
                            <button key={val} onClick={() => toggleAnswerVal(q.id, val)}
                              className={cn("px-2 py-0.5 rounded border text-[11px]", active ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                              {val} <span className="opacity-50">· {n}</span>
                            </button>
                          )
                        })
                      ) : (
                        ([["__answered__", `ответили · ${q.answered}`], ["__empty__", `без ответа · ${q.empty}`]] as const).map(([tok, lbl]) => {
                          const active = sel.includes(tok)
                          return (
                            <button key={tok} onClick={() => toggleAnswerVal(q.id, tok)}
                              className={cn("px-2 py-0.5 rounded border text-[11px]", active ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                              {lbl}
                            </button>
                          )
                        })
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

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
                        {visible.map((c) => (
                          <th key={c.id} className="relative text-left font-medium p-2.5 align-top border-l h-full"
                            style={{ width: colWidths[c.id] ?? 260, minWidth: colWidths[c.id] ?? 260, maxWidth: colWidths[c.id] ?? 260 }}>
                            {/* Ручка ресайза колонки — тянуть за правую границу */}
                            <div onMouseDown={(e) => startColResize(c.id, e)} title="Потяните, чтобы изменить ширину"
                              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 z-10" />
                            <div className="flex flex-col h-full">
                              {/* Имя + скоры. Высоту не фиксируем — отступ до иконок
                                  минимальный; выравнивание ряда иконок между колонками
                                  даёт mt-auto (сработает, если колонки разной высоты). */}
                              <div>
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
                          {visible.map((c) => {
                            const cellKey = `${c.id}:${q.id}`
                            return (
                            <td key={c.id} className={cn("p-2.5 border-l align-top", qi % 2 && "bg-muted/30")}
                              style={{ width: colWidths[c.id] ?? 260, minWidth: colWidths[c.id] ?? 260, maxWidth: colWidths[c.id] ?? 260 }}>
                              <AnswerCell a={section.answers[c.id]?.[q.id]}
                                clamped={!expandAll && !expandedCells.has(cellKey)}
                                onToggle={() => toggleCell(cellKey)} />
                            </td>
                          )})}
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
                        {visible.map((c) => {
                          const cellKey = `bq:${c.id}:${q.id}`
                          return (
                          <div key={c.id} className="p-2.5 grid grid-cols-[180px_1fr] gap-3">
                            <div className="text-sm font-medium truncate" title={nameOf(c)}>{nameOf(c)}</div>
                            <AnswerCell a={section.answers[c.id]?.[q.id]}
                              clamped={!expandAll && !expandedCells.has(cellKey)}
                              onToggle={() => toggleCell(cellKey)} />
                          </div>
                        )})}
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

      {/* Боковая карточка кандидата поверх сравнения (вместо ухода на /hr/candidates/[id]). */}
      <CandidateDrawer
        candidateId={drawerId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onStageChange={(id, stage) => patchHead(id, { stage })}
        onToggleFavorite={(id, isFavorite) => patchHead(id, { isFavorite })}
      />
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
