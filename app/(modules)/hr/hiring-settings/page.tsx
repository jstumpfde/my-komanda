"use client"

import { useState, useEffect } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

// ─── Боковая навигация (секции «Основные») ──────────────────────────────────

const SECTIONS = [
  { id: "funnel",       label: "Воронка и автоматизация", icon: GitBranch },
  { id: "interview",    label: "Интервью",                icon: Clock },
  { id: "ai",          label: "AI-общение",               icon: MessageSquare },
  { id: "stop-factors", label: "Стоп-факторы (дефолты)", icon: ShieldAlert },
  { id: "service",     label: "Служебное",                icon: Wrench },
] as const

// ─── Страница ────────────────────────────────────────────────────────────────

export default function HiringSettingsPage() {
  // ── Инициализация верхнего таба из ?tab=integrations ──
  const [topTab, setTopTab] = useState<"general" | "integrations">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      return params.get("tab") === "integrations" ? "integrations" : "general"
    }
    return "general"
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

  // ── Скролл к секции ──
  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
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
            <p className="text-sm text-muted-foreground mb-5">
              Эти настройки применяются ко всем новым вакансиям при создании.
              В каждой вакансии их можно изменить отдельно.
            </p>

            {/* Верхние табы: Основные / Интеграции */}
            <Tabs
              value={topTab}
              onValueChange={(v) => setTopTab(v as "general" | "integrations")}
              className="w-full"
            >
              <TabsList className="mb-6">
                <TabsTrigger value="general" className="gap-1.5">
                  <Settings className="w-3.5 h-3.5" />
                  Основные
                </TabsTrigger>
                <TabsTrigger value="integrations" className="gap-1.5">
                  <Plug className="w-3.5 h-3.5" />
                  Интеграции
                </TabsTrigger>
              </TabsList>

              {/* Таб «Интеграции» */}
              <TabsContent value="integrations">
                <IntegrationsContent />
              </TabsContent>

              {/* Таб «Основные»: прокручиваемая колонка + липкая боковая навигация */}
              <TabsContent value="general">
                <div className="flex gap-8">

                  {/* Боковая навигация — sticky */}
                  <aside className="w-52 shrink-0">
                    <nav className="sticky top-6 space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
                        Разделы
                      </p>
                      {SECTIONS.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => scrollTo(id)}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                            "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          )}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          {label}
                        </button>
                      ))}
                    </nav>
                  </aside>

                  {/* Основная колонка секций */}
                  <div className="flex-1 min-w-0 space-y-10 max-w-3xl">

                    {/* ─── 1. Воронка и автоматизация ─── */}
                    <section id="funnel">
                      <FunnelAutomationSection defaults={defaults} onPatch={onPatch} />
                    </section>

                    {/* ─── 2. Интервью ─── */}
                    <section id="interview">
                      <InterviewSection defaults={defaults} onPatch={onPatch} />
                    </section>

                    {/* ─── 3. AI-общение ─── */}
                    <section id="ai">
                      <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-violet-600" />
                          AI-общение
                        </h2>
                        {/* Per-company темп отправки follow-up (безопасность hh-аккаунта) */}
                        <SendDelaySettings />
                      </div>
                    </section>

                    {/* ─── 4. Стоп-факторы (дефолты) ─── */}
                    <section id="stop-factors">
                      <StopFactorsSection defaults={defaults} onPatch={onPatch} />
                    </section>

                    {/* ─── 5. Служебное ─── */}
                    <section id="service">
                      <div className="space-y-4">
                        <ServiceSection defaults={defaults} onPatch={onPatch} />
                        {/* Корзина вакансий — срок хранения */}
                        <TrashRetentionSettings />
                      </div>
                    </section>

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
