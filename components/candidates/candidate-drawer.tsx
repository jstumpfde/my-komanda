"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Phone,
  Mail,
  MapPin,
  Briefcase,
  DollarSign,
  Star,
  CheckCircle2,
  XCircle,
  Calendar,
  Loader2,
  Send,
  MessageSquare,
  MessageSquarePlus,
  Clock,
  Sparkles,
  MonitorOff,
  History as HistoryIcon,
  CheckCircle,
  SkipForward,
  X,
  FileQuestion,
  Play,
  MoreHorizontal,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { ApiCandidate } from "@/hooks/use-candidates"
import type { Lesson, Block } from "@/lib/course-types"
import { AnswersTab } from "./answers-tab"
import { HhResumeInfo } from "./hh-resume-info"

// ─── Note type ────────────────────────────────────────────────────────────────

interface CandidateNote {
  text: string
  createdAt: string
  authorId?: string
}

interface StageHistoryEntry {
  from?: string | null
  to?: string
  at?: string
  reason?: string
  movedBy?: string
  comment?: string
}

interface HhMessage {
  id: string
  text: string
  authorType: string
  createdAt: string | null
  viewedByMe: boolean
  viewedByOpponent: boolean
}

interface DemoBlock {
  blockId: string
  status: string
  timeSpent?: number
  answeredAt?: string
}

interface BlockMeta {
  title: string
  lessonTitle: string
  type?: string
}

function buildBlockMeta(lessons: unknown): Map<string, BlockMeta> {
  const map = new Map<string, BlockMeta>()
  if (!Array.isArray(lessons)) return map
  for (const l of lessons as Lesson[]) {
    if (!l || !Array.isArray(l.blocks)) continue
    for (const b of l.blocks as Block[]) {
      if (!b || typeof b.id !== "string") continue
      const title =
        b.taskTitle?.trim() ||
        b.taskDescription?.trim().slice(0, 80) ||
        b.imageTitleTop?.trim() ||
        b.videoTitleTop?.trim() ||
        b.audioTitleTop?.trim() ||
        b.fileTitleTop?.trim() ||
        (b.content ? b.content.replace(/<[^>]+>/g, "").trim().slice(0, 80) : "") ||
        l.title?.trim() ||
        ""
      map.set(b.id, { title, lessonTitle: l.title ?? "", type: b.type })
    }
  }
  return map
}

