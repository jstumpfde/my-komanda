"use client"

import { useState, useMemo } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Search, MapPin, ChevronUp, ChevronDown, ChevronsUpDown, Circle, Filter, ExternalLink, Briefcase, Clock, Users } from "lucide-react"
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
  stageColor: string
  source: string
  lastSeen: "online" | Date
  avatarColor: string
  crmId?: string
}

const ALL_STAGES = ["Новые", "Ожидает ответа", "Демонстрация", "Решение HR", "Интервью", "Финальное решение", "Нанят"]
const ALL_SOURCES = ["hh.ru", "Avito", "Telegram", "LinkedIn"]

const candidates: Candidate[] = [
  { id: "1", name: "Иван Петров", experience: "5 лет в B2B", vacancy: "Менеджер по продажам", city: "Москва", salaryMin: 150000, salaryMax: 180000, score: 88, stage: "Решение HR", stageColor: "#ef4444", source: "hh.ru", lastSeen: "online", avatarColor: "#ef4444", crmId: "1234" },
  { id: "2", name: "Мария Сидорова", experience: "3 года в ритейле", vacancy: "Менеджер по продажам", city: "СПб", salaryMin: 140000, salaryMax: 170000, score: 76, stage: "Демонстрация", stageColor: "#3b82f6", source: "Avito", lastSeen: new Date(Date.now() - 7200000), avatarColor: "#3b82f6" },
  { id: "3", name: "Алексей Козлов", experience: "7 лет, Team Lead", vacancy: "Менеджер по продажам", city: "Москва", salaryMin: 160000, salaryMax: 190000, score: 92, stage: "Интервью", stageColor: "#8b5cf6", source: "Telegram", lastSeen: new Date(Date.now() - 900000), avatarColor: "#8b5cf6" },
  { id: "4", name: "Елена Волкова", experience: "4 года IT Sales", vacancy: "Менеджер по продажам", city: "Москва", salaryMin: 155000, salaryMax: 185000, score: 81, stage: "Ожидает ответа", stageColor: "#f59e0b", source: "hh.ru", lastSeen: "online", avatarColor: "#f59e0b" },
  { id: "5", name: "Сергей Морозов", experience: "2 года продаж", vacancy: "Аккаунт-менеджер", city: "Казань", salaryMin: 145000, salaryMax: 175000, score: 65, stage: "Новые", stageColor: "#22d3ee", source: "LinkedIn", lastSeen: new Date(Date.now() - 86400000), avatarColor: "#22d3ee" },
  { id: "6", name: "Ольга Новикова", experience: "6 лет FMCG", vacancy: "Аккаунт-менеджер", city: "Москва", salaryMin: 150000, salaryMax: 180000, score: 85, stage: "Решение HR", stageColor: "#ef4444", source: "hh.ru", lastSeen: new Date(Date.now() - 1800000), avatarColor: "#ef4444", crmId: "1289" },
  { id: "7", name: "Дмитрий Смирнов", experience: "3 года телеком", vacancy: "Руководитель отдела продаж", city: "СПб", salaryMin: 200000, salaryMax: 260000, score: 72, stage: "Демонстрация", stageColor: "#3b82f6", source: "Avito", lastSeen: new Date(Date.now() - 18000000), avatarColor: "#3b82f6" },
  { id: "8", name: "Виктор Лебедев", experience: "5 лет Key Account", vacancy: "Руководитель отдела продаж", city: "Москва", salaryMin: 220000, salaryMax: 280000, score: 79, stage: "Интервью", stageColor: "#8b5cf6", source: "hh.ru", lastSeen: "online", avatarColor: "#8b5cf6" },
  { id: "9", name: "Юлия Орлова", experience: "8 лет Head of Sales", vacancy: "Менеджер по продажам", city: "Москва", salaryMin: 170000, salaryMax: 200000, score: 94, stage: "Финальное решение", stageColor: "#f97316", source: "hh.ru", lastSeen: new Date(Date.now() - 600000), avatarColor: "#f97316", crmId: "1301" },
  { id: "10", name: "Анна Белова", experience: "2 года продаж", vacancy: "Менеджер по продажам", city: "Казань", salaryMin: 120000, salaryMax: 150000, score: 71, stage: "Новые", stageColor: "#22d3ee", source: "hh.ru", lastSeen: new Date(Date.now() - 7200000), avatarColor: "#22d3ee" },
  { id: "11", name: "Павел Соколов", experience: "4 года B2B", vacancy: "Менеджер по продажам", city: "Москва", salaryMin: 155000, salaryMax: 180000, score: 87, stage: "Нанят", stageColor: "#22c55e", source: "hh.ru", lastSeen: new Date(Date.now() - 86400000), avatarColor: "#22c55e" },
  { id: "12", name: "Роман Соколов", experience: "6 лет управление", vacancy: "Руководитель отдела продаж", city: "Москва", salaryMin: 250000, salaryMax: 310000, score: 91, stage: "Решение HR", stageColor: "#ef4444", source: "Telegram", lastSeen: new Date(Date.now() - 2700000), avatarColor: "#ef4444" },
  { id: "13", name: "Анастасия Иванова", experience: "3 года аккаунт", vacancy: "Аккаунт-менеджер", city: "Москва", salaryMin: 140000, salaryMax: 165000, score: 74, stage: "Интервью", stageColor: "#8b5cf6", source: "Avito", lastSeen: new Date(Date.now() - 172800000), avatarColor: "#8b5cf6" },
  { id: "14", name: "Наталья Попова", experience: "2 года продаж", vacancy: "Аккаунт-менеджер", city: "Екатеринбург", salaryMin: 130000, salaryMax: 160000, score: 68, stage: "Новые", stageColor: "#22d3ee", source: "hh.ru", lastSeen: "online", avatarColor: "#22d3ee" },
  { id: "15", name: "Павел Николаев", experience: "7 лет B2B", vacancy: "Руководитель отдела продаж", city: "СПб", salaryMin: 240000, salaryMax: 290000, score: 87, stage: "Демонстрация", stageColor: "#3b82f6", source: "LinkedIn", lastSeen: "online", avatarColor: "#3b82f6" },
]

