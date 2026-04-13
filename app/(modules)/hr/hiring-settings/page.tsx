"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Settings, Clock, Save, Bell, GitBranch, MessageSquare, ShieldAlert, Plus, Pencil, Trash2, Palette, Play } from "lucide-react"
import { toast } from "sonner"

// ─── Constants ─────────────────────────────────────────────────────────────

const INTERVIEW_DAYS = [
  { id: "mon", label: "Пн" }, { id: "tue", label: "Вт" }, { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" }, { id: "fri", label: "Пт" }, { id: "sat", label: "Сб" },
]

const FUNNEL_SCENARIOS: Record<string, { label: string; stages: string[] }> = {
  standard: {
    label: "Стандартный",
    stages: ["Новый отклик", "Скрининг", "Демонстрация", "Интервью с HR", "Интервью с руководителем", "Оффер", "Выход на работу"],
  },
  fast: {
    label: "Быстрый",
    stages: ["Новый отклик", "Демонстрация", "Интервью", "Оффер", "Выход на работу"],
  },
  test_task: {
    label: "С тестовым заданием",
    stages: ["Новый отклик", "Скрининг", "Тестовое задание", "Интервью с HR", "Интервью с руководителем", "Оффер", "Выход на работу"],
  },
  two_stage: {
    label: "Двухэтапный",
    stages: ["Новый отклик", "Демонстрация", "Финальное интервью", "Оффер", "Выход на работу"],
  },
  mass: {
    label: "Массовый",
    stages: ["Новый отклик", "Демонстрация", "Групповое интервью", "Оффер", "Выход на работу"],
  },
}

type MessageTemplate = {
  id: string
  name: string
  type: "invite" | "reject" | "reminder" | "offer" | "custom"
  channel: "email" | "sms" | "telegram"
  text: string
  isSystem: boolean
}

const TYPE_LABELS: Record<string, string> = {
  invite: "Приглашение",
  reject: "Отказ",
  reminder: "Напоминание",
  offer: "Оффер",
  custom: "Произвольное",
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  telegram: "Telegram",
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "sys-1",
    name: "Приглашение на демонстрацию",
    type: "invite",
    channel: "email",
    text: "Здравствуйте, {{имя_кандидата}}! Приглашаем вас пройти демонстрацию для позиции «{{должность}}» в компании {{компания}}. Ссылка: {{ссылка_на_демо}}",
    isSystem: true,
  },
  {
    id: "sys-2",
    name: "Приглашение на интервью",
    type: "invite",
    channel: "email",
    text: "Здравствуйте, {{имя_кандидата}}! Приглашаем вас на интервью на позицию «{{должность}}» в компании {{компания}}. Дата: {{дата_интервью}}, время: {{время_интервью}}.",
    isSystem: true,
  },
  {
    id: "sys-3",
    name: "Вежливый отказ",
    type: "reject",
    channel: "email",
    text: "Здравствуйте, {{имя_кандидата}}! Благодарим за интерес к позиции «{{должность}}» в компании {{компания}}. К сожалению, мы приняли решение продолжить с другими кандидатами. Желаем удачи!",
    isSystem: true,
  },
  {
    id: "sys-4",
    name: "Оффер",
    type: "offer",
    channel: "email",
    text: "Здравствуйте, {{имя_кандидата}}! Рады сообщить, что мы готовы предложить вам позицию «{{должность}}» в компании {{компания}}. Ждём вашего ответа!",
    isSystem: true,
  },
]

// ─── Page ──────────────────────────────────────────────────────────────────

