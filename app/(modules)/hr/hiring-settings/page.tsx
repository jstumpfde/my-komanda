"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  FileText, Plus, Video, Phone, Truck, Bot,
  ShieldAlert, Settings,
} from "lucide-react"

// ─── Scenario presets (same as automation-settings) ─────────────────────────

type ScenarioType = "demo-call" | "call-demo" | "call-only" | "fast-hire" | "ai-smart"

const SCENARIOS: { key: ScenarioType; icon: React.ElementType; label: string; desc: string; color: string }[] = [
  { key: "demo-call",  icon: Video, label: "Демонстрация - Звонок",          desc: "Сначала кандидат смотрит демо, затем созвон",         color: "text-purple-600" },
  { key: "call-demo",  icon: Phone, label: "Звонок - Демонстрация",          desc: "Сначала короткий звонок, потом демо",                color: "text-emerald-600" },
  { key: "call-only",  icon: Phone, label: "Только звонок",                  desc: "Без демо, сразу живое общение",                      color: "text-blue-600" },
  { key: "fast-hire",  icon: Truck, label: "Быстрый найм",                   desc: "Минимум шагов, максимум скорости",                   color: "text-amber-600" },
  { key: "ai-smart",   icon: Bot,   label: "Умный - AI решает по скорингу",  desc: "AI подбирает путь кандидата по скорингу",             color: "text-cyan-600" },
]

// ─── Default stop factors ───────────────────────────────────────────────────

const DEFAULT_STOP_FACTORS = [
  { id: "no_experience",   label: "Нет опыта работы",              defaultOn: false },
  { id: "salary_mismatch", label: "Зарплатные ожидания не совпадают", defaultOn: true },
  { id: "no_response_3d",  label: "Нет ответа 3 дня",             defaultOn: true },
  { id: "failed_demo",     label: "Не прошёл демо-курс",          defaultOn: true },
  { id: "wrong_city",      label: "Город не совпадает",            defaultOn: false },
  { id: "duplicate",       label: "Дубликат кандидата",            defaultOn: true },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function HiringSettingsPage() {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType>("demo-call")
  const [stopFactors, setStopFactors] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DEFAULT_STOP_FACTORS.map(f => [f.id, f.defaultOn]))
  )

  const toggleFactor = (id: string) => {
    setStopFactors(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Settings className="size-5 text-muted-foreground" />
                <h1 className="text-xl font-bold tracking-tight">Настройки найма</h1>
              </div>
              <p className="text-sm text-muted-foreground">Общие настройки для всех вакансий</p>
            </div>

            <div className="space-y-6 max-w-3xl">

              {/* ═══ Templates ═══ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="size-4" />Шаблоны сообщений
                  </CardTitle>
                  <CardDescription>Создайте шаблоны для быстрого использования в вакансиях</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <FileText className="size-8 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground mb-3">Шаблонов пока нет</p>
                    <Button variant="outline" size="sm">
                      <Plus className="size-4 mr-1.5" />Создать шаблон
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ═══ Default funnel scenario ═══ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Video className="size-4" />Дефолтный сценарий воронки
                  </CardTitle>
                  <CardDescription>Новые вакансии будут использовать этот сценарий по умолчанию</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {SCENARIOS.map(s => {
                      const Icon = s.icon
                      const selected = selectedScenario === s.key
                      return (
                        <button
                          key={s.key}
                          onClick={() => setSelectedScenario(s.key)}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                            selected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-accent/50"
                          )}
                        >
                          <Icon className={cn("size-5 mt-0.5 shrink-0", s.color)} />
                          <div className="min-w-0">
                            <p className={cn("text-sm font-medium", selected && "text-primary")}>{s.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* ═══ Stop factors ═══ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="size-4" />Стоп-факторы по умолчанию
                  </CardTitle>
                  <CardDescription>Применяются ко всем новым вакансиям автоматически</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {DEFAULT_STOP_FACTORS.map(f => (
                      <div key={f.id} className="flex items-center justify-between">
                        <Label htmlFor={f.id} className="text-sm cursor-pointer">{f.label}</Label>
                        <Switch
                          id={f.id}
                          checked={stopFactors[f.id] ?? false}
                          onCheckedChange={() => toggleFactor(f.id)}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
