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
  MessageSquarePlus,
  Clock,
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

// ─── Score badge ──────────────────────────────────────────────────────────────

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
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CandidateDrawer({
  candidateId,
  open,
  onOpenChange,
  onStageChange,
}: CandidateDrawerProps) {
  const [candidate, setCandidate] = useState<ApiCandidate | null>(null)
  const [notes, setNotes] = useState<CandidateNote[]>([])
  const [loadingCandidate, setLoadingCandidate] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [changingStage, setChangingStage] = useState<string | null>(null)
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  // ── Fetch candidate details ───────────────────────────────────────────────

  const fetchCandidate = useCallback(async (id: string) => {
    setLoadingCandidate(true)
    try {
      const res = await fetch(`/api/candidates/${id}`)
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
      const res = await fetch(`/api/candidates/${id}/notes`)
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

  const handleStageChange = async (newStage: string) => {
    if (!candidate || changingStage) return
    setChangingStage(newStage)
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/stage`, {
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
        newStage === "scheduled" ? "Приглашён на интервью" :
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
      const res = await fetch(`/api/candidates/${candidate.id}/notes`, {
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
                <SheetTitle className="text-base font-semibold leading-tight mb-1">
                  {candidate.name}
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {stageCfg && (
                    <Badge variant="outline" className={cn("text-xs border", stageCfg.color)}>
                      {stageCfg.label}
                    </Badge>
                  )}
                  <ScoreBadge score={candidate.score} />
                </div>
              </div>
            </div>
          ) : null}
        </SheetHeader>

        {/* ── Scrollable body ───────────────────────────────────────── */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">

            {loadingCandidate ? (
              <div className="space-y-3 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 bg-muted rounded" />
                ))}
              </div>
            ) : candidate ? (
              <>
                {/* ── Contact info ─────────────────────────────────── */}
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

                <Separator />

                {/* ── Position info ─────────────────────────────────── */}
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

                {/* ── Stage action buttons ──────────────────────────── */}
                {!isHired && !isRejected && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Действия</h3>
                    <div className="space-y-2">
                      {candidate.stage !== "scheduled" && candidate.stage !== "interviewed" && candidate.stage !== "hired" && (
                        <Button
                          size="sm"
                          className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                          disabled={!!changingStage}
                          onClick={() => handleStageChange("scheduled")}
                        >
                          {changingStage === "scheduled" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                          Пригласить на интервью
                        </Button>
                      )}
                      {(candidate.stage === "scheduled" || candidate.stage === "interviewed") && (
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={!!changingStage}
                        onClick={() => handleStageChange("rejected")}
                      >
                        {changingStage === "rejected" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Отказать
                      </Button>
                    </div>
                  </section>
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

                {/* ── Notes ─────────────────────────────────────────── */}
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    Заметки
                  </h3>

                  {/* Existing notes */}
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

                  {/* Add note form */}
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
              </>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
