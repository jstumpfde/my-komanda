"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Search, Settings, ChevronDown } from "lucide-react"
import type { Candidate } from "./candidate-card"
import {
  PLATFORM_STAGES,
  ALL_STAGE_SLUGS,
  type StageSlug,
  type VacancyPipelineV2,
} from "@/lib/stages"

export interface FilterState {
  searchText: string
  cities: string[]
  salaryMin: number
  salaryMax: number
  /** @deprecated — оставлено для обратной совместимости с местами, где
   *  используется один общий слайдер. На странице вакансии — scoreMinAnketa. */
  scoreMin: number
  /** Минимальный AI-скор по резюме (поле candidates.resumeScore).
   *  0 = «не задан», фильтр не применяется. */
  scoreMinResume: number
  /** Минимальный AI-скор по анкете (поле candidates.aiScore).
   *  0 = «не задан», фильтр не применяется. */
  scoreMinAnketa: number
  sources: string[]
  workFormats: string[]
  relocation: "any" | "yes" | "no"
  businessTrips: "any" | "yes" | "no"
  experienceMin: number
  experienceMax: number
  funnelStatuses: string[]
  /** Скрыть кандидатов в стадии rejected. Отдельно от funnelStatuses —
   *  применяется сервером как stage != 'rejected', не ломая legacy-стадии. */
  hideRejected: boolean
  /** Скрыть кандидатов без указанной зарплаты (server: salary NOT NULL). */
  hideNoSalary: boolean
  /** Показать только активных сейчас (активность демо/тест за 30 мин). */
  activeNow: boolean
  demoProgress: string[]
  dateRange: string
  dateFrom: string
  dateTo: string
  ageMin: number
  ageMax: number
  education: string[]
  languages: string[]
  otherLanguages: string[]
  skills: string[]
  industries: string[]
}

interface CandidateFiltersProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  candidates?: Candidate[]
  /**
   * Ф6: pipeline текущей вакансии. ТЗ-3 Ч.4: больше НЕ влияет на выбор
   * стадий — фильтр всегда показывает все 14 системных стадий из
   * PLATFORM_STAGES. Проп оставлен для совместимости (custom-лейблы могут
   * пригодиться позже).
   */
  vacancyPipeline?: VacancyPipelineV2 | null
}

const WORK_FORMATS = [
  { id: "office", label: "Офис" },
  { id: "hybrid", label: "Гибрид" },
  { id: "remote", label: "Удалёнка" },
]

// Семантика: пустой массив = «нет фильтра по статусу, показываем всех».
// 13 заранее проставленных чекбоксов сбивали с толку — выглядело как
// активный фильтр, хотя видимо ничего не отсекалось. Теперь по первому
// открытию HR видит чистый список без галочек и сам выбирает статусы.
export const DEFAULT_FUNNEL_STATUSES: StageSlug[] = []

const DEFAULT_FILTERS: FilterState = {
  searchText: "", cities: [], salaryMin: 0, salaryMax: 250000,
  scoreMin: 0, scoreMinResume: 0, scoreMinAnketa: 0,
  sources: [], workFormats: [],
  relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20,
  funnelStatuses: DEFAULT_FUNNEL_STATUSES.slice(),
  hideRejected: false,
  hideNoSalary: false,
  activeNow: false,
  demoProgress: [],
  dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65, education: [], languages: [], otherLanguages: [],
  skills: [], industries: [],
}

const DEMO_PROGRESS = [
  "Не начал", "В процессе", "Завершил (≥85%)", "Завершил (<85%)",
]

const DATE_PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "3days", label: "3 дня" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
]

// Сколько дней назад от сегодня для каждого пресета (включая текущий день).
const DATE_PRESET_DAYS: Record<string, number> = {
  today: 0,
  "3days": 2,
  week: 6,
  month: 29,
}

