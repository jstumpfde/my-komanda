"use client"

import React from "react"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  CalendarPlus,
  Loader2,
  Send,
  MessageSquare,
  MessageSquarePlus,
  MessageCircle,
  Sparkles,
  History as HistoryIcon,
  CheckCircle,
  X,
  FileQuestion,
  Play,
  RotateCcw,
  Pencil,
  Trash2,
  EyeOff,
  Eye,
  Maximize2,
  Minimize2,
  PhoneCall,
  Car,
  Globe2,
  Languages,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  contactChannelLabel,
  contactOutcomeLabel,
  type ContactChannel,
  type ContactOutcome,
} from "@/lib/hr/contacts"
import { cn } from "@/lib/utils"
import { EditableMessagePreview } from "@/components/candidates/editable-message-preview"
import { useAuth } from "@/lib/auth"
import {
  getStageLabel,
  getStageColorClasses,
  ALL_STAGE_SLUGS,
  type VacancyPipelineV2,
} from "@/lib/stages"
import {
  REJECTION_INITIATORS,
  REJECTION_REASONS,
  rejectionReasonLabel,
  rejectionInitiatorLabel,
} from "@/lib/hr/rejection-reasons"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import type { ApiCandidate } from "@/hooks/use-candidates"
import type { Lesson, Block } from "@/lib/course-types"
import { AnswersTab } from "./answers-tab"
import { TestTab } from "./test-tab"
import { HhResumeInfo } from "./hh-resume-info"
import { AiMatchCardV2 } from "./ai-match-card-v2"
import { getBlockScore } from "@/lib/demo/block-scores"
import {
  generateCriteriaFromSpec,
  computeAutoScore,
  resolveInterviewScore,
  type ScorecardCriterion,
  type ScorecardVerdict,
} from "@/lib/candidates/interview-scorecard"
import type { CandidateSpec } from "@/lib/core/spec/types"

// ─── Contact log type ────────────────────────────────────────────────────────

interface CandidateContact {
  id: string
  channel: ContactChannel
  outcome: ContactOutcome
  reasonCategory: string | null
  comment: string | null
  createdAt: string
  createdById: string | null
  createdByName: string | null
}

// ─── Note type ────────────────────────────────────────────────────────────────

interface CandidateNote {
  text: string
  createdAt: string
  authorId?: string
}

// ─── Interview outcome (Воронка v2 Фаза 2) ────────────────────────────────────

type InterviewOutcomeValue = "held" | "no_show" | "rescheduled"
type InterviewDecisionValue = "advance" | "offer" | "reject" | "reserve"

interface CandidateInterviewEvent {
  id: string
  title: string
  startAt: string
  endAt: string
  interviewer: string | null
  interviewType: string | null
  interviewFormat: string | null
  interviewStatus: string | null
  location: string | null
  meetingUrl: string | null
  interviewOutcome: InterviewOutcomeValue | null
  interviewRating: number | null
  interviewDecision: InterviewDecisionValue | null
  interviewNotes: string | null
  interviewOutcomeAt: string | null
}

const INTERVIEW_OUTCOME_OPTIONS: { id: InterviewOutcomeValue; label: string }[] = [
  { id: "held", label: "Состоялось" },
  { id: "no_show", label: "Не явился" },
  { id: "rescheduled", label: "Перенесено" },
]

const INTERVIEW_DECISION_OPTIONS: { id: InterviewDecisionValue; label: string }[] = [
  { id: "advance", label: "Дальше" },
  { id: "offer", label: "Оффер" },
  { id: "reject", label: "Отказ" },
  { id: "reserve", label: "В резерв" },
]

function interviewOutcomeLabel(v: string | null): string {
  return INTERVIEW_OUTCOME_OPTIONS.find(o => o.id === v)?.label ?? "—"
}

