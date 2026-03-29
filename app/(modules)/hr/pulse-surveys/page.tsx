"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  MessageSquare, Plus, Send, Clock, CheckCircle, BarChart3,
  Smile, Meh, Frown, TrendingUp, TrendingDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Типы ────────────────────────────────────────────────────────────────────

interface PulseQuestion {
  id: string
  text: string
  category: string
  isSystem: boolean
}

interface PulseSurvey {
  id: string
  title: string | null
  status: string
  channel: string
  responseCount: number
  scheduledAt: string | null
  sentAt: string | null
  closesAt: string | null
  createdAt: string
  questionIds: string[] | null
}

// ── Конфиг ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft:     { label: "Черновик",    color: "bg-muted text-muted-foreground",                      icon: Clock },
  scheduled: { label: "Запланирован",color: "bg-blue-500/15 text-blue-700 dark:text-blue-400",     icon: Clock },
  sent:      { label: "Отправлен",   color: "bg-amber-500/15 text-amber-700 dark:text-amber-400",  icon: Send },
  closed:    { label: "Закрыт",      color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: CheckCircle },
}

const CATEGORY_LABELS: Record<string, string> = {
  engagement:    "Вовлечённость",
  satisfaction:  "Удовлетворённость",
  management:    "Руководство",
  culture:       "Культура",
  workload:      "Нагрузка",
  growth:        "Рост",
  communication: "Коммуникация",
  wellbeing:     "Самочувствие",
  team:          "Команда",
  compensation:  "Компенсация",
}

const CHANNEL_LABELS: Record<string, string> = {
  telegram:  "Telegram",
  whatsapp:  "WhatsApp",
  email:     "Email",
  web:       "Web",
}

// ── Компонент ───────────────────────────────────────────────────────────────

export default function PulseSurveysPage() {
  const [surveys, setSurveys] = useState<PulseSurvey[]>([])
  const [questions, setQuestions] = useState<PulseQuestion[]>([])
  const [tab, setTab] = useState<"surveys" | "questions">("surveys")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [surveysRes, questionsRes] = await Promise.all([
        fetch("/api/modules/hr/pulse-surveys"),
        fetch("/api/modules/hr/pulse-surveys?type=questions"),
      ])
      setSurveys(await surveysRes.json())
      setQuestions(await questionsRes.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createSurvey = async () => {
    // Берём 2 случайных вопроса (ротация — не повторяются)
    const shuffled = [...questions].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, 2).map(q => q.id)

    await fetch("/api/modules/hr/pulse-surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Пульс-опрос #${surveys.length + 1}`,
        questionIds: selected,
        channel: "telegram",
        status: "draft",
      }),
    })
    load()
  }

  // eNPS из вопросов (последний вопрос — eNPS)
  const enpsQuestion = questions.find(q => q.category === "culture")

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader title="Пульс-опросы" subtitle="Еженедельный мониторинг настроения команды" />
        <main className="p-6 space-y-6">

          {/* ── Сводка ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Всего опросов</p>
              <p className="text-2xl font-semibold">{surveys.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Отправлено</p>
              <p className="text-2xl font-semibold">{surveys.filter(s => s.status === "sent" || s.status === "closed").length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Ответов всего</p>
              <p className="text-2xl font-semibold">{surveys.reduce((acc, s) => acc + (s.responseCount || 0), 0)}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Вопросов в базе</p>
              <p className="text-2xl font-semibold">{questions.length}</p>
            </div>
          </div>

          {/* ── Табы ── */}
          <div className="flex items-center gap-4 border-b border-border">
            <button
              onClick={() => setTab("surveys")}
              className={cn(
                "pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === "surveys"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="size-4 inline mr-1.5" />
              Опросы
            </button>
            <button
              onClick={() => setTab("questions")}
              className={cn(
                "pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === "questions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="size-4 inline mr-1.5" />
              Вопросы ({questions.length})
            </button>
            <div className="flex-1" />
            <Button size="sm" onClick={createSurvey}>
              <Plus className="size-4 mr-1.5" />
              Создать опрос
            </Button>
          </div>

          {/* ── Список опросов ── */}
          {tab === "surveys" && (
            <div className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Загрузка...</p>
              ) : surveys.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="size-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Пока нет опросов</p>
                  <Button size="sm" onClick={createSurvey}>
                    <Plus className="size-4 mr-1.5" />
                    Создать первый опрос
                  </Button>
                </div>
              ) : (
                surveys.map((survey) => {
                  const cfg = STATUS_CONFIG[survey.status] ?? STATUS_CONFIG.draft
                  const StatusIcon = cfg.icon
                  return (
                    <div
                      key={survey.id}
                      className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className={cn("p-2 rounded-lg", cfg.color.split(" ")[0])}>
                        <StatusIcon className={cn("size-5", cfg.color.split(" ").slice(1).join(" "))} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{survey.title || "Без названия"}</p>
                        <p className="text-xs text-muted-foreground">
                          {CHANNEL_LABELS[survey.channel] || survey.channel}
                          {survey.sentAt && ` · Отправлен ${new Date(survey.sentAt).toLocaleDateString("ru")}`}
                          {" · "}{survey.questionIds?.length ?? 0} вопросов
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold">{survey.responseCount}</p>
                        <p className="text-xs text-muted-foreground">ответов</p>
                      </div>
                      <Badge variant="secondary" className={cn("text-xs", cfg.color)}>
                        {cfg.label}
                      </Badge>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── Вопросы ── */}
          {tab === "questions" && (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left font-medium px-4 py-3">Вопрос</th>
                    <th className="text-center font-medium px-4 py-3 w-32">Категория</th>
                    <th className="text-center font-medium px-4 py-3 w-24">Тип</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q.id} className="border-t border-border">
                      <td className="px-4 py-3">{q.text}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORY_LABELS[q.category] || q.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-muted-foreground">
                          {q.isSystem ? "Системный" : "Свой"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