const VACANCIES = [...new Set(candidates.map(c => c.vacancy))]
const VACANCY_COLORS: Record<string, string> = {
  "Менеджер по продажам": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200",
  "Аккаунт-менеджер": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200",
  "Руководитель отдела продаж": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200",
}

export default function CandidatesPage() {
  const [searchText, setSearchText] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selectedVacancies, setSelectedVacancies] = useState<string[]>([])
  const [filterStage, setFilterStage] = useState("all")
  const [filterSource, setFilterSource] = useState("all")
  const [filterHr, setFilterHr] = useState("all")
  const [filterPeriod, setFilterPeriod] = useState("all")

  const toggleVacancy = (v: string) => {
    setSelectedVacancies(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  }

  const filtered = useMemo(() => {
    return candidates.filter(c => {
      if (searchText && !c.name.toLowerCase().includes(searchText.toLowerCase())) return false
      if (selectedVacancies.length > 0 && !selectedVacancies.includes(c.vacancy)) return false
      if (filterStage !== "all" && c.stage !== filterStage) return false
      if (filterSource !== "all" && c.source !== filterSource) return false
      return true
    }).sort((a, b) => {
      let cmp = 0
      if (sortKey === "name") cmp = a.name.localeCompare(b.name)
      else if (sortKey === "vacancy") cmp = a.vacancy.localeCompare(b.vacancy)
      else if (sortKey === "city") cmp = a.city.localeCompare(b.city)
      else if (sortKey === "salary") cmp = a.salaryMin - b.salaryMin
      else if (sortKey === "score") cmp = a.score - b.score
      else if (sortKey === "stage") cmp = ALL_STAGES.indexOf(a.stage) - ALL_STAGES.indexOf(b.stage)
      else if (sortKey === "source") cmp = a.source.localeCompare(b.source)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [searchText, selectedVacancies, filterStage, filterSource, sortKey, sortDir])

  const vacancyCounts = VACANCIES.map(v => ({ name: v, count: candidates.filter(c => c.vacancy === v).length }))
  const selectedVacancyCount = selectedVacancies.length > 0 ? new Set(filtered.map(c => c.vacancy)).size : VACANCIES.length

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(prev => prev === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40" />
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6">
            <div className="mb-4">
              <h1 className="text-2xl font-semibold text-foreground mb-1">Все кандидаты</h1>
              <p className="text-muted-foreground text-sm">
                Показано {filtered.length} кандидат{filtered.length === 1 ? "" : filtered.length < 5 ? "а" : "ов"} по {selectedVacancyCount} {selectedVacancyCount === 1 ? "вакансии" : "вакансиям"}
              </p>
            </div>

            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-9" placeholder="Поиск по имени..." value={searchText} onChange={e => setSearchText(e.target.value)} />
              </div>

              {/* Vacancy multi-select */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" />
                    {selectedVacancies.length === 0 ? "Все вакансии" : `${selectedVacancies.length} вакансий`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                  <div className="space-y-2">
                    {vacancyCounts.map(v => (
                      <label key={v.name} className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={selectedVacancies.includes(v.name)} onCheckedChange={() => toggleVacancy(v.name)} />
                        <span className="text-sm text-foreground flex-1">{v.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{v.count}</Badge>
                      </label>
                    ))}
                    {selectedVacancies.length > 0 && (
                      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setSelectedVacancies([])}>Сбросить</Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Все этапы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все этапы</SelectItem>
                  {ALL_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Все источники" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все источники</SelectItem>
                  {ALL_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Период" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всё время</SelectItem>
                  <SelectItem value="7d">7 дней</SelectItem>
                  <SelectItem value="30d">30 дней</SelectItem>
                  <SelectItem value="90d">90 дней</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick vacancy tabs */}
            <div className="flex flex-wrap gap-1.5 mb-5">
              <button
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", selectedVacancies.length === 0 ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}
                onClick={() => setSelectedVacancies([])}
              >
                Все · {candidates.length}
              </button>
              {vacancyCounts.map(v => {
                const active = selectedVacancies.length === 1 && selectedVacancies[0] === v.name
                return (
                  <button
                    key={v.name}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}
                    onClick={() => setSelectedVacancies(active ? [] : [v.name])}
                  >
                    {v.name.split(" ").slice(0, 2).join(" ")} · {v.count}
                  </button>
                )
              })}
            </div>

            {/* Table */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {([
                        { key: "name" as const, label: "Кандидат", w: "" },
                        { key: "vacancy" as const, label: "Вакансия", w: "" },
                        { key: "city" as const, label: "Город", w: "" },
                        { key: "salary" as const, label: "Зарплата", w: "" },
                        { key: "score" as const, label: "Скор", w: "w-16" },
                        { key: "stage" as const, label: "Этап", w: "" },
                        { key: "source" as const, label: "Источник", w: "" },
                      ]).map(col => (
                        <th key={col.key} className={cn("text-left text-xs font-semibold text-muted-foreground px-4 py-3 cursor-pointer select-none hover:text-foreground", col.w)} onClick={() => handleSort(col.key)}>
                          <span className="flex items-center gap-1">{col.label} <SortIcon col={col.key} /></span>
                        </th>
                      ))}
                      <th className="w-10 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: c.avatarColor }}>
                              {c.name.split(" ").map(w => w[0]).join("")}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground">{c.experience}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-[10px]", VACANCY_COLORS[c.vacancy] || "")}>
                            {c.vacancy}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{c.city}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{Math.round(c.salaryMin / 1000)}-{Math.round(c.salaryMax / 1000)}k</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-xs font-bold", c.score >= 80 ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : c.score >= 70 ? "bg-amber-500/10 text-amber-700 border-amber-200" : "bg-red-500/10 text-red-700 border-red-200")}>
                            {c.score}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full text-white" style={{ backgroundColor: c.stageColor }}>
                            {c.stage}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.source}</td>
                        <td className="px-2 py-3">
                          {c.crmId && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={`Открыть в CRM (ID: ${c.crmId})`} onClick={() => window.open("#", "_blank")}>
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Нет кандидатов по выбранным фильтрам</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