export default function HiringSettingsPage() {
  // ── Schedule state ──
  const [slotDuration, setSlotDuration] = useState("30")
  const [bufferTime, setBufferTime] = useState("15")
  const [interviewFrom, setInterviewFrom] = useState("09:00")
  const [interviewTo, setInterviewTo] = useState("18:00")
  const [interviewDays, setInterviewDays] = useState<Set<string>>(new Set(["mon", "tue", "wed", "thu", "fri"]))
  const [maxPerDay, setMaxPerDay] = useState("8")
  const [remind24h, setRemind24h] = useState(true)
  const [remind2h, setRemind2h] = useState(true)

  // ── General: company selector toggle ──
  const [showCompanySelector, setShowCompanySelector] = useState(false)
  useEffect(() => {
    setShowCompanySelector(localStorage.getItem("mk_hr_show_company_selector") === "true")
  }, [])
  const toggleCompanySelector = (checked: boolean) => {
    setShowCompanySelector(checked)
    localStorage.setItem("mk_hr_show_company_selector", String(checked))
    toast.success(checked ? "Выбор компании включён в анкете" : "Секция «Компания» скрыта")
  }

  // ── Funnel state ──
  const [selectedScenario, setSelectedScenario] = useState("standard")
  const [autoDemo, setAutoDemo] = useState(true)
  const [autoInvite, setAutoInvite] = useState(false)
  const [minScore, setMinScore] = useState("70")
  const [autoReject, setAutoReject] = useState(false)

  // ── Messages state ──
  const [templates, setTemplates] = useState<MessageTemplate[]>(DEFAULT_TEMPLATES)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [tplName, setTplName] = useState("")
  const [tplType, setTplType] = useState<MessageTemplate["type"]>("invite")
  const [tplChannel, setTplChannel] = useState<MessageTemplate["channel"]>("email")
  const [tplText, setTplText] = useState("")

  // ── Stop-factors state ──
  const [sfCity, setSfCity] = useState(false)
  const [sfCityValue, setSfCityValue] = useState("")
  const [sfFormat, setSfFormat] = useState(false)
  const [sfAge, setSfAge] = useState(false)
  const [sfAgeMin, setSfAgeMin] = useState("")
  const [sfAgeMax, setSfAgeMax] = useState("")
  const [sfExperience, setSfExperience] = useState(false)
  const [sfExpValue, setSfExpValue] = useState("")
  const [sfDocs, setSfDocs] = useState(false)
  const [sfCitizenship, setSfCitizenship] = useState(false)
  const [sfCitizenshipValue, setSfCitizenshipValue] = useState("")
  const [sfSalary, setSfSalary] = useState(false)
  const [sfSalaryValue, setSfSalaryValue] = useState("")
  const [sfAutoReject, setSfAutoReject] = useState(false)
  const [sfRejectTemplate, setSfRejectTemplate] = useState("Вежливый отказ")

  // ── Branding state ──
  const [brandCompanyName, setBrandCompanyName] = useState("")
  const [brandGreeting, setBrandGreeting] = useState("Привет, {name}! 👋")
  const [brandTheme, setBrandTheme] = useState("light")
  const [brandPrimary, setBrandPrimary] = useState("#3b82f6")
  const [brandBg, setBrandBg] = useState("#f0f4ff")
  const [brandText, setBrandText] = useState("#1e293b")

  // ── Helpers ──
  const toggleDay = (id: string) =>
    setInterviewDays((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const openNewTemplate = () => {
    setEditingTemplate(null)
    setTplName("")
    setTplType("invite")
    setTplChannel("email")
    setTplText("")
    setDialogOpen(true)
  }

  const openEditTemplate = (t: MessageTemplate) => {
    setEditingTemplate(t)
    setTplName(t.name)
    setTplType(t.type)
    setTplChannel(t.channel)
    setTplText(t.text)
    setDialogOpen(true)
  }

  const saveTemplate = () => {
    if (!tplName.trim()) { toast.error("Введите название шаблона"); return }
    if (editingTemplate) {
      setTemplates((prev) => prev.map((t) => t.id === editingTemplate.id ? { ...t, name: tplName, type: tplType, channel: tplChannel, text: tplText } : t))
      toast.success("Шаблон обновлён")
    } else {
      const newTpl: MessageTemplate = { id: `custom-${Date.now()}`, name: tplName, type: tplType, channel: tplChannel, text: tplText, isSystem: false }
      setTemplates((prev) => [...prev, newTpl])
      toast.success("Шаблон создан")
    }
    setDialogOpen(false)
  }

  const deleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    toast.success("Шаблон удалён")
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <Settings className="size-5 text-muted-foreground" />
                <h1 className="text-xl font-bold tracking-tight">Настройки найма</h1>
              </div>
              <p className="text-sm text-muted-foreground">Общие настройки для всех вакансий</p>
            </div>

            {/* General toggles */}
            <Card className="mb-5 max-w-3xl">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Выбор компании в анкете вакансии</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Показывать секцию «Компания» для найма под клиентов (аутсорсинг/рекрутинг)</p>
                  </div>
                  <Switch checked={showCompanySelector} onCheckedChange={toggleCompanySelector} />
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="schedule">
              <TabsList className="mb-4">
                <TabsTrigger value="schedule" className="gap-1.5"><Clock className="size-3.5" />Расписание</TabsTrigger>
                <TabsTrigger value="funnel" className="gap-1.5"><GitBranch className="size-3.5" />Воронка</TabsTrigger>
                <TabsTrigger value="messages" className="gap-1.5"><MessageSquare className="size-3.5" />Сообщения</TabsTrigger>
                <TabsTrigger value="stopfactors" className="gap-1.5"><ShieldAlert className="size-3.5" />Стоп-факторы</TabsTrigger>
                <TabsTrigger value="branding" className="gap-1.5"><Palette className="size-3.5" />Брендинг</TabsTrigger>
              </TabsList>

              {/* ═══ TAB 1: Расписание ═══ */}
              <TabsContent value="schedule">
                <div className="space-y-4 max-w-3xl">

                  {/* Слоты интервью */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="size-4 text-muted-foreground" />Слоты для интервью
                      </CardTitle>
                      <CardDescription>Длительность и буфер между встречами</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Длительность интервью</Label>
                          <Select value={slotDuration} onValueChange={setSlotDuration}>
                            <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="15">15 минут</SelectItem>
                              <SelectItem value="30">30 минут</SelectItem>
                              <SelectItem value="45">45 минут</SelectItem>
                              <SelectItem value="60">60 минут</SelectItem>
                              <SelectItem value="90">90 минут</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Буфер между интервью</Label>
                          <Select value={bufferTime} onValueChange={setBufferTime}>
                            <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Без буфера</SelectItem>
                              <SelectItem value="5">5 минут</SelectItem>
                              <SelectItem value="10">10 минут</SelectItem>
                              <SelectItem value="15">15 минут</SelectItem>
                              <SelectItem value="30">30 минут</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Часы для записи */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="size-4 text-muted-foreground" />Часы для записи кандидатов
                      </CardTitle>
                      <CardDescription>Могут отличаться от общего графика компании</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">С</Label>
                          <Select value={interviewFrom} onValueChange={setInterviewFrom}>
                            <SelectTrigger className="w-28 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                            <SelectContent>{Array.from({ length: 24 }, (_, i) => { const h = `${String(i).padStart(2, "0")}:00`; return <SelectItem key={h} value={h}>{h}</SelectItem> })}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">До</Label>
                          <Select value={interviewTo} onValueChange={setInterviewTo}>
                            <SelectTrigger className="w-28 h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                            <SelectContent>{Array.from({ length: 24 }, (_, i) => { const h = `${String(i).padStart(2, "0")}:00`; return <SelectItem key={h} value={h}>{h}</SelectItem> })}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Макс. в день</Label>
                          <Input value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value.replace(/\D/g, ""))} className="w-20 h-9 text-sm bg-[var(--input-bg)]" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Дни для интервью</Label>
                        <div className="flex gap-2">
                          {INTERVIEW_DAYS.map((day) => (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() => toggleDay(day.id)}
                              className={cn(
                                "w-10 h-10 rounded-lg text-sm font-medium transition-all",
                                interviewDays.has(day.id)
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "border border-border text-muted-foreground hover:border-primary/50",
                              )}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Напоминания */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Bell className="size-4 text-muted-foreground" />Напоминания
                      </CardTitle>
                      <CardDescription>Автоматические уведомления об интервью</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">За 24 часа до интервью</p>
                          <p className="text-xs text-muted-foreground">Email и push-уведомление кандидату и HR</p>
                        </div>
                        <Switch checked={remind24h} onCheckedChange={setRemind24h} />
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">За 2 часа до интервью</p>
                          <p className="text-xs text-muted-foreground">Push-уведомление кандидату</p>
                        </div>
                        <Switch checked={remind2h} onCheckedChange={setRemind2h} />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button className="gap-2" onClick={() => toast.success("Настройки интервью сохранены")}>
                      <Save className="size-4" />Сохранить
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ═══ TAB 2: Воронка ═══ */}
              <TabsContent value="funnel">
                <div className="space-y-4 max-w-3xl">

                  {/* Дефолтный сценарий */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <GitBranch className="size-4" />Дефолтный сценарий воронки
                      </CardTitle>
                      <CardDescription>Новые вакансии будут использовать этот сценарий по умолчанию</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                        <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FUNNEL_SCENARIOS).map(([key, s]) => (
                            <SelectItem key={key} value={key}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="space-y-0">
                        {FUNNEL_SCENARIOS[selectedScenario].stages.map((stage, idx) => (
                          <div key={idx} className="flex items-center gap-3 py-2">
                            <div className="flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                              {idx + 1}
                            </div>
                            <span className="text-sm">{stage}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Автоматизация */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Автоматизация</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">Автоматически отправлять демонстрацию после отклика</p>
                        </div>
                        <Switch checked={autoDemo} onCheckedChange={setAutoDemo} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between py-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium">Автоматически приглашать на интервью после прохождения демо (скор &gt; N)</p>
                          </div>
                          <Switch checked={autoInvite} onCheckedChange={setAutoInvite} />
                        </div>
                        {autoInvite && (
                          <div className="flex items-center gap-2 ml-9">
                            <Label className="text-xs text-muted-foreground">Мин. балл</Label>
                            <Input value={minScore} onChange={(e) => setMinScore(e.target.value.replace(/\D/g, ""))} className="w-20 h-8 text-sm bg-[var(--input-bg)]" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">Автоматически отклонять при срабатывании стоп-фактора</p>
                        </div>
                        <Switch checked={autoReject} onCheckedChange={setAutoReject} />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button className="gap-2" onClick={async () => {
                      try {
                        const stages = FUNNEL_SCENARIOS[selectedScenario].stages
                        const stagesPayload = stages.map((title, i) => ({
                          title,
                          slug: title.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "_").replace(/_+/g, "_"),
                          sort_order: i,
                          color: i === stages.length - 1 ? "#22C55E" : i === 0 ? "#3B82F6" : "#8B5CF6",
                        }))
                        // Get existing stages to update or create
                        const res = await fetch("/api/funnel-stages")
                        if (res.ok) {
                          const existing = await res.json()
                          if (Array.isArray(existing) && existing.length > 0) {
                            const updatePayload = existing.map((s: { id: string }, i: number) => ({
                              id: s.id,
                              title: stagesPayload[i]?.title ?? s.id,
                              slug: stagesPayload[i]?.slug ?? "stage_" + i,
                              sort_order: i,
                              color: stagesPayload[i]?.color ?? "#3B82F6",
                            }))
                            await fetch("/api/funnel-stages", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(updatePayload),
                            })
                          }
                        }
                        toast.success("Настройки воронки сохранены")
                      } catch { toast.error("Ошибка сохранения") }
                    }}>
                      <Save className="size-4" />Сохранить
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ═══ TAB 3: Сообщения ═══ */}
              <TabsContent value="messages">
                <div className="space-y-4 max-w-3xl">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="size-4" />Шаблоны сообщений
                          </CardTitle>
                          <CardDescription className="mt-1">Создайте шаблоны для быстрого использования в вакансиях</CardDescription>
                        </div>
                        <Button size="sm" className="gap-1.5" onClick={openNewTemplate}>
                          <Plus className="size-3.5" />Создать шаблон
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              <th className="text-left py-2.5 px-4 uppercase text-xs font-medium text-muted-foreground tracking-wider">Название</th>
                              <th className="text-left py-2.5 px-4 uppercase text-xs font-medium text-muted-foreground tracking-wider">Тип</th>
                              <th className="text-left py-2.5 px-4 uppercase text-xs font-medium text-muted-foreground tracking-wider">Канал</th>
                              <th className="text-right py-2.5 px-4 uppercase text-xs font-medium text-muted-foreground tracking-wider">Действия</th>
                            </tr>
                          </thead>
                          <tbody>
                            {templates.map((t) => (
                              <tr key={t.id} className="hover:bg-muted/50">
                                <td className="py-2.5 px-4 font-medium">{t.name}</td>
                                <td className="py-2.5 px-4">
                                  <Badge variant="outline" className="text-xs">{TYPE_LABELS[t.type]}</Badge>
                                </td>
                                <td className="py-2.5 px-4 text-muted-foreground">{CHANNEL_LABELS[t.channel]}</td>
                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditTemplate(t)}>
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="size-7" disabled={t.isSystem} onClick={() => deleteTemplate(t.id)}>
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Dialog for creating/editing templates */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{editingTemplate ? "Редактировать шаблон" : "Создать шаблон"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Название</Label>
                        <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Название шаблона" className="bg-[var(--input-bg)]" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm">Тип</Label>
                          <Select value={tplType} onValueChange={(v) => setTplType(v as MessageTemplate["type"])}>
                            <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="invite">Приглашение</SelectItem>
                              <SelectItem value="reject">Отказ</SelectItem>
                              <SelectItem value="reminder">Напоминание</SelectItem>
                              <SelectItem value="offer">Оффер</SelectItem>
                              <SelectItem value="custom">Произвольное</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Канал</Label>
                          <Select value={tplChannel} onValueChange={(v) => setTplChannel(v as MessageTemplate["channel"])}>
                            <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="sms">SMS</SelectItem>
                              <SelectItem value="telegram">Telegram</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Текст сообщения</Label>
                        <Textarea value={tplText} onChange={(e) => setTplText(e.target.value)} placeholder="Введите текст шаблона..." rows={4} className="bg-[var(--input-bg)]" />
                      </div>
                      <div className="rounded-md bg-muted/50 border p-3">
                        <p className="text-xs text-muted-foreground">
                          Переменные: {"{{имя_кандидата}}"}, {"{{должность}}"}, {"{{компания}}"}, {"{{дата_интервью}}"}, {"{{время_интервью}}"}, {"{{ссылка_на_демо}}"}
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={saveTemplate} className="gap-2">
                          <Save className="size-4" />Сохранить
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              {/* ═══ TAB 4: Стоп-факторы ═══ */}
              <TabsContent value="stopfactors">
                <div className="space-y-4 max-w-3xl">

                  {/* Стоп-факторы по умолчанию */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShieldAlert className="size-4" />Стоп-факторы по умолчанию
                      </CardTitle>
                      <CardDescription>Применяются ко всем новым вакансиям автоматически</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">

                      {/* Город */}
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch checked={sfCity} onCheckedChange={setSfCity} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Город / релокация</p>
                            {sfCity && (
                              <Input value={sfCityValue} onChange={(e) => setSfCityValue(e.target.value)} placeholder="Например: Москва" className="mt-2 h-8 text-sm bg-[var(--input-bg)] max-w-xs" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Формат работы */}
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch checked={sfFormat} onCheckedChange={setSfFormat} />
                          <div>
                            <p className="text-sm font-medium">Формат работы</p>
                            <p className="text-xs text-muted-foreground">офис / гибрид / удалёнка</p>
                          </div>
                        </div>
                      </div>

                      {/* Возраст */}
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch checked={sfAge} onCheckedChange={setSfAge} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Возраст</p>
                            {sfAge && (
                              <div className="flex items-center gap-2 mt-2">
                                <Input value={sfAgeMin} onChange={(e) => setSfAgeMin(e.target.value.replace(/\D/g, ""))} placeholder="мин" className="w-20 h-8 text-sm bg-[var(--input-bg)]" />
                                <span className="text-xs text-muted-foreground">—</span>
                                <Input value={sfAgeMax} onChange={(e) => setSfAgeMax(e.target.value.replace(/\D/g, ""))} placeholder="макс" className="w-20 h-8 text-sm bg-[var(--input-bg)]" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Опыт */}
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch checked={sfExperience} onCheckedChange={setSfExperience} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Минимальный опыт</p>
                            {sfExperience && (
                              <Input value={sfExpValue} onChange={(e) => setSfExpValue(e.target.value.replace(/\D/g, ""))} placeholder="лет" className="mt-2 w-20 h-8 text-sm bg-[var(--input-bg)]" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Документы */}
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch checked={sfDocs} onCheckedChange={setSfDocs} />
                          <div>
                            <p className="text-sm font-medium">Обязательные документы</p>
                            <p className="text-xs text-muted-foreground">вод.права, мед.книжка</p>
                          </div>
                        </div>
                      </div>

                      {/* Гражданство */}
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch checked={sfCitizenship} onCheckedChange={setSfCitizenship} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Гражданство</p>
                            {sfCitizenship && (
                              <Input value={sfCitizenshipValue} onChange={(e) => setSfCitizenshipValue(e.target.value)} placeholder="Например: РФ" className="mt-2 h-8 text-sm bg-[var(--input-bg)] max-w-xs" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Макс зарплата */}
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch checked={sfSalary} onCheckedChange={setSfSalary} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Макс. зарплатные ожидания</p>
                            {sfSalary && (
                              <Input value={sfSalaryValue} onChange={(e) => setSfSalaryValue(e.target.value.replace(/\D/g, ""))} placeholder="руб." className="mt-2 w-32 h-8 text-sm bg-[var(--input-bg)]" />
                            )}
                          </div>
                        </div>
                      </div>

                    </CardContent>
                  </Card>

                  {/* Автоматический отказ */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Автоматический отказ</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">Отправлять автоматический отказ при срабатывании стоп-фактора</p>
                        </div>
                        <Switch checked={sfAutoReject} onCheckedChange={setSfAutoReject} />
                      </div>
                      {sfAutoReject && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Шаблон отказа</Label>
                          <Select value={sfRejectTemplate} onValueChange={setSfRejectTemplate}>
                            <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)] max-w-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Вежливый отказ">Вежливый отказ</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">HR может вручную вернуть отклонённого кандидата</p>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button className="gap-2" onClick={() => toast.success("Стоп-факторы сохранены")}>
                      <Save className="size-4" />Сохранить
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ═══ TAB: Брендинг ═══ */}
              <TabsContent value="branding">
                <div className="space-y-4 max-w-3xl">

                  {/* Страница кандидата */}
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-medium flex items-center gap-2"><Palette className="size-4 text-muted-foreground" />Страница кандидата</CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 pt-0 space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Название компании (для кандидатов)</Label>
                        <Input value={brandCompanyName} onChange={e => setBrandCompanyName(e.target.value)} placeholder="ООО Ромашка" className="h-9 bg-[var(--input-bg)]" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Приветствие</Label>
                        <Input value={brandGreeting} onChange={e => setBrandGreeting(e.target.value)} placeholder="Привет, {name}! 👋" className="h-9 bg-[var(--input-bg)]" />
                        <p className="text-[11px] text-muted-foreground"><code className="bg-muted px-1 rounded">{"{name}"}</code> — будет заменено на имя кандидата</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Тема */}
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-medium">Тема демонстрации</CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 pt-0">
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: "light", label: "☀️ Светлая" },
                          { id: "dark", label: "🌙 Тёмная" },
                          { id: "brand", label: "🎨 Под бренд" },
                          { id: "neutral", label: "⚪ Нейтральная" },
                        ].map(t => (
                          <button key={t.id} type="button" onClick={() => setBrandTheme(t.id)} className={cn(
                            "h-9 px-4 rounded-full text-sm font-medium transition-all",
                            brandTheme === t.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border hover:border-primary/50",
                          )}>{t.label}</button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Цвета */}
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-medium">Цвета для кандидатов</CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 pt-0">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Основной</Label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={brandPrimary} onChange={e => setBrandPrimary(e.target.value)} className="w-9 h-9 rounded-lg border cursor-pointer" />
                            <Input value={brandPrimary} onChange={e => setBrandPrimary(e.target.value)} className="h-9 font-mono text-xs flex-1 bg-[var(--input-bg)]" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Фон</Label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={brandBg} onChange={e => setBrandBg(e.target.value)} className="w-9 h-9 rounded-lg border cursor-pointer" />
                            <Input value={brandBg} onChange={e => setBrandBg(e.target.value)} className="h-9 font-mono text-xs flex-1 bg-[var(--input-bg)]" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Текст</Label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={brandText} onChange={e => setBrandText(e.target.value)} className="w-9 h-9 rounded-lg border cursor-pointer" />
                            <Input value={brandText} onChange={e => setBrandText(e.target.value)} className="h-9 font-mono text-xs flex-1 bg-[var(--input-bg)]" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Превью */}
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-medium">Превью</CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 pt-0">
                      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: brandBg }}>
                        <div className="p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: brandPrimary }}>{brandCompanyName ? brandCompanyName[0] : "К"}</div>
                            <span className="text-base font-bold" style={{ color: brandText }}>{brandCompanyName || "Компания"}</span>
                          </div>
                          <div>
                            <h3 className="text-lg font-bold" style={{ color: brandText }}>{brandGreeting.replace("{name}", "Иван")}</h3>
                            <p className="text-sm mt-1" style={{ color: brandText + "99" }}>Менеджер по продажам · {brandCompanyName || "Компания"}</p>
                          </div>
                          <div className="h-10 w-fit px-5 rounded-lg flex items-center justify-center text-white text-sm font-medium" style={{ backgroundColor: brandPrimary }}>
                            <Play className="w-4 h-4 mr-1.5" />Начать демонстрацию
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs" style={{ color: brandText + "80" }}><span>Урок 3 из 12</span><span>25%</span></div>
                            <div className="h-2 rounded-full" style={{ backgroundColor: brandPrimary + "20" }}>
                              <div className="h-full rounded-full w-1/4" style={{ backgroundColor: brandPrimary }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button className="gap-2" onClick={() => toast.success("Брендинг для кандидатов сохранён")}>
                      <Save className="size-4" />Сохранить
                    </Button>
                  </div>
                </div>
              </TabsContent>

            </Tabs>

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
