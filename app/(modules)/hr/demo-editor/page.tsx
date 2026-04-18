"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NotionEditor } from "@/components/vacancies/notion-editor"
import {
  Clock, Pause, Archive, Plus, Kanban, BarChart3, Zap, Globe, Settings, BookOpen, LayoutTemplate, ClipboardList, Loader2,
} from "lucide-react"
import { toast } from "sonner"
import type { Demo } from "@/lib/course-types"
import { createDemo } from "@/lib/course-types"
import { TemplateSelectorDialog } from "@/components/vacancies/template-selector-dialog"
import type { DemoTemplate } from "@/lib/templates/demo-templates"

// KPI для шапки — в реальности данные придут из API, пока плейсхолдеры
const KPI_ITEMS = [
  { label: "Всего откликов", value: "0", pct: "", color: "text-muted-foreground" },
  { label: "Перешли на демо", value: "0", pct: "", color: "text-blue-600" },
  { label: "Прошли демо ≥85%", value: "0", pct: "", color: "text-violet-600" },
  { label: "Назначено интервью", value: "0", pct: "", color: "text-amber-600" },
  { label: "Прошли интервью", value: "0", pct: "", color: "text-orange-600" },
  { label: "Нанято", value: "0", pct: "", color: "text-emerald-600" },
]

// ─── Загрузка демо из БД ─────────────────────────────────────────────────────

async function fetchDemoByVacancy(vacancyId: string): Promise<{ id: string; title: string; lessons_json: unknown[] } | null> {
  try {
    const res = await fetch(`/api/modules/hr/demos?vacancy_id=${encodeURIComponent(vacancyId)}`)
    if (!res.ok) return null
    const json = await res.json()
    const rows = (json?.data ?? json) as Array<{ id: string; title: string; lessonsJson: unknown[] }>
    if (!Array.isArray(rows) || rows.length === 0) return null
    const first = rows[0]
    return {
      id: first.id,
      title: first.title,
      lessons_json: Array.isArray(first.lessonsJson) ? first.lessonsJson : [],
    }
  } catch (err) {
    console.error("[demo-editor] fetchDemoByVacancy error:", err)
    return null
  }
}

async function fetchVacancyTitle(vacancyId: string): Promise<string> {
  try {
    const res = await fetch(`/api/vacancies/${encodeURIComponent(vacancyId)}`)
    if (!res.ok) return "Демонстрация"
    const json = await res.json()
    const v = json?.data ?? json
    return v?.title || "Демонстрация"
  } catch {
    return "Демонстрация"
  }
}

async function createEmptyDemo(vacancyId: string, title: string): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`/api/modules/hr/demos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vacancy_id: vacancyId, title, lessons_json: [] }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const created = json?.data ?? json
    return created?.id ? { id: created.id } : null
  } catch (err) {
    console.error("[demo-editor] createEmptyDemo error:", err)
    return null
  }
}

async function saveDemoToDb(demoId: string, demo: Demo): Promise<boolean> {
  try {
    const res = await fetch(`/api/modules/hr/demos/${encodeURIComponent(demoId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: demo.title,
        lessons_json: demo.lessons,
      }),
    })
    return res.ok
  } catch (err) {
    console.error("[demo-editor] saveDemoToDb error:", err)
    return false
  }
}

// ─── Конверсия lessons_json из БД в Demo ─────────────────────────────────────

function buildDemoFromDb(dbId: string, title: string, lessonsJson: unknown[]): Demo {
  // Базовый объект Demo с правильной структурой
  const base = createDemo(title)
  return {
    ...base,
    id: dbId,
    title,
    // Если есть сохранённые уроки — используем их, иначе дефолт из createDemo
    lessons: Array.isArray(lessonsJson) && lessonsJson.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (lessonsJson as any[])
      : base.lessons,
  }
}

// ─── Главный компонент ──────────────────────────────────────────────────────