function interviewDecisionLabel(v: string | null): string {
  return INTERVIEW_DECISION_OPTIONS.find(o => o.id === v)?.label ?? "—"
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

// Быстрые шаблоны «поправки»: удалить сообщение из чата hh нельзя (API hh не даёт),
// поэтому исправляем отправкой корректирующего сообщения вдогонку. Шаблон подставляется
// в поле ввода — HR дополняет нужным и отправляет.
const CORRECTION_TEMPLATES: { label: string; text: string }[] = [
  { label: "Неактуальная ссылка", text: "Прошу прощения, в предыдущем сообщении была неактуальная ссылка. Актуальная ссылка: " },
  { label: "Ошибка / опечатка",   text: "Прошу прощения за предыдущее сообщение — в нём была ошибка. Корректная информация: " },
  { label: "Неверное обращение",  text: "Прошу прощения, в прошлом сообщении ошибочно указано имя. " },
  { label: "Не то сообщение",     text: "Прошу прощения, предыдущее сообщение было отправлено по ошибке — его можно проигнорировать. " },
]

// F8: «скрыть у себя» — id скрытых сообщений чата теперь хранятся на сервере
// (candidates.hidden_chat_msg_ids), а не в localStorage. Косметическое скрытие на
// нашей стороне (у кандидата в hh сообщение остаётся). Инициализация — из данных
// кандидата; запись — PUT /candidates/[id]/hidden-messages.

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

// ─── Survey contacts (из анкетной формы) ──────────────────────────────────────

// candidates.survey_responses — снимок того, что кандидат указал в анкете
// при заполнении формы по демо-токену. Хранится отдельно от anketa_answers
// (там массив демо-блоков, не контакты). Поля могут отличаться от
// hh-данных в основной карточке — показываем выделенным блоком в UI.
interface SurveyContacts {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  city?: string
  birthDate?: string
  telegram?: string
  portfolioUrl?: string
  hhUrl?: string
  otherLinks?: string
  experienceSummary?: string
  employmentPreference?: string
  niches?: string
}

const SURVEY_KEYS: (keyof SurveyContacts)[] = [
  "firstName", "lastName", "phone", "email", "city", "birthDate",
  "telegram", "portfolioUrl", "hhUrl", "otherLinks",
  "experienceSummary", "employmentPreference", "niches",
]

function pickSurveyContacts(answers: unknown): SurveyContacts | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null
  const o = answers as Record<string, unknown>
  const result: SurveyContacts = {}
  for (const k of SURVEY_KEYS) {
    const v = o[k]
    if (typeof v === "string" && v.trim().length > 0) {
      result[k] = v.trim()
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

function SurveyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="text-foreground break-words min-w-0 flex-1">{children}</span>
    </div>
  )
}

function SurveyContactsBlock({ contacts: sc }: { contacts: SurveyContacts }) {
  const fullName = `${sc.firstName ?? ""} ${sc.lastName ?? ""}`.trim()
  // Выделенный блок: данные кандидата из анкеты. Они могут отличаться от
  // основных контактов на вкладке «Контакты», если карточка привязана к hh —
  // там источник истины hh.ru, здесь — то, что кандидат сам указал в форме.
  return (
    <div className="rounded-lg border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
      <div>
        <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
          Данные из анкеты
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Что кандидат указал при заполнении (отдельно от основных контактов)
        </p>
      </div>
      <div className="space-y-1 text-sm">
        {fullName && <SurveyRow label="Имя">{fullName}</SurveyRow>}
        {sc.phone && (
          <SurveyRow label="Телефон">
            <a href={`tel:${sc.phone}`} className="hover:text-primary">{sc.phone}</a>
          </SurveyRow>
        )}
        {sc.email && (
          <SurveyRow label="Email">
            <a href={`mailto:${sc.email}`} className="hover:text-primary">{sc.email}</a>
          </SurveyRow>
        )}
        {sc.city && <SurveyRow label="Город">{sc.city}</SurveyRow>}
        {sc.birthDate && <SurveyRow label="Дата рождения">{sc.birthDate}</SurveyRow>}
        {sc.telegram && <SurveyRow label="Telegram">{sc.telegram}</SurveyRow>}
        {sc.portfolioUrl && (
          <SurveyRow label="Портфолио">
            <a href={sc.portfolioUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline-offset-2 hover:underline break-all">{sc.portfolioUrl}</a>
          </SurveyRow>
        )}
        {sc.hhUrl && (
          <SurveyRow label="hh.ru">
            <a href={sc.hhUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline-offset-2 hover:underline break-all">{sc.hhUrl}</a>
          </SurveyRow>
        )}
        {sc.otherLinks && (
          <SurveyRow label="Другие ссылки">
            <span className="whitespace-pre-wrap">{sc.otherLinks}</span>
          </SurveyRow>
        )}
        {sc.experienceSummary && (
          <SurveyRow label="Опыт">
            <span className="whitespace-pre-wrap">{sc.experienceSummary}</span>
          </SurveyRow>
        )}
        {sc.employmentPreference && (
          <SurveyRow label="Формат работы">
            <span className="whitespace-pre-wrap">{sc.employmentPreference}</span>
          </SurveyRow>
        )}
        {sc.niches && (
          <SurveyRow label="Ниши">
            <span className="whitespace-pre-wrap">{sc.niches}</span>
          </SurveyRow>
        )}
      </div>
    </div>
  )
}

// ─── Stage config ─────────────────────────────────────────────────────────────

// Ф2: STAGE_LABELS удалён. Источник правды — lib/stages.ts.
// Лейбл/цвет — getStageLabel(slug, vacancyPipeline) и getStageColorClasses(slug, vacancyPipeline).
// vacancyPipeline передаётся через props CandidateDrawer; если null —
// используются дефолтные значения из PLATFORM_STAGES.

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

// ─── Панель «Оценки» (вверху карточки) ────────────────────────────────────────
// ЕДИНСТВЕННОЕ место с баллами кандидата (бейджи из шапки убраны — дублировали
// и сдвигали контент). Карточки в ОДИН РЯД: крупный балл · название · «что
// измеряет» одной фразой. Клик по карточке разворачивает «почему» (детали из
// *_details) под всем рядом. Отсутствующие оценки не показываются; когда
// появится балл «Интервью» — добавить элемент в items, ряд растянется сам.

function scoreTone(score: number) {
  if (score > 70) return "text-success"
  if (score >= 40) return "text-warning"
  return "text-destructive"
}

function ScoresPanel({ candidate }: { candidate: ApiCandidate }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const resumeScore = candidate.resumeScore ?? null
  const answersScore = candidate.demoAnswersScore ?? null
  const testScore = candidate.testScore ?? null
  // Индикатор прогресса частей анкеты "N/M" (Вариант Б, единый балл 05.07):
  // показываем ТОЛЬКО когда у вакансии есть 2-я часть (partsTotal >= 2).
  const anketaPartsTotal = candidate.anketaPartsTotal ?? 0
  const anketaPartsAnswered = candidate.anketaPartsAnswered ?? 0
  const hasAnketaParts = anketaPartsTotal >= 2

  const answerDetails = Array.isArray(candidate.demoAnswersDetails) ? candidate.demoAnswersDetails : []
  const resumeSummary = typeof candidate.aiSummary === "string" ? candidate.aiSummary.trim() : ""
  // Осевой разбор резюме (spec.scoringMode="axes"): оси score→баллы + штрафы + summary.
  const breakdown = candidate.aiScoreBreakdown ?? null
  const breakdownAxes = Array.isArray(breakdown?.axes) ? breakdown!.axes : []
  const breakdownPenalties = Array.isArray(breakdown?.penalties) ? breakdown!.penalties.filter(p => p.triggered) : []
  const breakdownSummary = typeof breakdown?.summary === "string" ? breakdown.summary.trim() : ""

  // Ни одной оценки — панель не показываем. (aiScoreV2/осевой балл сюда больше не
  // входит 05.07 — своей карточки в этом ряду у него больше нет, см. cards ниже.)
  if (resumeScore == null && answersScore == null && testScore == null) {
    return null
  }

  const resumeHasDetails = resumeSummary.length > 0 || breakdownAxes.length > 0 || breakdownPenalties.length > 0 || breakdownSummary.length > 0
  const answersHasDetails = answerDetails.length > 0
  const testStatusLabel: Record<string, string> = {
    submitted: "сдан", in_progress: "пишет", opened: "перешёл", sent: "отправлен", failed: "ошибка отправки",
  }
  const testHint = candidate.testStatus ? testStatusLabel[candidate.testStatus] : null

  // Детали «почему» — разворачиваются под рядом карточек.
  const resumeDetailsNode = (
    <>
      {/* Осевой разбор (Портрет, scoringMode="axes"): почему такой балл. */}
      {breakdownAxes.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">По осям</div>
          <ul className="space-y-1">
            {breakdownAxes.map((a) => (
              <li key={a.key} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 text-foreground/90">{a.label}</span>
                  <span className={cn("shrink-0 text-sm font-bold tabular-nums", scoreTone(a.score))}>
                    {a.score}<span className="text-[11px] font-normal text-muted-foreground">→{a.points} б.</span>
                  </span>
                </div>
                {a.evidence && <p className="text-[11px] leading-snug text-muted-foreground">{a.evidence}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {breakdownPenalties.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-destructive flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Штрафы «Не подходит»
          </div>
          <ul className="space-y-0.5">
            {breakdownPenalties.map((p, i) => (
              <li key={i} className="space-y-0.5">
                <div className="flex gap-1.5">
                  <span className="shrink-0 font-semibold text-destructive tabular-nums">−{p.applied}</span>
                  <span className="min-w-0 text-foreground/90">{p.text}</span>
                </div>
                {p.evidence && <p className="pl-6 text-[11px] leading-snug text-muted-foreground">{p.evidence}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(breakdownSummary || resumeSummary) && (
        <p className="text-foreground/90 whitespace-pre-wrap">{breakdownSummary || resumeSummary}</p>
      )}
    </>
  )

  const answersDetailsNode = (
    <ul className="space-y-2">
      {answerDetails.map((d, i) => (
        <li key={i} className="space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-foreground/90 min-w-0 flex-1">{d.questionText}</span>
            <span className={cn("shrink-0 text-sm font-bold tabular-nums", scoreTone(Math.round((d.awarded / (d.max || 1)) * 100)))}>{d.awarded}/{d.max}</span>
          </div>
          {d.comment && <p className="text-[12px] text-muted-foreground">{d.comment}</p>}
        </li>
      ))}
    </ul>
  )

  type ScoreCard = {
    key: string; title: string; caption: string
    score: number; hasDetails: boolean; details: React.ReactNode
    /** Индикатор прогресса частей "N/M" (только карточка «Анкета», Вариант Б). */
    partsBadge?: string; partsTooltip?: string
  }
  const cards = ([
    // Пользовательская сущность оценки — ОДНА, «Портрет» (resumeScore). Отдельная
    // карточка «AI-Портрет» (осевой балл v2, aiScoreV2) убрана из этого ряда 05.07 —
    // консолидация Юрия: осевой балл больше не светится как вторая оценка в шапке,
    // он остался справочно внутри таба «Портрет» (AiMatchCardV2 → «Осевой балл (справочно)»).
    { key: "resume", title: "Портрет", caption: "Оценка по Портрету вакансии", score: resumeScore, hasDetails: resumeHasDetails, details: resumeDetailsNode },
    {
      key: "answers", title: "Анкета", caption: "Качество ответов в анкете демо", score: answersScore, hasDetails: answersHasDetails, details: answersDetailsNode,
      partsBadge: hasAnketaParts ? `${anketaPartsAnswered}/${anketaPartsTotal}` : undefined,
      partsTooltip: `Единый балл по отвеченным вопросам · часть 1: ${getBlockScore(candidate, 1) ?? "—"} · часть 2: ${getBlockScore(candidate, 2) ?? "—"}`,
    },
    { key: "test", title: "Тест", caption: testHint ? `Тестовое задание (${testHint})` : "Результат тестового задания", score: testScore, hasDetails: false, details: null },
    // Сюда же встанет карточка «Интервью», когда появится балл интервью.
  ] as Array<Omit<ScoreCard, "score"> & { score: number | null }>)
    .filter((c): c is ScoreCard => c.score != null)

  const open = cards.find((c) => c.key === openKey && c.hasDetails) ?? null

  return (
    <div className="mx-3 mt-3 shrink-0 rounded-lg border border-border/70 bg-muted/30 p-2">
      <div className="grid gap-1.5 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={!c.hasDetails}
            onClick={() => setOpenKey((k) => (k === c.key ? null : c.key))}
            title={c.partsBadge ? c.partsTooltip : c.caption}
            className={cn(
              "rounded-md border border-border/60 bg-background/50 px-2.5 py-2 text-left",
              c.hasDetails && "hover:bg-accent/40 transition-colors cursor-pointer",
              open?.key === c.key && "border-primary/50 bg-accent/30",
            )}
          >
            <span className="flex items-center justify-between gap-1.5">
              <span className={cn("text-2xl font-bold tabular-nums leading-none", scoreTone(c.score))}>{c.score}</span>
              <span className="flex items-center gap-1 shrink-0">
                {c.partsBadge && (
                  // Юрий 05.07: контраст выровнен по прецеденту списка кандидатов
                  // (list-view.tsx) — 10px + secondary-foreground вместо приглушённого.
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-secondary-foreground font-medium tabular-nums">
                    {c.partsBadge}
                  </span>
                )}
                {c.hasDetails && (open?.key === c.key
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />)}
              </span>
            </span>
            <span className="mt-1 block text-xs font-medium text-foreground">{c.title}</span>
            <span className="block text-[10px] leading-snug text-muted-foreground line-clamp-2">{c.caption}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="mt-1.5 rounded-md border border-border/60 bg-background/50 px-3 py-2.5 space-y-2 text-sm">
          {open.details}
        </div>
      )}
    </div>
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
  vacancyPipeline: VacancyPipelineV2 | null | undefined
}): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const { candidate, stageHistory, demoBlocks, demoCompletedAt, blockMeta, vacancyPipeline } = args

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
    const fromLabel = entry.from ? getStageLabel(entry.from, vacancyPipeline) : null
    const toLabel = entry.to ? getStageLabel(entry.to, vacancyPipeline) : null
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

  return events.sort((a, b) => a.at - b.at)
}

// ─── Props ────────────────────────────────────────────────────────────────────

/** Краткая сводка кандидата — достаточно чтобы мгновенно отрисовать шапку
 *  до завершения полного fetch. Передаётся из списка (где данные уже есть). */
export interface InitialCandidateSnapshot {
  id: string
  name: string
  photoUrl?: string | null
  stage: string
  vacancyTitle?: string
  city?: string | null
  source?: string | null
  aiScore?: number | null
  aiScoreV2?: number | null
  resumeScore?: number | null
  isFavorite?: boolean
}

export interface CandidateDrawerProps {
  candidateId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStageChange?: (candidateId: string, newStage: string) => void
  onToggleFavorite?: (candidateId: string, isFavorite: boolean) => void | Promise<void>
  /**
   * Pipeline текущей вакансии для отображения кастомных лейблов/цветов стадий.
   * Если null/undefined — используются дефолты из lib/stages.ts.
   * См. parsePipeline(vacancy.descriptionJson?.pipeline) на стороне родителя.
   */
  vacancyPipeline?: VacancyPipelineV2 | null
  /**
   * #42: единый список стадий вакансии (источник = воронка v2 / pipeline).
   * Если задан — дропдаун «Стадия» рендерит именно его (плюс негативные
   * «Отказ»/«Отказался»); если нет — fallback на ALL_STAGE_SLUGS.
   * Считается родителем через resolveVacancyStageOptions() (lib/stages.ts).
   */
  stageOptions?: { slug: string; label: string }[] | null
  /** VA4: AI-критерии вакансии — показываются в табе «AI-оценка» как контекст. */
  vacancyAnketa?: {
    aiIdealProfile?: string | null
    aiRequiredHardSkills?: string[] | null
    aiStopFactors?: string[] | null
  } | null
  /**
   * Краткая сводка кандидата из списка — показывается в шапке мгновенно,
   * пока загружаются полные данные. Необязательный, обратная совместимость.
   */
  initialCandidate?: InitialCandidateSnapshot | null
  /** Вкладка, на которой открыть карточку (напр. "test" — сразу к результату теста). */
  initialTab?: string | null
  /**
   * modal=false — открывать карточку НЕ модально (Radix Dialog): без блокирующего
   * фокус-трапа и с непрозрачным для кликов фоном. Нужно, когда карточка открыта
   * ПОВЕРХ другого интерактивного окна (глобальный виджет «Чаты»), которое должно
   * оставаться кликабельным одновременно с открытой карточкой. По умолчанию true
   * (обычное модальное поведение — как было).
   */
  modal?: boolean
  /**
   * Вид интервью по умолчанию для диалога «Пригласить на интервью» —
   * достаётся из стадии action="interview" воронки v2 текущей вакансии
   * (funnelV2.stages[].interviewMode). Если не задан — используется 'zoom'.
   */
  defaultInterviewMode?: "phone" | "zoom" | "office" | null
}

// Ищем URL видео-визитки в anketaAnswers. Структура такая же, как
// та, по которой считается hasVideoVizitka (см. api/.../answer/route.ts):
// answers — массив или Record; у каждого entry поле answer = { mediaType: "video", url }.
function findVideoVizitkaUrl(answers: unknown): string | null {
  if (!answers) return null
  const list: unknown[] = Array.isArray(answers)
    ? answers
    : typeof answers === "object" ? Object.values(answers as Record<string, unknown>) : []
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue
    const ans = (entry as { answer?: unknown }).answer
    if (!ans || typeof ans !== "object") continue
    const a = ans as Record<string, unknown>
    if (a.mediaType === "video" && typeof a.url === "string" && a.url.length > 0) {
      return a.url
    }
  }
  return null
}

// ─── Main component ───────────────────────────────────────────────────────────


// Предохранитель карточки (Юрий 04.07: «Что-то пошло не так» на весь экран при
// быстром переключении табов). Ловит рендер-ошибку контента таба и показывает
// мягкий ретрай внутри карточки, не убивая страницу. Сбрасывается сменой ключа.
class DrawerTabBoundary extends React.Component<{ resetKey: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.error("[candidate-drawer] tab crashed:", err) }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="px-6 py-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Не удалось отобразить вкладку.</p>
          <button
            type="button"
            className="text-sm text-primary underline underline-offset-2"
            onClick={() => this.setState({ failed: false })}
          >Попробовать снова</button>
        </div>
      )
    }
    return this.props.children
  }
}

export function CandidateDrawer({
  candidateId,
  open,
  onOpenChange,
  onStageChange,
  onToggleFavorite,
  vacancyPipeline,
  stageOptions,
  vacancyAnketa,
  initialCandidate,
  initialTab,
  modal = true,
  defaultInterviewMode,
}: CandidateDrawerProps) {
  const { user } = useAuth()
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [candidate, setCandidate] = useState<ApiCandidate | null>(null)
  // Notes хранятся в demo_progress_json у самого кандидата — отдельный
  // /notes-запрос сделал бы тот же select, поэтому держим notes как локальное
  // состояние, инициализируемое из candidate.demoProgressJson.notes.
  const [notes, setNotes] = useState<CandidateNote[]>([])
  const [loadingCandidate, setLoadingCandidate] = useState(false)
  const [changingStage, setChangingStage] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false)
  const [restoreTargetStage, setRestoreTargetStage] = useState<string | null>(null)
  const [confirmInterviewOpen, setConfirmInterviewOpen] = useState(false)
  // #30/#31: диалог приглашения на интервью с двумя режимами и редактируемым
  // превью. mode 'link' — ссылка на самозапись (/schedule); mode 'slots' —
  // HR выбирает 2-3 конкретных времени из окон вакансии.
  const [inviteMode, setInviteMode] = useState<"link" | "slots">("link")
  // Вид встречи (Звонок/Онлайн/В офис) — передаётся в PUT stage interviewMode.
  // Дефолт — вид из воронки (defaultInterviewMode), иначе 'zoom'.
  const [inviteMeetMode, setInviteMeetMode] = useState<"phone" | "zoom" | "office">(defaultInterviewMode ?? "zoom")
  const [inviteText, setInviteText] = useState("")            // разовый текст для этого кандидата
  const [inviteTemplate, setInviteTemplate] = useState("")    // текущий шаблон вакансии (для сравнения/сейва)
  const [inviteDefaultText, setInviteDefaultText] = useState("")
  const [inviteScheduleLink, setInviteScheduleLink] = useState("")
  const [inviteVacancyTitle, setInviteVacancyTitle] = useState("")
  const [inviteFirstName, setInviteFirstName] = useState("")
  const [inviteTzLabel, setInviteTzLabel] = useState("")
  const [inviteDays, setInviteDays] = useState<{ date: string; label: string; slots: string[] }[]>([])
  const [inviteSelectedSlots, setInviteSelectedSlots] = useState<string[]>([]) // "YYYY-MM-DD|HH:MM"
  const [inviteLoading, setInviteLoading] = useState(false)
  // #1: «Запланировать интервью» из карточки — создаёт событие календаря,
  // привязанное к кандидату+вакансии (появляется в табе «Интервью»).
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [schedDate, setSchedDate] = useState("")
  const [schedTime, setSchedTime] = useState("10:00")
  const [schedDur, setSchedDur] = useState("45")
  const [schedInterviewer, setSchedInterviewer] = useState("")
  const [schedCurrentUser, setSchedCurrentUser] = useState<string>("")
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false)
  const [rejectInitiator, setRejectInitiator] = useState("company")
  const [rejectReason, setRejectReason] = useState("")
  const [rejectComment, setRejectComment] = useState("")
  // Инлайн-редактирование имени (например, для анонимных «Новый кандидат»).
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [savingName, setSavingName] = useState(false)
  const startEditName = () => { setNameDraft(candidate?.name ?? ""); setEditingName(true) }
  const saveName = async () => {
    if (!candidate) return
    const next = nameDraft.trim()
    if (!next || next === candidate.name) { setEditingName(false); return }
    setSavingName(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }),
      })
      if (!res.ok) throw new Error()
      setCandidate((prev) => prev ? { ...prev, name: next } : prev)
      setEditingName(false)
      toast.success("Имя сохранено")
    } catch { toast.error("Не удалось сохранить имя") } finally { setSavingName(false) }
  }
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [scoringAi, setScoringAi] = useState(false)
  const [scoringPortrait, setScoringPortrait] = useState(false)

  // Лог контактов
  const [contacts, setContacts] = useState<CandidateContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [contactChannel, setContactChannel] = useState<ContactChannel>("call")
  const [contactOutcome, setContactOutcome] = useState<ContactOutcome>("pending")
  const [contactReason, setContactReason] = useState("")
  const [contactComment, setContactComment] = useState("")
  const [savingContact, setSavingContact] = useState(false)
  // #33: редактирование существующей записи контакта (автором).
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [editChannel, setEditChannel] = useState<ContactChannel>("call")
  const [editOutcome, setEditOutcome] = useState<ContactOutcome>("pending")
  const [editReason, setEditReason] = useState("")
  const [editComment, setEditComment] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  // Итоги интервью (Воронка v2 Фаза 2)
  const [interviewEvents, setInterviewEvents] = useState<CandidateInterviewEvent[]>([])
  const [interviewEventsLoading, setInterviewEventsLoading] = useState(false)
  const [editingOutcomeEventId, setEditingOutcomeEventId] = useState<string | null>(null)
  const [outcomeValue, setOutcomeValue] = useState<InterviewOutcomeValue | "">("")
  const [ratingValue, setRatingValue] = useState<number | null>(null)
  const [decisionValue, setDecisionValue] = useState<InterviewDecisionValue | "">("")
  const [notesValue, setNotesValue] = useState("")
  const [savingOutcome, setSavingOutcome] = useState(false)

  // ── Скоркарта интервью (дизайн координатора, одобрен Юрием 05.07) ─────────
  const [scorecardCriteria, setScorecardCriteria] = useState<ScorecardCriterion[]>([])
  const [scorecardManualOverride, setScorecardManualOverride] = useState<number | null>(null)
  const [scorecardAutoScore, setScorecardAutoScore] = useState<number | null>(null)
  const [scorecardLoading, setScorecardLoading] = useState(false)
  const [scorecardSaving, setScorecardSaving] = useState(false)
  const [scorecardOverrideDraft, setScorecardOverrideDraft] = useState("")
  const [scorecardDecisionSaving, setScorecardDecisionSaving] = useState<InterviewDecisionValue | null>(null)
  const [scorecardRejectReasonOpen, setScorecardRejectReasonOpen] = useState(false)
  const [scorecardRejectReason, setScorecardRejectReason] = useState("")
  const [scorecardRejectComment, setScorecardRejectComment] = useState("")
  const scorecardInitializedFor = useRef<string | null>(null)

  const [activeTab, setActiveTab] = useState("contacts")
  // Открыть карточку на заданной вкладке (напр. клик по колонке «Тест» → результат теста).
  useEffect(() => {
    if (open && initialTab) setActiveTab(initialTab)
  }, [open, initialTab])
  const [hhMessages, setHhMessages] = useState<HhMessage[]>([])
  const [hhLoading, setHhLoading] = useState(false)
  const [hhError, setHhError] = useState<string | null>(null)
  const [hhDraft, setHhDraft] = useState("")
  const [hhSending, setHhSending] = useState(false)
  // hh-токен жив? false → показываем сохранённую переписку + плашку «не подключён».
  const [hhConnected, setHhConnected] = useState(true)
  // F8: «скрыть у себя» — серверное хранение (постоянно, на всех устройствах).
  const [hiddenMsgIds, setHiddenMsgIds] = useState<Set<string>>(new Set())
  const [showHiddenMsgs, setShowHiddenMsgs] = useState(false)
  const toggleHiddenMsg = useCallback((id: string) => {
    if (!candidateId) return
    setHiddenMsgIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // Оптимистично + сохраняем полный набор на сервере (fire-and-forget).
      fetch(`/api/modules/hr/candidates/${candidateId}/hidden-messages`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...next] }),
      }).catch(() => {})
      return next
    })
  }, [candidateId])
  // F8: при загрузке/смене кандидата подхватываем скрытые id с сервера.
  useEffect(() => {
    const ids = candidate?.hiddenChatMsgIds
    setHiddenMsgIds(new Set(Array.isArray(ids) ? ids : []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id])
  const hhFetchRef = useRef<string | null>(null)
  const hhListRef = useRef<HTMLDivElement | null>(null)
  const hhInputRef = useRef<HTMLTextAreaElement | null>(null)
  // «Изменить» отправленное: hh API НЕ даёт редактировать сообщение —
  // единственный честный способ — отправить поправку вдогонку. Клик по «Изменить»
  // подставляет корректирующий шаблон в поле ввода и ставит фокус; HR дополняет и шлёт.
  const startCorrection = useCallback((msg: HhMessage) => {
    const quoted = msg.text.length > 80 ? `${msg.text.slice(0, 80)}…` : msg.text
    setHhDraft(`Прошу прощения, поправлю предыдущее сообщение («${quoted}»). Корректно: `)
    // Даём React перерисовать, затем фокус + курсор в конец.
    requestAnimationFrame(() => {
      const el = hhInputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    })
  }, [])
  const tabScrollRef = useRef<HTMLDivElement | null>(null)

  // F7: Telegram-канал — состояние
  const [tgInviteLink,   setTgInviteLink]   = useState<string | null>(null)
  const [tgInviteLoading, setTgInviteLoading] = useState(false)
  const [tgDraft,        setTgDraft]        = useState("")
  const [tgSending,      setTgSending]      = useState(false)
  const [tgMessages,     setTgMessages]     = useState<import("@/lib/db/schema").TgMessage[]>([])

  // ── Стадии каналов (hh, авито и др.) — загружаются лениво при открытии таба «Каналы» ──
  // Читаемые лейблы каналов; неизвестный ключ показываем как есть (capitalize).
  const CHANNEL_LABELS: Record<string, string> = {
    hh:       "hh.ru",
    avito:    "Авито",
    telegram: "Telegram",
    site:     "Сайт",
    referral: "Реферал",
    manual:   "Вручную",
  }
  const channelLabel = (channel: string): string =>
    CHANNEL_LABELS[channel.toLowerCase()] ?? (channel.charAt(0).toUpperCase() + channel.slice(1))
  type ChannelStage = { channel: string; stageId: string; stageLabel: string }
  const [channelStages,        setChannelStages]        = useState<ChannelStage[]>([])
  const [channelStagesLoading, setChannelStagesLoading] = useState(false)
  const [channelStagesError,   setChannelStagesError]   = useState<string | null>(null)
  const channelStagesFetchedFor = useRef<string | null>(null)

  const fetchCandidate = useCallback(async (id: string) => {
    setLoadingCandidate(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}`)
      if (!res.ok) throw new Error("Not found")
      const data = await res.json() as ApiCandidate
      setCandidate(data)
      // Инициализация notes из тех же данных — без отдельного round-trip.
      const dp = data.demoProgressJson as { notes?: CandidateNote[] } | null
      setNotes(Array.isArray(dp?.notes) ? dp.notes : [])
      // F7: инициализация TG-истории
      setTgMessages(Array.isArray(data.tgMessages) ? data.tgMessages : [])
    } catch {
      toast.error("Не удалось загрузить данные кандидата")
    } finally {
      setLoadingCandidate(false)
    }
  }, [])

  const loadContacts = useCallback(async (id: string) => {
    setContactsLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${id}/contacts`)
      if (!res.ok) throw new Error()
      const data = await res.json() as { contacts: CandidateContact[] }
      setContacts(data.contacts ?? [])
    } catch {
      // не критично
    } finally {
      setContactsLoading(false)
    }
  }, [])

  const submitContact = async () => {
    if (!candidateId) return
    setSavingContact(true)
    try {
      const body: Record<string, unknown> = { channel: contactChannel, outcome: contactOutcome }
      if (contactOutcome === "no_fit" && contactReason) body.reasonCategory = contactReason
      if (contactComment.trim()) body.comment = contactComment.trim()
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success("Контакт записан")
      setContactDialogOpen(false)
      setContactChannel("call")
      setContactOutcome("pending")
      setContactReason("")
      setContactComment("")
      await loadContacts(candidateId)
    } catch {
      toast.error("Не удалось сохранить контакт")
    } finally {
      setSavingContact(false)
    }
  }

  // #33: открыть/закрыть режим правки записи контакта.
  const startEditContact = (c: CandidateContact) => {
    setEditingContactId(c.id)
    setEditChannel(c.channel)
    setEditOutcome(c.outcome)
    setEditReason(c.reasonCategory ?? "")
    setEditComment(c.comment ?? "")
  }
  const cancelEditContact = () => {
    setEditingContactId(null)
  }
  const saveEditContact = async () => {
    if (!candidateId || !editingContactId) return
    setSavingEdit(true)
    try {
      const body: Record<string, unknown> = {
        contactId: editingContactId,
        channel: editChannel,
        outcome: editOutcome,
        reasonCategory: editOutcome === "no_fit" ? (editReason || null) : null,
        comment: editComment.trim() || null,
      }
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(j?.error || "")
      }
      toast.success("Запись обновлена")
      setEditingContactId(null)
      await loadContacts(candidateId)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось обновить запись")
    } finally {
      setSavingEdit(false)
    }
  }

  // Итоги интервью (Воронка v2 Фаза 2)
  const loadInterviewEvents = useCallback(async (id: string) => {
    setInterviewEventsLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/calendar?candidateId=${id}&type=interview`)
      if (!res.ok) throw new Error()
      const data = await res.json() as CandidateInterviewEvent[]
      const list = Array.isArray(data) ? data : []
      list.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
      setInterviewEvents(list)
    } catch {
      // не критично
    } finally {
      setInterviewEventsLoading(false)
    }
  }, [])

  const startEditOutcome = (ev: CandidateInterviewEvent) => {
    setEditingOutcomeEventId(ev.id)
    setOutcomeValue(ev.interviewOutcome ?? "")
    setRatingValue(ev.interviewRating ?? null)
    setDecisionValue(ev.interviewDecision ?? "")
    setNotesValue(ev.interviewNotes ?? "")
  }

  const submitInterviewOutcome = async () => {
    if (!candidateId || !editingOutcomeEventId) return
    setSavingOutcome(true)
    try {
      const body: Record<string, unknown> = {
        interviewOutcome: outcomeValue || null,
        interviewRating: ratingValue,
        interviewDecision: decisionValue || null,
        interviewNotes: notesValue.trim() || null,
      }
      const res = await fetch(`/api/modules/hr/calendar/${editingOutcomeEventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(j?.error || "")
      }
      toast.success("Итог интервью сохранён")
      await loadInterviewEvents(candidateId)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить итог")
    } finally {
      setSavingOutcome(false)
    }
  }

  // ── Скоркарта интервью: инициализация ──────────────────────────────────────
  // Once per candidate: если interview_scorecard_json уже есть — используем его
  // (сохранённые вердикты HR), иначе генерируем стартовый набор из Портрета
  // вакансии (mustHave×2 + niceToHave×1) + 3 универсальных критерия.
  useEffect(() => {
    if (!candidate || !candidateId) return
    if (scorecardInitializedFor.current === candidateId) return
    scorecardInitializedFor.current = candidateId

    const existing = candidate.interviewScorecardJson
    if (existing && Array.isArray(existing.criteria) && existing.criteria.length > 0) {
      setScorecardCriteria(existing.criteria)
      setScorecardAutoScore(existing.autoScore ?? null)
      setScorecardManualOverride(existing.manualOverride ?? null)
      setScorecardOverrideDraft(existing.manualOverride != null ? String(existing.manualOverride) : "")
      return
    }

    // Нет сохранённой скоркарты — тянем Портрет вакансии, чтобы построить критерии.
    const vacancyId = candidate.vacancyId
    if (!vacancyId) {
      // Вакансия не определена — хотя бы 3 универсальных критерия.
      setScorecardCriteria(generateCriteriaFromSpec(null))
      return
    }
    setScorecardLoading(true)
    fetch(`/api/core/spec/${vacancyId}`)
      .then(res => res.ok ? res.json() : null)
      .then((data: { spec?: CandidateSpec } | null) => {
        setScorecardCriteria(generateCriteriaFromSpec(data?.spec ?? null))
      })
      .catch(() => {
        setScorecardCriteria(generateCriteriaFromSpec(null))
      })
      .finally(() => setScorecardLoading(false))
  }, [candidate, candidateId])

  // Автосейв на каждый тап критерия — пересчитывает autoScore на клиенте
  // (для мгновенного отклика UI) И отправляет на сервер (источник правды —
  // сервер пересчитывает сам, см. PATCH /interview-scorecard).
  const saveScorecard = useCallback(async (nextCriteria: ScorecardCriterion[], nextManualOverride?: number | null) => {
    if (!candidateId) return
    setScorecardCriteria(nextCriteria)
    const auto = computeAutoScore(nextCriteria)
    setScorecardAutoScore(auto)
    setScorecardSaving(true)
    try {
      const body: Record<string, unknown> = { criteria: nextCriteria }
      if (nextManualOverride !== undefined) body.manualOverride = nextManualOverride
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/interview-scorecard`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const data = await res.json() as { interviewScore?: number | null }
      setCandidate((prev) => prev ? { ...prev, interviewScore: data.interviewScore ?? null } : prev)
    } catch {
      toast.error("Не удалось сохранить скоркарту")
    } finally {
      setScorecardSaving(false)
    }
  }, [candidateId])

  const setCriterionVerdict = (key: string, verdict: ScorecardVerdict) => {
    const next = scorecardCriteria.map((c) => c.key === key ? { ...c, verdict } : c)
    void saveScorecard(next)
  }

  const applyManualOverride = () => {
    const trimmed = scorecardOverrideDraft.trim()
    if (trimmed === "") {
      setScorecardManualOverride(null)
      void saveScorecard(scorecardCriteria, null)
      return
    }
    const n = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      toast.error("Балл — целое число от 1 до 10")
      return
    }
    setScorecardManualOverride(n)
    void saveScorecard(scorecardCriteria, n)
  }

  const scorecardFinalScore = resolveInterviewScore({ autoScore: scorecardAutoScore, manualOverride: scorecardManualOverride })

  // ── Скоркарта: кнопки решения (Дальше/Оффер/Отказ/Резерв) ──────────────────
  const submitScorecardDecision = async (decision: InterviewDecisionValue) => {
    if (!candidate || scorecardDecisionSaving) return
    if (decision === "reject") {
      setScorecardRejectReason("")
      setScorecardRejectComment("")
      setScorecardRejectReasonOpen(true)
      return
    }
    // advance / offer / reserve — существующий stage-переход (переиспользуем
    // handleStageChange — тот же PUT .../stage, что и везде в карточке, со
    // своими тостами/onStageChange; не дублируем fetch-логику).
    const targetStage = decision === "offer" ? "offer_sent" : decision === "reserve" ? "talent_pool" : "decision"
    setScorecardDecisionSaving(decision)
    try {
      await handleStageChange(targetStage)
    } finally {
      setScorecardDecisionSaving(null)
    }
  }

  const submitScorecardReject = async () => {
    if (!candidate || scorecardDecisionSaving) return
    setScorecardDecisionSaving("reject")
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/interview-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "reject",
          rejectionReasonCategory: scorecardRejectReason || null,
          rejectionComment: scorecardRejectComment.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json() as { pendingRejectionAt?: string | null }
      setCandidate((prev) => prev ? {
        ...prev,
        pendingRejectionAt: data.pendingRejectionAt ?? null,
        pendingRejectionReason: "interview_scorecard_decision",
        rejectionReasonCategory: scorecardRejectReason || null,
        rejectionComment: scorecardRejectComment.trim() || null,
      } : prev)
      setScorecardRejectReasonOpen(false)
      toast.success("Отказ запланирован")
    } catch {
      toast.error("Не удалось запланировать отказ")
    } finally {
      setScorecardDecisionSaving(null)
    }
  }

  // Ярлык решения для бейджа «Решение: …» под кнопками.
  function scorecardDecisionLabel(): string | null {
    if (!candidate) return null
    if (candidate.pendingRejectionAt) return "Отказ (запланирован)"
    if (candidate.stage === "rejected") return "Отказ"
    if (candidate.stage === "offer_sent") return "Оффер"
    if (candidate.stage === "talent_pool") return "В резерве"
    if (candidate.stage === "decision" || candidate.stage === "hired") return "Дальше по воронке"
    return null
  }

  useEffect(() => {
    if (open && candidateId) {
      setCandidate(null)
      setNotes([])
      setContacts([])
      setEditingContactId(null)
      setHhMessages([])
      setHhError(null)
      setHhDraft("")
      hhFetchRef.current = null
      // Баг #8: этот эффект и эффект «открыть на initialTab» (выше) оба реагируют
      // на open/candidateId — этот шёл вторым и безусловно затирал вкладку на
      // «Контакты», перечёркивая initialTab (напр. клик по колонке «Тест» должен
      // был открыть карточку сразу на вкладке теста). Теперь уважаем initialTab.
      setActiveTab(initialTab || "contacts")
      setTgInviteLink(null)
      setTgDraft("")
      setTgMessages([])
      setChannelStages([])
      setChannelStagesError(null)
      channelStagesFetchedFor.current = null
      setInterviewEvents([])
      setEditingOutcomeEventId(null)
      // Скоркарта интервью — сброс, инициализация случится в отдельном
      // эффекте после загрузки candidate (нужен vacancyId для Портрета).
      setScorecardCriteria([])
      setScorecardManualOverride(null)
      setScorecardAutoScore(null)
      setScorecardOverrideDraft("")
      scorecardInitializedFor.current = null
      fetchCandidate(candidateId)
      loadContacts(candidateId)
      loadInterviewEvents(candidateId)
    }
  }, [open, candidateId, initialTab, fetchCandidate, loadContacts, loadInterviewEvents])

  // F7: Telegram — получить / сгенерировать ссылку-приглашение
  const loadTgInvite = useCallback(async () => {
    if (!candidateId) return
    setTgInviteLoading(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/telegram-invite`, {
        method: "POST",
      })
      const data = await res.json() as { deepLink?: string; error?: string }
      if (!res.ok) { toast.error(data.error || "Ошибка генерации ссылки"); return }
      setTgInviteLink(data.deepLink ?? null)
    } catch {
      toast.error("Не удалось получить ссылку Telegram")
    } finally {
      setTgInviteLoading(false)
    }
  }, [candidateId])

  // F7: Telegram — отправить сообщение HR → кандидат
  const sendTgMessage = useCallback(async () => {
    if (!candidateId || !tgDraft.trim()) return
    setTgSending(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/telegram-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: tgDraft.trim() }),
      })
      const data = await res.json() as { sent?: boolean; error?: string }
      if (!res.ok) { toast.error(data.error || "Ошибка отправки"); return }
      setTgDraft("")
      // Добавить в локальную историю не дожидаясь перезагрузки
      setTgMessages(prev => [...prev, { role: "hr", text: tgDraft.trim(), sentAt: new Date().toISOString() }])
      toast.success("Сообщение отправлено")
    } catch {
      toast.error("Не удалось отправить сообщение")
    } finally {
      setTgSending(false)
    }
  }, [candidateId, tgDraft])

  // ── Reload hh messages on demand (после отправки своего сообщения) ────────
  const reloadHhMessages = useCallback(async (hhResponseId: string) => {
    try {
      const res = await fetch(`/api/integrations/hh/messages/${hhResponseId}`)
      const data = await res.json() as { messages?: HhMessage[]; error?: string; hhConnected?: boolean }
      if (res.ok && Array.isArray(data.messages)) setHhMessages(data.messages)
      if (typeof data.hhConnected === "boolean") setHhConnected(data.hhConnected)
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
        const data = await res.json() as { messages?: HhMessage[]; error?: string; details?: string; hhConnected?: boolean }
        if (cancelled) return
        if (!res.ok) {
          console.error("[hh-chat] fetch failed", res.status, data)
          setHhError(data.error ?? `Ошибка ${res.status}`)
        } else {
          const msgs = data.messages ?? []
          setHhMessages(msgs)
          setHhConnected(data.hhConnected !== false)
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

  // ── Lazy-load channel stages when «История» tab opens (стадии hh/авито
  //    показываются в Истории; отдельного таба «Каналы» больше нет) ──────────
  const loadChannelStages = useCallback(async (candidateId: string) => {
    setChannelStagesLoading(true)
    setChannelStagesError(null)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/channel-stage`)
      const data = await res.json() as { channels?: { channel: string; stageId: string; stageLabel: string }[]; error?: string }
      setChannelStages(data.channels ?? [])
      if (data.error) setChannelStagesError(data.error)
    } catch (err) {
      setChannelStagesError(err instanceof Error ? err.message : "Сетевая ошибка")
    } finally {
      setChannelStagesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab !== "history") return
    const id = candidate?.id
    if (!id) return
    // Only auto-fetch once per candidate; manual refresh re-fetches
    if (channelStagesFetchedFor.current === id) return
    channelStagesFetchedFor.current = id
    void loadChannelStages(id)
  }, [activeTab, candidate?.id, loadChannelStages])

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

  // #1: текущий пользователь — для авто-интервьюера в диалоге планирования.
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then((j) => {
      const u = j?.user ?? j?.data ?? j
      if (u?.name || u?.email) setSchedCurrentUser(u.name ?? u.email)
    }).catch(() => {})
  }, [])

  const openSchedule = () => {
    const now = new Date()
    setSchedDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`)
    setSchedTime("10:00"); setSchedDur("45"); setSchedInterviewer(schedCurrentUser)
    setScheduleOpen(true)
  }

  const handleScheduleInterview = async () => {
    if (!candidate || !schedDate || !schedTime) { toast.error("Укажите дату и время"); return }
    setScheduling(true)
    try {
      const [h, m] = schedTime.split(":").map(Number)
      const start = new Date(schedDate); start.setHours(h, m, 0, 0)
      const end = new Date(start.getTime() + (parseInt(schedDur) || 45) * 60000)
      const res = await fetch("/api/modules/hr/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: candidate.name, type: "interview",
          startAt: start.toISOString(), endAt: end.toISOString(),
          candidateId: candidate.id,
          vacancyId: (candidate as { vacancyId?: string | null }).vacancyId ?? null,
          interviewer: schedInterviewer || null,
        }),
      })
      if (!res.ok) throw new Error()
      setScheduleOpen(false)
      toast.success("Интервью запланировано — смотрите в табе «Интервью»")
    } catch { toast.error("Не удалось запланировать интервью") } finally { setScheduling(false) }
  }

  const handleStageChange = async (
    newStage: string,
    messageOverride?: string,
    interviewMode?: "phone" | "zoom" | "office",
  ) => {
    if (!candidate || changingStage) return
    setChangingStage(newStage)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: newStage,
          ...(messageOverride && messageOverride.trim().length > 0 ? { messageOverride: messageOverride.trim() } : {}),
          ...(interviewMode ? { interviewMode } : {}),
        }),
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

  // #30/#31: открыть диалог приглашения на интервью. Грузим шаблон вакансии,
  // дефолт, персональную ссылку самозаписи и доступные слоты интервью.
  const openInviteDialog = useCallback(async () => {
    if (!candidate) return
    setInviteMode("link")
    setInviteMeetMode(defaultInterviewMode ?? "zoom")
    setInviteSelectedSlots([])
    setInviteText("")
    setInviteDays([])
    setInviteLoading(true)
    setConfirmInterviewOpen(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/interview-invite`)
      const json = await res.json().catch(() => null)
      const d = (json?.data ?? json) as {
        scheduleInviteText?: string
        defaultText?: string
        scheduleLink?: string
        vacancyTitle?: string
        candidateFirstName?: string
        timezoneLabel?: string
        days?: { date: string; label: string; slots: string[] }[]
      } | null
      if (!res.ok || !d) throw new Error()
      const tmpl = (d.scheduleInviteText && d.scheduleInviteText.trim().length > 0)
        ? d.scheduleInviteText
        : (d.defaultText ?? "")
      setInviteTemplate(tmpl)
      setInviteDefaultText(d.defaultText ?? "")
      setInviteText(tmpl)
      setInviteScheduleLink(d.scheduleLink ?? "")
      setInviteVacancyTitle(d.vacancyTitle ?? "")
      setInviteFirstName(d.candidateFirstName ?? "")
      setInviteTzLabel(d.timezoneLabel ?? "")
      setInviteDays(Array.isArray(d.days) ? d.days : [])
    } catch {
      toast.error("Не удалось загрузить данные приглашения")
    } finally {
      setInviteLoading(false)
    }
  }, [candidate])

  // Переключить выбор конкретного слота (Режим Б). Максимум 3.
  const toggleInviteSlot = useCallback((key: string) => {
    setInviteSelectedSlots((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= 3) { toast.info("Можно выбрать до 3 вариантов"); return prev }
      return [...prev, key]
    })
  }, [])

  // Человекочитаемая подпись слота: «Пн, 9 июн, 10:00».
  const formatSlotKey = useCallback((key: string): string => {
    const [date, time] = key.split("|")
    const day = inviteDays.find((d) => d.date === date)
    return day ? `${day.label}, ${time}` : `${date}, ${time}`
  }, [inviteDays])

  // Финальный текст, который уйдёт кандидату (override для стадии interview).
  // Режим А: текст как есть (содержит {{schedule_link}}).
  // Режим Б: к тексту дописываем строки с выбранными временами и просьбу ответить.
  const buildInviteMessage = useCallback((): string => {
    // Режим «ссылка на самозапись»: без {{schedule_link}} кандидат не получил
    // бы свой календарь (Юрий 03.07) — дописываем ссылку в конец автоматически.
    if (inviteMode === "link") {
      return inviteText.includes("{{schedule_link}}")
        ? inviteText
        : `${inviteText.trimEnd()}\n\nВыберите удобное время: {{schedule_link}}`
    }
    const lines = inviteSelectedSlots.map((k) => `• ${formatSlotKey(k)}`)
    const tz = inviteTzLabel ? ` (${inviteTzLabel})` : ""
    return [
      inviteText.trim(),
      "",
      `Предлагаю такие варианты времени${tz}:`,
      ...lines,
      "",
      "Напишите, какой вам удобен?",
    ].join("\n")
  }, [inviteMode, inviteText, inviteSelectedSlots, formatSlotKey, inviteTzLabel])

  // Отправить приглашение: перевод в стадию «Интервью» с messageOverride
  // (стадия-роут ставит schedule_invite в очередь follow-up с этим текстом).
  const submitInvite = useCallback(async () => {
    if (!candidate) return
    if (inviteMode === "slots" && inviteSelectedSlots.length === 0) {
      toast.error("Выберите хотя бы одно время")
      return
    }
    // Режим А: если {{schedule_link}} убрали из текста — кандидат не получит
    // ссылку. Мягко предупреждаем, но не блокируем (HR мог намеренно).
    setConfirmInterviewOpen(false)
    await handleStageChange("interview", buildInviteMessage(), inviteMeetMode)
  }, [candidate, inviteMode, inviteSelectedSlots, buildInviteMessage, handleStageChange, inviteMeetMode])

  // #31: сохранить текущий текст в шаблон вакансии (vacancies.schedule_invite_text).
  const saveInviteTemplate = useCallback(async (text: string) => {
    const vacancyId = (candidate as { vacancyId?: string | null } | null)?.vacancyId
    if (!vacancyId) { toast.error("Вакансия не определена"); return }
    const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule_invite_text: text }),
    })
    if (!res.ok) { toast.error("Не удалось сохранить шаблон"); throw new Error() }
    setInviteTemplate(text)
    toast.success("Шаблон приглашения обновлён")
  }, [candidate])

  // Восстановление кандидата из стадии "rejected". prevStage определяет
  // сервер (по stage_history), но для confirm-диалога рассчитываем тут же
  // на клиенте — чтобы сразу показать HR'у куда именно вернётся кандидат.
  const computeRestoreTargetStage = (): string => {
    if (!candidate) return "primary_contact"
    const history = (Array.isArray(candidate.stageHistory) ? candidate.stageHistory : []) as StageHistoryEntry[]
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i]
      if (entry?.to === "rejected" && typeof entry.from === "string" && entry.from.length > 0) {
        return entry.from
      }
    }
    return "primary_contact"
  }

  const openRestoreConfirm = () => {
    if (!candidate || candidate.stage !== "rejected" || restoring) return
    setRestoreTargetStage(computeRestoreTargetStage())
    setConfirmRestoreOpen(true)
  }

  // #42: initiator предзадаётся из выбранного пункта («Отказ» → company,
  // «Отказался» → candidate). HR может изменить его в самом диалоге.
  const openRejectDialog = (initiator: "company" | "candidate" = "company") => {
    setRejectInitiator(initiator)
    setRejectReason("")
    setRejectComment("")
    setConfirmRejectOpen(true)
  }

  const submitReject = async () => {
    if (!candidate || changingStage) return
    setChangingStage("rejected")
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "rejected",
          rejectionReasonCategory: rejectReason || null,
          rejectionInitiator: rejectInitiator || null,
          rejectionComment: rejectComment.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      setCandidate((prev) => prev ? {
        ...prev,
        stage: "rejected",
        rejectionReasonCategory: rejectReason || null,
        rejectionInitiator: rejectInitiator || null,
        rejectionComment: rejectComment.trim() || null,
      } : prev)
      onStageChange?.(candidate.id, "rejected")
      setConfirmRejectOpen(false)
      toast.success(`${candidate.name} — отказ`)
    } catch {
      toast.error("Не удалось изменить стадию")
    } finally {
      setChangingStage(null)
    }
  }

  const handleRestore = async () => {
    if (!candidate || restoring) return
    setRestoring(true)
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidate.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { stage?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error || "Не удалось вернуть кандидата")
        return
      }
      const newStage = data.stage ?? "primary_contact"
      setCandidate((prev) => prev ? { ...prev, stage: newStage } : prev)
      onStageChange?.(candidate.id, newStage)
      toast.success(`Кандидат возвращён в воронку: ${getStageLabel(newStage, vacancyPipeline)}`)
      setConfirmRestoreOpen(false)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setRestoring(false)
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
      const data = await res.json() as {
        score:     number | null
        summary?:  string | null
        details?:  { question: string; score: number; comment: string }[] | null
        v1?:       number | null
        v2?:       number | null
        v2Details?: import("@/lib/db/schema").CandidateScoreV2 | null
      }
      setCandidate(prev => prev ? {
        ...prev,
        aiScore:          data.score ?? prev.aiScore,
        aiSummary:        typeof data.summary === "string" ? data.summary : prev.aiSummary,
        aiDetails:        Array.isArray(data.details) ? data.details : prev.aiDetails,
        aiScoreV1:        data.v1 ?? prev.aiScoreV1 ?? null,
        aiScoreV2:        data.v2 ?? prev.aiScoreV2 ?? null,
        aiScoreV2Details: data.v2Details ?? prev.aiScoreV2Details ?? null,
      } : prev)
      const shown = data.v2 ?? data.score ?? "?"
      toast.success(`AI-скоринг: ${shown}/100`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка AI-скоринга")
    } finally {
      setScoringAi(false)
    }
  }

  // ── Переоценить разбор по Портрету (осевой балл, per-criteria v2) ────────
  // Вызывает rescore-роут с dimension=portrait: он запускает scoreCandidateV2
  // и персистирует aiScoreV2/aiScoreV2Details/aiScoredAt.
  const handlePortraitRescore = async () => {
    if (!candidate || scoringPortrait) return
    setScoringPortrait(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${candidate.vacancyId}/rescore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: [candidate.id], dimension: "portrait" }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error || "Ошибка")
      }
      // Перезагружаем кандидата чтобы получить обновлённые aiScoreV2Details.
      const refreshRes = await fetch(`/api/modules/hr/candidates/${candidate.id}`)
      if (refreshRes.ok) {
        const fresh = await refreshRes.json() as typeof candidate
        setCandidate(prev => prev ? {
          ...prev,
          aiScoreV2:        fresh.aiScoreV2 ?? prev.aiScoreV2,
          aiScoreV2Details: fresh.aiScoreV2Details ?? prev.aiScoreV2Details,
          aiScoredAt:       fresh.aiScoredAt ?? prev.aiScoredAt,
        } : prev)
        toast.success(`Осевой балл переоценён: ${fresh.aiScoreV2 ?? "?"}/100`)
      } else {
        toast.success("Осевой балл переоценён")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка переоценки")
    } finally {
      setScoringPortrait(false)
    }
  }

  // ── Format helpers ────────────────────────────────────────────────────────

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return null
    if (min && max) return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} ₽`
    if (min) return `от ${min.toLocaleString("ru-RU")} ₽`
    return `до ${max!.toLocaleString("ru-RU")} ₽`
  }

  const stageCfg = candidate?.stage
    ? { label: getStageLabel(candidate.stage, vacancyPipeline), color: getStageColorClasses(candidate.stage, vacancyPipeline) }
    : null
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
      candidate, stageHistory, demoBlocks: realBlocks, demoCompletedAt: demo?.completedAt, blockMeta, vacancyPipeline,
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
    const surveyContacts = pickSurveyContacts(candidate.surveyResponses)
    return { demo, demoBlocks: realBlocks, demoTotal, demoCompleted, demoPct, stageHistory, timeline, hasAnswers, blockMeta, surveyContacts }
  }, [candidate])

  // Прелоад видео-визитки: пока юзер читает «Контакты», файл уже подкачивается
  // в фоне, чтобы при переходе на таб «Ответы» спиннер был короче.
  const videoVizitkaUrl = useMemo(
    () => (candidate ? findVideoVizitkaUrl(candidate.anketaAnswers) : null),
    [candidate],
  )
  useEffect(() => {
    if (!open || !videoVizitkaUrl) return
    const link = document.createElement("link")
    link.rel = "preload"
    link.as = "video"
    link.href = videoVizitkaUrl
    document.head.appendChild(link)
    return () => {
      link.parentNode?.removeChild(link)
    }
  }, [open, videoVizitkaUrl])

  return (
    <Sheet
      open={open}
      modal={modal}
      onOpenChange={(next) => {
        // Если карточку закрывают, а у нас активен PiP видео-визитки — выходим из PiP,
        // иначе плавающее окно остаётся жить после уже закрытой карточки.
        if (!next && typeof document !== "undefined" && document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {})
        }
        if (!next) setSheetExpanded(false)
        onOpenChange(next)
      }}
    >
      <SheetContent
        side="right"
        // modal=false (карточка поверх глобального виджета «Чаты»): гасим
        // оверлей — Radix всё равно рендерит SheetOverlay, но без затемнения
        // и БЕЗ перехвата кликов (pointer-events-none) чат под ним остаётся
        // интерактивным. Сама карточка — z-[60], выше окна чата (z-50).
        overlayClassName={!modal ? "bg-transparent pointer-events-none" : undefined}
        className={cn(
          "w-full p-0 flex flex-col",
          sheetExpanded ? "max-w-none sm:max-w-none w-screen" : "sm:max-w-2xl",
          !modal && "z-[60]",
        )}
      >
        {/* sr-only title/description: гарантируют наличие aria-labelledby
            и aria-describedby у Radix Dialog даже когда candidate ещё грузится
            или не найден — иначе библиотека пишет варнинги в консоль. */}
        <SheetTitle className="sr-only">
          Карточка кандидата{candidate?.name ? ` ${candidate.name}` : ""}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Подробная информация о кандидате
        </SheetDescription>
        {/* Развернуть на весь экран (слева от стандартного крестика Radix) */}
        <button
          type="button"
          onClick={() => setSheetExpanded((v) => !v)}
          title={sheetExpanded ? "Свернуть панель" : "Развернуть на весь экран"}
          className="absolute right-12 top-4 z-20 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {sheetExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          {/* Если есть снапшот из списка — шапку рисуем сразу, без скелетона.
              Тяжёлые секции (табы) остаются под скелетоном пока идёт fetch. */}
          {loadingCandidate && !initialCandidate ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-40 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            </div>
          ) : loadingCandidate && initialCandidate ? (
            /* Мгновенная шапка по снапшоту из списка, пока подгружаются детали */
            <div className="flex items-start gap-4">
              <AvatarInitials name={initialCandidate.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold leading-tight mb-1 flex items-center gap-2">
                  <span className="truncate">{initialCandidate.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {initialCandidate.stage && (() => {
                    const cfg = { label: getStageLabel(initialCandidate.stage, vacancyPipeline), color: getStageColorClasses(initialCandidate.stage, vacancyPipeline) }
                    return (
                      <Badge variant="outline" className={cn("text-xs border", cfg.color)}>
                        {cfg.label}
                      </Badge>
                    )
                  })()}
                  {(() => {
                    const mainScore = initialCandidate.aiScoreV2 ?? initialCandidate.resumeScore ?? null
                    return mainScore != null ? <AiScoreBadge score={mainScore} onClick={() => {}} /> : null
                  })()}
                  {/* Мини-спиннер — сигнал что детали ещё грузятся */}
                  <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground/60">
                    <svg className="animate-spin size-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          ) : candidate ? (
            <div className="flex items-start gap-4">
              <AvatarInitials name={candidate.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold leading-tight mb-1 flex items-center gap-2">
                  {editingName ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveName(); if (e.key === "Escape") setEditingName(false) }}
                      onBlur={() => void saveName()}
                      disabled={savingName}
                      placeholder="Имя кандидата"
                      className="flex-1 min-w-0 text-base font-semibold border-b border-primary/40 bg-transparent outline-none px-0.5"
                    />
                  ) : (
                    <>
                      <span className="truncate">{candidate.name}</span>
                      <button type="button" onClick={startEditName} title="Переименовать"
                        className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors p-0.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
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
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Баллы из шапки убраны — дублировали панель «Оценки» и сдвигали контент. */}
                  {stageCfg && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">Стадия:</span>
                      <Badge variant="outline" className={cn("text-xs border", stageCfg.color)}>
                        {stageCfg.label}
                      </Badge>
                    </span>
                  )}
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
          <DrawerTabBoundary resetKey={`${candidate?.id ?? ""}:${activeTab}`}>
            <ScoresPanel candidate={candidate} />
            <TabsList className="flex flex-wrap justify-start gap-1 mx-3 mt-3 shrink-0 h-auto">
              <TabsTrigger value="contacts" className="text-[10px] px-1 py-1.5">Резюме</TabsTrigger>
              <TabsTrigger value="chat" className="text-[10px] px-1 py-1.5">Чат hh</TabsTrigger>
              <TabsTrigger value="rubric" className="text-[10px] px-1 py-1.5">Портрет</TabsTrigger>
              <TabsTrigger value="answers" className="text-[10px] px-1 py-1.5">Анкета</TabsTrigger>
              <TabsTrigger value="test" className="text-[10px] px-1 py-1.5">Тест</TabsTrigger>
              <TabsTrigger value="calls" className="text-[10px] px-1 py-1.5">Каналы</TabsTrigger>
              <TabsTrigger value="interview" className="text-[10px] px-1 py-1.5">Итоги</TabsTrigger>
              <TabsTrigger value="history" className="text-[10px] px-1 py-1.5">История</TabsTrigger>
            </TabsList>

            <div
              ref={tabScrollRef}
              className="flex-1 min-h-0 h-full overflow-y-auto overscroll-contain"
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
                      photoUrl: candidate.photoUrl ?? null,
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
                      {/* Языки */}
                      {candidate.languages && candidate.languages.length > 0 && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
                          <Languages className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{candidate.languages.join(", ")}</span>
                        </div>
                      )}
                      {/* Профессиональные роли */}
                      {candidate.professionalRoles && candidate.professionalRoles.length > 0 && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
                          <Briefcase className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Профроли: {candidate.professionalRoles.join(", ")}</span>
                        </div>
                      )}
                      {/* Гражданство */}
                      {candidate.citizenshipNames && candidate.citizenshipNames.length > 0 && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
                          <Globe2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Гражданство: {candidate.citizenshipNames.join(", ")}</span>
                        </div>
                      )}
                      {/* Права и автомобиль */}
                      {(candidate.driverLicenses && candidate.driverLicenses.length > 0 || candidate.hasVehicle) && (
                        <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
                          <Car className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            {candidate.driverLicenses && candidate.driverLicenses.length > 0
                              ? `Права: ${candidate.driverLicenses.join(", ")}`
                              : ""}
                            {candidate.driverLicenses && candidate.driverLicenses.length > 0 && candidate.hasVehicle ? " · " : ""}
                            {candidate.hasVehicle ? "есть автомобиль" : ""}
                          </span>
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
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
                    <p className="text-sm text-destructive font-medium text-center">
                      Кандидат получил отказ
                    </p>
                    {(candidate.rejectionReasonCategory || candidate.rejectionInitiator) && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground px-1">
                        {candidate.rejectionInitiator && (
                          <span>{rejectionInitiatorLabel(candidate.rejectionInitiator)}</span>
                        )}
                        {candidate.rejectionReasonCategory && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>{rejectionReasonLabel(candidate.rejectionReasonCategory)}</span>
                          </>
                        )}
                        {candidate.rejectionComment && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="italic">{candidate.rejectionComment}</span>
                          </>
                        )}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2"
                      disabled={restoring}
                      onClick={openRestoreConfirm}
                    >
                      {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Вернуть в воронку
                    </Button>
                  </div>
                )}

                <Separator />

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    Заметки
                  </h3>

                  {notes.length === 0 ? (
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

              {/* ── Каналы связи ─────────────────────────────────── */}
              <TabsContent value="calls" className="px-6 py-4 pb-28 space-y-4 mt-0">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Каналы связи
                </h3>

                {/* Telegram */}
                <div className="rounded-lg border border-border/60 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500">
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Telegram</p>
                        <p className="text-[11px] text-muted-foreground">
                          {candidate?.telegramOptOut
                            ? "Отписался (/stop)"
                            : candidate?.telegramChatId
                              ? `Подключён${candidate.telegramUsername ? ` · @${candidate.telegramUsername}` : ""}`
                              : "Не подключён"
                          }
                        </p>
                      </div>
                    </div>
                    {candidate?.telegramOptOut ? (
                      <span className="text-[10px] text-amber-600 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">отписался</span>
                    ) : candidate?.telegramChatId ? (
                      <span className="text-[10px] text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">связан</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/40">не связан</span>
                    )}
                  </div>

                  {/* Ссылка-приглашение */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      Кандидат начинает диалог сам — по ссылке-приглашению. Отправьте её в hh-чате.
                    </p>
                    {tgInviteLink ? (
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={tgInviteLink}
                          className="flex-1 text-xs font-mono bg-muted/50 border border-border rounded px-2 py-1.5 truncate"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(tgInviteLink)
                            toast.success("Ссылка скопирована")
                          }}
                        >
                          Скопировать
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5"
                        onClick={loadTgInvite}
                        disabled={tgInviteLoading}
                      >
                        {tgInviteLoading
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Send className="w-3 h-3" />
                        }
                        Получить ссылку-приглашение
                      </Button>
                    )}
                  </div>

                  {/* История сообщений + поле отправки — только если кандидат связан */}
                  {candidate?.telegramChatId && !candidate.telegramOptOut && (
                    <>
                      {tgMessages.length > 0 && (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {tgMessages.map((m, i) => (
                            <div
                              key={i}
                              className={cn(
                                "text-xs rounded-lg px-2.5 py-1.5 max-w-[85%]",
                                m.role === "hr"
                                  ? "ml-auto bg-primary text-primary-foreground"
                                  : "mr-auto bg-muted text-foreground",
                              )}
                            >
                              <p>{m.text}</p>
                              <p className={cn("text-[10px] mt-0.5 opacity-70", m.role === "hr" ? "text-right" : "")}>
                                {formatDateTime(m.sentAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <Textarea
                          value={tgDraft}
                          onChange={e => setTgDraft(e.target.value)}
                          placeholder="Написать в Telegram…"
                          className="min-h-[60px] text-sm resize-none"
                          onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              sendTgMessage()
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          className="self-end shrink-0"
                          onClick={sendTgMessage}
                          disabled={tgSending || !tgDraft.trim()}
                        >
                          {tgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </>
                  )}

                  {candidate?.telegramOptOut && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5">
                      Кандидат отправил /stop — отписался от бота. Отправка сообщений недоступна.
                    </p>
                  )}
                </div>

                {/* WhatsApp — скоро */}
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

                {/* MAX — скоро */}
                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-600/10 flex items-center justify-center text-blue-600">
                        <MessageCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">MAX</p>
                        <p className="text-[11px] text-muted-foreground">Российский мессенджер</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted/40">скоро</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">Мессенджер MAX — приглашения и уточнения</p>
                </div>

                {/* Email — скоро */}
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

              {/* ── Ответы ───────────────────────────────────────── */}
              {/* pb-40 (а не pb-28 как у соседних табов) — длинные ответы
                  с видео/аудио рендерятся высоко (max-h-[400px] на видео),
                  и стандартного буфера 7rem не хватало чтобы последний блок
                  был полностью виден над sticky-футером. */}
              <TabsContent value="answers" className="px-6 py-4 pb-40 mt-0 space-y-4">
                {derived.surveyContacts ? (
                  <SurveyContactsBlock contacts={derived.surveyContacts} />
                ) : null}
                <AnswersTab answers={candidate.anketaAnswers} demoLessons={candidate.demoLessons} candidateId={candidate.id} aiScore={candidate.demoAnswersScore} answersDetails={candidate.demoAnswersDetails} testScore={candidate.testScore} demoBlockScores={candidate.demoBlockScores} secondDemoInvite={candidate.secondDemoInvite} />
              </TabsContent>

              {/* ── Тест ─────────────────────────────────────────── */}
              <TabsContent value="test" className="px-6 py-4 pb-40 mt-0 space-y-4">
                <TestTab candidateId={candidate.id} />
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
                        <p className="text-xs text-muted-foreground italic py-2">
                          {hhConnected ? "Пока нет сообщений. Отправь первое — кандидат увидит в hh" : "Сохранённой переписки нет (hh не подключён)"}
                        </p>
                      ) : (
                        <div ref={hhListRef} className="space-y-2 pt-1 max-h-[50vh] overflow-y-auto pr-1 -mr-1">
                          {(() => {
                            const hiddenCount = hhMessages.reduce((n, m) => n + (hiddenMsgIds.has(m.id) ? 1 : 0), 0)
                            const visible = showHiddenMsgs ? hhMessages : hhMessages.filter((m) => !hiddenMsgIds.has(m.id))
                            return (
                              <>
                                {hiddenCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setShowHiddenMsgs((v) => !v)}
                                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors mx-auto py-0.5"
                                  >
                                    {showHiddenMsgs ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    {showHiddenMsgs ? `Спрятать скрытые (${hiddenCount})` : `Показать скрытые (${hiddenCount})`}
                                  </button>
                                )}
                                {visible.map((m) => {
                                  const mine = m.authorType === "employer"
                                  const isHidden = hiddenMsgIds.has(m.id)
                                  return (
                                    <div key={m.id} className={cn("flex group", mine ? "justify-end" : "justify-start", isHidden && "opacity-50")}>
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
                                          <div className="flex items-center gap-1.5">
                                            {/* «Изменить»/«Удалить» — только на СВОИХ (исходящих) сообщениях.
                                                hh API не даёт ни редактировать, ни удалять отправленное
                                                (есть только POST нового сообщения). Поэтому:
                                                • «Изменить» → подставляем поправку в поле ввода (отправим вдогонку);
                                                • «Удалить» → скрываем у себя (у кандидата в hh сообщение остаётся). */}
                                            {mine && hhConnected && !isHidden && (
                                              <button
                                                type="button"
                                                onClick={() => startCorrection(m)}
                                                title="hh не даёт редактировать отправленное — подставим поправку в поле ввода, отправите вдогонку"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                                              >
                                                <Pencil className="w-3 h-3" />
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => toggleHiddenMsg(m.id)}
                                              title={
                                                isHidden
                                                  ? "Вернуть в чат (у себя)"
                                                  : mine
                                                    ? "Удалить: hh не даёт удалять отправленное — скроем у вас, у кандидата в hh останется"
                                                    : "Скрыть у себя (у кандидата в hh останется)"
                                              }
                                              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                                            >
                                              {isHidden
                                                ? <Eye className="w-3 h-3" />
                                                : mine
                                                  ? <Trash2 className="w-3 h-3" />
                                                  : <EyeOff className="w-3 h-3" />}
                                            </button>
                                            {mine && (
                                              <span title={m.viewedByOpponent ? "прочитано" : "не прочитано"}>
                                                {m.viewedByOpponent ? "✓✓" : "✓"}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </>
                            )
                          })()}
                        </div>
                      )}

                      {/* Поле ввода при живом hh, иначе — плашка «не подключён» */}
                      {hhConnected ? (
                      <div className="pt-2 mt-1 border-t border-border/40 space-y-2">
                        {/* «Поправка»: удалить сообщение в hh нельзя — отправляем корректирующее вдогонку */}
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-muted-foreground mr-0.5 inline-flex items-center gap-1">
                            <Pencil className="w-3 h-3" /> Поправка:
                          </span>
                          {CORRECTION_TEMPLATES.map((t) => (
                            <button
                              key={t.label}
                              type="button"
                              disabled={hhSending}
                              onClick={() => setHhDraft(t.text)}
                              className="text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <Textarea
                          ref={hhInputRef}
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
                      ) : (
                        <div className="pt-2 mt-1 border-t border-amber-300/40">
                          <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
                            <p className="font-medium">hh не подключён</p>
                            <p>Показана сохранённая переписка. Новые сообщения не подтянутся, отправка недоступна.</p>
                            <a href="/hr/integrations" className="inline-block underline font-medium">Переподключить hh →</a>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>



              {/* ── Портрет (разбор по критериям Портрета) ────────────────── */}
              <TabsContent value="rubric" className="px-6 py-4 pb-28 mt-0 space-y-4">
                {/* Шапка с кнопкой переоценки */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Портрет</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    disabled={scoringPortrait || !candidate.vacancyId}
                    onClick={handlePortraitRescore}
                  >
                    {scoringPortrait
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Оценивается…</>
                      : <><Sparkles className="w-3.5 h-3.5" /> {candidate.aiScoreV2Details ? "Переоценить" : "Оценить"}</>
                    }
                  </Button>
                </div>

                {/* Основной контент: персистированный результат */}
                {candidate.aiScoreV2Details ? (
                  <AiMatchCardV2
                    details={candidate.aiScoreV2Details}
                    scoreV1={candidate.aiScoreV1 ?? null}
                    scoreV2={candidate.aiScoreV2 ?? null}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    {scoringPortrait
                      ? "Оцениваем кандидата по критериям Портрета…"
                      : "Оценка ещё не готова — нажмите «Оценить» или дождитесь автоматического скоринга."
                    }
                  </div>
                )}
              </TabsContent>

              {/* ── Итоги интервью (Воронка v2 Фаза 2) ──────────────────────────── */}
              <TabsContent value="interview" className="px-6 py-4 pb-28 space-y-4 mt-0">
                {/* ── Скоркарта интервью (дизайн координатора, одобрен Юрием 05.07) ── */}
                <div className="rounded-lg border border-border/60 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Скоркарта интервью
                    </h3>
                    {scorecardFinalScore != null && (
                      <span className={cn("text-lg font-bold tabular-nums", scoreTone(scorecardFinalScore * 10))}>
                        {scorecardFinalScore}<span className="text-xs font-normal text-muted-foreground">/10</span>
                      </span>
                    )}
                  </div>

                  {scorecardLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />Строим критерии из Портрета…
                    </div>
                  ) : scorecardCriteria.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2 text-center">Критерии не заданы</p>
                  ) : (
                    <div className="space-y-2">
                      {scorecardCriteria.map((c) => (
                        <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 py-1">
                          <span className="min-w-0 flex-1 text-sm text-foreground flex items-center gap-1.5">
                            {c.label}
                            {c.source === "portrait" && c.weight === 2 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0 border-primary/40 text-primary">обязат.</Badge>
                            )}
                          </span>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setCriterionVerdict(c.key, "confirmed")}
                              className={cn(
                                "px-2.5 py-1.5 rounded-md text-xs border transition-colors min-h-[32px]",
                                c.verdict === "confirmed"
                                  ? "bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-300"
                                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                              )}
                            >
                              Подтвердился
                            </button>
                            <button
                              type="button"
                              onClick={() => setCriterionVerdict(c.key, "not_confirmed")}
                              className={cn(
                                "px-2.5 py-1.5 rounded-md text-xs border transition-colors min-h-[32px]",
                                c.verdict === "not_confirmed"
                                  ? "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300"
                                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                              )}
                            >
                              Не подтвердился
                            </button>
                            <button
                              type="button"
                              onClick={() => setCriterionVerdict(c.key, "not_checked")}
                              className={cn(
                                "px-2.5 py-1.5 rounded-md text-xs border transition-colors min-h-[32px]",
                                c.verdict === "not_checked"
                                  ? "bg-muted border-border text-foreground"
                                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                              )}
                            >
                              Не проверяли
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ручное переопределение балла */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                    <Label htmlFor="scorecard-override" className="text-xs text-muted-foreground shrink-0">Ваш итоговый балл</Label>
                    <Input
                      id="scorecard-override"
                      type="number"
                      min={1}
                      max={10}
                      value={scorecardOverrideDraft}
                      onChange={(e) => setScorecardOverrideDraft(e.target.value)}
                      onBlur={applyManualOverride}
                      placeholder={scorecardAutoScore != null ? String(scorecardAutoScore) : "—"}
                      className="h-8 w-16 text-xs"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {scorecardManualOverride != null ? "переопределён вручную" : scorecardAutoScore != null ? `авто: ${scorecardAutoScore}/10` : "балла ещё нет"}
                    </span>
                    {scorecardSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
                  </div>

                  {/* Кнопки решения */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                    {INTERVIEW_DECISION_OPTIONS.map((opt) => (
                      <Button
                        key={opt.id}
                        size="sm"
                        variant={opt.id === "reject" ? "outline" : opt.id === "offer" ? "default" : "outline"}
                        className={cn("h-8 text-xs gap-1.5", opt.id === "reject" && "text-destructive border-destructive/40 hover:bg-destructive/10")}
                        disabled={!!scorecardDecisionSaving}
                        onClick={() => void submitScorecardDecision(opt.id)}
                      >
                        {scorecardDecisionSaving === opt.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {opt.id === "advance" ? "Дальше по воронке" : opt.label}
                      </Button>
                    ))}
                    {scorecardDecisionLabel() && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 ml-auto">
                        Решение: {scorecardDecisionLabel()}
                      </Badge>
                    )}
                  </div>
                </div>

                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Собеседования
                </h3>
                {interviewEventsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />Загрузка...
                  </div>
                ) : interviewEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Интервью ещё не назначено</p>
                ) : (
                  <div className="space-y-3">
                    {interviewEvents.map((ev) => (
                      <div key={ev.id} className="rounded-lg border border-border/60 p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium text-foreground">{formatDateTime(ev.startAt)}</span>
                          {ev.interviewType && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ev.interviewType}</Badge>
                          )}
                          {ev.interviewFormat && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ev.interviewFormat}</Badge>
                          )}
                          {ev.interviewStatus && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-muted text-muted-foreground">
                              {ev.interviewStatus}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {ev.interviewer && <span>Интервьюер: {ev.interviewer}</span>}
                          {ev.location && <span>Адрес: {ev.location}</span>}
                          {ev.meetingUrl && (
                            <a href={ev.meetingUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              Ссылка на звонок
                            </a>
                          )}
                        </div>

                        {/* Уже зафиксированный итог — показываем сводкой, если не редактируем */}
                        {ev.interviewOutcomeAt && editingOutcomeEventId !== ev.id && (
                          <div className="rounded-md bg-muted/40 p-2.5 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-background">
                                {interviewOutcomeLabel(ev.interviewOutcome)}
                              </Badge>
                              {ev.interviewRating != null && (
                                <span className="flex items-center gap-0.5 text-amber-500">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      className={cn("w-3 h-3", i < (ev.interviewRating ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
                                    />
                                  ))}
                                </span>
                              )}
                              {ev.interviewDecision && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 border-0",
                                    ev.interviewDecision === "offer" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                                    ev.interviewDecision === "reject" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                                    (ev.interviewDecision === "advance" || ev.interviewDecision === "reserve") && "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {interviewDecisionLabel(ev.interviewDecision)}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground/60 ml-auto">
                                Зафиксировано {formatDateTime(ev.interviewOutcomeAt)}
                              </span>
                            </div>
                            {ev.interviewNotes && (
                              <p className="text-xs text-foreground italic">{ev.interviewNotes}</p>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditOutcome(ev)}
                              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 pt-0.5"
                            >
                              <Pencil className="w-3 h-3" />Изменить итог
                            </button>
                          </div>
                        )}

                        {/* Форма фиксации итога — либо ещё не заполнено, либо режим правки */}
                        {(!ev.interviewOutcomeAt || editingOutcomeEventId === ev.id) && (
                          editingOutcomeEventId === ev.id ? (
                            <div className="rounded-md border bg-muted/30 p-3 space-y-2.5">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Состоялось</Label>
                                <div className="flex gap-1.5 flex-wrap">
                                  {INTERVIEW_OUTCOME_OPTIONS.map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => setOutcomeValue(item.id)}
                                      className={cn(
                                        "px-2.5 py-1 rounded-md text-xs border transition-colors",
                                        outcomeValue === item.id
                                          ? "bg-primary/10 border-primary text-primary"
                                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                                      )}
                                    >
                                      {item.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Впечатление</Label>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() => setRatingValue(ratingValue === n ? null : n)}
                                      className="p-0.5"
                                      title={`${n}/5`}
                                    >
                                      <Star className={cn("w-4 h-4", ratingValue != null && n <= ratingValue ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
                                    </button>
                                  ))}
                                  {ratingValue != null && (
                                    <button
                                      type="button"
                                      onClick={() => setRatingValue(null)}
                                      className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
                                    >
                                      сбросить
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Решение</Label>
                                <Select value={decisionValue || undefined} onValueChange={(v) => setDecisionValue(v as InterviewDecisionValue)}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Не выбрано" /></SelectTrigger>
                                  <SelectContent>
                                    {INTERVIEW_DECISION_OPTIONS.map((item) => (
                                      <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Заметка</Label>
                                <Textarea
                                  value={notesValue}
                                  onChange={(e) => setNotesValue(e.target.value)}
                                  placeholder="Впечатления от собеседования…"
                                  rows={2}
                                  className="resize-none text-xs"
                                />
                              </div>

                              <div className="flex gap-2 pt-1">
                                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => void submitInterviewOutcome()} disabled={savingOutcome}>
                                  {savingOutcome ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                  Сохранить итог
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingOutcomeEventId(null)} disabled={savingOutcome}>
                                  Отмена
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => startEditOutcome(ev)}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Зафиксировать итог
                            </Button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Лог контактов ── */}
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 pt-2">
                  <PhoneCall className="w-3.5 h-3.5" />
                  Лог контактов
                </h3>
                {/* M2: быстрый ввод контакта прямо в карточке — без модалки (1 клик). */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
                  <div className="flex gap-2 flex-wrap items-center">
                    <Select value={contactChannel} onValueChange={(v) => setContactChannel(v as ContactChannel)}>
                      <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTACT_CHANNELS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1.5 flex-wrap">
                      {CONTACT_OUTCOMES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { setContactOutcome(item.id as ContactOutcome); if (item.id !== "no_fit") setContactReason("") }}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-xs border transition-colors",
                            contactOutcome === item.id
                              ? item.id === "fit"
                                ? "bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-300"
                                : item.id === "no_fit"
                                ? "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300"
                                : "bg-muted border-border text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {contactOutcome === "no_fit" && (
                    <Select value={contactReason} onValueChange={setContactReason}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Причина" /></SelectTrigger>
                      <SelectContent>
                        {REJECTION_REASONS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2 items-end">
                    <Textarea
                      value={contactComment}
                      onChange={(e) => setContactComment(e.target.value)}
                      placeholder="Итоги разговора (необязательно)…"
                      rows={1}
                      className="resize-none text-xs min-h-8 flex-1"
                    />
                    <Button size="sm" className="h-8 text-xs shrink-0 gap-1.5" onClick={() => void submitContact()} disabled={savingContact}>
                      {savingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Сохранить результат
                    </Button>
                  </div>
                </div>
                {contactsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />Загрузка...
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Контактов пока нет</p>
                ) : (
                  <div className="divide-y divide-border">
                    {contacts.map((c) => {
                      const canEdit = !c.createdById || (!!user.id && c.createdById === user.id)
                      if (editingContactId === c.id) {
                        return (
                          <div key={c.id} className="py-2.5 space-y-2.5">
                            <div className="flex gap-2 flex-wrap items-center">
                              <Select value={editChannel} onValueChange={(v) => setEditChannel(v as ContactChannel)}>
                                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {CONTACT_CHANNELS.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex gap-1.5 flex-wrap">
                                {CONTACT_OUTCOMES.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => { setEditOutcome(item.id as ContactOutcome); if (item.id !== "no_fit") setEditReason("") }}
                                    className={cn(
                                      "px-2.5 py-1 rounded-md text-xs border transition-colors",
                                      editOutcome === item.id
                                        ? item.id === "fit"
                                          ? "bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-300"
                                          : item.id === "no_fit"
                                          ? "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300"
                                          : "bg-muted border-border text-foreground"
                                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                                    )}
                                  >
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {editOutcome === "no_fit" && (
                              <Select value={editReason} onValueChange={setEditReason}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Причина" /></SelectTrigger>
                                <SelectContent>
                                  {REJECTION_REASONS.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Textarea
                              value={editComment}
                              onChange={(e) => setEditComment(e.target.value)}
                              placeholder="Итоги разговора (необязательно)…"
                              rows={2}
                              className="resize-none text-xs"
                            />
                            <div className="flex gap-2">
                              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => void saveEditContact()} disabled={savingEdit}>
                                {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Сохранить
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={cancelEditContact} disabled={savingEdit}>
                                Отмена
                              </Button>
                            </div>
                          </div>
                        )
                      }
                      return (
                      <div key={c.id} className="py-2.5 space-y-1 group/contact">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-xs text-muted-foreground shrink-0">
                            {new Date(c.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-xs font-medium">{contactChannelLabel(c.channel)}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 border-0",
                              c.outcome === "fit" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                              c.outcome === "no_fit" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                              c.outcome === "pending" && "bg-muted text-muted-foreground",
                            )}
                          >
                            {contactOutcomeLabel(c.outcome)}
                          </Badge>
                          {c.reasonCategory && (
                            <span className="text-xs text-muted-foreground">{rejectionReasonLabel(c.reasonCategory)}</span>
                          )}
                          <div className="flex items-center gap-1.5 ml-auto">
                            {c.createdByName && (
                              <span className="text-[10px] text-muted-foreground/60">{c.createdByName}</span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => startEditContact(c)}
                                title="Изменить"
                                className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors p-0.5"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {c.comment && (
                          <p className="text-xs text-foreground italic pl-0.5">{c.comment}</p>
                        )}
                      </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── История ──────────────────────────────────────── */}
              <TabsContent value="history" className="px-6 py-4 pb-28 mt-0">
                {/* Стадии каналов (hh/авито) — текущая стадия кандидата вживую. */}
                <div className="rounded-lg border border-border/60 p-3 space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">Стадии каналов (hh / авито)</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        if (!candidate?.id) return
                        channelStagesFetchedFor.current = null
                        void loadChannelStages(candidate.id)
                      }}
                      disabled={channelStagesLoading}
                      title="Обновить"
                    >
                      <RotateCcw className={cn("w-3 h-3", channelStagesLoading && "animate-spin")} />
                    </Button>
                  </div>
                  {channelStagesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Загружаем…
                    </div>
                  ) : channelStages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      {channelStagesError ? `Ошибка: ${channelStagesError}` : "Нет данных по каналам"}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {channelStages.map((cs) => (
                        <div key={cs.channel} className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-foreground">{channelLabel(cs.channel)}</span>
                          <span className="text-muted-foreground">—</span>
                          <span className="text-foreground">{cs.stageLabel || "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
          </DrawerTabBoundary>
          </Tabs>
        ) : null}

        {/* ── M1: единый список «Стадия» + «Запланировать». Показывается ВСЕГДА
            (в т.ч. на «найнят»/«отказ» — можно вернуть в воронку). Выбор стадии
            сохраняет процессы: «Отказ» → диалог причины+hh-discard, «Интервью» →
            подтверждение приглашения; остальные — прямой перевод. ─── */}
        {candidate && (
          <div className="border-t bg-background px-6 py-3 shrink-0 flex items-center gap-2">
            <Select
              value={candidate.stage ?? "new"}
              disabled={!!changingStage}
              onValueChange={(slug) => {
                // #42: два негативных пункта в конце списка — оба ведут в
                // rejected, но с разным инициатором (company / candidate).
                if (slug === "__reject_company") { openRejectDialog("company"); return }
                if (slug === "__reject_candidate") { openRejectDialog("candidate"); return }
                if (slug === (candidate.stage ?? "")) return
                if (slug === "rejected") { openRejectDialog(); return }
                if (slug === "interview") { void openInviteDialog(); return }
                void handleStageChange(slug)
              }}
            >
              <SelectTrigger className="h-10 flex-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  {changingStage ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                  <span className="text-muted-foreground shrink-0">Стадия:</span>
                  <span className="font-medium truncate">{getStageLabel(candidate.stage ?? "new", vacancyPipeline)}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {/* #42: единый источник — воронка v2 вакансии (stageOptions);
                    fallback на ALL_STAGE_SLUGS, когда список не прокинут. */}
                {(stageOptions && stageOptions.length > 0
                  ? stageOptions.filter((o) => o.slug !== "rejected")
                  : ALL_STAGE_SLUGS.filter((slug) => slug !== "rejected").map((slug) => ({ slug, label: getStageLabel(slug, vacancyPipeline) }))
                ).map((opt) => (
                  <SelectItem key={opt.slug} value={opt.slug}>{opt.label}</SelectItem>
                ))}
                {/* Негативные исходы — всегда в конце. */}
                <SelectItem value="__reject_company">Отказ</SelectItem>
                <SelectItem value="__reject_candidate">Отказался</SelectItem>
              </SelectContent>
            </Select>

            {/* Запланировать интервью с датой → событие в табе «Интервью» */}
            <Button
              size="sm"
              variant="outline"
              className="h-10 shrink-0 gap-2"
              onClick={openSchedule}
              title="Запланировать интервью (с датой)"
            >
              <CalendarPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Запланировать</span>
            </Button>
          </div>
        )}
      </SheetContent>

      {/* #1: Диалог планирования интервью из карточки кандидата */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Запланировать интервью{candidate?.name ? ` — ${candidate.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="sch-date" className="text-xs">Дата *</Label>
                <Input id="sch-date" type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sch-time" className="text-xs">Время *</Label>
                <Input id="sch-time" type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sch-dur" className="text-xs">Длит., мин</Label>
                <Input id="sch-dur" type="number" min={15} step={15} value={schedDur} onChange={e => setSchedDur(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sch-interviewer" className="text-xs">Интервьюер</Label>
              <Input id="sch-interviewer" value={schedInterviewer} onChange={e => setSchedInterviewer(e.target.value)} placeholder="Кто проводит" />
              {schedCurrentUser && <p className="text-[11px] text-muted-foreground">По умолчанию — вы. Можно изменить.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={scheduling}>Отмена</Button>
            <Button onClick={handleScheduleInterview} disabled={scheduling || !schedDate || !schedTime}>
              {scheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Запланировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRestoreOpen} onOpenChange={setConfirmRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вернуть кандидата в воронку?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTargetStage
                ? `Кандидат будет перемещён на стадию: «${getStageLabel(restoreTargetStage, vacancyPipeline)}».`
                : "Кандидат будет перемещён обратно в воронку."}
              {" "}Автоматическая обработка (если была остановлена) останется выключенной — включите её отдельно, если нужно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              onClick={(e) => { e.preventDefault(); void handleRestore() }}
            >
              {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
              Вернуть
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* #30/#31: Приглашение на интервью — два режима + редактируемый превью */}
      <Dialog open={confirmInterviewOpen} onOpenChange={setConfirmInterviewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Пригласить на интервью{candidate?.name ? ` — ${candidate.name}` : ""}</DialogTitle>
          </DialogHeader>

          {inviteLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загрузка…
            </div>
          ) : (
            <div className="space-y-3">
              {/* Вид встречи — передаётся в PUT stage interviewMode, кандидат
                  увидит его на странице самозаписи /schedule. */}
              <div className="space-y-1.5">
                <Label className="text-xs">Вид встречи</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: "phone", label: "Звонок" },
                    { v: "zoom", label: "Онлайн" },
                    { v: "office", label: "В офис" },
                  ] as const).map((m) => (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => setInviteMeetMode(m.v)}
                      className={cn(
                        "text-sm px-2.5 py-1.5 rounded-md border transition-colors",
                        inviteMeetMode === m.v
                          ? "bg-purple-600 border-purple-600 text-white font-medium"
                          : "border-border text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

            <Tabs value={inviteMode} onValueChange={(v) => setInviteMode(v as "link" | "slots")} className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="link">Ссылка на самозапись</TabsTrigger>
                <TabsTrigger value="slots">Предложить 2-3 времени</TabsTrigger>
              </TabsList>

              {/* Режим А — кандидат сам выбирает слот по ссылке /schedule */}
              <TabsContent value="link" className="space-y-3 pt-3">
                <p className="text-xs text-muted-foreground">
                  Кандидату уйдёт ссылка на страницу самозаписи — он сам выберет удобное время.
                  Плейсхолдер <code className="bg-muted px-1 rounded">{"{{schedule_link}}"}</code> заменится на персональную ссылку.
                </p>
                <EditableMessagePreview
                  text={inviteText}
                  onChange={setInviteText}
                  vars={{ name: inviteFirstName, vacancy: inviteVacancyTitle, schedule_link: inviteScheduleLink }}
                  placeholders={["name", "vacancy", "schedule_link"]}
                  onSaveTemplate={saveInviteTemplate}
                />
                {!inviteText.includes("{{schedule_link}}") && (
                  <p className="text-[11px] text-muted-foreground">
                    В тексте нет ссылки — персональная ссылка на самозапись будет
                    добавлена в конец сообщения автоматически
                    {inviteScheduleLink ? <>: <span className="font-mono break-all">{inviteScheduleLink}</span></> : "."}
                  </p>
                )}
              </TabsContent>

              {/* Режим Б — HR выбирает 2-3 конкретных времени из окон вакансии */}
              <TabsContent value="slots" className="space-y-3 pt-3">
                <p className="text-xs text-muted-foreground">
                  Выберите 2-3 времени из окон вакансии{inviteTzLabel ? ` (${inviteTzLabel})` : ""} — кандидат ответит, какое ему подходит.
                </p>
                {inviteDays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Нет доступных слотов. Проверьте окна интервью в настройках вакансии, либо используйте режим «Ссылка на самозапись».
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {inviteDays.map((day) => (
                      <div key={day.date}>
                        <div className="text-xs font-medium text-muted-foreground mb-1">{day.label}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {day.slots.map((t) => {
                            const key = `${day.date}|${t}`
                            const active = inviteSelectedSlots.includes(key)
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleInviteSlot(key)}
                                className={cn(
                                  "px-2.5 py-1 rounded-md text-xs border transition-colors",
                                  active
                                    ? "bg-purple-600 border-purple-600 text-white"
                                    : "bg-background hover:bg-muted border-border",
                                )}
                              >
                                {t}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {inviteSelectedSlots.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Выбрано: {inviteSelectedSlots.map(formatSlotKey).join("; ")}
                  </div>
                )}
                {/* Базовый текст + превью итогового сообщения со слотами */}
                <EditableMessagePreview
                  label="Вступительный текст (перед списком времени)"
                  text={inviteText}
                  onChange={setInviteText}
                  vars={{ name: inviteFirstName, vacancy: inviteVacancyTitle }}
                  placeholders={["name", "vacancy"]}
                  onSaveTemplate={saveInviteTemplate}
                />
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="text-[11px] text-muted-foreground mb-1">Итоговое сообщение кандидату:</div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {inviteSelectedSlots.length === 0
                      ? "Выберите время выше — оно добавится в сообщение."
                      : buildInviteMessage()
                          .replace(/\{\{\s*name\s*\}\}/g, inviteFirstName)
                          .replace(/\{\{\s*vacancy\s*\}\}/g, inviteVacancyTitle)}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmInterviewOpen(false)} disabled={!!changingStage}>Отмена</Button>
            <Button
              disabled={!!changingStage || inviteLoading || (inviteMode === "slots" && inviteSelectedSlots.length === 0)}
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => void submitInvite()}
            >
              {changingStage === "interview" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
              Отправить приглашение
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог записи контакта */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Записать контакт</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="drawer-contact-channel">Канал</Label>
              <Select value={contactChannel} onValueChange={(v) => setContactChannel(v as ContactChannel)}>
                <SelectTrigger id="drawer-contact-channel" className="w-full">
                  <SelectValue placeholder="Выберите канал" />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_CHANNELS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Исход</Label>
              <div className="flex gap-2 flex-wrap">
                {CONTACT_OUTCOMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setContactOutcome(item.id as ContactOutcome); if (item.id !== "no_fit") setContactReason("") }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                      contactOutcome === item.id
                        ? item.id === "fit"
                          ? "bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-300"
                          : item.id === "no_fit"
                          ? "bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300"
                          : "bg-muted border-border text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {contactOutcome === "no_fit" && (
              <div className="space-y-1.5">
                <Label htmlFor="drawer-contact-reason">Причина</Label>
                <Select value={contactReason} onValueChange={setContactReason}>
                  <SelectTrigger id="drawer-contact-reason" className="w-full">
                    <SelectValue placeholder="Выберите причину" />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_REASONS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="drawer-contact-comment">Комментарий <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
              <Textarea
                id="drawer-contact-comment"
                value={contactComment}
                onChange={(e) => setContactComment(e.target.value)}
                placeholder="Итоги разговора..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)} disabled={savingContact}>
              Отмена
            </Button>
            <Button onClick={() => void submitContact()} disabled={savingContact}>
              {savingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог причины отказа */}
      <AlertDialog open={confirmRejectOpen} onOpenChange={setConfirmRejectOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Причина отказа</AlertDialogTitle>
            <AlertDialogDescription>
              {candidate?.name ? <><b>{candidate.name}</b> будет переведён</> : "Кандидат будет переведён"} на стадию «Отказ».
              {" "}Укажите причину для отчёта по найму.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="drawer-reject-initiator">Кто отказался</Label>
              <Select value={rejectInitiator} onValueChange={setRejectInitiator}>
                <SelectTrigger id="drawer-reject-initiator" className="w-full">
                  <SelectValue placeholder="Выберите инициатора" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_INITIATORS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drawer-reject-reason">Причина</Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger id="drawer-reject-reason" className="w-full">
                  <SelectValue placeholder="Выберите причину" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drawer-reject-comment">Комментарий <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
              <Textarea
                id="drawer-reject-comment"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Дополнительные детали..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!changingStage}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!changingStage}
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void submitReject() }}
            >
              {changingStage === "rejected" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
              Отказать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Скоркарта интервью — «Отказ»: НЕ мгновенный, ставит отложенный отказ
          (scheduleRejection), исполнит cron pending-rejections. Причина —
          та же таксономия, что и в обычном диалоге отказа выше. */}
      <AlertDialog open={scorecardRejectReasonOpen} onOpenChange={setScorecardRejectReasonOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Причина отказа</AlertDialogTitle>
            <AlertDialogDescription>
              {candidate?.name ? <><b>{candidate.name}</b> получит</> : "Кандидат получит"} отложенный отказ (по задержке вакансии, как обычно) — можно отменить в карточке до исполнения.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="scorecard-reject-reason">Причина</Label>
              <Select value={scorecardRejectReason} onValueChange={setScorecardRejectReason}>
                <SelectTrigger id="scorecard-reject-reason" className="w-full">
                  <SelectValue placeholder="Выберите причину" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scorecard-reject-comment">Комментарий <span className="text-muted-foreground font-normal">(необязательно)</span></Label>
              <Textarea
                id="scorecard-reject-comment"
                value={scorecardRejectComment}
                onChange={(e) => setScorecardRejectComment(e.target.value)}
                placeholder="Дополнительные детали..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!scorecardDecisionSaving}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!scorecardDecisionSaving}
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void submitScorecardReject() }}
            >
              {scorecardDecisionSaving === "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
              Отказать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
