"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { Settings, Plug, GitBranch, Clock, ShieldAlert, Wrench, MessageSquare } from "lucide-react"
import { IntegrationsContent } from "@/components/hr/integrations-content"
import { SendDelaySettings } from "@/components/company/send-delay-settings"
import { TrashRetentionSettings } from "@/components/company/trash-retention-settings"
import { FunnelAutomationSection } from "@/components/hiring-settings/funnel-automation-section"
import { InterviewSection } from "@/components/hiring-settings/interview-section"
import { StopFactorsSection } from "@/components/hiring-settings/stop-factors-section"
import { ServiceSection } from "@/components/hiring-settings/service-section"
import type { CompanyHiringDefaults } from "@/lib/db/schema"

// ─── Константы ─────────────────────────────────────────────────────────────

const HIRING_DEFAULTS_URL = "/api/modules/hr/company/hiring-defaults"

type TabKey = "funnel" | "interview" | "ai" | "stop-factors" | "service" | "integrations"

const TABS: { value: TabKey; label: string; icon: typeof Settings }[] = [
  { value: "funnel",        label: "Воронка и автоматизация", icon: GitBranch },
  { value: "interview",     label: "Интервью",                icon: Clock },
  { value: "ai",            label: "AI-общение",              icon: MessageSquare },
  { value: "stop-factors",  label: "Стоп-факторы",           icon: ShieldAlert },
  { value: "service",       label: "Служебное",               icon: Wrench },
  { value: "integrations",  label: "Интеграции",              icon: Plug },
]

// ─── Страница ────────────────────────────────────────────────────────────────

export default function HiringSettingsPage() {
  // ── Инициализация таба из ?tab=integrations (и других) ──
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("tab") as TabKey | null
      if (v && TABS.some((t) => t.value === v)) return v
    }
    return "funnel"
  })

  // ── Единый источник данных ──
  const [defaults, setDefaults] = useState<CompanyHiringDefaults | null>(null)

  useEffect(() => {
    fetch(HIRING_DEFAULTS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { hiringDefaults?: CompanyHiringDefaults } | null) => {
        if (d?.hiringDefaults) setDefaults(d.hiringDefaults)
      })
      .catch(() => {})
  }, [])

  // ── onPatch: PATCH → merge в локальный state ──
  const onPatch = async (patch: Partial<CompanyHiringDefaults>) => {
    const res = await fetch(HIRING_DEFAULTS_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error("save_failed")
    const data = (await res.json()) as { hiringDefaults: CompanyHiringDefaults }
    setDefaults((prev) =>
      prev ? { ...prev, ...data.hiringDefaults } : data.hiringDefaults
    )
  }

  // ── Ожидание загрузки defaults ──
  if (!defaults) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex-1 overflow-auto bg-background min-w-0">
            <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
              <div className="flex items-center gap-2 pt-3 pb-2">
                <Settings className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Настройки найма</h1>
              </div>
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Шапка */}
            <div className="flex items-center gap-2 pt-3 pb-2">
              <Settings className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Настройки найма</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Эти настройки применяются ко всем новым вакансиям при создании.
              В каждой вакансии их можно изменить отдельно.
            </p>

            {/* Горизонтальный таб-бар — стиль настроек вакансии */}
            <div className="flex items-center gap-1 border-b overflow-x-auto mb-6">
              {TABS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveTab(value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0",
                    activeTab === value
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Контент активного таба */}
            <div className="max-w-3xl">

              {activeTab === "funnel" && (
                <FunnelAutomationSection defaults={defaults} onPatch={onPatch} />
              )}

              {activeTab === "interview" && (
                <InterviewSection defaults={defaults} onPatch={onPatch} />
              )}

              {activeTab === "ai" && (
                <SendDelaySettings />
              )}

              {activeTab === "stop-factors" && (
                <StopFactorsSection defaults={defaults} onPatch={onPatch} />
              )}

              {activeTab === "service" && (
                <div className="space-y-4">
                  <ServiceSection defaults={defaults} onPatch={onPatch} />
                  <TrashRetentionSettings />
                </div>
              )}

              {activeTab === "integrations" && (
                <IntegrationsContent />
              )}

            </div>

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
