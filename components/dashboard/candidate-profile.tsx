"use client"

import { useState, useRef, useEffect } from "react"
import type { Candidate } from "./candidate-card"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CandidateAction } from "@/lib/column-config"
import { useAuth } from "@/lib/auth"
import { Input } from "@/components/ui/input"
import {
  MapPin, Briefcase, Circle, Calendar, Star, ExternalLink, Archive,
  CheckCircle2, XCircle, Clock, MessageSquare, Send, User,
  Play, FileText, History, Bot, Phone, Video, Building2,
  ChevronRight, Sparkles,
} from "lucide-react"

// ─── Мок-данные ─────────────────────────────────────────────

const MOCK_LESSONS = [
  { id: 1, emoji: "👋", title: "Приветствие", status: "done" as const },
  { id: 2, emoji: "🎥", title: "Видео-обращение", status: "done" as const },
  { id: 3, emoji: "🚀", title: "Куда растёт компания", status: "done" as const },
  { id: 4, emoji: "🏢", title: "О компании", status: "done" as const },
  { id: 5, emoji: "💰", title: "Рынок и заказчики", status: "done" as const },
  { id: 6, emoji: "🏗", title: "Обзор объектов", status: "done" as const },
  { id: 7, emoji: "👤", title: "Ваша роль", status: "done" as const },
  { id: 8, emoji: "⚙️", title: "Как устроена работа", status: "done" as const },
  { id: 9, emoji: "💵", title: "Система дохода", status: "done" as const },
  { id: 10, emoji: "📍", title: "Офис и команда", status: "done" as const },
  { id: 11, emoji: "📈", title: "Рост и карьера", status: "done" as const },
  { id: 12, emoji: "✅", title: "Задания и вопросы", status: "done" as const },
]

const MOCK_ANSWERS = [
  { question: "Расскажите о вашем опыте работы", answer: "Работал 5 лет в B2B продажах, последние 2 года — руководитель группы из 4 человек. Закрывал сделки до 5 млн.", aiScore: 87 },
  { question: "Почему вас заинтересовала эта должность?", answer: "Хочу расти в компании с сильным продуктом. Ваш подход к автоматизации найма — то, что нужно рынку.", aiScore: 92 },
  { question: "Какой у вас опыт продаж?", answer: "3-5 лет", aiScore: 75 },
]

interface ChatMessage {
  id: string
  text: string
  sender: "hr" | "candidate"
  time: string
  date: string
  channel: "hh" | "tg" | "wa" | "bot"
}

const MOCK_CHAT: ChatMessage[] = [
  { id: "m1", text: "Здравствуйте! Видели ваш отклик на «Менеджер по продажам» — выглядит интересно 👋 Подготовили короткий обзор должности: hrf.link/abc123", sender: "hr", time: "14:26", date: "15.03", channel: "bot" },
  { id: "m2", text: "Добрый день! Спасибо, посмотрю", sender: "candidate", time: "14:31", date: "15.03", channel: "hh" },
  { id: "m3", text: "Отлично! Если будут вопросы — пишите 🙂", sender: "hr", time: "14:32", date: "15.03", channel: "bot" },
  { id: "m4", text: "Прошёл демонстрацию, очень интересно! Хочу пообщаться подробнее", sender: "candidate", time: "16:25", date: "15.03", channel: "hh" },
  { id: "m5", text: "Рады, что понравилось! Давайте назначим звонок. Когда вам удобно?", sender: "hr", time: "16:30", date: "15.03", channel: "hh" },
  { id: "m6", text: "Завтра после 14:00 было бы идеально", sender: "candidate", time: "16:35", date: "15.03", channel: "hh" },
  { id: "m7", text: "Отлично, записал вас на 16.03 в 14:00. Ссылка на Zoom придёт за 15 минут. До встречи!", sender: "hr", time: "16:40", date: "15.03", channel: "hh" },
]

