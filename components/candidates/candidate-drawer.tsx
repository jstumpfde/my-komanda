"use client"

import { useState, useEffect, useCallback } from "react"
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
  ChevronDown,
  ChevronUp,
  MonitorOff,
  History as HistoryIcon,
  CheckCircle,
  SkipForward,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { ApiCandidate } from "@/hooks/use-candidates"

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

interface DemoBlock {
  blockId: string
  status: string
  timeSpent?: number
  answer?: unknown
  answerType?: "text" | "audio" | "video"
  question?: string
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
  scheduled: { label: "Интервью назначено", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800" },
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

  // Generate a consistent color from the name
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

function AiScoreBadge({ score, onClick }: { score: number | null; onClick?: () => void }) {
  if (score === null) return null
  const color =
    score >= 75 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
    score >= 50 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" :
    "bg-destructive/10 text-destructive border-destructive/20"
  return (
    <Badge
      variant="outline"
      className={cn("font-bold text-sm border cursor-pointer hover:opacity-80 transition-opacity", color)}
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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CandidateDrawerProps {
  candidateId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful stage change so the parent can update kanban */
  onStageChange?: (candidateId: string, newStage: string) => void
  /** Toggle favorite from outside (kanban hook). Drawer optimistically updates local state too. */
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
  const [showAiDetails, setShowAiDetails] = useState(false)

  // ── Fetch candidate details ───────────────────────────────────────────────

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
      fetchCandidate(candidateId)
      fetchNotes(candidateId)
    }
  }, [open, candidateId, fetchCandidate, fetchNotes])

  // ── Stage change ─────────────────────────────────────────────────────────

  const handleFavoriteToggle = async () => {
    if (!candidate) return
    const next = !candidate.isFavorite
    // Локально обновляем сразу
    setCandidate(prev => prev ? { ...prev, isFavorite: next } : prev)
    if (onToggleFavorite) {
      try {
        await onToggleFavorite(candidate.id, next)
      } catch {
        setCandidate(prev => prev ? { ...prev, isFavorite: !next } : prev)
        toast.error("Не удалось обновить избранное")
      }
    } else {
      // Fallback — пишем в API напрямую
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

  // ── Add note ─────────────────────────────────────────────────────────────

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

  // ── AI Scoring ───────────────────────────────────────────────────────────

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
      setShowAiDetails(true)
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

  const formatNoteDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) +
        " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    } catch {
      return iso
    }
  }

