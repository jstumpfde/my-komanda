"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, Star,
  UserPlus, Archive, XCircle, Loader2, Save, CheckCircle2, Clock,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"

// ─── Types ──────────────────────────────────────────────────────────────────

interface Candidate {
  id: string
  vacancyId: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  source: string | null
  stage: string
  score: number | null
  salaryMin: number | null
  salaryMax: number | null
  experience: string | null
  skills: string[]
  demoProgressJson: { blocks?: { title: string; status: string; timeSpent?: number }[]; notes?: { text: string; createdAt: string }[] } | null
  anketaAnswers: { question: string; answer: string }[] | null
  aiScore: number | null
  aiSummary: string | null
  createdAt: string
  updatedAt: string
  vacancyTitle: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; cls: string }> = {
  new:          { label: "Новый",              cls: "bg-sky-500/15 text-sky-700" },
  demo:         { label: "Демонстрация",       cls: "bg-violet-500/15 text-violet-700" },
  scheduled:    { label: "Интервью назначено",  cls: "bg-amber-500/15 text-amber-700" },
  interviewed:  { label: "Интервью пройдено",   cls: "bg-orange-500/15 text-orange-700" },
  hired:        { label: "Нанят",              cls: "bg-emerald-500/15 text-emerald-700" },
  rejected:     { label: "Отказ",              cls: "bg-red-500/15 text-red-700" },
  decision:     { label: "Решение",            cls: "bg-amber-500/15 text-amber-700" },
  interview:    { label: "Интервью",           cls: "bg-orange-500/15 text-orange-700" },
  talent_pool:  { label: "Резерв",             cls: "bg-blue-500/15 text-blue-700" },
  pending:      { label: "Ожидание",           cls: "bg-gray-500/15 text-gray-700" },
}

const SOURCE_LABELS: Record<string, string> = {
  hh: "hh.ru", avito: "Авито", telegram: "Telegram", site: "Сайт", referral: "Реферал", manual: "Вручную", direct: "Прямой",
}

const TABS = [
  { id: "resume", label: "Резюме" },
  { id: "demo", label: "Демонстрация" },
  { id: "anketa", label: "Анкета" },
  { id: "history", label: "История" },
  { id: "notes", label: "Заметки" },
] as const

