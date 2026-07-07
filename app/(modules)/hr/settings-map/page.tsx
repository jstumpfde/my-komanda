"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Map as MapIcon, Search, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Типы (зеркалят app/api/modules/hr/settings-map/route.ts) ───────────────

type Level = "platform" | "company" | "vacancy"
type Origin = "default" | "company" | "vacancy" | "code"

interface SettingsMapRow {
  key: string
  title: string
  description?: string
  group: string
  level: Level
  editPath: string | null
  effectiveValue: string
  origin: Origin
  hardcoded?: true
  valueHint?: string
}

interface VacancyOption { id: string; title: string; shortCode?: string | null }

interface SettingsMapResponse {
  rows: SettingsMapRow[]
  vacancyOptions: VacancyOption[]
  selectedVacancyId: string | null
}

const LEVEL_LABELS: Record<Level, string> = {
  platform: "Платформа",
  company:  "Компания",
  vacancy:  "Вакансия",
}

const LEVEL_FILTERS: { value: "all" | Level; label: string }[] = [
  { value: "all",      label: "Все" },
  { value: "platform", label: "Платформа" },
  { value: "company",  label: "Компания" },
  { value: "vacancy",  label: "Вакансия" },
]

function originBadge(row: SettingsMapRow) {
  if (row.hardcoded || row.origin === "code") {
    return <Badge className="border-amber-200 bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:border-amber-800">в коде</Badge>
  }
  if (row.origin === "vacancy") {
    return <Badge className="border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:border-emerald-800">вакансия</Badge>
  }
  if (row.origin === "company") {
    return <Badge className="border-blue-200 bg-blue-500/10 text-blue-700 dark:text-blue-400 dark:border-blue-800">компания</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground">дефолт</Badge>
}

function resolveEditPath(editPath: string | null, vacancyId: string): string | null {
  if (!editPath) return null
  if (editPath.includes("[id]")) {
    if (!vacancyId) return null
    return editPath.replace("[id]", vacancyId)
  }
  return editPath
}

export default function SettingsMapPage() {
  // Внутренний код вакансии (short_code) в дропдауне — только платформенным
  // (session.user.isPlatformAdmin переживает impersonation, см. auth.ts).
  const { data: session } = useSession()
  const isPlatformAdmin = session?.user?.isPlatformAdmin === true
  const [search, setSearch] = useState("")
  const [levelFilter, setLevelFilter] = useState<"all" | Level>("all")
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [vacancyId, setVacancyId] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return localStorage.getItem("hr-settings-map-vacancy") || ""
  })
  const [data, setData] = useState<SettingsMapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem("hr-settings-map-vacancy", vacancyId)
  }, [vacancyId])

  const load = useCallback((vid: string) => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = vid ? `?vacancyId=${encodeURIComponent(vid)}` : ""
    fetch(`/api/modules/hr/settings-map${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SettingsMapResponse) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError("Не удалось загрузить карту настроек") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const cancel = load(vacancyId)
    return cancel
  }, [vacancyId, load])

  const filteredGroups = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const rows = data.rows.filter((r) => {
      if (levelFilter !== "all" && r.level !== levelFilter) return false
      if (onlyChanged && r.origin === "default") return false
      if (q) {
        const hay = `${r.title} ${r.description ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const byGroup = new Map<string, SettingsMapRow[]>()
    for (const r of rows) {
      const arr = byGroup.get(r.group) ?? []
      arr.push(r)
      byGroup.set(r.group, arr)
    }
    return Array.from(byGroup.entries())
  }, [data, search, levelFilter, onlyChanged])

  const totalCount = data?.rows.length ?? 0
  const visibleCount = filteredGroups.reduce((acc, [, rows]) => acc + rows.length, 0)

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6 px-4 sm:px-14">

            {/* Шапка */}
            <div className="flex items-center gap-2 pt-3 pb-2">
              <MapIcon className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Карта настроек</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Каждый настраиваемый параметр найма: эффективное значение, откуда оно взялось
              (дефолт платформы / компания / вакансия) и переход к месту редактирования.
              Только для чтения.
            </p>

            {/* Тулбар: поиск + фильтры уровня + вакансия + «только изменённые» */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-5">
              <div className="relative w-full lg:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по названию…"
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border p-0.5">
                  {LEVEL_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setLevelFilter(f.value)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded transition-colors",
                        levelFilter === f.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <Select value={vacancyId || "none"} onValueChange={(v) => setVacancyId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm w-full sm:w-[220px]">
                    <SelectValue placeholder="Вакансия не выбрана" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Вакансия не выбрана</SelectItem>
                    {(data?.vacancyOptions ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.title}
                        {isPlatformAdmin && o.shortCode && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground/70">{o.shortCode}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <label className="flex items-center gap-2 text-sm pl-1">
                  <Switch checked={onlyChanged} onCheckedChange={setOnlyChanged} />
                  <span className="text-muted-foreground whitespace-nowrap">Только изменённые</span>
                </label>
              </div>
            </div>

            {loading && (
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {!loading && !error && data && (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Показано {visibleCount} из {totalCount}
                  {!vacancyId && " · выберите вакансию, чтобы увидеть vacancy-уровень"}
                </p>

                <div className="space-y-6">
                  {filteredGroups.map(([group, rows]) => (
                    <section key={group}>
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {group}
                      </h2>
                      <div className="rounded-lg border divide-y">
                        {rows.map((row) => {
                          const href = resolveEditPath(row.editPath, vacancyId)
                          return (
                            <div
                              key={row.key}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{row.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {LEVEL_LABELS[row.level]}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {row.valueHint ?? row.effectiveValue}
                                  {row.description && !row.valueHint && (
                                    <span className="ml-1.5 opacity-70">— {row.description}</span>
                                  )}
                                </p>
                              </div>
                              <div className="shrink-0">{originBadge(row)}</div>
                              <div className="shrink-0 w-7 flex justify-center">
                                {href ? (
                                  <a
                                    href={href}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                    title="Редактировать"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <ExternalLink
                                    className="h-3.5 w-3.5 opacity-25 cursor-not-allowed"
                                    aria-hidden
                                  />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ))}

                  {filteredGroups.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
                  )}
                </div>
              </>
            )}

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
