"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
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
import {Settings, Clock, Save, Bell, GitBranch, MessageSquare, ShieldAlert, Plus, Pencil, Trash2, Palette, Plug} from "lucide-react"
import { toast } from "sonner"
import { IntegrationsContent } from "@/components/hr/integrations-content"
import { AiAbuseModeSettings } from "@/components/company/ai-abuse-mode-settings"
import { SendDelaySettings } from "@/components/company/send-delay-settings"
import { TrashRetentionSettings } from "@/components/company/trash-retention-settings"
import type { CompanyHiringDefaults, VacancyStopFactors } from "@/lib/db/schema"

// ─── Constants ─────────────────────────────────────────────────────────────

const HIRING_DEFAULTS_URL = "/api/modules/hr/company/hiring-defaults"

async function patchHiringDefaults(patch: Partial<CompanyHiringDefaults>) {
  const res = await fetch(HIRING_DEFAULTS_URL, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(patch),
  })
  if (!res.ok) throw new Error("save_failed")
  return res.json() as Promise<{ hiringDefaults: CompanyHiringDefaults }>
}

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
    text: "Здравствуйте, {{name}}! Приглашаем вас пройти демонстрацию для позиции «{{vacancy}}» в компании {{company}}. Ссылка: {{demo_link}}",
    isSystem: true,
  },
  {
    id: "sys-2",
    name: "Приглашение на интервью",
    type: "invite",
    channel: "email",
    text: "Здравствуйте, {{name}}! Приглашаем вас на интервью на позицию «{{vacancy}}» в компании {{company}}. Дата и время: {{interview_at}}.",
    isSystem: true,
  },
  {
    id: "sys-3",
    name: "Вежливый отказ",
    type: "reject",
    channel: "email",
    text: "Здравствуйте, {{name}}! Благодарим за интерес к позиции «{{vacancy}}» в компании {{company}}. К сожалению, мы приняли решение продолжить с другими кандидатами. Желаем удачи!",
    isSystem: true,
  },
  {
    id: "sys-4",
    name: "Оффер",
    type: "offer",
    channel: "email",
    text: "Здравствуйте, {{name}}! Рады сообщить, что мы готовы предложить вам позицию «{{vacancy}}» в компании {{company}}. Ждём вашего ответа!",
    isSystem: true,
  },
]

// ─── Page ──────────────────────────────────────────────────────────────────

