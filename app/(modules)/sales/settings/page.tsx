"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings2,
  Loader2,
  Save,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Workflow,
  Package,
  Users,
  CalendarClock,
  Inbox,
  Zap,
  Bot,
} from "lucide-react"
import Link from "next/link"
import {
  type FunnelType,
  type CrmStage,
  FUNNEL_TYPES,
  getDefaultStages,
} from "@/lib/crm/deal-stages"
import { ServicesTab } from "@/components/sales/settings/services-tab"
import { MastersTab } from "@/components/sales/settings/masters-tab"
import { ScheduleTab } from "@/components/sales/settings/schedule-tab"
import { SourcesTab } from "@/components/sales/settings/sources-tab"
import { AutomationsTab } from "@/components/sales/settings/automations-tab"

interface SalesSettings {
  funnelType: FunnelType
  stages: CrmStage[]
  leadSources: string[] | null
  automations: unknown[] | null
}

function slugify(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, "_").replace(/^_+|_+$/g, "")
  return base || `stage_${Math.random().toString(36).slice(2, 7)}`
}

export default function SalesSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [funnelType, setFunnelType] = useState<FunnelType>("booking")
  const [stages, setStages] = useState<CrmStage[]>([])

  // ── Загрузка ──
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch("/api/modules/sales/settings")
        if (!res.ok) throw new Error()
        const json = await res.json()
        const data = (json?.data ?? json) as SalesSettings
        if (!alive) return
        setFunnelType(data.funnelType ?? "booking")
        setStages(Array.isArray(data.stages) ? data.stages : getDefaultStages(data.funnelType ?? "booking"))
      } catch {
        if (alive) toast.error("Не удалось загрузить настройки CRM")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // ── Смена типа воронки → подставить дефолтные стадии нового типа ──
  const changeFunnelType = useCallback((next: FunnelType) => {
    if (next === funnelType) return
    setFunnelType(next)
    setStages(getDefaultStages(next))
    toast.info(`Стадии заменены на набор по умолчанию для типа «${FUNNEL_TYPES.find(f => f.id === next)?.label}». Не забудьте сохранить.`)
  }, [funnelType])

  // ── Операции над стадиями ──
  const updateStage = (i: number, patch: Partial<CrmStage>) =>
    setStages(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))

  const addStage = () =>
    setStages(prev => [...prev, { id: slugify(`stage_${prev.length + 1}`), label: "Новая стадия", color: "#6B7280", probability: 0, order: prev.length }])

  const removeStage = (i: number) =>
    setStages(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })))

  const moveStage = (i: number, dir: -1 | 1) =>
    setStages(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((s, idx) => ({ ...s, order: idx }))
    })

  const resetStages = () => setStages(getDefaultStages(funnelType))

  // ── Сохранение ──
  const save = useCallback(async () => {
    // нормализуем id/order
    const payloadStages = stages.map((s, idx) => ({
      ...s,
      id: s.id || slugify(s.label),
      order: idx,
      probability: Math.max(0, Math.min(100, Math.round(s.probability))),
    }))
    setSaving(true)
    try {
      const res = await fetch("/api/modules/sales/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelType, stages: payloadStages }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error)
      }
      const json = await res.json()
      const data = (json?.data ?? json) as SalesSettings
      setFunnelType(data.funnelType)
      setStages(data.stages)
      toast.success("Настройки воронки сохранены")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }, [funnelType, stages])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">
            {/* Шапка */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Settings2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Настройки CRM</h1>
                <p className="text-sm text-muted-foreground">Воронка, услуги, расписание и автоматизации продаж</p>
              </div>
            </div>

            <Tabs defaultValue="funnel" className="w-full">
              <TabsList className="mb-6 flex-wrap h-auto">
                <TabsTrigger value="funnel"><Workflow className="h-4 w-4 mr-1.5" />Воронка</TabsTrigger>
                <TabsTrigger value="services"><Package className="h-4 w-4 mr-1.5" />Услуги</TabsTrigger>
                <TabsTrigger value="masters"><Users className="h-4 w-4 mr-1.5" />Мастера</TabsTrigger>
                <TabsTrigger value="schedule"><CalendarClock className="h-4 w-4 mr-1.5" />Расписание</TabsTrigger>
                <TabsTrigger value="sources"><Inbox className="h-4 w-4 mr-1.5" />Источники</TabsTrigger>
                <TabsTrigger value="automations"><Zap className="h-4 w-4 mr-1.5" />Автоматизации</TabsTrigger>
                <TabsTrigger value="bot"><Bot className="h-4 w-4 mr-1.5" />Бот</TabsTrigger>
              </TabsList>

              {/* ── Вкладка «Воронка» ── */}
              <TabsContent value="funnel">
                {loading ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Загрузка…
                  </div>
                ) : (
                  <div className="space-y-6 max-w-3xl">
                    {/* Тип воронки */}
                    <Card>
                      <CardHeader><CardTitle className="text-base">Тип воронки</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {FUNNEL_TYPES.map(ft => (
                          <button
                            key={ft.id}
                            onClick={() => changeFunnelType(ft.id)}
                            className={`w-full text-left rounded-lg border p-4 transition-colors ${funnelType === ft.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`h-4 w-4 rounded-full border-2 ${funnelType === ft.id ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                              <span className="font-medium text-foreground">{ft.label}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 ml-6">{ft.description}</p>
                          </button>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Стадии */}
                    <Card>
                      <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">Стадии воронки</CardTitle>
                        <Button variant="ghost" size="sm" onClick={resetStages}>
                          <RotateCcw className="h-4 w-4 mr-1.5" />Сбросить к умолчанию
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {stages.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2">
                            <div className="flex flex-col">
                              <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => moveStage(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                              <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === stages.length - 1} onClick={() => moveStage(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                            </div>
                            <input
                              type="color"
                              value={s.color}
                              onChange={e => updateStage(i, { color: e.target.value })}
                              className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                              title="Цвет стадии"
                            />
                            <Input
                              value={s.label}
                              onChange={e => updateStage(i, { label: e.target.value })}
                              className="flex-1"
                              placeholder="Название стадии"
                            />
                            <div className="flex items-center gap-1 shrink-0">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={s.probability}
                                onChange={e => updateStage(i, { probability: Number(e.target.value) })}
                                className="w-20"
                                title="Вероятность закрытия, %"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeStage(i)} disabled={stages.length <= 2}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addStage} className="mt-2">
                          <Plus className="h-4 w-4 mr-1.5" />Добавить стадию
                        </Button>
                      </CardContent>
                    </Card>

                    <div className="flex justify-end">
                      <Button onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                        Сохранить
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── Вкладки фазы 2 ── */}
              <TabsContent value="services"><ServicesTab /></TabsContent>
              <TabsContent value="masters"><MastersTab /></TabsContent>
              <TabsContent value="schedule"><ScheduleTab /></TabsContent>
              <TabsContent value="sources"><SourcesTab /></TabsContent>
              <TabsContent value="automations"><AutomationsTab /></TabsContent>
              <TabsContent value="bot">
                <Card className="max-w-2xl">
                  <CardContent className="py-8 text-center space-y-3">
                    <Bot className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Настройки AI-бота вынесены на отдельную страницу.</p>
                    <Button asChild variant="outline"><Link href="/sales/chatbot">Открыть настройки бота</Link></Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

