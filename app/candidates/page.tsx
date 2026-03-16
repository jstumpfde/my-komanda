"use client"

import { useState, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, MapPin, ArrowRight, ChevronUp, ChevronDown, ChevronsUpDown, Circle, Filter } from "lucide-react"
import { cn } from "@/lib/utils"

type SortKey = "name" | "vacancy" | "city" | "salary" | "score" | "stage" | "source"
type SortDir = "asc" | "desc"

interface Candidate {
  id: string
  name: string
  experience: string
  vacancy: string
  city: string
  salaryMin: number
  salaryMax: number
  score: number
  stage: string
  stageColorFrom: string
  stageColorTo: string
  source: string
  lastSeen: "online" | Date
  avatarColor: string
}

const candidates: Candidate[] = [
  {
    id: "1",
    name: "Иван Петров",
    experience: "5 лет в B2B продажах",
    vacancy: "Менеджер по продажам",
    city: "Москва",
    salaryMin: 150000,
    salaryMax: 180000,
    score: 88,
    stage: "Новые",
    stageColorFrom: "#22d3ee",
    stageColorTo: "#06b6d4",
    source: "hh.ru",
    lastSeen: "online",
    avatarColor: "#06b6d4",
  },
  {
    id: "2",
    name: "Мария Сидорова",
    experience: "3 года в ритейле",
    vacancy: "Менеджер по продажам",
    city: "Санкт-Петербург",
    salaryMin: 140000,
    salaryMax: 170000,
    score: 76,
    stage: "Квалификация",
    stageColorFrom: "#f59e0b",
    stageColorTo: "#d97706",
    source: "Avito",
    lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000),
    avatarColor: "#f59e0b",
  },
  {
    id: "3",
    name: "Алексей Козлов",
    experience: "7 лет, Team Lead",
    vacancy: "Менеджер по продажам",
    city: "Москва",
    salaryMin: 160000,
    salaryMax: 190000,
    score: 92,
    stage: "Интервью",
    stageColorFrom: "#8b5cf6",
    stageColorTo: "#7c3aed",
    source: "Telegram",
    lastSeen: new Date(Date.now() - 15 * 60 * 1000),
    avatarColor: "#8b5cf6",
  },
  {
    id: "4",
    name: "Елена Волкова",
    experience: "4 года в IT-продажах",
    vacancy: "Менеджер по продажам",
    city: "Москва",
    salaryMin: 155000,
    salaryMax: 185000,
    score: 81,
    stage: "Тестирование",
    stageColorFrom: "#3b82f6",
    stageColorTo: "#2563eb",
    source: "hh.ru",
    lastSeen: "online",
    avatarColor: "#3b82f6",
  },
  {
    id: "5",
    name: "Сергей Морозов",
    experience: "2 года в продажах",
    vacancy: "Аккаунт-менеджер",
    city: "Казань",
    salaryMin: 145000,
    salaryMax: 175000,
    score: 65,
    stage: "Новые",
    stageColorFrom: "#22d3ee",
    stageColorTo: "#06b6d4",
    source: "LinkedIn",
    lastSeen: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    avatarColor: "#06b6d4",
  },
  {
    id: "6",
    name: "Ольга Новикова",
    experience: "6 лет в FMCG",
    vacancy: "Аккаунт-менеджер",
    city: "Москва",
    salaryMin: 150000,
    salaryMax: 180000,
    score: 85,
    stage: "Квалификация",
    stageColorFrom: "#f59e0b",
    stageColorTo: "#d97706",
    source: "hh.ru",
    lastSeen: new Date(Date.now() - 30 * 60 * 1000),
    avatarColor: "#f59e0b",
  },
  {
    id: "7",
    name: "Дмитрий Смирнов",
    experience: "3 года в телекоме",
    vacancy: "Frontend разработчик",
    city: "Санкт-Петербург",
    salaryMin: 160000,
    salaryMax: 200000,
    score: 72,
    stage: "Тестирование",
    stageColorFrom: "#3b82f6",
    stageColorTo: "#2563eb",
    source: "Avito",
    lastSeen: new Date(Date.now() - 5 * 60 * 60 * 1000),
    avatarColor: "#3b82f6",
  },
  {
    id: "8",
    name: "Виктор Лебедев",
    experience: "5 лет React/TypeScript",
    vacancy: "Frontend разработчик",
    city: "Москва",
    salaryMin: 200000,
    salaryMax: 240000,
    score: 79,
    stage: "Интервью",
    stageColorFrom: "#8b5cf6",
    stageColorTo: "#7c3aed",
    source: "hh.ru",
    lastSeen: "online",
    avatarColor: "#8b5cf6",
  },
  {
    id: "9",
    name: "Юлия Орлова",
    experience: "8 лет, Head of Sales",
    vacancy: "Менеджер по продажам",
    city: "Москва",
    salaryMin: 170000,
    salaryMax: 200000,
    score: 94,
    stage: "Предложение",
    stageColorFrom: "#22c55e",
    stageColorTo: "#16a34a",
    source: "hh.ru",
    lastSeen: new Date(Date.now() - 10 * 60 * 1000),
    avatarColor: "#22c55e",
  },
  {
    id: "10",
    name: "Андрей Кузнецов",
    experience: "4 года DevOps/AWS",
    vacancy: "DevOps инженер",
    city: "Новосибирск",
    salaryMin: 220000,
    salaryMax: 270000,
    score: 83,
    stage: "Квалификация",
    stageColorFrom: "#f59e0b",
    stageColorTo: "#d97706",
    source: "LinkedIn",
    lastSeen: new Date(Date.now() - 3 * 60 * 60 * 1000),
    avatarColor: "#f59e0b",
  },
  {
    id: "11",
    name: "Наталья Попова",
    experience: "2 года Vue/React",
    vacancy: "Frontend разработчик",
    city: "Екатеринбург",
    salaryMin: 130000,
    salaryMax: 160000,
    score: 68,
    stage: "Новые",
    stageColorFrom: "#22d3ee",
    stageColorTo: "#06b6d4",
    source: "hh.ru",
    lastSeen: "online",
    avatarColor: "#06b6d4",
  },
  {
    id: "12",
    name: "Роман Соколов",
    experience: "6 лет Kubernetes/CI-CD",
    vacancy: "DevOps инженер",
    city: "Москва",
    salaryMin: 260000,
    salaryMax: 310000,
    score: 91,
    stage: "Тестирование",
    stageColorFrom: "#3b82f6",
    stageColorTo: "#2563eb",
    source: "Telegram",
    lastSeen: new Date(Date.now() - 45 * 60 * 1000),
    avatarColor: "#3b82f6",
  },
  {
    id: "13",
    name: "Анастасия Иванова",
    experience: "3 года аккаунт-менеджмент",
    vacancy: "Аккаунт-менеджер",
    city: "Москва",
    salaryMin: 140000,
    salaryMax: 165000,
    score: 74,
    stage: "Интервью",
    stageColorFrom: "#8b5cf6",
    stageColorTo: "#7c3aed",
    source: "Avito",
    lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    avatarColor: "#8b5cf6",
  },
  {
    id: "14",
    name: "Павел Николаев",
    experience: "7 лет SRE/Linux",
    vacancy: "DevOps инженер",
    city: "Санкт-Петербург",
    salaryMin: 240000,
    salaryMax: 290000,
    score: 87,
    stage: "Квалификация",
    stageColorFrom: "#f59e0b",
    stageColorTo: "#d97706",
    source: "LinkedIn",
    lastSeen: "online",
    avatarColor: "#f59e0b",
  },
  {
    id: "15",
    name: "Екатерина Белова",
    experience: "5 лет Next.js/Node.js",
    vacancy: "Frontend разработчик",
    city: "Москва",
    salaryMin: 190000,
    salaryMax: 230000,
    score: 96,
    stage: "Предложение",
    stageColorFrom: "#22c55e",
    stageColorTo: "#16a34a",
    source: "hh.ru",
    lastSeen: new Date(Date.now() - 5 * 60 * 1000),
    avatarColor: "#22c55e",
  },
]

