"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Target, Loader2, Phone, Headphones, UserCheck, ChevronRight, Plus, X,
  MessageCircle, Volume2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Scenario {
  id: string
  title: string
  description: string | null
  type: string
  difficulty: string
  isPreset: boolean
  createdAt: string
}

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  cold_call: {
    icon: <Phone className="size-4" />,
    label: "Холодный звонок",
    color: "bg-red-500/15 text-red-700",
  },
  inbound_support: {
    icon: <Headphones className="size-4" />,
    label: "Обслуживание",
    color: "bg-blue-500/15 text-blue-700",
  },
  interview: {
    icon: <UserCheck className="size-4" />,
    label: "Собеседование",
    color: "bg-violet-500/15 text-violet-700",
  },
  custom: {
    icon: <Target className="size-4" />,
    label: "Кастомный",
    color: "bg-muted text-muted-foreground",
  },
}

const DIFFICULTY_META: Record<string, { label: string; className: string }> = {
  easy: { label: "Легко", className: "bg-emerald-500/15 text-emerald-700" },
  medium: { label: "Средне", className: "bg-amber-500/15 text-amber-700" },
  hard: { label: "Сложно", className: "bg-red-500/15 text-red-700" },
}

const DEFAULT_CRITERIA = [
  { key: "greeting", label: "Приветствие" },
  { key: "qualification", label: "Квалификация" },
  { key: "presentation", label: "Презентация" },
  { key: "objections", label: "Работа с возражениями" },
  { key: "closing", label: "Закрытие" },
]

interface Article {
  id: string
  title: string
}

type ScenarioType = "cold_call" | "inbound_support" | "interview" | "custom"
type Difficulty = "easy" | "medium" | "hard"

function slugCriterion(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30) || `c_${Date.now()}`
}