export default function DemoEditorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const vacancyIdFromUrl = searchParams?.get("vacancyId") || null

  const [demo, setDemo] = useState<Demo | null>(null)
  const [demoDbId, setDemoDbId] = useState<string | null>(null)
  const [vacancyTitle, setVacancyTitle] = useState<string>("Демонстрация")
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState("demo-notion")
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  // Debounce для autosave
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Инициализация: загрузка/создание демо ────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)

      if (!vacancyIdFromUrl) {
        // Нет vacancyId — создаём временный локальный демо, без БД
        if (!cancelled) {
          const local = createDemo("Новая демонстрация")
          setDemo(local)
          setVacancyTitle(local.title)
          setLoading(false)
        }
        return
      }

      // Загружаем название вакансии и существующее демо параллельно
      const [title, existing] = await Promise.all([
        fetchVacancyTitle(vacancyIdFromUrl),
        fetchDemoByVacancy(vacancyIdFromUrl),
      ])

      if (cancelled) return

      setVacancyTitle(title)

      if (existing) {
        // Демо уже есть — загружаем
        const loaded = buildDemoFromDb(existing.id, existing.title || title, existing.lessons_json)
        setDemo(loaded)
        setDemoDbId(existing.id)
        setLoading(false)
        return
      }

      // Демо нет — создаём пустое
      const created = await createEmptyDemo(vacancyIdFromUrl, title)
      if (cancelled) return

      if (!created) {
        toast.error("Не удалось создать демонстрацию")
        const local = createDemo(title)
        setDemo(local)
        setLoading(false)
        return
      }

      const fresh = buildDemoFromDb(created.id, title, [])
      setDemo(fresh)
      setDemoDbId(created.id)
      setLoading(false)
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [vacancyIdFromUrl])

  // ─── Автосохранение с debounce 2 сек ──────────────────────────────────────
  const handleUpdate = useCallback((updated: Demo) => {
    setDemo(updated)

    if (!demoDbId) return // Нет ID в БД — не сохраняем
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      const ok = await saveDemoToDb(demoDbId, updated)
      setSaving(false)
      if (!ok) toast.error("Не удалось сохранить")
    }, 2000)
  }, [demoDbId])

  // Применить шаблон из библиотеки
  const handleTemplateSelect = useCallback((template: DemoTemplate) => {
    if (!demo) return
    const ts = Date.now()
    const lessons = template.lessons.map((l, i) => ({
      ...l,
      id: `${l.id}-${ts}`,
      blocks: l.blocks.map((b) => ({ ...b, id: `${b.id}-${ts}-${i}` })),
    }))
    const newDemo: Demo = {
      ...demo,
      title: template.title,
      lessons,
      updatedAt: new Date(),
    }
    setDemo(newDemo)
    // Сохраняем немедленно после применения шаблона
    if (demoDbId) {
      void saveDemoToDb(demoDbId, newDemo).then((ok) => {
        if (ok) toast.success(`Шаблон «${template.title}» применён`)
        else toast.error("Не удалось сохранить шаблон")
      })
    } else {
      toast.success(`Шаблон «${template.title}» применён (локально)`)
    }
  }, [demo, demoDbId])

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Шапка вакансии */}
          <div className="px-6 pt-4 pb-0 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-bold text-foreground">{vacancyTitle}</h1>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-xs">
                    Активна
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />Редактор демонстрации
                  </span>
                  {saving && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />Сохранение...
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {vacancyIdFromUrl
                    ? "Демонстрация привязана к вакансии"
                    : "Локальный черновик (без привязки к вакансии)"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setTemplateDialogOpen(true)}>
                  <LayoutTemplate className="w-3.5 h-3.5" />Выбрать шаблон
                </Button>
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

            {/* KPI */}
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

            {/* Табы */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-transparent p-0 h-auto gap-0 border-0 rounded-none">
                <button
                  type="button"
                  onClick={() => router.push(vacancyIdFromUrl ? `/hr/vacancies/${vacancyIdFromUrl}` : "/hr/vacancies")}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ClipboardList className="w-3.5 h-3.5" />Анкета
                </button>
                {[
                  { id: "demo-notion", icon: <BookOpen className="w-3.5 h-3.5" />, label: "Демонстрация" },
                  { id: "candidates", icon: <Kanban className="w-3.5 h-3.5" />, label: "Кандидаты" },
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

          {/* Контент табов */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "candidates" && (
              <div className="h-full flex items-center justify-center text-muted-foreground/40 text-sm">
                Канбан-доска кандидатов
              </div>
            )}

            {activeTab === "demo-notion" && (
              <div className="h-full overflow-y-auto px-6 pt-4">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground/60 text-sm gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />Загрузка демонстрации...
                  </div>
                ) : demo ? (
                  <NotionEditor
                    demo={demo}
                    onBack={() => {}}
                    onUpdate={handleUpdate}
                    onOpenLibrary={() => setTemplateDialogOpen(true)}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
                    Не удалось загрузить демонстрацию
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

        {/* Диалог выбора шаблона */}
        <TemplateSelectorDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          onSelect={handleTemplateSelect}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