function formatLastSeen(lastSeen: "online" | Date): { label: string; isOnline: boolean } {
  if (lastSeen === "online") return { label: "онлайн", isOnline: true }
  const diffMs = Date.now() - lastSeen.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  if (diffMin < 60) return { label: `${diffMin} мин. назад`, isOnline: false }
  if (diffHr < 24) return { label: `${diffHr} ч. назад`, isOnline: false }
  return { label: `${diffDay} дн. назад`, isOnline: false }
}

function getScoreColor(score: number) {
  if (score >= 80) return "bg-success/10 text-success border-success/20"
  if (score >= 70) return "bg-warning/10 text-warning border-warning/20"
  return "bg-destructive/10 text-destructive border-destructive/20"
}

function getSourceColor(source: string) {
  const colors: Record<string, string> = {
    "hh.ru": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    "Avito": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
    "Telegram": "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    "LinkedIn": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  }
  return colors[source] || "bg-muted text-muted-foreground border-border"
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="size-3 opacity-40" />
  return dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
}

export default function CandidatesPage() {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filtered = useMemo(() => {
    let list = candidates
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) => c.name.toLowerCase().includes(q))
    }
    if (!sortKey) return list
    return [...list].sort((a, b) => {
      let aVal: string | number = ""
      let bVal: string | number = ""
      if (sortKey === "name") { aVal = a.name; bVal = b.name }
      else if (sortKey === "vacancy") { aVal = a.vacancy; bVal = b.vacancy }
      else if (sortKey === "city") { aVal = a.city; bVal = b.city }
      else if (sortKey === "salary") { aVal = a.salaryMin; bVal = b.salaryMin }
      else if (sortKey === "score") { aVal = a.score; bVal = b.score }
      else if (sortKey === "stage") { aVal = a.stage; bVal = b.stage }
      else if (sortKey === "source") { aVal = a.source; bVal = b.source }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal), "ru")
        : String(bVal).localeCompare(String(aVal), "ru")
    })
  }, [search, sortKey, sortDir])

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-6">
            {/* Page Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Все кандидаты</h1>
                <p className="text-muted-foreground text-sm">
                  {filtered.length} из {candidates.length} кандидатов
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9 h-9 w-64 text-sm"
                    placeholder="Поиск по имени..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Filter className="w-4 h-4" />
                  Фильтры
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              {/* Table Header */}
              <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr_1.2fr_1fr_auto] gap-3 px-4 py-2.5 bg-muted/60 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <button
                  onClick={() => handleSort("name")}
                  className={cn(
                    "flex items-center gap-1 hover:text-foreground transition-colors text-left",
                    sortKey === "name" && "text-foreground"
                  )}
                >
                  Кандидат <SortIcon active={sortKey === "name"} dir={sortDir} />
                </button>
                <button
                  onClick={() => handleSort("vacancy")}
                  className={cn(
                    "flex items-center gap-1 hover:text-foreground transition-colors text-left",
                    sortKey === "vacancy" && "text-foreground"
                  )}
                >
                  Вакансия <SortIcon active={sortKey === "vacancy"} dir={sortDir} />
                </button>
                <button
                  onClick={() => handleSort("city")}
                  className={cn(
                    "flex items-center gap-1 hover:text-foreground transition-colors text-left",
                    sortKey === "city" && "text-foreground"
                  )}
                >
                  Город <SortIcon active={sortKey === "city"} dir={sortDir} />
                </button>
                <button
                  onClick={() => handleSort("salary")}
                  className={cn(
                    "flex items-center gap-1 hover:text-foreground transition-colors text-left",
                    sortKey === "salary" && "text-foreground"
                  )}
                >
                  Зарплата <SortIcon active={sortKey === "salary"} dir={sortDir} />
                </button>
                <button
                  onClick={() => handleSort("score")}
                  className={cn(
                    "flex items-center gap-1 hover:text-foreground transition-colors text-left",
                    sortKey === "score" && "text-foreground"
                  )}
                >
                  AI скор <SortIcon active={sortKey === "score"} dir={sortDir} />
                </button>
                <button
                  onClick={() => handleSort("stage")}
                  className={cn(
                    "flex items-center gap-1 hover:text-foreground transition-colors text-left",
                    sortKey === "stage" && "text-foreground"
                  )}
                >
                  Статус <SortIcon active={sortKey === "stage"} dir={sortDir} />
                </button>
                <button
                  onClick={() => handleSort("source")}
                  className={cn(
                    "flex items-center gap-1 hover:text-foreground transition-colors text-left",
                    sortKey === "source" && "text-foreground"
                  )}
                >
                  Источник <SortIcon active={sortKey === "source"} dir={sortDir} />
                </button>
                <div>Действия</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Кандидаты не найдены
                  </div>
                ) : (
                  filtered.map((candidate, i) => {
                    const { label: lastSeenLabel, isOnline } = formatLastSeen(candidate.lastSeen)
                    return (
                      <div
                        key={candidate.id}
                        className={cn(
                          "grid grid-cols-[2fr_1.5fr_1fr_1fr_0.7fr_1.2fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-muted/40 transition-colors",
                          i % 2 !== 0 && "bg-muted/20"
                        )}
                      >
                        {/* Кандидат */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                            style={{ backgroundColor: candidate.avatarColor }}
                          >
                            {candidate.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{candidate.experience}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Circle
                                className={cn(
                                  "w-2 h-2 flex-shrink-0",
                                  isOnline ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground/40 text-muted-foreground/40"
                                )}
                              />
                              <span className="text-[10px] text-muted-foreground">{lastSeenLabel}</span>
                            </div>
                          </div>
                        </div>

                        {/* Вакансия */}
                        <div className="text-xs text-foreground truncate">
                          {candidate.vacancy}
                        </div>

                        {/* Город */}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{candidate.city}</span>
                        </div>

                        {/* Зарплата */}
                        <div className="text-xs font-medium text-foreground">
                          {Math.round(candidate.salaryMin / 1000)}–{Math.round(candidate.salaryMax / 1000)}k ₽
                        </div>

                        {/* AI скор */}
                        <div>
                          <Badge
                            variant="outline"
                            className={cn("text-xs border font-semibold", getScoreColor(candidate.score))}
                          >
                            {candidate.score}
                          </Badge>
                        </div>

                        {/* Статус */}
                        <div>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                            style={{
                              background: `linear-gradient(135deg, ${candidate.stageColorFrom}, ${candidate.stageColorTo})`,
                            }}
                          >
                            {candidate.stage}
                          </span>
                        </div>

                        {/* Источник */}
                        <div>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] border", getSourceColor(candidate.source))}
                          >
                            {candidate.source}
                          </Badge>
                        </div>

                        {/* Действия */}
                        <div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            title="Открыть профиль"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