function formatTime(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatTimeShort(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return ""
  if (seconds < 60) return `${seconds} сек`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m} мин` : `${m} мин ${s} сек`
}

interface DemoProgress {
  blocks?: DemoBlock[]
  totalBlocks?: number
  completedAt?: string | null
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Новый", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  demo: { label: "На демо", color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800" },
  decision: { label: "Решение", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  scheduled: { label: "Интервью назначено", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800" },
  interview: { label: "Интервью", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800" },
  interviewed: { label: "Прошёл интервью", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  hired: { label: "Нанят", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  rejected: { label: "Отказ", color: "bg-destructive/10 text-destructive border-destructive/20" },
}

// ─── Avatar with initials ─────────────────────────────────────────────────────

function AvatarInitials({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("")

  const sizeClass = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-16 h-16 text-lg",
  }[size]

  const colors = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  ]
  const colorIdx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length

  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold shrink-0", sizeClass, colors[colorIdx])}>
      {initials || "?"}
    </div>
  )
}

// ─── AI Score badge ──────────────────────────────────────────────────────────

function aiScoreColor(score: number) {
  if (score >= 70) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
  if (score >= 40) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
  return "bg-destructive/10 text-destructive border-destructive/20"
}

function AiScoreBadge({ score, onClick }: { score: number | null; onClick?: () => void }) {
  if (score === null) return null
  return (
    <Badge
      variant="outline"
      className={cn("font-bold text-sm border cursor-pointer hover:opacity-80 transition-opacity", aiScoreColor(score))}
      onClick={onClick}
    >
      <Sparkles className="w-3 h-3 mr-1" />
      AI: {score}
    </Badge>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const color =
    score >= 80 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
    score >= 60 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" :
    "bg-destructive/10 text-destructive border-destructive/20"
  return (
    <Badge variant="outline" className={cn("font-bold text-sm border", color)}>
      <Star className="w-3 h-3 mr-1" />
      {score}
    </Badge>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isHhSource(src: string | null | undefined) {
  return src === "hh" || src === "hh.ru"
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
  } catch {
    return iso
  }
}

interface TimelineEvent {
  at: number              // millis для сортировки
  iso: string             // отображаемая дата
  icon: typeof HistoryIcon
  iconClass: string
  title: string
  hint?: string
}

function buildTimeline(args: {
  candidate: ApiCandidate
  stageHistory: StageHistoryEntry[]
  demoBlocks: DemoBlock[]
  demoCompletedAt: string | null | undefined
  blockMeta: Map<string, BlockMeta>
}): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const { candidate, stageHistory, demoBlocks, demoCompletedAt, blockMeta } = args

  if (candidate.createdAt) {
    const t = Date.parse(candidate.createdAt)
    if (!isNaN(t)) {
      events.push({
        at: t,
        iso: candidate.createdAt,
        icon: isHhSource(candidate.source) ? HistoryIcon : MessageSquarePlus,
        iconClass: "text-blue-500",
        title: isHhSource(candidate.source) ? "Импортирован отклик с hh.ru" : "Кандидат добавлен",
      })
    }
  }

  for (const entry of stageHistory) {
    if (!entry?.at) continue
    const t = Date.parse(entry.at)
    if (isNaN(t)) continue
    const fromLabel = entry.from ? (STAGE_LABELS[entry.from]?.label ?? entry.from) : null
    const toLabel = entry.to ? (STAGE_LABELS[entry.to]?.label ?? entry.to) : null
    // Понятные заголовки для известных reason'ов — иначе fallback на "Перевод: A → B".
    let title: string
    switch (entry.reason) {
      case "anketa_submitted": title = "Заполнил анкету полностью"; break
      case "demo_started":     title = "Начал демонстрацию"; break
      case "demo_completed":   title = "Завершил демонстрацию"; break
      case "ai_classifier_rejection": title = "Кандидат отказался (AI-классификация)"; break
      default:
        title = fromLabel ? `Перевод: ${fromLabel} → ${toLabel}` : `Стадия: ${toLabel}`
    }
    const isReject = entry.to === "rejected"
    const isHire = entry.to === "hired"
    events.push({
      at: t,
      iso: entry.at,
      icon: isReject ? XCircle : isHire ? CheckCircle2 : HistoryIcon,
      iconClass: isReject ? "text-destructive" : isHire ? "text-emerald-500" : "text-muted-foreground",
      title,
      hint: entry.movedBy ? `Перевёл: ${entry.movedBy}` : entry.comment || (entry.reason ? undefined : undefined),
    })
  }

  // По каждому сабмиченному блоку — отдельное событие с названием и временем.
  const sorted = [...demoBlocks].filter(b => b?.answeredAt).sort((a, b) =>
    Date.parse(a.answeredAt!) - Date.parse(b.answeredAt!)
  )
  if (sorted.length > 0) {
    const first = sorted[0]
    const t = Date.parse(first.answeredAt!)
    if (!isNaN(t)) {
      events.push({
        at: t - 1, iso: first.answeredAt!,
        icon: Play, iconClass: "text-indigo-500",
        title: "Открыл демонстрацию",
      })
    }
    sorted.forEach((b, i) => {
      const t2 = Date.parse(b.answeredAt!)
      if (isNaN(t2)) return
      const meta = blockMeta.get(b.blockId)
      const blockTitle = meta?.title?.trim() || `Блок ${i + 1}`
      const dur = formatDuration(b.timeSpent)
      events.push({
        at: t2, iso: b.answeredAt!,
        icon: CheckCircle, iconClass: "text-indigo-500",
        title: `Прошёл блок «${blockTitle}»`,
        hint: dur ? `Длительность: ${dur}` : undefined,
      })
    })
  }

  if (demoCompletedAt) {
    const t = Date.parse(demoCompletedAt)
    if (!isNaN(t)) {
      events.push({
        at: t + 1, iso: demoCompletedAt,
        icon: CheckCircle, iconClass: "text-emerald-500",
        title: "Завершил демонстрацию",
      })
    }
  }

  // AI-оценка
  const aiScore = candidate.aiScore
  if (aiScore != null) {
    // Используем updatedAt как приближённое время оценки
    const updIso = candidate.updatedAt
    if (updIso) {
      const t = Date.parse(updIso)
      if (!isNaN(t)) {
        events.push({
          at: t + 2, iso: updIso,
          icon: Sparkles, iconClass: "text-purple-500",
          title: `AI-оценка: ${aiScore}/100`,
          hint: candidate.aiSummary ? candidate.aiSummary.slice(0, 120) : undefined,
        })
      }
    }
  }

  return events.sort((a, b) => a.at - b.at)
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CandidateDrawerProps {
  candidateId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStageChange?: (candidateId: string, newStage: string) => void
  onToggleFavorite?: (candidateId: string, isFavorite: boolean) => void | Promise<void>
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CandidateDrawer({
  candidateId,
  open,
  onOpenChange,
  onStageChange,
  onToggleFavorite,
}: CandidateDrawerProps) {
  const [candidate, setCandidate] = useState<ApiCandidate | null>(null)
  const [notes, setNotes] = useState<CandidateNote[]>([])
  const [loadingCandidate, setLoadingCandidate] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [changingStage, setChangingStage] = useState<string | null>(null)
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [scoringAi, setScoringAi] = useState(false)
  const [activeTab, setActiveTab] = useState("contacts")
  const [hhMessages, setHhMessages] = useState<HhMessage[]>([])
  const [hhLoading, setHhLoading] = useState(false)
  const [hhError, setHhError] = useState<string | null>(null)
  const [hhDraft, setHhDraft] = useState("")
  const [hhSending, setHhSending] = useState(false)
  const hhFetchRef = useRef<string | null>(null)
  const hhListRef = useRef<HTMLDivElement | null>(null)
  const tabScrollRef = useRef<HTMLDivElement | null>(null)

  const fetchCandidate = useCallback(async (id: string) => {
    setLoadingCandidate(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}`)
      if (!res.ok) throw new Error("Not found")
      const data = await res.json() as ApiCandidate
      setCandidate(data)
    } catch {
      toast.error("Не удалось загрузить данные кандидата")
    } finally {
      setLoadingCandidate(false)
    }
  }, [])

  const fetchNotes = useCallback(async (id: string) => {
    setLoadingNotes(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}/notes`)
      if (!res.ok) return
      const data = await res.json() as CandidateNote[]
      setNotes(data)
    } catch {
      // silently fail
    } finally {
      setLoadingNotes(false)
    }
  }, [])

  useEffect(() => {
    if (open && candidateId) {
      setCandidate(null)
      setNotes([])
      setHhMessages([])
      setHhError(null)
      setHhDraft("")
      hhFetchRef.current = null
      setActiveTab("contacts")
      fetchCandidate(candidateId)
      fetchNotes(candidateId)
    }
  }, [open, candidateId, fetchCandidate, fetchNotes])

  // ── Reload hh messages on demand (после отправки своего сообщения) ────────
  const reloadHhMessages = useCallback(async (hhResponseId: string) => {
    try {
      const res = await fetch(`/api/integrations/hh/messages/${hhResponseId}`)
      const data = await res.json() as { messages?: HhMessage[]; error?: string }
      if (res.ok && Array.isArray(data.messages)) setHhMessages(data.messages)
    } catch (err) {
      console.error("[hh-chat] reload failed", err)
    }
  }, [])

  const handleSendHhMessage = useCallback(async () => {
    const hhResponseId = candidate?.hhResponseId
    const text = hhDraft.trim()
    if (!hhResponseId || !text || hhSending) return
    setHhSending(true)
    try {
      const res = await fetch(`/api/integrations/hh/messages/${hhResponseId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        toast.error(data.error || "Не удалось отправить сообщение")
        return
      }
      setHhDraft("")
      toast.success("Сообщение отправлено")
      await reloadHhMessages(hhResponseId)
    } catch (err) {
      console.error("[hh-chat] send failed", err)
      toast.error("Сетевая ошибка")
    } finally {
      setHhSending(false)
    }
  }, [candidate?.hhResponseId, hhDraft, hhSending, reloadHhMessages])

  // ── Lazy-load hh messages when chat tab opens ─────────────────────────────
  useEffect(() => {
    const hhResponseId = candidate?.hhResponseId
    if (activeTab !== "chat" || !hhResponseId) return
    if (hhFetchRef.current === hhResponseId) return

    hhFetchRef.current = hhResponseId
    let cancelled = false
    setHhLoading(true)
    setHhError(null)

    ;(async () => {
      try {
        const res = await fetch(`/api/integrations/hh/messages/${hhResponseId}`)
        const data = await res.json() as { messages?: HhMessage[]; error?: string; details?: string }
        if (cancelled) return
        if (!res.ok) {
          console.error("[hh-chat] fetch failed", res.status, data)
          setHhError(data.error ?? `Ошибка ${res.status}`)
        } else {
          const msgs = data.messages ?? []
          if (msgs.length === 0) console.warn("[hh-chat] empty messages list", { hhResponseId })
          setHhMessages(msgs)
        }
      } catch (err) {
        console.error("[hh-chat] network error", err)
        if (!cancelled) setHhError(err instanceof Error ? err.message : "Сетевая ошибка")
      } finally {
        if (!cancelled) setHhLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [activeTab, candidate?.hhResponseId])

  // ── Auto-scroll to last hh message when list updates ──────────────────────
  useEffect(() => {
    if (activeTab !== "chat" || hhMessages.length === 0) return
    const el = hhListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeTab, hhMessages])

  // ── Reset tab scroll to top when switching tabs ──────────────────────────
  // Без этого пользователь может открыть Ответы после прокрутки длинных
  // Контактов и не увидеть верх — будет казаться, что таб не работает.
  useEffect(() => {
    const el = tabScrollRef.current
    if (el) el.scrollTop = 0
  }, [activeTab])

  // ── Mutations ────────────────────────────────────────────────────────────

  const handleFavoriteToggle = async () => {
    if (!candidate) return
    const next = !candidate.isFavorite
    setCandidate(prev => prev ? { ...prev, isFavorite: next } : prev)
    if (onToggleFavorite) {
      try {
        await onToggleFavorite(candidate.id, next)
      } catch {
        setCandidate(prev => prev ? { ...prev, isFavorite: !next } : prev)
        toast.error("Не удалось обновить избранное")
      }
    } else {
      try {
        const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/favorite`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFavorite: next }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setCandidate(prev => prev ? { ...prev, isFavorite: !next } : prev)
        toast.error("Не удалось обновить избранное")
      }
    }
  }

  const handleStageChange = async (newStage: string) => {
    if (!candidate || changingStage) return
    setChangingStage(newStage)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      })
      if (!res.ok) throw new Error()
      setCandidate((prev) => prev ? { ...prev, stage: newStage } : prev)
      onStageChange?.(candidate.id, newStage)
      toast.success(
        newStage === "hired" ? `🎉 ${candidate.name} нанят!` :
        newStage === "rejected" ? `${candidate.name} — отказ` :
        newStage === "interview" ? "Приглашён на интервью" :
        "Стадия обновлена"
      )
    } catch {
      toast.error("Не удалось изменить стадию")
    } finally {
      setChangingStage(null)
    }
  }

  const handleAddNote = async () => {
    if (!candidate || !noteText.trim() || savingNote) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText.trim() }),
      })
      if (!res.ok) throw new Error()
      const note = await res.json() as CandidateNote
      setNotes((prev) => [...prev, note])
      setNoteText("")
      toast.success("Заметка добавлена")
    } catch {
      toast.error("Не удалось добавить заметку")
    } finally {
      setSavingNote(false)
    }
  }

  const handleAiScore = async () => {
    if (!candidate || scoringAi) return
    setScoringAi(true)
    try {
      const res = await fetch(`/api/vacancies/${candidate.vacancyId}/score-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || "Ошибка")
      }
      const data = await res.json() as { score: number; summary: string; details: { question: string; score: number; comment: string }[] }
      setCandidate(prev => prev ? { ...prev, aiScore: data.score, aiSummary: data.summary, aiDetails: data.details } : prev)
      toast.success(`AI-скоринг: ${data.score}/100`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка AI-скоринга")
    } finally {
      setScoringAi(false)
    }
  }

  // ── Format helpers ────────────────────────────────────────────────────────

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return null
    if (min && max) return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} ₽`
    if (min) return `от ${min.toLocaleString("ru-RU")} ₽`
    return `до ${max!.toLocaleString("ru-RU")} ₽`
  }

  const stageCfg = candidate?.stage ? STAGE_LABELS[candidate.stage] : null
  const salary = formatSalary(candidate?.salaryMin ?? null, candidate?.salaryMax ?? null)
  const isHired = candidate?.stage === "hired"
  const isRejected = candidate?.stage === "rejected"

  // ── Derived: timeline / demo / answers (computed only when candidate loaded)
  const derived = useMemo(() => {
    if (!candidate) return null
    const demo = candidate.demoProgressJson as DemoProgress | null
    const demoBlocks = (demo?.blocks ?? []).filter(b => b && typeof b.blockId === "string")
    const blockMeta = buildBlockMeta(candidate.demoLessons)
    // Сабмиченные блоки (не считая synthetic __complete__)
    const realBlocks = demoBlocks.filter(b => b.blockId !== "__complete__")
    const demoTotal = demo?.totalBlocks ?? realBlocks.length
    const demoCompleted = realBlocks.filter((b) => b.status === "completed").length
    const demoPct = demoTotal > 0 ? Math.round((demoCompleted / demoTotal) * 100) : 0
    const stageHistory = (Array.isArray(candidate.stageHistory) ? candidate.stageHistory : []) as StageHistoryEntry[]
    const timeline = buildTimeline({
      candidate, stageHistory, demoBlocks: realBlocks, demoCompletedAt: demo?.completedAt, blockMeta,
    })
    const hasAnswers = (() => {
      const raw = candidate.anketaAnswers
      if (!raw) return false
      if (Array.isArray(raw)) {
        return raw.some(a => a && typeof a === "object" && (a as { blockId?: string }).blockId !== "__complete__")
      }
      if (typeof raw === "object") return Object.keys(raw).length > 0
      return false
    })()
    return { demo, demoBlocks: realBlocks, demoTotal, demoCompleted, demoPct, stageHistory, timeline, hasAnswers, blockMeta }
  }, [candidate])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          {loadingCandidate ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-40 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            </div>
          ) : candidate ? (
            <div className="flex items-start gap-4">
              <AvatarInitials name={candidate.name} size="md" />
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base font-semibold leading-tight mb-1 flex items-center gap-2">
                  <span className="truncate">{candidate.name}</span>
                  <button
                    type="button"
                    onClick={handleFavoriteToggle}
                    className={cn(
                      "shrink-0 transition-colors p-0.5",
                      candidate.isFavorite
                        ? "text-amber-400 hover:text-amber-500"
                        : "text-muted-foreground/40 hover:text-amber-400"
                    )}
                    title={candidate.isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                  >
                    <Star className={cn("w-4 h-4", candidate.isFavorite && "fill-current")} />
                  </button>
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {stageCfg && (
                    <Badge variant="outline" className={cn("text-xs border", stageCfg.color)}>
                      {stageCfg.label}
                    </Badge>
                  )}
                  <ScoreBadge score={candidate.score} />
                  <AiScoreBadge score={candidate.aiScore ?? null} onClick={() => setActiveTab("ai")} />
                </div>
              </div>
            </div>
          ) : null}
        </SheetHeader>

        {/* ── Scrollable body with tabs ───────────────────────────── */}
        {loadingCandidate ? (
          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-3 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 bg-muted rounded" />
              ))}
            </div>
          </ScrollArea>
        ) : candidate && derived ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-7 mx-3 mt-3 shrink-0 h-auto">
              <TabsTrigger value="contacts" className="text-[10px] px-1 py-1.5">Контакты</TabsTrigger>
              <TabsTrigger value="demo" className="text-[10px] px-1 py-1.5">Демо</TabsTrigger>
              <TabsTrigger value="answers" className="text-[10px] px-1 py-1.5">Ответы</TabsTrigger>
              <TabsTrigger value="chat" className="text-[10px] px-1 py-1.5">Чат hh</TabsTrigger>
              <TabsTrigger value="ai" className="text-[10px] px-1 py-1.5">AI</TabsTrigger>
              <TabsTrigger value="channels" className="text-[10px] px-1 py-1.5">Каналы</TabsTrigger>
              <TabsTrigger value="history" className="text-[10px] px-1 py-1.5">История</TabsTrigger>
            </TabsList>

            <div
              ref={tabScrollRef}
              className="flex-1 min-h-0 overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 180px)" }}
            >
              {/* ── Контакты ─────────────────────────────────────── */}
              <TabsContent value="contacts" className="px-6 py-4 pb-28 space-y-5 mt-0">
                {candidate.hhRawData ? (
                  <HhResumeInfo
                    rawData={candidate.hhRawData}
                    fallback={{
                      phone: candidate.phone,
                      email: candidate.email,
                      city: candidate.city,
                      experience: candidate.experience,
                      salaryMin: candidate.salaryMin,
                      salaryMax: candidate.salaryMax,
                    }}
                  />
                ) : (
                  (candidate.phone || candidate.email || candidate.city || candidate.experience || salary || (candidate.skills && candidate.skills.length > 0)) ? (
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Контакты</h3>
                      <div className="space-y-1.5">
                        {candidate.phone && (
                          <a href={`tel:${candidate.phone}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {candidate.phone}
                          </a>
                        )}
                        {candidate.email && (
                          <a href={`mailto:${candidate.email}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {candidate.email}
                          </a>
                        )}
                        {candidate.city && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            {candidate.city}
                          </div>
                        )}
                        {candidate.experience && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Briefcase className="w-3.5 h-3.5 shrink-0" />
                            {candidate.experience}
                          </div>
                        )}
                        {salary && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSign className="w-3.5 h-3.5 shrink-0" />
                            {salary}
                          </div>
                        )}
                      </div>
                      {candidate.skills && candidate.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {candidate.skills.map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-xs font-normal">{skill}</Badge>
                          ))}
                        </div>
                      )}
                    </section>
                  ) : null
                )}

                {(candidate.source || candidate.referredByShortId) && (
                  <>
                    <Separator />
                    <section className="space-y-1.5">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Источник</h3>
                      {candidate.source && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-foreground font-medium">{candidate.source}</span>
                        </div>
                      )}
                      {candidate.referredByShortId && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          По рекомендации от{" "}
                          <span className="text-foreground font-medium">{candidate.referredByShortId}</span>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {isHired && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400 font-medium text-center">
                    🎉 Кандидат нанят
                  </div>
                )}
                {isRejected && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive font-medium text-center">
                    Кандидат получил отказ
                  </div>
                )}

                <Separator />

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    Заметки
                  </h3>

                  {loadingNotes ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-12 bg-muted rounded" />
                      <div className="h-12 bg-muted rounded" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Заметок пока нет</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((note, i) => (
                        <div key={i} className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-1">
                          <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
                          <p className="text-[10px] text-muted-foreground">{formatDateTime(note.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Textarea
                      placeholder="Добавить заметку..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="text-sm resize-none min-h-[80px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault()
                          handleAddNote()
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      disabled={!noteText.trim() || savingNote}
                      onClick={handleAddNote}
                    >
                      {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Добавить заметку
                      <span className="text-[10px] text-primary-foreground/60 ml-1">Ctrl+Enter</span>
                    </Button>
                  </div>
                </section>
              </TabsContent>

              {/* ── Демо ─────────────────────────────────────────── */}
              <TabsContent value="demo" className="px-6 py-4 pb-28 mt-0">
                {!derived.demo || derived.demoBlocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MonitorOff className="w-10 h-10 mb-3 opacity-50" />
                    <p className="text-sm text-center">Кандидат не открывал демонстрацию должности</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-2">
                      <p className="text-sm">
                        Прошёл <span className="font-semibold text-foreground">{derived.demoCompleted}</span> из <span className="font-semibold text-foreground">{derived.demoTotal}</span> блоков · <span className="font-semibold text-foreground">{derived.demoPct}%</span>
                      </p>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            derived.demoPct === 0 ? "bg-muted-foreground/30"
                            : derived.demoPct < 50 ? "bg-orange-500"
                            : derived.demoPct < 100 ? "bg-emerald-500"
                            : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                          )}
                          style={{ width: `${derived.demoPct}%` }}
                        />
                      </div>
                    </div>

                    {derived.demo.completedAt && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400 font-medium text-center">
                        ✓ Завершено {formatDate(derived.demo.completedAt)}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {derived.demoBlocks.map((b, i) => {
                        const Icon = b.status === "completed" ? CheckCircle
                          : b.status === "skipped" ? SkipForward
                          : Clock
                        const iconColor = b.status === "completed" ? "text-emerald-500"
                          : b.status === "skipped" ? "text-muted-foreground"
                          : "text-amber-500"
                        const meta = derived.blockMeta.get(b.blockId)
                        const blockTitle = meta?.title?.trim() || `Блок ${i + 1}`
                        const endIso = b.answeredAt
                        const endMs = endIso ? Date.parse(endIso) : NaN
                        const startIso = !isNaN(endMs) && b.timeSpent && b.timeSpent > 0
                          ? new Date(endMs - b.timeSpent * 1000).toISOString()
                          : undefined
                        const dur = formatDuration(b.timeSpent)
                        return (
                          <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg border border-border/60">
                            <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", iconColor)} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground break-words">{blockTitle}</p>
                              <div className="text-[11px] text-muted-foreground space-x-2">
                                {startIso && <span>Начал: {formatTimeShort(startIso)}</span>}
                                {endIso && <span>Закончил: {formatTimeShort(endIso)}</span>}
                                {dur && <span>· {dur}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── Ответы ───────────────────────────────────────── */}
              <TabsContent value="answers" className="px-6 py-4 pb-28 mt-0">
                <AnswersTab answers={candidate.anketaAnswers} demoLessons={candidate.demoLessons} />
              </TabsContent>

              {/* ── Чат (только hh) ──────────────────────────────── */}
              <TabsContent value="chat" className="px-6 py-4 pb-28 mt-0">
                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 text-xs font-semibold">hh</div>
                      <div>
                        <p className="text-sm font-medium text-foreground">HeadHunter</p>
                        <p className="text-[11px] text-muted-foreground">Сообщения отклика</p>
                      </div>
                    </div>
                    {candidate.hhResponseId ? (
                      hhLoading ? (
                        <span className="text-[10px] text-muted-foreground/70 px-2 py-0.5 rounded-full bg-muted/40 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> загрузка
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/70 px-2 py-0.5 rounded-full bg-muted/40 tabular-nums">
                          {hhMessages.length} сообщ.
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/40">нет связи</span>
                    )}
                  </div>

                  {!candidate.hhResponseId ? (
                    <p className="text-xs text-muted-foreground italic py-2">У этого кандидата нет связанного отклика hh</p>
                  ) : hhLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground italic py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Загружаю переписку из hh...
                    </div>
                  ) : hhError ? (
                    <p className="text-xs text-muted-foreground py-2">{hhError}</p>
                  ) : (
                    <>
                      {hhMessages.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2">Пока нет сообщений. Отправь первое — кандидат увидит в hh</p>
                      ) : (
                        <div ref={hhListRef} className="space-y-2 pt-1 max-h-[50vh] overflow-y-auto pr-1 -mr-1">
                          {hhMessages.map((m) => {
                            const mine = m.authorType === "employer"
                            return (
                              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                                <div
                                  className={cn(
                                    "max-w-[80%] rounded-lg px-3 py-2 text-xs space-y-1",
                                    mine
                                      ? "bg-indigo-500/10 text-foreground border border-indigo-500/20"
                                      : "bg-muted/60 text-foreground border border-border/40"
                                  )}
                                >
                                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/80">
                                    <span>
                                      {m.createdAt
                                        ? new Date(m.createdAt).toLocaleString("ru-RU", {
                                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                          })
                                        : ""}
                                    </span>
                                    {mine && (
                                      <span title={m.viewedByOpponent ? "прочитано" : "не прочитано"}>
                                        {m.viewedByOpponent ? "✓✓" : "✓"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Input для отправки сообщения в hh */}
                      <div className="pt-2 mt-1 border-t border-border/40 space-y-2">
                        <Textarea
                          value={hhDraft}
                          onChange={(e) => setHhDraft(e.target.value)}
                          placeholder="Написать кандидату..."
                          rows={3}
                          disabled={hhSending}
                          className="text-sm resize-none min-h-[72px]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault()
                              handleSendHhMessage()
                            }
                          }}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">Ctrl+Enter — отправить</span>
                          <Button
                            size="sm"
                            className="gap-2"
                            disabled={!hhDraft.trim() || hhSending}
                            onClick={handleSendHhMessage}
                          >
                            {hhSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Отправить
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

              {/* ── AI-оценка ────────────────────────────────────── */}
              <TabsContent value="ai" className="px-6 py-4 pb-28 mt-0 space-y-4">
                {candidate.aiScore != null ? (
                  <>
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div
                        className={cn(
                          "w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold border-4",
                          aiScoreColor(candidate.aiScore),
                        )}
                      >
                        {candidate.aiScore}
                      </div>
                      <p className="text-xs text-muted-foreground">из 100</p>
                    </div>

                    {candidate.aiSummary && (
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{candidate.aiSummary}</p>
                      </div>
                    )}

                    {Array.isArray(candidate.aiDetails) && candidate.aiDetails.length > 0 && (
                      <section className="space-y-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Детали</h3>
                        {candidate.aiDetails.map((detail, i) => {
                          const detailColor =
                            detail.score >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                            detail.score >= 40 ? "text-amber-600 dark:text-amber-400" :
                            "text-destructive"
                          return (
                            <div key={i} className="p-2.5 rounded-lg bg-muted/40 border border-border/60 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-foreground">{detail.question}</span>
                                <span className={cn("text-xs font-bold", detailColor)}>{detail.score}</span>
                              </div>
                              {detail.comment && (
                                <p className="text-xs text-muted-foreground">{detail.comment}</p>
                              )}
                            </div>
                          )
                        })}
                      </section>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={scoringAi}
                      onClick={handleAiScore}
                    >
                      {scoringAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Переоценить
                    </Button>
                  </>
                ) : derived.hasAnswers ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <Sparkles className="w-10 h-10 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">Кандидат ещё не оценён</p>
                    <Button
                      size="sm"
                      className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                      disabled={scoringAi}
                      onClick={handleAiScore}
                    >
                      {scoringAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Оценить сейчас
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <FileQuestion className="w-10 h-10 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      Нет ответов на анкету — оценивать пока нечего
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ── Другие каналы ────────────────────────────────── */}
              <TabsContent value="channels" className="px-6 py-4 pb-28 mt-0 space-y-3">
                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500">
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Telegram</p>
                        <p className="text-[11px] text-muted-foreground">Личное общение</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/40">скоро</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">Когда кандидат напишет нам в Telegram — переписка появится здесь</p>
                </div>

                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">WhatsApp</p>
                        <p className="text-[11px] text-muted-foreground">Бизнес-чат</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/40">скоро</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">WhatsApp Business API — для коротких уточнений и приглашений</p>
                </div>

                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Email</p>
                        <p className="text-[11px] text-muted-foreground">Корпоративная почта</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/40">скоро</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">Отправка офферов, документов и приглашений</p>
                </div>
              </TabsContent>

              {/* ── История ──────────────────────────────────────── */}
              <TabsContent value="history" className="px-6 py-4 pb-28 mt-0">
                {derived.timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Событий пока нет</p>
                ) : (
                  <ol className="relative space-y-3 border-l border-border/60 ml-2 pl-4">
                    {derived.timeline.map((ev, i) => {
                      const Icon = ev.icon
                      return (
                        <li key={i} className="relative">
                          <span className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-background border border-border" />
                          <div className="flex items-start gap-2">
                            <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", ev.iconClass)} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">{ev.title}</p>
                              <p className="text-[11px] text-muted-foreground">{formatDateTime(ev.iso)}</p>
                              {ev.hint && (
                                <p className="text-[11px] text-muted-foreground italic mt-0.5">{ev.hint}</p>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </TabsContent>
            </div>
          </Tabs>
        ) : null}

        {/* ── Sticky footer: dropdown (secondary) + 1 primary action ───── */}
        {candidate && !isHired && !isRejected && (
          <div className="border-t bg-background px-6 py-3 shrink-0 flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 px-2.5"
                  aria-label="Дополнительные действия"
                  disabled={scoringAi || !!changingStage}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); handleAiScore() }}
                  disabled={scoringAi}
                  className="gap-2"
                >
                  {scoringAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                  {candidate.aiScore != null ? "Переоценить AI" : "Оценить AI"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); handleStageChange("rejected") }}
                  disabled={!!changingStage}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  {changingStage === "rejected" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  Отказать
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {candidate.stage !== "interview" && candidate.stage !== "final_decision" && candidate.stage !== "hired" ? (
              <Button
                size="sm"
                className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                disabled={!!changingStage}
                onClick={() => handleStageChange("interview")}
              >
                {changingStage === "interview" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                Пригласить на интервью
              </Button>
            ) : (
              <Button
                size="sm"
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!!changingStage}
                onClick={() => handleStageChange("hired")}
              >
                {changingStage === "hired" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Нанять
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
