"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NotionEditor } from "@/components/vacancies/notion-editor"
import { CourseTab } from "@/components/vacancies/course-tab"
import {
  Clock, Pause, Archive, Plus, Kanban, BarChart3, Zap, Globe, Settings, BookOpen,
} from "lucide-react"
import { toast } from "sonner"
import type { Demo } from "@/lib/course-types"
import { createDemo } from "@/lib/course-types"

const STORAGE_KEY = "hireflow-demos"
const NOTION_DEMO_KEY = "notion-demo-editor-demo"

function loadOrCreateDemo(): Demo {
  if (typeof window === "undefined") return createDemo("Менеджер по продажам")
  try {
    // Try to load from notion key first (persisted demo for this editor)
    const raw = localStorage.getItem(NOTION_DEMO_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      return { ...d, createdAt: new Date(d.createdAt), updatedAt: new Date(d.updatedAt) }
    }
    // Otherwise try from shared demos storage
    const shared = localStorage.getItem(STORAGE_KEY)
    if (shared) {
      const arr = JSON.parse(shared)
      if (arr.length > 0) {
        const d = arr[0]
        return { ...d, createdAt: new Date(d.createdAt), updatedAt: new Date(d.updatedAt) }
      }
    }
  } catch { /* fallback */ }
  return createDemo("Менеджер по продажам")
}

function saveDemo(demo: Demo) {
  try {
    localStorage.setItem(NOTION_DEMO_KEY, JSON.stringify(demo))
    console.log("[DemoEditor] saved demo", demo.id, "lessons:", demo.lessons.length)
  } catch (e) { console.error("[DemoEditor] save error", e) }
}

// KPI data for the header
const KPI_ITEMS = [
  { label: "Всего откликов", value: "1001", pct: "+60%", color: "text-muted-foreground" },
  { label: "Перешли на демо", value: "601", pct: "+27%", color: "text-blue-600" },
  { label: "Прошли демо ≥85%", value: "164", pct: "+184%", color: "text-violet-600" },
  { label: "Назначено интервью", value: "301", pct: "+40%", color: "text-amber-600" },
  { label: "Прошли интервью", value: "121", pct: "+34%", color: "text-orange-600" },
  { label: "Нанято", value: "41", pct: "", color: "text-emerald-600" },
]

export default function DemoEditorPage() {
  const [demo, setDemo] = useState<Demo | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [activeTab, setActiveTab] = useState("demo-notion")

  useEffect(() => {
    const d = loadOrCreateDemo()
    setDemo(d)
    setHydrated(true)
  }, [])

  const handleUpdate = useCallback((updated: Demo) => {
    setDemo(updated)
    saveDemo(updated)
  }, [])

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Vacancy header */}
          <div className="px-6 pt-4 pb-0 border-b border-border flex-shrink-0">
            {/* Title row */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-bold text-foreground">Менеджер по продажам</h1>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-xs">
                    Активна
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />18 дн.
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">1001 кандидатов · Менеджер по продажам · Москва</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Pause className="w-3.5 h-3.5" />Остановить
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Archive className="w-3.5 h-3.5" />В архив
                </Button>
                <Button size="sm" className="gap-1.5 text-xs">
                  <Plus className="w-3.5 h-3.5" />Добавить
                </Button>
              </div>
            </div>

            {/* KPI row */}
            <div className="flex gap-px mb-3">
              {KPI_ITEMS.map((kpi, i) => (
                <div key={i} className={cn(
                  "flex-1 px-3 py-2 bg-card border border-border rounded-none",
                  i === 0 && "rounded-l-xl",
                  i === KPI_ITEMS.length - 1 && "rounded-r-xl",
                  i > 0 && "-ml-px"
                )}>
                  <p className="text-[10px] text-muted-foreground mb-0.5">{kpi.label}</p>
                  <p className="text-lg font-bold text-foreground leading-none">{kpi.value}</p>
                  {kpi.pct && <p className={cn("text-[11px] font-medium mt-0.5", kpi.color)}>{kpi.pct}</p>}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-transparent p-0 h-auto gap-0 border-0 rounded-none">
                {[
                  { id: "candidates", icon: <Kanban className="w-3.5 h-3.5" />, label: "Кандидаты" },
                  { id: "demo-notion", icon: <BookOpen className="w-3.5 h-3.5" />, label: "Демонстрация" },
                  { id: "analytics", icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Аналитика" },
                  { id: "automation", icon: <Zap className="w-3.5 h-3.5" />, label: "Автоматизация" },
                  { id: "publish", icon: <Globe className="w-3.5 h-3.5" />, label: "Публикация" },
                  { id: "settings", icon: <Settings className="w-3.5 h-3.5" />, label: "Настройки" },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-none border-b-2 transition-colors",
                      activeTab === tab.id
                        ? "border-primary text-foreground bg-transparent shadow-none"
                        : "border-transparent text-muted-foreground hover:text-foreground bg-transparent shadow-none"
                    )}
                  >
                    {tab.icon}{tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "candidates" && (
              <div className="h-full flex items-center justify-center text-muted-foreground/40 text-sm">
                Канбан-доска кандидатов
              </div>
            )}

            {activeTab === "demo-notion" && (
              <div className="h-full overflow-y-auto px-6 pt-4">
                {hydrated && demo ? (
                  <NotionEditor
                    demo={demo}
                    onBack={() => {}}
                    onUpdate={handleUpdate}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
                    Загрузка...
                  </div>
                )}
              </div>
            )}

            {activeTab === "analytics" && (
              <div className="h-full flex items-center justify-center text-muted-foreground/40 text-sm">
                Аналитика воронки
              </div>
            )}
            {activeTab === "automation" && (
              <div className="h-full flex items-center justify-center text-muted-foreground/40 text-sm">
                Настройки автоматизации
              </div>
            )}
            {activeTab === "publish" && (
              <div className="h-full flex items-center justify-center text-muted-foreground/40 text-sm">
                Публикация вакансии
              </div>
            )}
            {activeTab === "settings" && (
              <div className="h-full flex items-center justify-center text-muted-foreground/40 text-sm">
                Настройки вакансии
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