const MOCK_HISTORY = [
  { date: "15.03", time: "14:23", event: "Отклик получен с hh.ru", icon: ExternalLink, color: "text-blue-600" },
  { date: "15.03", time: "14:26", event: "Бот отправил приветственное сообщение", icon: Bot, color: "text-cyan-600" },
  { date: "15.03", time: "14:31", event: "Кандидат открыл ссылку на демонстрацию", icon: Play, color: "text-purple-600" },
  { date: "15.03", time: "15:47", event: "Начал демонстрацию", icon: Play, color: "text-indigo-600" },
  { date: "15.03", time: "16:22", event: "Завершил демонстрацию (94%)", icon: CheckCircle2, color: "text-emerald-600" },
  { date: "15.03", time: "16:23", event: "AI скоринг: 88/100", icon: Sparkles, color: "text-amber-600" },
  { date: "16.03", time: "10:00", event: "HR просмотрел карточку (Анна И.)", icon: User, color: "text-muted-foreground" },
]

const QUICK_TEMPLATES = [
  "Добрый день! Когда вам удобно пообщаться?",
  "Спасибо за прохождение демонстрации!",
  "Хотим пригласить вас на интервью",
]

// ─── Типы ────────────────────────────────────────────────────

interface CandidateProfileProps {
  candidate: Candidate | null
  columnId?: string
  columnTitle?: string
  columnColorFrom?: string
  columnColorTo?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
}

// ─── Score thresholds (persisted via state, shared across component) ──

interface ScoreThreshold {
  excellent: { min: number; color: string }
  good: { min: number; color: string }
  weak: { color: string }
}

const DEFAULT_THRESHOLDS: ScoreThreshold = {
  excellent: { min: 85, color: "#86EFAC" },
  good: { min: 65, color: "#F97316" },
  weak: { color: "#EF4444" },
}

let globalThresholds: ScoreThreshold = { ...DEFAULT_THRESHOLDS }

function getScoreRingStyle(score: number): string {
  if (score <= 0) return "#D1D5DB"
  if (score >= 100) return "#22C55E"
  if (score >= globalThresholds.excellent.min) return globalThresholds.excellent.color
  if (score >= globalThresholds.good.min) return globalThresholds.good.color
  return globalThresholds.weak.color
}

function getScoreColor(score: number) {
  if (score >= globalThresholds.excellent.min) return "text-emerald-600 bg-emerald-500"
  if (score >= globalThresholds.good.min) return "text-amber-600 bg-amber-500"
  return "text-red-600 bg-red-500"
}

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2 // radius accounting for stroke
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
  const offset = circ - (pct / 100) * circ
  const color = getScoreRingStyle(score)
  const noData = score === 0 || score == null

  return (
    <svg width={size} height={size} className="block">
      {/* Background circle */}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      {/* Progress arc */}
      {!noData && (
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-500"
        />
      )}
      {/* Score text */}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={noData ? "#D1D5DB" : color}
        fontSize={noData ? 11 : 14} fontWeight="bold"
      >
        {noData ? "—" : score}
      </text>
    </svg>
  )
}

const channelIcons: Record<string, { icon: typeof MessageSquare; color: string }> = {
  hh: { icon: ExternalLink, color: "text-red-500" },
  tg: { icon: Send, color: "text-blue-500" },
  wa: { icon: Phone, color: "text-emerald-500" },
  bot: { icon: Bot, color: "text-cyan-500" },
}

// ─── Компонент ──────────────────────────────────────────────