type TabId = typeof TABS[number]["id"]

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
}

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return "Не указано"
  if (min && max) return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} ₽`
  if (min) return `от ${min.toLocaleString("ru-RU")} ₽`
  return `до ${max!.toLocaleString("ru-RU")} ₽`
}

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500"
  if (score >= 40) return "bg-amber-500"
  return "bg-red-500"
}

function scoreTextColor(score: number): string {
  if (score >= 70) return "text-emerald-700"
  if (score >= 40) return "text-amber-700"
  return "text-red-700"
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>("resume")
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [stageChanging, setStageChanging] = useState(false)

  const loadCandidate = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCandidate(data)
    } catch {
      toast.error("Кандидат не найден")
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { loadCandidate() }, [loadCandidate])

  // Load notes from localStorage
  useEffect(() => {
    if (!id) return
    const saved = localStorage.getItem(`candidate-notes-${id}`)
    if (saved) setNoteText(saved)
  }, [id])

  const changeStage = async (stage: string) => {
    if (!candidate) return
    setStageChanging(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setCandidate(prev => prev ? { ...prev, stage: updated.stage } : prev)
      toast.success(`Этап изменён: ${STAGE_CONFIG[stage]?.label ?? stage}`)
    } catch { toast.error("Ошибка смены этапа") }
    finally { setStageChanging(false) }
  }

  const saveNote = () => {
    if (!noteText.trim() || !id) return
    setSavingNote(true)
    localStorage.setItem(`candidate-notes-${id}`, noteText)
    setTimeout(() => {
      setSavingNote(false)
      toast.success("Заметка сохранена")
    }, 300)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
        <Button variant="ghost" className="gap-1.5 mb-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />Назад
        </Button>
        <p className="text-muted-foreground">Кандидат не найден</p>
      </div>
    )
  }

  const stageCfg = STAGE_CONFIG[candidate.stage] ?? { label: candidate.stage, cls: "bg-muted text-muted-foreground" }
  const demoBlocks = candidate.demoProgressJson?.blocks ?? []
  const anketaAnswers = candidate.anketaAnswers ?? []

  return (
    <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
      {/* ═══ Назад ═══ */}
      <Button variant="ghost" size="sm" className="gap-1.5 mb-4 -ml-2" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4" />Назад к списку
      </Button>

      {/* ═══ Шапка ═══ */}
      <Card className="rounded-xl border border-border p-5 mb-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="w-12 h-12 shrink-0">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-base font-bold">
              {getInitials(candidate.name)}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{candidate.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-muted-foreground">
              {candidate.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{candidate.city}</span>}
              {candidate.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{candidate.email}</span>}
              {candidate.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{candidate.phone}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {candidate.source && (
                <Badge variant="outline" className="text-xs">{SOURCE_LABELS[candidate.source] ?? candidate.source}</Badge>
              )}
              <Link href={`/hr/vacancies/${candidate.vacancyId}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Briefcase className="w-3 h-3" />{candidate.vacancyTitle}
              </Link>
              <Badge variant="outline" className={cn("text-xs border-0", stageCfg.cls)}>{stageCfg.label}</Badge>
            </div>
          </div>

          {/* AI Score */}
          {candidate.aiScore != null && (
            <div className="shrink-0 text-center">
              <p className="text-xs text-muted-foreground mb-1">AI скор</p>
              <p className={cn("text-2xl font-bold", scoreTextColor(candidate.aiScore))}>{candidate.aiScore}</p>
              <div className="w-20 mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", scoreColor(candidate.aiScore))} style={{ width: `${candidate.aiScore}%` }} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => changeStage("scheduled")} disabled={stageChanging}>
              <UserPlus className="w-3.5 h-3.5" />Пригласить
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => changeStage("talent_pool")} disabled={stageChanging}>
              <Archive className="w-3.5 h-3.5" />В резерв
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => {
              if (confirm("Отказать кандидату?")) changeStage("rejected")
            }} disabled={stageChanging}>
              <XCircle className="w-3.5 h-3.5" />Отказать
            </Button>
            <Select value={candidate.stage} onValueChange={(v) => changeStage(v)}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-[var(--input-bg)]"><SelectValue placeholder="Сменить этап" /></SelectTrigger>
              <SelectContent>
                {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* ═══ Табы ═══ */}
      <div className="flex items-center gap-1 border-b border-border mb-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors -mb-px",
              activeTab === tab.id
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ Таб: Резюме ═══ */}
      {activeTab === "resume" && (
        <div className="space-y-4 max-w-3xl">
          {candidate.aiSummary && (
            <Card className="rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold">AI-резюме</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{candidate.aiSummary}</p>
            </Card>
          )}

          <Card className="rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Основная информация</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Опыт:</span> <span className="text-foreground">{candidate.experience || "Не указан"}</span></div>
              <div><span className="text-muted-foreground">Зарплата:</span> <span className="text-foreground">{formatSalary(candidate.salaryMin, candidate.salaryMax)}</span></div>
              <div><span className="text-muted-foreground">Город:</span> <span className="text-foreground">{candidate.city || "Не указан"}</span></div>
              <div><span className="text-muted-foreground">Источник:</span> <span className="text-foreground">{SOURCE_LABELS[candidate.source ?? ""] ?? candidate.source ?? "—"}</span></div>
            </div>
          </Card>

          {candidate.skills && candidate.skills.length > 0 && (
            <Card className="rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold mb-3">Навыки</h3>
              <div className="flex flex-wrap gap-1.5">
                {candidate.skills.map((skill, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══ Таб: Демонстрация ═══ */}
      {activeTab === "demo" && (
        <div className="max-w-3xl">
          <Card className="rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Прогресс демонстрации</h3>
            {demoBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Демонстрация ещё не начата</p>
            ) : (
              <div className="space-y-2">
                {demoBlocks.map((block, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg",
                    i % 2 === 0 ? "bg-background" : "bg-muted/10",
                  )}>
                    {block.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm flex-1">{block.title}</span>
                    {block.timeSpent != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(block.timeSpent / 60)} мин</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══ Таб: Анкета ═══ */}
      {activeTab === "anketa" && (
        <div className="max-w-3xl">
          <Card className="rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-3">Ответы на анкету</h3>
            {anketaAnswers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Анкета не заполнена</p>
            ) : (
              <div className="divide-y divide-border">
                {anketaAnswers.map((qa, i) => (
                  <div key={i} className="py-2.5">
                    <p className="text-xs text-muted-foreground mb-0.5">{qa.question}</p>
                    <p className="text-sm text-foreground">{qa.answer}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══ Таб: История ═══ */}
      {activeTab === "history" && (
        <div className="max-w-3xl">
          <Card className="rounded-xl border border-border p-5">
            <p className="text-sm text-muted-foreground">История действий будет доступна в следующем обновлении</p>
          </Card>
        </div>
      )}

      {/* ═══ Таб: Заметки ═══ */}
      {activeTab === "notes" && (
        <div className="max-w-3xl">
          <Card className="rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold">Заметки</h3>
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Добавьте заметку о кандидате..."
              rows={5}
              className="bg-[var(--input-bg)] border border-border rounded-lg text-sm"
            />
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" onClick={saveNote} disabled={savingNote || !noteText.trim()}>
                {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Сохранить
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