  const stageCfg = candidate?.stage ? STAGE_LABELS[candidate.stage] : null
  const salary = formatSalary(candidate?.salaryMin ?? null, candidate?.salaryMax ?? null)
  const isHired = candidate?.stage === "hired"
  const isRejected = candidate?.stage === "rejected"

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
                  <AiScoreBadge score={candidate.aiScore ?? null} onClick={() => setShowAiDetails(v => !v)} />
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
        ) : candidate ? (() => {
          const demo = candidate.demoProgressJson as DemoProgress | null
          const demoBlocks = demo?.blocks ?? []
          const demoTotal = demo?.totalBlocks ?? demoBlocks.length
          const demoCompleted = demoBlocks.filter((b) => b.status === "completed").length
          const demoPct = demoTotal > 0 ? Math.round((demoCompleted / demoTotal) * 100) : 0
          const stageHistory = ((candidate as ApiCandidate & { stageHistory?: StageHistoryEntry[] | null }).stageHistory) ?? []
          const answers = candidate.anketaAnswers ?? []

          return (
            <Tabs defaultValue="contacts" className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid grid-cols-5 mx-6 mt-3 shrink-0">
                <TabsTrigger value="contacts" className="text-xs">Контакты</TabsTrigger>
                <TabsTrigger value="demo" className="text-xs">Демо</TabsTrigger>
                <TabsTrigger value="answers" className="text-xs">Ответы</TabsTrigger>
                <TabsTrigger value="chat" className="text-xs">Чат</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">История</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                {/* ── Контакты ─────────────────────────────────────── */}
                <TabsContent value="contacts" className="px-6 py-4 space-y-5 mt-0">
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Резюме</h3>
                    <div className="space-y-1.5">
                      {candidate.source && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          Источник: <span className="text-foreground font-medium">{candidate.source}</span>
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
                      {candidate.createdAt && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          Добавлен: {new Date(candidate.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                      )}
                    </div>

                    {candidate.skills && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {candidate.skills.map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs font-normal">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </section>

                  <Separator />

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Контакты</h3>
                    <div className="space-y-1.5">
                      {candidate.phone ? (
                        <a href={`tel:${candidate.phone}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {candidate.phone}
                        </a>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground/50">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          Телефон не указан
                        </div>
                      )}
                      {candidate.email ? (
                        <a href={`mailto:${candidate.email}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {candidate.email}
                        </a>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground/50">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          Email не указан
                        </div>
                      )}
                      {candidate.city && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {candidate.city}
                        </div>
                      )}
                    </div>
                  </section>

                  {candidate.aiScore !== null && candidate.aiScore !== undefined && (
                    <>
                      <Separator />
                      <section className="space-y-2">
                        <button
                          className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                          onClick={() => setShowAiDetails(v => !v)}
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            AI-оценка
                          </span>
                          {showAiDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {showAiDetails && (
                          <div className="space-y-2">
                            {candidate.aiSummary && (
                              <p className="text-sm text-muted-foreground italic">{candidate.aiSummary}</p>
                            )}
                            {(candidate.aiDetails as { question: string; score: number; comment: string }[] | null)?.map((detail, i) => {
                              const detailColor =
                                detail.score >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                                detail.score >= 50 ? "text-amber-600 dark:text-amber-400" :
                                "text-destructive"
                              return (
                                <div key={i} className="p-2 rounded-lg bg-muted/40 border border-border/60 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-foreground">{detail.question}</span>
                                    <span className={cn("text-xs font-bold", detailColor)}>{detail.score}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{detail.comment}</p>
                                </div>
                              )
                            })}
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
                            <p className="text-[10px] text-muted-foreground">{formatNoteDate(note.createdAt)}</p>
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
                <TabsContent value="demo" className="px-6 py-4 mt-0">
                  {!demo || demoBlocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <MonitorOff className="w-10 h-10 mb-3 opacity-50" />
                      <p className="text-sm text-center">Кандидат не открывал демонстрацию должности</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-2">
                        <p className="text-sm">
                          Прошёл <span className="font-semibold text-foreground">{demoCompleted}</span> из <span className="font-semibold text-foreground">{demoTotal}</span> блоков · <span className="font-semibold text-foreground">{demoPct}%</span>
                        </p>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              demoPct === 0 ? "bg-muted-foreground/30"
                              : demoPct < 50 ? "bg-orange-500"
                              : demoPct < 100 ? "bg-emerald-500"
                              : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                            )}
                            style={{ width: `${demoPct}%` }}
                          />
                        </div>
                      </div>

                      {demo.completedAt && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400 font-medium text-center">
                          ✓ Завершено {new Date(demo.completedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {demoBlocks.map((b, i) => {
                          const Icon = b.status === "completed" ? CheckCircle
                            : b.status === "skipped" ? SkipForward
                            : Clock
                          const iconColor = b.status === "completed" ? "text-emerald-500"
                            : b.status === "skipped" ? "text-muted-foreground"
                            : "text-amber-500"
                          return (
                            <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg border border-border/60">
                              <Icon className={cn("w-4 h-4 shrink-0", iconColor)} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{b.blockId}</p>
                                {b.timeSpent != null && (
                                  <p className="text-[11px] text-muted-foreground">потратил {b.timeSpent} сек</p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ── Ответы ───────────────────────────────────────── */}
                <TabsContent value="answers" className="px-6 py-4 mt-0">
                  {/* TODO: render audio/video answers from demoProgressJson.blocks once schema includes media URLs */}
                  {answers.length > 0 ? (
                    <div className="space-y-3">
                      {answers.map((a, i) => (
                        <div key={i} className="p-3 rounded-lg border border-border/60 bg-muted/40 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{a.question}</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{a.answer}</p>
                        </div>
                      ))}
                    </div>
                  ) : demoBlocks.length > 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Ответы появятся после прохождения демонстрации
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Кандидат не отвечал на вопросы
                    </p>
                  )}
                </TabsContent>

                {/* ── Чат ────────────────────────────────────────── */}
                <TabsContent value="chat" className="px-6 py-4 mt-0">
                  <div className="space-y-3">
                    {/* hh-сообщения */}
                    <div className="rounded-lg border border-border/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 text-xs font-semibold">hh</div>
                          <div>
                            <p className="text-sm font-medium text-foreground">HeadHunter</p>
                            <p className="text-[11px] text-muted-foreground">Сообщения отклика</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/40">скоро</span>
                      </div>
                      <p className="text-xs text-muted-foreground italic">Здесь будет переписка из hh.ru — отклик кандидата, ответы, приглашения и отказы</p>
                    </div>

                    {/* Telegram */}
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

                    {/* WhatsApp */}
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

                    {/* Email */}
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

                    <p className="text-[11px] text-center text-muted-foreground/60 pt-2">
                      Все каналы общения с кандидатом в одном месте
                    </p>
                  </div>
                </TabsContent>

                {/* ── История ──────────────────────────────────────── */}
                <TabsContent value="history" className="px-6 py-4 mt-0">
                  <div className="space-y-2">
                    {candidate.source === "hh" || candidate.source === "hh.ru" ? (
                      <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/60">
                        <HistoryIcon className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">Импортирован с hh</p>
                          {candidate.createdAt && (
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(candidate.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {stageHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Перемещений по этапам ещё не было</p>
                    ) : (
                      stageHistory.map((entry, i) => {
                        const fromLabel = entry.from ? (STAGE_LABELS[entry.from]?.label ?? entry.from) : null
                        const toLabel = entry.to ? (STAGE_LABELS[entry.to]?.label ?? entry.to) : null
                        return (
                          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/60">
                            <HistoryIcon className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-sm text-foreground">
                                {fromLabel ? <>{fromLabel} <span className="text-muted-foreground">→</span> {toLabel}</> : toLabel}
                              </p>
                              {entry.at && (
                                <p className="text-[11px] text-muted-foreground">
                                  {new Date(entry.at).toLocaleString("ru-RU")}
                                </p>
                              )}
                              {entry.movedBy && (
                                <p className="text-[11px] text-muted-foreground">Перевёл: {entry.movedBy}</p>
                              )}
                              {(entry.comment || entry.reason) && (
                                <p className="text-xs text-muted-foreground italic">{entry.comment || entry.reason}</p>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )
        })() : null}

        {/* ── Sticky footer with action buttons ───────────────────── */}
        {candidate && !isHired && !isRejected && (
          <div className="border-t bg-background px-6 py-3 shrink-0 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 hover:bg-purple-500/10"
                disabled={scoringAi}
                onClick={handleAiScore}
              >
                {scoringAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {scoringAi ? "Оценка..." : "Оценить AI"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={!!changingStage}
                onClick={() => handleStageChange("rejected")}
              >
                {changingStage === "rejected" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                Отказать
              </Button>
            </div>
            {candidate.stage !== "interview" && candidate.stage !== "final_decision" && candidate.stage !== "hired" ? (
              <Button
                size="sm"
                className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                disabled={!!changingStage}
                onClick={() => handleStageChange("interview")}
              >
                {changingStage === "interview" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                Пригласить на интервью
              </Button>
            ) : (
              <Button
                size="sm"
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
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