export default function HiringSettingsPage() {
  // ── Top-level tab (Основные / Интеграции) ──
  const [topTab, setTopTab] = useState<"general" | "integrations">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      return params.get("tab") === "integrations" ? "integrations" : "general"
    }
    return "general"
  })

  // D12: «Скоро»-заглушки (опросы адаптации, интеграции календарей/Zoom,
  // шаблоны сообщений) показываем только платформенному админу.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null)
      .then(d => setIsPlatformAdmin(!!(d?.data ?? d)?.isPlatformAdmin)).catch(() => {})
  }, [])

  // ── Schedule state ──
  const [slotDuration, setSlotDuration] = useState("45")
  const [bufferTime, setBufferTime] = useState("15")
  const [interviewFrom, setInterviewFrom] = useState("09:00")
  const [interviewTo, setInterviewTo] = useState("18:00")
  const [interviewDays, setInterviewDays] = useState<Set<string>>(new Set(["mon", "tue", "wed", "thu", "fri"]))
  const [maxPerDay, setMaxPerDay] = useState("8")
  const [remind24h, setRemind24h] = useState(true)
  const [remind2h, setRemind2h] = useState(true)
  const [interviewMethods, setInterviewMethods] = useState<string[]>(["zoom", "meet", "telegram", "phone", "office"])
  const [officeAddress, setOfficeAddress] = useState("")
  const [timezone, setTimezone] = useState("Europe/Moscow")
  const [savingSchedule, setSavingSchedule] = useState(false)

  // ── Описание компании (companies.company_description) ──
  // Показывается кандидатам в вакансии (блок «О компании»). Кнопка «Подтянуть
  // из настроек» в анкете вакансии берёт текст отсюда (GET /api/companies).
  const [companyDescription, setCompanyDescription] = useState("")
  const [savingCompanyDesc, setSavingCompanyDesc] = useState(false)
  useEffect(() => {
    fetch("/api/companies")
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && typeof j.companyDescription === "string") setCompanyDescription(j.companyDescription) })
      .catch(() => {})
  }, [])
  const saveCompanyDescription = async () => {
    setSavingCompanyDesc(true)
    try {
      const res = await fetch("/api/companies", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ company_description: companyDescription }),
      })
      if (!res.ok) throw new Error("save_failed")
      toast.success("Описание компании сохранено")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingCompanyDesc(false)
    }
  }

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

  // ── AI-чат-бот kill switch (глобально на компанию) ──
  const [aiChatbotKilled, setAiChatbotKilled] = useState(false)
  const [aiKillSaving, setAiKillSaving] = useState(false)
  useEffect(() => {
    fetch("/api/modules/hr/company/ai-chatbot-kill-switch")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.killed === "boolean") setAiChatbotKilled(d.killed) })
      .catch(() => {})
  }, [])
  const toggleAiChatbotKill = async (checked: boolean) => {
    setAiKillSaving(true)
    setAiChatbotKilled(checked)
    try {
      const res = await fetch("/api/modules/hr/company/ai-chatbot-kill-switch", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ killed: checked }),
      })
      if (!res.ok) throw new Error("save_failed")
      toast.success(checked ? "AI-чат-бот заблокирован для всей компании" : "AI-чат-бот разблокирован")
    } catch {
      setAiChatbotKilled(!checked)
      toast.error("Не удалось сохранить")
    } finally {
      setAiKillSaving(false)
    }
  }

  // Сессия 7: глобальные шаблоны компании удалены. Чистка localStorage.
  useEffect(() => {
    try { localStorage.removeItem("mk_hr_message_templates") } catch {}
  }, [])

  // ── Feedback schedule ──
  const [feedbackEnabled, setFeedbackEnabled] = useState(false)
  const [feedback30, setFeedback30] = useState(true)
  const [feedback60, setFeedback60] = useState(true)
  const [feedback90, setFeedback90] = useState(true)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mk_hr_feedback_schedule")
      if (saved) {
        const p = JSON.parse(saved) as { enabled?: boolean; d30?: boolean; d60?: boolean; d90?: boolean }
        setFeedbackEnabled(p.enabled ?? false)
        setFeedback30(p.d30 ?? true)
        setFeedback60(p.d60 ?? true)
        setFeedback90(p.d90 ?? true)
      }
    } catch {}
  }, [])
  const saveFeedbackSchedule = (patch: Partial<{ enabled: boolean; d30: boolean; d60: boolean; d90: boolean }>) => {
    const next = { enabled: patch.enabled ?? feedbackEnabled, d30: patch.d30 ?? feedback30, d60: patch.d60 ?? feedback60, d90: patch.d90 ?? feedback90 }
    if ("enabled" in patch) setFeedbackEnabled(next.enabled)
    if ("d30" in patch) setFeedback30(next.d30)
    if ("d60" in patch) setFeedback60(next.d60)
    if ("d90" in patch) setFeedback90(next.d90)
    localStorage.setItem("mk_hr_feedback_schedule", JSON.stringify(next))
    toast.success("Настройки обратной связи сохранены")
  }

  // ── Data retention (ФЗ-152) — сохраняется на сервер (только хранение значения) ──
  const [dataRetention, setDataRetention] = useState("6months")
  const [savingRetention, setSavingRetention] = useState(false)
  const saveDataRetention = async (val: string) => {
    setDataRetention(val)
    setSavingRetention(true)
    try {
      await patchHiringDefaults({ dataRetention: val })
      toast.success("Настройки хранения данных сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingRetention(false)
    }
  }

  // ── Webhooks (на сервер) ──
  const [webhookUrl, setWebhookUrl] = useState("")
  const [webhookEvents, setWebhookEvents] = useState<Record<string, boolean>>({ new_candidate: false, ai_screening: false, stage_change: false, offer: false, reject: false })
  const [savingWebhook, setSavingWebhook] = useState(false)
  const saveWebhooks = async () => {
    setSavingWebhook(true)
    try {
      await patchHiringDefaults({ webhooks: { url: webhookUrl, events: webhookEvents } })
      toast.success("Настройки webhook сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingWebhook(false)
    }
  }

  // ── Bitrix24 (на сервер) ──
  const [bitrixUrl, setBitrixUrl] = useState("")
  const [bitrixTrigger, setBitrixTrigger] = useState("offer")
  const [savingBitrix, setSavingBitrix] = useState(false)
  const saveBitrix = async () => {
    setSavingBitrix(true)
    try {
      await patchHiringDefaults({ bitrix: { url: bitrixUrl, trigger: bitrixTrigger } })
      toast.success("Интеграция с Битрикс24 сохранена")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingBitrix(false)
    }
  }

  // ── Funnel state ──
  const [selectedScenario, setSelectedScenario] = useState("standard")
  const [autoDemo, setAutoDemo] = useState(true)
  const [autoInvite, setAutoInvite] = useState(false)
  const [minScore, setMinScore] = useState("70")
  const [autoReject, setAutoReject] = useState(false)
  const [savingFunnel, setSavingFunnel] = useState(false)

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
  // Тумблер «Применять стоп-факторы автоматически при создании вакансии».
  const [sfAutoReject, setSfAutoReject] = useState(false)
  const [sfRejectTemplate, setSfRejectTemplate] = useState("Вежливый отказ")
  const [savingStopFactors, setSavingStopFactors] = useState(false)

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

  const toggleInterviewMethod = (id: string) =>
    setInterviewMethods((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  // ── Гидратация всех серверных дефолтов одним GET ──
  useEffect(() => {
    fetch(HIRING_DEFAULTS_URL)
      .then((r) => r.ok ? r.json() : null)
      .then((d: { hiringDefaults?: CompanyHiringDefaults } | null) => {
        const hd = d?.hiringDefaults
        if (!hd) return

        // Расписание
        const s = hd.schedule
        if (s) {
          if (s.slotDuration) setSlotDuration(s.slotDuration)
          if (s.bufferTime) setBufferTime(s.bufferTime)
          if (s.interviewFrom) setInterviewFrom(s.interviewFrom)
          if (s.interviewTo) setInterviewTo(s.interviewTo)
          if (Array.isArray(s.interviewDays)) setInterviewDays(new Set(s.interviewDays))
          if (s.maxPerDay) setMaxPerDay(s.maxPerDay)
          if (typeof s.remind24h === "boolean") setRemind24h(s.remind24h)
          if (typeof s.remind2h === "boolean") setRemind2h(s.remind2h)
          if (Array.isArray(s.interviewMethods)) setInterviewMethods(s.interviewMethods)
          if (typeof s.officeAddress === "string") setOfficeAddress(s.officeAddress)
          if (s.timezone) setTimezone(s.timezone)
        }

        // Webhooks
        if (hd.webhooks) {
          if (hd.webhooks.url) setWebhookUrl(hd.webhooks.url)
          if (hd.webhooks.events) setWebhookEvents((prev) => ({ ...prev, ...hd.webhooks!.events }))
        }

        // Битрикс24
        if (hd.bitrix) {
          if (hd.bitrix.url) setBitrixUrl(hd.bitrix.url)
          if (hd.bitrix.trigger) setBitrixTrigger(hd.bitrix.trigger)
        }

        // Хранение данных
        if (hd.dataRetention) setDataRetention(hd.dataRetention)

        // Стоп-факторы-дефолты (VacancyStopFactors → плоские sf*)
        // B8-fix: гидрируем enabled ЯВНО (и false тоже), а значения — если они
        // ОПРЕДЕЛЕНЫ (включая очищенные пустые). Старые truthy-guards теряли
        // выключенные факторы и очищенные поля после reload.
        const sf = hd.stopFactorsDefaults
        if (sf) {
          if (sf.city) {
            setSfCity(!!sf.city.enabled)
            if (sf.city.allowedCities != null) setSfCityValue(sf.city.allowedCities.join(", "))
          }
          if (sf.format) setSfFormat(!!sf.format.enabled)
          if (sf.age) {
            setSfAge(!!sf.age.enabled)
            if (sf.age.minAge != null) setSfAgeMin(String(sf.age.minAge))
            if (sf.age.maxAge != null) setSfAgeMax(String(sf.age.maxAge))
          }
          if (sf.experience) {
            setSfExperience(!!sf.experience.enabled)
            if (sf.experience.minYears != null) setSfExpValue(String(sf.experience.minYears))
          }
          if (sf.documents) setSfDocs(!!sf.documents.enabled)
          if (sf.citizenship) {
            setSfCitizenship(!!sf.citizenship.enabled)
            if (sf.citizenship.allowed != null) setSfCitizenshipValue(sf.citizenship.allowed.join(", "))
          }
          if (sf.salaryExpectation) {
            setSfSalary(!!sf.salaryExpectation.enabled)
            if (sf.salaryExpectation.maxAmount != null) setSfSalaryValue(String(sf.salaryExpectation.maxAmount))
          }
        }
        if (typeof hd.applyStopFactorsOnCreate === "boolean") setSfAutoReject(hd.applyStopFactorsOnCreate)

        // Автоматизация воронки
        if (hd.automation) {
          if (typeof hd.automation.autoDemo === "boolean") setAutoDemo(hd.automation.autoDemo)
          if (typeof hd.automation.autoInvite === "boolean") setAutoInvite(hd.automation.autoInvite)
          if (hd.automation.minScore != null) setMinScore(String(hd.automation.minScore))
          if (typeof hd.automation.autoReject === "boolean") setAutoReject(hd.automation.autoReject)
        }
        if (hd.funnelScenario) setSelectedScenario(hd.funnelScenario)
      })
      .catch(() => {})
  }, [])

  // ── Сохранение: Расписание ──
  const handleSaveSchedule = async () => {
    setSavingSchedule(true)
    try {
      await patchHiringDefaults({
        schedule: {
          slotDuration,
          bufferTime,
          interviewFrom,
          interviewTo,
          interviewDays: Array.from(interviewDays),
          maxPerDay,
          remind24h,
          remind2h,
          timezone,
          interviewMethods,
          officeAddress,
        },
      })
      toast.success("Настройки интервью сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingSchedule(false)
    }
  }

  // ── Сохранение: Стоп-факторы-дефолты (плоские sf* → VacancyStopFactors) ──
  const handleSaveStopFactors = async () => {
    setSavingStopFactors(true)
    const stopFactorsDefaults: VacancyStopFactors = {
      city: sfCity
        ? { enabled: true, allowedCities: sfCityValue ? sfCityValue.split(",").map((c) => c.trim()).filter(Boolean) : [] }
        : { enabled: false },
      format: { enabled: sfFormat },
      age: sfAge
        ? { enabled: true, minAge: Number(sfAgeMin) || undefined, maxAge: Number(sfAgeMax) || undefined }
        : { enabled: false },
      experience: sfExperience
        ? { enabled: true, minYears: Number(sfExpValue) || undefined }
        : { enabled: false },
      documents: { enabled: sfDocs },
      citizenship: sfCitizenship
        ? { enabled: true, allowed: sfCitizenshipValue ? sfCitizenshipValue.split(",").map((c) => c.trim()).filter(Boolean) : [] }
        : { enabled: false },
      salaryExpectation: sfSalary
        ? { enabled: true, maxAmount: Number(sfSalaryValue) || undefined }
        : { enabled: false },
    }
    try {
      // TODO(next): копировать эти дефолты (stopFactorsJson) в новую вакансию при
      // создании, если applyStopFactorsOnCreate=true — делается отдельным заходом
      // в app/api/modules/hr/vacancies/route.ts (POST). Сейчас только хранение.
      await patchHiringDefaults({ stopFactorsDefaults, applyStopFactorsOnCreate: sfAutoReject })
      toast.success("Стоп-факторы сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingStopFactors(false)
    }
  }

  // ── Сохранение: Автоматизация воронки + сценарий ──
  const handleSaveFunnel = async () => {
    setSavingFunnel(true)
    try {
      await patchHiringDefaults({
        automation: { autoDemo, autoInvite, minScore: Number(minScore) || undefined, autoReject },
        funnelScenario: selectedScenario,
      })
      toast.success("Настройки воронки сохранены")
    } catch {
      toast.error("Ошибка сохранения")
    } finally {
      setSavingFunnel(false)
    }
  }

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
                <h1 className="text-xl font-bold tracking-tight">Дефолты компании</h1>
              </div>
              {/* #37: чёткое позиционирование страницы — это дефолты для НОВЫХ
                  вакансий, каждая вакансия может их переопределить локально. */}
              <p className="text-sm text-muted-foreground">
                Эти настройки применяются ко всем новым вакансиям при создании.
                В каждой вакансии их можно изменить отдельно.
              </p>
            </div>

            {/* Top-level tabs: Основные | Интеграции */}
            <div className="flex items-center gap-1 border-b border-border mb-5">
              <button
                onClick={() => setTopTab("general")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  topTab === "general"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Основные
              </button>
              <button
                onClick={() => setTopTab("integrations")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  topTab === "integrations"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Plug className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Интеграции
              </button>
            </div>

            {topTab === "integrations" ? (
              <IntegrationsContent />
            ) : (<>

            {/* Аварийное отключение AI */}
            <Card className={cn("mb-5 max-w-3xl border-2", aiChatbotKilled ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" : "border-amber-200")}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShieldAlert className="size-4 text-red-600" />
                  Аварийное отключение AI
                </CardTitle>
                <CardDescription>Глобальный рубильник AI-чат-бота на уровне компании.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Заблокировать AI-чат-бота для всех вакансий</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      При включении ВСЕ вакансии перестанут использовать AI-агента. Используйте только в аварии.
                    </p>
                  </div>
                  <Switch
                    checked={aiChatbotKilled}
                    onCheckedChange={toggleAiChatbotKill}
                    disabled={aiKillSaving}
                  />
                </div>
              </CardContent>
            </Card>

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

            {/* Описание компании — показывается кандидатам в вакансии. */}
            <Card className="mb-5 max-w-3xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Описание компании</CardTitle>
                <CardDescription>
                  Показывается кандидатам в вакансии (блок «О компании»). В анкете вакансии
                  кнопка «Подтянуть из настроек» берёт текст отсюда.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={companyDescription}
                  onChange={e => setCompanyDescription(e.target.value)}
                  placeholder="Кратко о компании для кандидатов: чем занимаетесь, чем интересны соискателю…"
                  rows={5}
                  className="text-sm bg-[var(--input-bg)]"
                />
                <div className="flex justify-end">
                  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={saveCompanyDescription} disabled={savingCompanyDesc}>
                    <Save className="size-3.5" />Сохранить
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* «Шаблоны сообщений компании» удалены в Сессии 7.
                Шаблоны на уровне компании больше не используются — на каждой
                вакансии есть отдельный блок «Частые вопросы» (FAQ) в табе
                «Сообщения», с собственным набором тем для копирования. */}

            {/* Feedback schedule.
                #43: блок 30/60/90 опросов закрыт плашкой «Скоро» — фича из
                модуля Adaptation (15-й модуль Company24 OS), сейчас не
                подключена. Юрий не хочет показывать неработающее. Старая
                логика state и saveFeedbackSchedule оставлена для будущего
                включения — UI заблокирован overlay'ем. */}
            <Card className={cn("mb-5 max-w-3xl relative overflow-hidden", !isPlatformAdmin && "hidden")}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium">Автоматический сбор обратной связи</CardTitle>
                    <CardDescription>Опросы новых сотрудников на контрольных точках адаптации</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">Скоро</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pointer-events-none opacity-40 select-none">
                <div className="flex items-center justify-between">
                  <p className="text-sm">Включить автоматические опросы</p>
                  <Switch checked={false} disabled />
                </div>
                <div className="space-y-2 pl-4 border-l-2 border-primary/20 opacity-60">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={false} disabled className="rounded" />
                    30 дней — «Как проходит адаптация?»
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={false} disabled className="rounded" />
                    60 дней — «Чувствуете ли уверенность?»
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={false} disabled className="rounded" />
                    90 дней — «Оправдались ли ожидания?»
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Data retention */}
            <Card className="mb-5 max-w-3xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Хранение данных кандидатов</CardTitle>
                <CardDescription>В соответствии с ФЗ-152 персональные данные отказанных кандидатов будут автоматически удалены</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={dataRetention} onValueChange={saveDataRetention} disabled={savingRetention}>
                  <SelectTrigger className="w-[280px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Сразу после отказа</SelectItem>
                    <SelectItem value="7days">7 дней</SelectItem>
                    <SelectItem value="30days">30 дней</SelectItem>
                    <SelectItem value="3months">3 месяца</SelectItem>
                    <SelectItem value="6months">6 месяцев</SelectItem>
                    <SelectItem value="12months">12 месяцев</SelectItem>
                    <SelectItem value="never">Не удалять</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Webhooks */}
            <Card className="mb-5 max-w-3xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Webhooks</CardTitle>
                <CardDescription>Отправлять события в внешние системы</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">URL для отправки</Label>
                  <Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">События</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {[["new_candidate", "Новый кандидат"], ["ai_screening", "AI-скрининг"], ["stage_change", "Смена этапа"], ["offer", "Оффер"], ["reject", "Отказ"]].map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={webhookEvents[key] || false}
                          onChange={e => setWebhookEvents(prev => ({ ...prev, [key]: e.target.checked }))} className="rounded" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={saveWebhooks} disabled={savingWebhook}>Сохранить</Button>
              </CardContent>
            </Card>

            {/* Bitrix24 */}
            <Card className="mb-5 max-w-3xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Интеграция с Битрикс24</CardTitle>
                <CardDescription>Отправлять кандидатов в CRM Битрикс24</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Webhook URL Битрикс24</Label>
                  <Input value={bitrixUrl} onChange={e => setBitrixUrl(e.target.value)} placeholder="https://your-domain.bitrix24.ru/rest/1/..." className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Когда отправлять</Label>
                  <Select value={bitrixTrigger} onValueChange={setBitrixTrigger}>
                    <SelectTrigger className="w-[250px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все кандидаты</SelectItem>
                      <SelectItem value="qualified">Только подходящие (AI 70+)</SelectItem>
                      <SelectItem value="offer">Только на этапе оффера</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={saveBitrix} disabled={savingBitrix}>Сохранить</Button>
              </CardContent>
            </Card>

            <Tabs defaultValue="schedule">
              <TabsList className="mb-4">
                <TabsTrigger value="schedule" className="gap-1.5"><Clock className="size-3.5" />Расписание</TabsTrigger>
                <TabsTrigger value="funnel" className="gap-1.5"><GitBranch className="size-3.5" />Воронка</TabsTrigger>
                <TabsTrigger value="messages" className="gap-1.5"><MessageSquare className="size-3.5" />Сообщения</TabsTrigger>
                <TabsTrigger value="stopfactors" className="gap-1.5"><ShieldAlert className="size-3.5" />Стоп-факторы</TabsTrigger>
              </TabsList>
              <p className="text-xs text-muted-foreground mb-4 -mt-2">
                <Palette className="size-3 inline-block mr-1 -mt-0.5" />
                Брендинг настраивается в <Link href="/settings/branding" className="text-primary hover:underline">Настройках компании</Link>
              </p>

              {/* ═══ TAB 1: Расписание ═══ */}
              <TabsContent value="schedule">
                <div className="space-y-4 max-w-3xl">

                  {/* #41: Способы проведения интервью + часовой пояс +
                      placeholder-блоки интеграций. */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="size-4 text-muted-foreground" />Способы проведения интервью
                      </CardTitle>
                      <CardDescription>HR выбирает что использовать при назначении встречи кандидату.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {[
                        { id: "zoom",      label: "Видео-звонок Zoom" },
                        { id: "meet",      label: "Видео-звонок Google Meet" },
                        { id: "telegram",  label: "Видео-звонок Telegram" },
                        { id: "phone",     label: "Звонок по телефону" },
                        { id: "office",    label: "Встреча в офисе" },
                      ].map(t => (
                        <label key={t.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={interviewMethods.includes(t.id)}
                            onChange={() => toggleInterviewMethod(t.id)}
                            className="rounded"
                          />
                          {t.label}
                        </label>
                      ))}
                      <div className="space-y-1.5 pt-2">
                        <Label className="text-xs text-muted-foreground">Адрес офиса (если выбран офис)</Label>
                        <Textarea
                          placeholder="Москва, ул. Тверская, 1, БЦ «Альфа», 3 этаж"
                          rows={2}
                          value={officeAddress}
                          onChange={(e) => setOfficeAddress(e.target.value)}
                          className="text-sm bg-[var(--input-bg)]"
                        />
                      </div>
                      <div className="space-y-1.5 pt-2">
                        <Label className="text-xs text-muted-foreground">Часовой пояс HR</Label>
                        <Select value={timezone} onValueChange={setTimezone}>
                          <SelectTrigger className="h-9 text-sm bg-[var(--input-bg)] w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Europe/Kaliningrad">Калининград (UTC+2)</SelectItem>
                            <SelectItem value="Europe/Moscow">Москва (UTC+3)</SelectItem>
                            <SelectItem value="Europe/Samara">Самара (UTC+4)</SelectItem>
                            <SelectItem value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</SelectItem>
                            <SelectItem value="Asia/Omsk">Омск (UTC+6)</SelectItem>
                            <SelectItem value="Asia/Krasnoyarsk">Красноярск (UTC+7)</SelectItem>
                            <SelectItem value="Asia/Irkutsk">Иркутск (UTC+8)</SelectItem>
                            <SelectItem value="Asia/Yakutsk">Якутск (UTC+9)</SelectItem>
                            <SelectItem value="Asia/Vladivostok">Владивосток (UTC+10)</SelectItem>
                            <SelectItem value="Asia/Magadan">Магадан (UTC+11)</SelectItem>
                            <SelectItem value="Asia/Kamchatka">Камчатка (UTC+12)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* #41: интеграции календарей и Zoom — заглушки «Скоро». */}
                  <Card className={cn(!isPlatformAdmin && "hidden")}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Plug className="size-4 text-muted-foreground" />Интеграции календарей
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">Скоро</Badge>
                      </CardTitle>
                      <CardDescription>Двусторонняя синхронизация слотов и автосоздание встреч.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {[
                        { id: "gcal",    label: "Google Calendar" },
                        { id: "outlook", label: "Outlook Calendar" },
                        { id: "yandex",  label: "Яндекс Календарь" },
                        { id: "zoom",    label: "Zoom OAuth" },
                      ].map(i => (
                        <div key={i.id} className="flex items-center justify-between rounded-lg border p-3">
                          <span className="text-sm">{i.label}</span>
                          <Button size="sm" variant="outline" disabled className="h-7 text-xs">Подключить</Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

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
                    <Button className="gap-2" onClick={handleSaveSchedule} disabled={savingSchedule}>
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
                    <Button className="gap-2" onClick={handleSaveFunnel} disabled={savingFunnel}>
                      <Save className="size-4" />Сохранить
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ═══ TAB 3: Сообщения ═══ */}
              <TabsContent value="messages">
                <div className="space-y-4 max-w-3xl">
                  {/* #44: блок «Шаблоны сообщений» закрыт плашкой «Скоро».
                      Шаблоны на уровне компании пока демо-заглушка — они
                      не подключены к диалогу отправки в карточке кандидата.
                      Будем доделывать вместе с этим диалогом отдельной
                      задачей. UI оставляем виден, но кликать нельзя. */}
                  <Card className={cn("relative overflow-hidden", !isPlatformAdmin && "hidden")}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="size-4" />Шаблоны сообщений
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1">Скоро</Badge>
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Шаблоны сообщений компании — общая библиотека для использования
                            во всех вакансиях. Скоро.
                          </CardDescription>
                        </div>
                        <Button size="sm" className="gap-1.5" disabled>
                          <Plus className="size-3.5" />Создать шаблон
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pointer-events-none opacity-40 select-none">
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
                                    <Button variant="ghost" size="icon" className="size-7" disabled>
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="size-7" disabled>
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
                          Переменные: {"{{name}}"}, {"{{vacancy}}"}, {"{{company}}"}, {"{{interview_at}}"}, {"{{demo_link}}"}
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

                {/* Группа 36: per-company режим строгости AI чат-бота. */}
                <div className="max-w-3xl mt-6">
                  <AiAbuseModeSettings />
                </div>

                {/* Per-company темп отправки follow-up (безопасность hh-аккаунта). */}
                <div className="max-w-3xl mt-6">
                  <SendDelaySettings />
                </div>

                {/* Корзина вакансий — срок хранения до авто-удаления. */}
                <div className="max-w-3xl mt-6">
                  <TrashRetentionSettings />
                </div>
              </TabsContent>

              {/* ═══ TAB 4: Стоп-факторы ═══ */}
              <TabsContent value="stopfactors">
                <div className="space-y-4 max-w-3xl">

                  {/* #37: переименовано — это критерии отсева на этапе
                      AI-скоринга резюме (город, возраст, опыт), а не
                      стоп-слова в чате (#22, отдельная фича в каждой
                      вакансии). */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShieldAlert className="size-4" />Стоп-факторы для нового резюме
                      </CardTitle>
                      <CardDescription>
                        Критерии отсева на этапе AI-скоринга резюме (НЕ стоп-слова в чате).
                        Применяется к новым вакансиям. В вакансии можно изменить.
                      </CardDescription>
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

                  {/* #61: уведомление, что эти настройки — defaults для новых
                      вакансий, а реальные правила настраиваются на самой
                      вакансии (Воронка → Стоп-факторы). */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-200">
                    <strong>Это дефолты компании.</strong> Реальные стоп-факторы
                    настраиваются на каждой вакансии — в табе «Воронка» → блок
                    «Стоп-факторы по резюме». Эти значения берутся как стартовые
                    при создании новой вакансии, если включена опция ниже.
                  </div>

                  {/* Автоматический отказ */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Автоматический отказ</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium">Применять стоп-факторы автоматически при создании вакансии</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">При создании новой вакансии — копировать эти дефолты в её настройки.</p>
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
                    <Button className="gap-2" onClick={handleSaveStopFactors} disabled={savingStopFactors}>
                      <Save className="size-4" />Сохранить
                    </Button>
                  </div>
                </div>
              </TabsContent>

            </Tabs>

            </>)}

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