export function CandidateProfile({ candidate, columnId, columnTitle, columnColorFrom, columnColorTo, open, onOpenChange, onAction }: CandidateProfileProps) {
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState(MOCK_CHAT)
  const [showTemplates, setShowTemplates] = useState(false)
  const [interviewOpen, setInterviewOpen] = useState(false)
  const [interviewType, setInterviewType] = useState("online")
  const [interviewDuration, setInterviewDuration] = useState("45")
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [scorePopup, setScorePopup] = useState(false)
  const [thresholds, setThresholds] = useState<ScoreThreshold>(() => globalThresholds)
  const scorePopRef = useRef<HTMLDivElement>(null)
  const { role } = useAuth()
  const canEditThresholds = role === "admin" || role === "manager"

  useEffect(() => {
    if (!scorePopup) return
    const handler = (e: MouseEvent) => {
      if (scorePopRef.current && !scorePopRef.current.contains(e.target as Node)) setScorePopup(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [scorePopup])

  if (!candidate) return null

  const isOnline = candidate.lastSeen === "online"
  const demoLessons = candidate.demoProgress ?? 0
  const demoTotal = candidate.demoTotal ?? 12
  const hasAnswered = demoLessons >= 1
  const demoCompleted = demoLessons >= demoTotal
  const initials = candidate.name.split(" ").map(w => w[0]).join("").slice(0, 2)
  const matchPercent = Math.min(95, candidate.score + 5)

  const handleSendChat = () => {
    if (!chatInput.trim()) return
    setChatMessages(prev => [...prev, {
      id: `m-${Date.now()}`, text: chatInput, sender: "hr", time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), date: new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), channel: "hh",
    }])
    setChatInput("")
    toast.success("Сообщение отправлено")
  }

  const handleTemplateSelect = (text: string) => {
    setChatInput(text)
    setShowTemplates(false)
  }

  const handleScheduleInterview = () => {
    if (!selectedSlot) { toast.error("Выберите слот"); return }
    toast.success(`Интервью назначено: ${selectedSlot}`)
    setInterviewOpen(false)
    if (candidate && columnId) onAction?.(candidate.id, columnId, "advance")
    onOpenChange(false)
  }

  const days = Array.from({ length: 3 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d })
  const slots = ["10:00", "12:00", "14:00", "16:00"]
  const formatDay = (d: Date) => { const wd = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]; return `${wd[d.getDay()]}, ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}` }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
          {/* ═══ Шапка ═══════════════════════════════════════ */}
          <div className="px-5 pt-8 pb-5 border-b" style={{ background: columnColorFrom && columnColorTo ? `linear-gradient(135deg, ${columnColorFrom}15, ${columnColorTo}15)` : undefined }}>
            <div className="flex items-start gap-4">
              <Avatar className="w-14 h-14 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground">{candidate.name}</h2>
                  {/* AI Score — inline next to name with SVG arc */}
                  <div className="relative ml-3">
                    <button
                      onClick={() => canEditThresholds && setScorePopup(!scorePopup)}
                      className={cn("w-[44px] h-[44px] relative shrink-0 transition-transform", canEditThresholds && "cursor-pointer hover:scale-110")}
                      title={canEditThresholds ? "Настройка порогов" : `AI-скор: ${candidate.score}`}
                    >
                      <ScoreRing score={candidate.score} size={44} />
                    </button>

                    {/* Score threshold settings popup */}
                    {scorePopup && canEditThresholds && (
                      <div ref={scorePopRef} className="absolute top-12 left-0 z-50 bg-popover border border-border rounded-xl shadow-xl p-4 w-[320px] space-y-3">
                        <p className="text-xs font-semibold text-foreground">Настройка цветовых порогов AI-скора</p>

                        {/* Excellent */}
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: thresholds.excellent.color }} />
                          <span className="text-xs text-muted-foreground w-14 shrink-0">Отлично:</span>
                          <span className="text-xs text-muted-foreground shrink-0">от</span>
                          <Input type="number" min={0} max={100} value={thresholds.excellent.min} onChange={(e) => setThresholds({ ...thresholds, excellent: { ...thresholds.excellent, min: parseInt(e.target.value) || 0 } })} className="w-14 h-7 text-xs text-center" />
                          <span className="text-xs text-muted-foreground shrink-0">до 100%</span>
                          <input type="color" value={thresholds.excellent.color} onChange={(e) => setThresholds({ ...thresholds, excellent: { ...thresholds.excellent, color: e.target.value } })} className="w-6 h-6 rounded border border-border cursor-pointer shrink-0" />
                        </div>

                        {/* Good */}
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: thresholds.good.color }} />
                          <span className="text-xs text-muted-foreground w-14 shrink-0">Хорошо:</span>
                          <span className="text-xs text-muted-foreground shrink-0">от</span>
                          <Input type="number" min={0} max={100} value={thresholds.good.min} onChange={(e) => setThresholds({ ...thresholds, good: { ...thresholds.good, min: parseInt(e.target.value) || 0 } })} className="w-14 h-7 text-xs text-center" />
                          <span className="text-xs text-muted-foreground shrink-0">до {thresholds.excellent.min - 1}%</span>
                          <input type="color" value={thresholds.good.color} onChange={(e) => setThresholds({ ...thresholds, good: { ...thresholds.good, color: e.target.value } })} className="w-6 h-6 rounded border border-border cursor-pointer shrink-0" />
                        </div>

                        {/* Weak */}
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: thresholds.weak.color }} />
                          <span className="text-xs text-muted-foreground w-14 shrink-0">Слабо:</span>
                          <span className="text-xs text-muted-foreground shrink-0">от 0% до {thresholds.good.min - 1}%</span>
                          <div className="flex-1" />
                          <input type="color" value={thresholds.weak.color} onChange={(e) => setThresholds({ ...thresholds, weak: { ...thresholds.weak, color: e.target.value } })} className="w-6 h-6 rounded border border-border cursor-pointer shrink-0" />
                        </div>

                        <Button size="sm" className="w-full text-xs h-8" onClick={() => {
                          globalThresholds = { ...thresholds }
                          setScorePopup(false)
                          toast.success("Пороги сохранены")
                        }}>
                          Сохранить
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className={cn("text-xs", candidate.source === "hh.ru" ? "border-red-200 text-red-600" : candidate.source === "Telegram" ? "border-blue-200 text-blue-600" : "border-border text-muted-foreground")}>
                    {candidate.source}
                  </Badge>
                  {candidate.utmSource && <span className="text-xs text-muted-foreground">{candidate.utmSource}</span>}
                  {isOnline ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600"><Circle className="w-2 h-2 fill-current" /> онлайн</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">был {(() => { const d = candidate.lastSeen as Date; const h = Math.floor((Date.now() - d.getTime()) / 3600000); return h < 1 ? `${Math.floor((Date.now() - d.getTime()) / 60000)} мин. назад` : `${h} ч. назад` })()}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setInterviewOpen(true)}>
                <Calendar className="w-3.5 h-3.5" /> Пригласить
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { if (columnId) { onAction?.(candidate.id, columnId, "hire"); onOpenChange(false) } }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Нанять
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30" onClick={() => { if (columnId) { onAction?.(candidate.id, columnId, "reserve"); onOpenChange(false) } }}>
                <Archive className="w-3.5 h-3.5" /> В резерв
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10" onClick={() => { if (columnId) { onAction?.(candidate.id, columnId, "reject"); onOpenChange(false) } }}>
                <XCircle className="w-3.5 h-3.5" /> Отказать
              </Button>
            </div>
          </div>

          {/* ═══ Табы ════════════════════════════════════════ */}
          <Tabs defaultValue="profile" className="px-5 pt-4 pb-6">
            <TabsList className="w-full grid grid-cols-5 mb-4">
              <TabsTrigger value="profile" className="text-xs gap-1"><User className="w-3 h-3" /> Профиль</TabsTrigger>
              <TabsTrigger value="demo" className="text-xs gap-1"><Play className="w-3 h-3" /> Демо</TabsTrigger>
              <TabsTrigger value="answers" className="text-xs gap-1"><FileText className="w-3 h-3" /> Ответы</TabsTrigger>
              <TabsTrigger value="chat" className="text-xs gap-1"><MessageSquare className="w-3 h-3" /> Чат</TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1"><History className="w-3 h-3" /> История</TabsTrigger>
            </TabsList>

            {/* ─── Профиль ──────────────────────────────────── */}
            <TabsContent value="profile" className="space-y-5 mt-0">
              {!hasAnswered ? (
                <div className="p-6 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-center">
                  <Clock className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Резюме будет доступно после прохождения первого задания</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Это мотивирует не судить кандидата по резюме до ответов</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-muted-foreground" /> {candidate.city}</div>
                    <div className="flex items-center gap-2 text-sm"><Briefcase className="w-4 h-4 text-muted-foreground" /> {candidate.salaryMin.toLocaleString("ru-RU")} – {candidate.salaryMax.toLocaleString("ru-RU")} ₽</div>
                    <div className="flex items-center gap-2 text-sm"><Briefcase className="w-4 h-4 text-muted-foreground" /> {candidate.experience}</div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Ключевые навыки</p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.skills.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">AI-анализ резюме</p>
                    <div className="p-3 rounded-lg bg-muted/50 border text-sm text-foreground leading-relaxed">
                      <Sparkles className="w-4 h-4 text-amber-500 inline mr-1" />
                      Кандидат с сильным опытом в {candidate.skills[0] || "продажах"}. Хорошо структурирует мысли, демонстрирует понимание B2B-процессов. Рекомендуется для позиций среднего и старшего уровня.
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Совпадение с портретом должности</p>
                    <div className="flex items-center gap-3">
                      <Progress value={matchPercent} className="h-2.5 flex-1" />
                      <span className="text-sm font-bold text-foreground">{matchPercent}%</span>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ─── Демонстрация ─────────────────────────────── */}
            <TabsContent value="demo" className="space-y-5 mt-0">
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{demoCompleted ? "✅ Завершено" : "⏳ В процессе"}</span>
                  <span className="text-sm font-bold">{demoLessons}/{demoTotal} · {candidate.demoTimeMin || 0} мин · {demoTotal > 0 ? Math.round((demoLessons / demoTotal) * 100) : 0}%</span>
                </div>
                <Progress value={demoTotal > 0 ? (demoLessons / demoTotal) * 100 : 0} className="h-2" />
              </div>

              <div className="space-y-1">
                {MOCK_LESSONS.slice(0, demoTotal).map((l, i) => {
                  const done = i < demoLessons
                  return (
                    <div key={l.id} className={cn("flex items-center gap-2.5 p-2 rounded-lg text-sm", done ? "text-foreground" : "text-muted-foreground")}>
                      <span className="w-5 text-center">{done ? "✅" : i === demoLessons ? "⏳" : "❌"}</span>
                      <span>{l.emoji} {l.title}</span>
                    </div>
                  )
                })}
              </div>

              {hasAnswered && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Ответы на задания</p>
                    <div className="space-y-3">
                      {MOCK_ANSWERS.map((a, i) => (
                        <div key={i} className="p-3 rounded-lg border bg-card space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">{a.question}</p>
                          <p className="text-sm text-foreground">{a.answer}</p>
                          <div className="flex items-center gap-2">
                            <Progress value={a.aiScore} className="h-1.5 flex-1" />
                            <span className={cn("text-xs font-bold", a.aiScore >= 80 ? "text-emerald-600" : a.aiScore >= 60 ? "text-amber-600" : "text-red-600")}>{a.aiScore}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">AI-резюме по ответам</p>
                    <div className="p-3 rounded-lg bg-muted/50 border text-sm text-foreground leading-relaxed">
                      <Sparkles className="w-4 h-4 text-amber-500 inline mr-1" />
                      Кандидат демонстрирует сильный опыт в B2B-продажах с фокусом на крупных клиентов. Ответы структурированы, показывают аналитическое мышление. Мотивация — рост дохода и карьера. Рекомендован для следующего этапа.
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ─── Ответы ──────────────────────────────────── */}
            <TabsContent value="answers" className="space-y-5 mt-0">
              {/* Ответы на вопросы */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Ответы на вопросы
                </h3>
                {MOCK_ANSWERS.length > 0 ? (
                  <div className="space-y-3">
                    {MOCK_ANSWERS.map((a, i) => (
                      <div key={i} className="p-3 rounded-lg border border-border">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">{i + 1}. {a.question}</p>
                        <p className="text-sm text-foreground mb-2">{a.answer}</p>
                        <div className="flex items-center gap-2">
                          <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                            a.aiScore >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
                            a.aiScore >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
                            "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                          )}>
                            <Sparkles className="w-3 h-3" />
                            AI: {a.aiScore}/100
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {a.aiScore >= 80 ? "Отличный ответ" : a.aiScore >= 60 ? "Хороший ответ" : "Требует внимания"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">Кандидат ещё не ответил на вопросы</p>
                )}
              </div>

              <Separator />

              {/* Видео и аудио */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Video className="w-4 h-4 text-muted-foreground" />
                  Видео и аудио
                </h3>
                {hasAnswered ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center shrink-0">
                        <Video className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Видео-визитка</p>
                        <p className="text-[11px] text-muted-foreground">Урок «Видео-визитка» · 1:42</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"><Play className="w-3 h-3" />Смотреть</Button>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0">
                        <Play className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Аудио-ответ</p>
                        <p className="text-[11px] text-muted-foreground">Урок «Задания и вопросы» · 0:45</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"><Play className="w-3 h-3" />Слушать</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">Записей пока нет</p>
                )}
              </div>
            </TabsContent>

            {/* ─── Чат ──────────────────────────────────────── */}
            <TabsContent value="chat" className="mt-0">
              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-3">
                {chatMessages.map(msg => {
                  const ch = channelIcons[msg.channel] || channelIcons.hh
                  const ChIcon = ch.icon
                  return (
                    <div key={msg.id} className={cn("flex", msg.sender === "hr" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5", msg.sender === "hr" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md")}>
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        <div className={cn("flex items-center gap-1.5 mt-1", msg.sender === "hr" ? "justify-end" : "justify-start")}>
                          <ChIcon className={cn("w-2.5 h-2.5", msg.sender === "hr" ? "text-primary-foreground/50" : ch.color)} />
                          <span className={cn("text-[10px]", msg.sender === "hr" ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            {msg.date} {msg.time}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Input */}
              <div className="border-t pt-3 space-y-2">
                {showTemplates && (
                  <div className="space-y-1 p-2 rounded-lg bg-muted/50 border">
                    {QUICK_TEMPLATES.map((t, i) => (
                      <button key={i} className="w-full text-left text-xs p-2 rounded hover:bg-primary/5 text-foreground" onClick={() => handleTemplateSelect(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button className="text-xs text-muted-foreground hover:text-primary shrink-0" onClick={() => setShowTemplates(!showTemplates)}>
                    Шаблоны ▼
                  </button>
                  <input
                    className="flex-1 h-9 rounded-lg border px-3 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Написать сообщение..."
                    onKeyDown={e => { if (e.key === "Enter") handleSendChat() }}
                  />
                  <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSendChat}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ─── История ──────────────────────────────────── */}
            <TabsContent value="history" className="mt-0">
              <div className="space-y-1">
                {MOCK_HISTORY.map((h, i) => {
                  const Icon = h.icon
                  return (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30">
                      <div className={cn("w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5")}>
                        <Icon className={cn("w-3 h-3", h.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{h.event}</p>
                        <p className="text-[10px] text-muted-foreground">{h.date} · {h.time}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* ═══ Планировщик интервью ═════════════════════════════ */}
      <Dialog open={interviewOpen} onOpenChange={setInterviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Пригласить на интервью</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Тип</label>
                <Select value={interviewType} onValueChange={setInterviewType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online"><Video className="w-3.5 h-3.5 inline mr-1.5" />Онлайн</SelectItem>
                    <SelectItem value="office"><Building2 className="w-3.5 h-3.5 inline mr-1.5" />Офис</SelectItem>
                    <SelectItem value="phone"><Phone className="w-3.5 h-3.5 inline mr-1.5" />Телефон</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Длительность</label>
                <Select value={interviewDuration} onValueChange={setInterviewDuration}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 мин</SelectItem>
                    <SelectItem value="45">45 мин</SelectItem>
                    <SelectItem value="60">60 мин</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              {days.map(day => (
                <div key={day.toISOString()}>
                  <p className="text-sm font-medium text-muted-foreground mb-2">{formatDay(day)}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map(time => {
                      const key = `${formatDay(day)} ${time}`
                      return (
                        <button key={key} className={cn("py-2.5 rounded-lg border text-sm font-medium transition-all", selectedSlot === key ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20" : "border-border hover:border-primary/30")} onClick={() => setSelectedSlot(key)}>
                          {time}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">Кандидат получит ссылку для подтверждения выбранного времени</p>

            <Button className="w-full" disabled={!selectedSlot} onClick={handleScheduleInterview}>
              <Calendar className="w-4 h-4 mr-2" /> Назначить интервью
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