export default function TrainingListPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)

  // ── Create scenario modal ──────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<ScenarioType>("cold_call")
  const [difficulty, setDifficulty] = useState<Difficulty>("medium")
  const [situation, setSituation] = useState("")
  const [aiRole, setAiRole] = useState("")
  const [criteria, setCriteria] = useState<{ key: string; label: string; enabled: boolean }[]>(
    DEFAULT_CRITERIA.map((c) => ({ ...c, enabled: true })),
  )
  const [newCriterion, setNewCriterion] = useState("")
  const [articles, setArticles] = useState<Article[]>([])
  const [articleId, setArticleId] = useState<string>("none")

  async function loadScenarios() {
    setLoading(true)
    try {
      const res = await fetch("/api/modules/knowledge/training")
      if (res.ok) {
        const data = (await res.json()) as { scenarios: Scenario[] }
        setScenarios(data.scenarios)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadScenarios()
  }, [])

  // Load articles for "related material" picker when modal opens
  useEffect(() => {
    if (!createOpen || articles.length > 0) return
    fetch("/api/modules/knowledge/articles?limit=100")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { articles?: Article[] } | null) => {
        if (d?.articles) setArticles(d.articles)
      })
      .catch(() => {})
  }, [createOpen, articles.length])

  function resetForm() {
    setTitle("")
    setType("cold_call")
    setDifficulty("medium")
    setSituation("")
    setAiRole("")
    setCriteria(DEFAULT_CRITERIA.map((c) => ({ ...c, enabled: true })))
    setNewCriterion("")
    setArticleId("none")
  }

  function addCustomCriterion() {
    const label = newCriterion.trim()
    if (!label) return
    const key = slugCriterion(label)
    if (criteria.some((c) => c.key === key)) {
      toast.error("Такой критерий уже есть")
      return
    }
    setCriteria((prev) => [...prev, { key, label, enabled: true }])
    setNewCriterion("")
  }

  function toggleCriterion(key: string) {
    setCriteria((prev) => prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c)))
  }

  function removeCriterion(key: string) {
    setCriteria((prev) => prev.filter((c) => c.key !== key))
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("Укажите название")
      return
    }
    if (!aiRole.trim()) {
      toast.error("Опишите роль AI")
      return
    }
    const enabledCriteria = criteria.filter((c) => c.enabled).map(({ key, label }) => ({ key, label }))
    if (enabledCriteria.length === 0) {
      toast.error("Выберите хотя бы один критерий оценки")
      return
    }

    // Собираем полноценный system prompt: роль + ситуация + стандартные стилевые указания
    const systemPrompt = [
      aiRole.trim(),
      situation.trim() ? `\nСИТУАЦИЯ:\n${situation.trim()}` : "",
      `\nСТИЛЬ ОТВЕТОВ:`,
      `- Кратко (1-3 предложения)`,
      `- Без мета-комментариев — ты играешь роль, а не помогаешь`,
      `- Только реплика персонажа, без префиксов типа «AI:»`,
    ].filter(Boolean).join("\n")

    setCreating(true)
    try {
      const res = await fetch("/api/modules/knowledge/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: situation.trim() || undefined,
          type,
          difficulty,
          systemPrompt,
          criteria: enabledCriteria,
          relatedArticleId: articleId !== "none" ? articleId : undefined,
        }),
      })
      const data = await res.json() as { id?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error || "Не удалось создать сценарий")
        return
      }
      toast.success("Сценарий создан")
      setCreateOpen(false)
      resetForm()
      await loadScenarios()
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setCreating(false)
    }
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
              <Link href="/learning/dashboard" className="hover:text-foreground transition-colors">Обучение</Link>
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium">Тренировки</span>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <Target className="size-5 text-violet-500" />
                  <h1 className="text-xl font-semibold">Тренировки с AI</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Ролевые сценарии: AI играет собеседника, оценивает ваш диалог и даёт рекомендации
                </p>
              </div>
              <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Создать сценарий
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Загрузка...
              </div>
            ) : scenarios.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Target className="size-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Пока нет сценариев</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Создайте первый сценарий или обновите страницу — встроенные пресеты появятся автоматически.
                </p>
                <Button className="gap-1.5" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5" />
                  Создать сценарий
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scenarios.map((s) => {
                  const typeMeta = TYPE_META[s.type] ?? TYPE_META.custom
                  const diffMeta = DIFFICULTY_META[s.difficulty] ?? DIFFICULTY_META.medium
                  return (
                    <div
                      key={s.id}
                      className="group flex flex-col border rounded-xl p-5 bg-card transition-all hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn("p-2 rounded-lg", typeMeta.color)}>{typeMeta.icon}</div>
                        <div className="flex gap-1.5">
                          <Badge variant="secondary" className={cn("text-[10px]", typeMeta.color)}>
                            {typeMeta.label}
                          </Badge>
                          <Badge variant="secondary" className={cn("text-[10px]", diffMeta.className)}>
                            {diffMeta.label}
                          </Badge>
                        </div>
                      </div>

                      <h3 className="font-semibold text-sm mb-1 line-clamp-2">{s.title}</h3>
                      {s.description && (
                        <p className="text-xs text-muted-foreground line-clamp-3 mb-3 flex-1">
                          {s.description}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          <MessageCircle className="size-3" />
                          Чат
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          <Volume2 className="size-3" />
                          Голос
                        </span>
                      </div>

                      <Link href={`/learning/training/${s.id}`}>
                        <Button className="w-full gap-1.5" size="sm">
                          <Target className="size-3.5" />
                          Начать тренировку
                        </Button>
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SidebarInset>

      {/* Create scenario dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm() }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Новый сценарий тренировки</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tr-title" className="text-sm">Название тренировки</Label>
              <Input
                id="tr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Холодный звонок в банк"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Тип</Label>
                <Select value={type} onValueChange={(v) => setType(v as ScenarioType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold_call">Холодный звонок</SelectItem>
                    <SelectItem value="inbound_support">Входящий звонок / обслуживание</SelectItem>
                    <SelectItem value="interview">Собеседование</SelectItem>
                    <SelectItem value="custom">Свой</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Сложность</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Легко</SelectItem>
                    <SelectItem value="medium">Средне</SelectItem>
                    <SelectItem value="hard">Сложно</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tr-situation" className="text-sm">Описание ситуации</Label>
              <Textarea
                id="tr-situation"
                rows={3}
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="Например: Вы звоните директору строительной компании с предложением CRM-системы. Компании 150 человек, сейчас используют Excel..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tr-role" className="text-sm">Роль AI</Label>
              <Textarea
                id="tr-role"
                rows={4}
                value={aiRole}
                onChange={(e) => setAiRole(e.target.value)}
                placeholder="Например: Ты играешь роль занятого директора, который не хочет разговаривать. Первые 10 секунд звучишь раздражённо. Задаёшь жёсткие вопросы..."
              />
              <p className="text-[10px] text-muted-foreground">
                AI будет следовать этой инструкции во время диалога
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Критерии оценки</Label>
              <div className="space-y-1.5 rounded-lg border p-3">
                {criteria.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`cr-${c.key}`}
                      checked={c.enabled}
                      onCheckedChange={() => toggleCriterion(c.key)}
                    />
                    <Label htmlFor={`cr-${c.key}`} className="flex-1 text-sm font-normal cursor-pointer">
                      {c.label}
                    </Label>
                    <button
                      type="button"
                      onClick={() => removeCriterion(c.key)}
                      className="p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2 border-t mt-2">
                  <Input
                    placeholder="Добавить свой критерий..."
                    value={newCriterion}
                    onChange={(e) => setNewCriterion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addCustomCriterion()
                      }
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addCustomCriterion}
                    disabled={!newCriterion.trim()}
                    className="h-8"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Привязка к материалу (необязательно)</Label>
              <Select value={articleId} onValueChange={setArticleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Не привязан" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не привязан —</SelectItem>
                  {articles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info: режимы тренировки */}
            <div className="bg-muted rounded-lg p-3 flex items-start gap-2.5">
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <MessageCircle className="size-4 text-muted-foreground" />
                <Volume2 className="size-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                После создания сценария вы сможете тренироваться в текстовом чате или в голосовом режиме — как настоящий звонок.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Отмена
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="size-4 mr-2 animate-spin" />}
                Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