/** YYYY-MM-DD для (сегодня минус N дней) в локальной таймзоне. */
function presetDateFrom(presetId: string): string {
  const n = DATE_PRESET_DAYS[presetId]
  if (typeof n !== "number") return ""
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function CandidateFilters({ filters, onFiltersChange, candidates = [], vacancyPipeline }: CandidateFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showAllCities, setShowAllCities] = useState(false)
  const [showAllSources, setShowAllSources] = useState(false)

  // Compute dynamic lists from candidates
  const cityCounts = useMemo(() => {
    const map = new Map<string, number>()
    candidates.forEach((c) => map.set(c.city, (map.get(c.city) || 0) + 1))
    return Array.from(map.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
  }, [candidates])

  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>()
    candidates.forEach((c) => map.set(c.source, (map.get(c.source) || 0) + 1))
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
  }, [candidates])

  const visibleCities = showAllCities ? cityCounts : cityCounts.slice(0, 3)
  const hiddenCitiesCount = cityCounts.length - 3
  const visibleSources = showAllSources ? sourceCounts : sourceCounts.slice(0, 3)
  const hiddenSourcesCount = sourceCounts.length - 3

  const handleCityToggle = (city: string) => {
    const newCities = filters.cities.includes(city)
      ? filters.cities.filter((c) => c !== city)
      : [...filters.cities, city]
    onFiltersChange({ ...filters, cities: newCities })
  }

  const handleSourceToggle = (source: string) => {
    const newSources = filters.sources.includes(source)
      ? filters.sources.filter((s) => s !== source)
      : [...filters.sources, source]
    onFiltersChange({ ...filters, sources: newSources })
  }

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]

  const handleReset = () => {
    onFiltersChange({ ...DEFAULT_FILTERS })
  }

  const activeCount = [
    filters.searchText ? 1 : 0,
    (filters.cities?.length ?? 0) > 0 ? 1 : 0,
    (filters.sources?.length ?? 0) > 0 ? 1 : 0,
    (filters.workFormats?.length ?? 0) > 0 ? 1 : 0,
    (filters.scoreMinResume ?? 0) > 0 ? 1 : 0,
    (filters.scoreMinAnketa ?? 0) > 0 ? 1 : 0,
    (filters.salaryMin ?? 0) > 0 || (filters.salaryMax ?? 250000) < 250000 ? 1 : 0,
    filters.hideNoSalary ? 1 : 0,
    (filters.relocation ?? "any") !== "any" ? 1 : 0,
    (filters.businessTrips ?? "any") !== "any" ? 1 : 0,
    (filters.experienceMin ?? 0) > 0 || (filters.experienceMax ?? 20) < 20 ? 1 : 0,
    (filters.funnelStatuses?.length ?? 0) > 0 ? 1 : 0,
    filters.hideRejected ? 1 : 0,
    (filters.demoProgress?.length ?? 0) > 0 ? 1 : 0,
    filters.dateRange || filters.dateFrom || filters.dateTo ? 1 : 0,
    (filters.ageMin ?? 18) > 18 || (filters.ageMax ?? 65) < 65 ? 1 : 0,
    (filters.education?.length ?? 0) > 0 ? 1 : 0,
    (filters.languages?.length ?? 0) > 0 ? 1 : 0,
    (filters.skills?.length ?? 0) > 0 ? 1 : 0,
    (filters.industries?.length ?? 0) > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const hasActiveFilters = activeCount > 0

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
        >
          <Search className="size-3.5" />
          Фильтр
          {hasActiveFilters && (
            <Badge className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-primary-foreground text-primary">
              {activeCount}
            </Badge>
          )}
          <Settings className="size-3.5 ml-0.5 text-current opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 flex flex-col max-h-[min(85vh,var(--radix-popover-content-available-height))]"
        align="start"
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-sm">Поиск кандидатов</h3>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleReset}>
                Сбросить
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Поиск по имени</label>
            <Input
              placeholder="Имя или фамилия..."
              value={filters.searchText}
              onChange={(e) => onFiltersChange({ ...filters, searchText: e.target.value })}
              className="h-8 text-sm"
            />
          </div>

          {/* Cities (dynamic) */}
          {cityCounts.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Города</label>
              <div className="space-y-1">
                {visibleCities.map(({ city, count }) => (
                  <div key={city} className="flex items-center gap-2">
                    <Checkbox
                      id={`city-${city}`}
                      checked={filters.cities.includes(city)}
                      onCheckedChange={() => handleCityToggle(city)}
                    />
                    <label htmlFor={`city-${city}`} className="text-sm cursor-pointer flex-1">{city}</label>
                    <span className="text-xs text-muted-foreground">({count})</span>
                  </div>
                ))}
              </div>
              {hiddenCitiesCount > 0 && !showAllCities && (
                <button className="text-xs text-primary hover:underline" onClick={() => setShowAllCities(true)}>
                  + ещё {hiddenCitiesCount} {hiddenCitiesCount === 1 ? "город" : hiddenCitiesCount < 5 ? "города" : "городов"}
                </button>
              )}
              {showAllCities && hiddenCitiesCount > 0 && (
                <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShowAllCities(false)}>
                  Свернуть
                </button>
              )}
            </div>
          )}

          {/* Sources (dynamic) */}
          {sourceCounts.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Источники</label>
              <div className="space-y-1">
                {visibleSources.map(({ source, count }) => (
                  <div key={source} className="flex items-center gap-2">
                    <Checkbox
                      id={`source-${source}`}
                      checked={filters.sources.includes(source)}
                      onCheckedChange={() => handleSourceToggle(source)}
                    />
                    <label htmlFor={`source-${source}`} className="text-sm cursor-pointer flex-1">{source}</label>
                    <span className="text-xs text-muted-foreground">({count})</span>
                  </div>
                ))}
              </div>
              {hiddenSourcesCount > 0 && !showAllSources && (
                <button className="text-xs text-primary hover:underline" onClick={() => setShowAllSources(true)}>
                  + ещё {hiddenSourcesCount}
                </button>
              )}
              {showAllSources && hiddenSourcesCount > 0 && (
                <button className="text-xs text-muted-foreground hover:underline" onClick={() => setShowAllSources(false)}>
                  Свернуть
                </button>
              )}
            </div>
          )}

          {/* Salary Range — единый ползунок с двумя бегунками (как «Возраст»).
              На полном диапазоне (0–250k) показываем «не задана» — фильтр не
              активен. Верхний бегунок на максимуме означает «и выше» (250k+). */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {filters.salaryMin === 0 && filters.salaryMax >= 250000
                ? <>Зарплата: <span className="italic">не задана</span></>
                : <>Зарплата: {filters.salaryMin.toLocaleString("ru-RU")} – {filters.salaryMax.toLocaleString("ru-RU")}{filters.salaryMax >= 250000 ? "+" : ""} ₽</>}
            </label>
            <Slider
              value={[filters.salaryMin, filters.salaryMax]}
              onValueChange={([min, max]) => onFiltersChange({ ...filters, salaryMin: min, salaryMax: max })}
              min={0} max={250000} step={10000}
            />
            {/* По умолчанию кандидаты без указанной ЗП проходят любой фильтр по
                зарплате (их оффер неизвестен). Этот чекбокс их прячет. */}
            <label className="flex items-center gap-2 cursor-pointer text-sm pt-0.5">
              <Checkbox
                checked={filters.hideNoSalary}
                onCheckedChange={(v) => onFiltersChange({ ...filters, hideNoSalary: v === true })}
              />
              <span>Скрыть без указанной зарплаты</span>
            </label>
          </div>

          <Separator className="my-1" />

          {/* Score — два независимых слайдера. resumeScore — оценка резюме
              (выставляется в process-queue.ts при приёме отклика); aiScore —
              оценка после прохождения демо/анкеты. На дефолте (0) показываем
              «не задан», чтобы было видно — фильтр не активен. */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Минимальный AI-скор по резюме: {filters.scoreMinResume > 0
                ? filters.scoreMinResume
                : <span className="italic">не задан</span>}
            </label>
            <Slider
              value={[filters.scoreMinResume]}
              onValueChange={([v]) => onFiltersChange({ ...filters, scoreMinResume: v })}
              min={0} max={100} step={5}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Минимальный AI-скор по анкете: {filters.scoreMinAnketa > 0
                ? filters.scoreMinAnketa
                : <span className="italic">не задан</span>}
            </label>
            <Slider
              value={[filters.scoreMinAnketa]}
              onValueChange={([v]) => onFiltersChange({ ...filters, scoreMinAnketa: v })}
              min={0} max={100} step={5}
            />
          </div>

          <Separator className="my-1" />

          {/* Доп. фильтры — свёрнуты по умолчанию, чтобы панель не растягивалась */}
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Дополнительно
                {((filters.workFormats?.length ?? 0) > 0 || (filters.relocation ?? "any") !== "any" || (filters.businessTrips ?? "any") !== "any" || (filters.experienceMin ?? 0) > 0 || (filters.experienceMax ?? 20) < 20) && (
                  <span className="text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5">активны</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              {/* Формат работы */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Формат работы</label>
                <div className="space-y-1">
                  {WORK_FORMATS.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`fmt-${f.id}`}
                        checked={filters.workFormats.includes(f.id)}
                        onCheckedChange={() => onFiltersChange({ ...filters, workFormats: toggleArray(filters.workFormats, f.id) })}
                      />
                      <label htmlFor={`fmt-${f.id}`} className="text-sm cursor-pointer">{f.label}</label>
                    </div>
                  ))}
                </div>
              </div>
              {/* Готовность к переезду */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Готовность к переезду</label>
                <div className="space-y-1">
                  {([["any", "Не важно"], ["yes", "Да"], ["no", "Нет"]] as const).map(([val, label]) => (
                    <div key={val} className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`reloc-${val}`}
                        name="relocation"
                        checked={filters.relocation === val}
                        onChange={() => onFiltersChange({ ...filters, relocation: val })}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <label htmlFor={`reloc-${val}`} className="text-sm cursor-pointer">{label}</label>
                    </div>
                  ))}
                </div>
              </div>
              {/* Готовность к командировкам */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Готовность к командировкам</label>
                <div className="space-y-1">
                  {([["any", "Не важно"], ["yes", "Готов"], ["no", "Не готов"]] as const).map(([val, label]) => (
                    <div key={val} className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`trips-${val}`}
                        name="businessTrips"
                        checked={filters.businessTrips === val}
                        onChange={() => onFiltersChange({ ...filters, businessTrips: val })}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      <label htmlFor={`trips-${val}`} className="text-sm cursor-pointer">{label}</label>
                    </div>
                  ))}
                </div>
              </div>
              {/* Опыт работы */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {filters.experienceMin === 0 && filters.experienceMax >= 20
                    ? <>Опыт работы: <span className="italic">не задан</span></>
                    : <>Опыт работы: {filters.experienceMin} – {filters.experienceMax}{filters.experienceMax >= 20 ? "+" : ""} лет</>}
                </label>
                <Slider
                  value={[filters.experienceMin, filters.experienceMax]}
                  onValueChange={([min, max]) => onFiltersChange({ ...filters, experienceMin: min, experienceMax: max })}
                  min={0} max={20} step={1}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Статус, отказы и прогресс демо — свёрнуты (список статусов длинный) */}
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Статус и этап
                {((filters.funnelStatuses?.length ?? 0) > 0 || filters.hideRejected || (filters.demoProgress?.length ?? 0) > 0) && (
                  <span className="text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5">активны</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              {/* Статус в воронке. rejected исключён — им управляет тумблер ниже. */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Статус в воронке</label>
                <div className="space-y-1">
                  {ALL_STAGE_SLUGS.filter((slug) => slug !== "rejected").map((slug) => {
                    const stage = PLATFORM_STAGES[slug]
                    return (
                      <div key={slug} className="flex items-center gap-2">
                        <Checkbox
                          id={`funnel-${slug}`}
                          checked={filters.funnelStatuses.includes(slug)}
                          onCheckedChange={() => onFiltersChange({ ...filters, funnelStatuses: toggleArray(filters.funnelStatuses, slug) })}
                        />
                        <label htmlFor={`funnel-${slug}`} className="text-sm cursor-pointer flex items-center gap-2">
                          <span>{stage.defaultLabel}</span>
                          {stage.isTerminal && <span className="text-[10px] text-muted-foreground">терминальная</span>}
                        </label>
                      </div>
                    )
                  })}
                </div>
                {/* Скрыть/Показать отказы — отдельный hideRejected (сервер: stage != 'rejected'),
                    т.к. в данных есть legacy-стадии вне ALL_STAGE_SLUGS. */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                  <Label htmlFor="show-rejections" className="text-sm cursor-pointer">
                    {filters.hideRejected ? "Показать отказы" : "Скрыть отказы"}
                  </Label>
                  <Switch
                    id="show-rejections"
                    checked={!filters.hideRejected}
                    onCheckedChange={(show) => onFiltersChange({ ...filters, hideRejected: !show })}
                  />
                </div>
                {/* Активны сейчас — кандидаты, кто прямо сейчас проходит демо
                    или тест (активность за последние 30 минут). */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                  <Label htmlFor="active-now" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    Активны сейчас
                  </Label>
                  <Switch
                    id="active-now"
                    checked={filters.activeNow}
                    onCheckedChange={(on) => onFiltersChange({ ...filters, activeNow: on })}
                  />
                </div>
              </div>
              {/* Прогресс демо */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Прогресс демо</label>
                <div className="space-y-1">
                  {DEMO_PROGRESS.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <Checkbox
                        id={`demo-${s}`}
                        checked={filters.demoProgress.includes(s)}
                        onCheckedChange={() => onFiltersChange({ ...filters, demoProgress: toggleArray(filters.demoProgress, s) })}
                      />
                      <label htmlFor={`demo-${s}`} className="text-sm cursor-pointer">{s}</label>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* 6. Application Date */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Дата отклика</label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  variant={filters.dateRange === p.id ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    const turningOff = filters.dateRange === p.id
                    onFiltersChange({
                      ...filters,
                      dateRange: turningOff ? "" : p.id,
                      dateFrom: turningOff ? "" : presetDateFrom(p.id),
                      dateTo: "",
                    })
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value, dateRange: "" })}
                className="h-8 text-xs"
                placeholder="От"
              />
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value, dateRange: "" })}
                className="h-8 text-xs"
                placeholder="До"
              />
            </div>
          </div>

          {/* 7. Age. На дефолтном диапазоне 18–65 — это «без фильтра по возрасту»,
              а не «возраст между 18 и 65» (нет ничего отсекаемого). Подписываем
              явно, иначе пользователь думает, что мы скрываем кандидатов <18/>65. */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {filters.ageMin === 18 && filters.ageMax === 65
                ? <>Возраст: <span className="italic">не задан</span></>
                : <>Возраст: {filters.ageMin} – {filters.ageMax} лет</>}
            </label>
            <Slider
              value={[filters.ageMin, filters.ageMax]}
              onValueChange={([min, max]) => onFiltersChange({ ...filters, ageMin: min, ageMax: max })}
              min={18} max={65} step={1}
            />
          </div>

        </div>
        {/* Футер закреплён вне скролла — «Готово» всегда доступно, даже когда
            список фильтров длиннее экрана. Кнопка просто закрывает поповер:
            фильтры применяются мгновенно при каждом изменении. */}
        <div className="border-t bg-popover px-4 py-3 shrink-0">
          <p className="text-[11px] text-muted-foreground text-center mb-2">
            Фильтры применяются мгновенно
          </p>
          <Button variant="default" className="w-full h-8 text-sm" onClick={() => setIsOpen(false)}>
            Готово
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
