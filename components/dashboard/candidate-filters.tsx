"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Search, Settings, X, ChevronsUpDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Candidate } from "./candidate-card"

export interface FilterState {
  searchText: string
  cities: string[]
  salaryMin: number
  salaryMax: number
  scoreMin: number
  sources: string[]
  workFormats: string[]
  relocation: "any" | "yes" | "no"
  businessTrips: "any" | "yes" | "no"
  experienceMin: number
  experienceMax: number
  funnelStatuses: string[]
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

const DEFAULT_FILTERS: FilterState = {
  searchText: "", cities: [], salaryMin: 0, salaryMax: 250000, scoreMin: 0, sources: [], workFormats: [],
  relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20, funnelStatuses: [], demoProgress: [],
  dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65, education: [], languages: [], otherLanguages: [],
  skills: [], industries: [],
}

interface CandidateFiltersProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  candidates?: Candidate[]
}

const WORK_FORMATS = [
  { id: "office", label: "Офис" },
  { id: "hybrid", label: "Гибрид" },
  { id: "remote", label: "Удалёнка" },
]

const FUNNEL_STATUSES = [
  "Всего откликов", "Демо пройдено", "Интервью назначено",
  "Интервью пройдено", "Оффер", "Нанят", "Отказ",
]

const DEMO_PROGRESS = [
  "Не начал", "В процессе", "Завершил (≥85%)", "Завершил (<85%)",
]

const DATE_PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "3days", label: "3 дня" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
]

const EDUCATION_OPTIONS = [
  "Среднее", "Среднее специальное", "Высшее", "MBA/Магистратура",
]

const LANGUAGE_OPTIONS = [
  "Русский", "Английский", "Немецкий", "Другие",
]

const OTHER_LANGUAGES = [
  "Китайский", "Французский", "Испанский", "Турецкий",
  "Арабский", "Японский", "Корейский", "Португальский",
]

const SKILLS_OPTIONS = [
  "CRM", "Холодные звонки", "B2B", "B2C", "Переговоры", "Excel", "1C", "Битрикс24", "AmoCRM",
  "PowerPoint", "Управление командой", "Аналитика", "Python", "SQL", "JavaScript", "React",
  "TypeScript", "Node.js", "Телефонные продажи", "Работа с возражениями", "Презентации",
  "Тендеры", "Закупки", "Бюджетирование", "SAP", "Google Sheets", "Планирование",
  "Делопроизводство", "Кадровое делопроизводство", "ТК РФ", "Подбор персонала",
  "Управление проектами", "Scrum", "Agile", "JIRA", "Confluence", "Figma", "Adobe Photoshop",
  "Копирайтинг", "SEO", "Контекстная реклама", "Таргетированная реклама", "SMM",
  "Логистика", "ВЭД", "Бухучёт", "Аудит", "Финансовый анализ", "Маркетинговая аналитика",
]

const INDUSTRY_OPTIONS = [
  "Информационные технологии", "Финансовый сектор", "Розничная торговля", "Оптовая торговля",
  "Производство", "Строительство/Недвижимость", "Транспорт/Логистика", "Телекоммуникации",
  "Медицина/Фармацевтика", "Образование/Наука", "Госслужба/НКО", "Юриспруденция",
  "Маркетинг/Реклама/PR", "HoReCa (отели, рестораны)", "Добыча сырья/Энергетика",
  "Автомобильный бизнес", "Сельское хозяйство", "Металлургия/Металлообработка",
  "Лёгкая промышленность", "Искусство/Развлечения", "Безопасность", "Спорт/Фитнес",
  "Бухгалтерия/Аудит", "Страхование", "Консалтинг", "Управление персоналом", "Другое",
]

export function CandidateFilters({ filters, onFiltersChange, candidates = [] }: CandidateFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showAllCities, setShowAllCities] = useState(false)
  const [showAllSources, setShowAllSources] = useState(false)
  const [langInput, setLangInput] = useState("")
  const [industryOpen, setIndustryOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)

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
    (filters.scoreMin ?? 0) > 0 ? 1 : 0,
    (filters.salaryMin ?? 0) > 0 || (filters.salaryMax ?? 250000) < 250000 ? 1 : 0,
    (filters.relocation ?? "any") !== "any" ? 1 : 0,
    (filters.businessTrips ?? "any") !== "any" ? 1 : 0,
    (filters.experienceMin ?? 0) > 0 || (filters.experienceMax ?? 20) < 20 ? 1 : 0,
    (filters.funnelStatuses?.length ?? 0) > 0 ? 1 : 0,
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
          className="h-9 gap-1.5"
        >
          <Search className="size-3.5" />
          Поиск
          {hasActiveFilters && (
            <Badge className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-primary-foreground text-primary">
              {activeCount}
            </Badge>
          )}
          <Settings className="size-3.5 ml-0.5 text-current opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="max-h-[75vh] overflow-y-auto p-4 space-y-4">
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

          {/* Salary Range */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Зарплата: {filters.salaryMin.toLocaleString("ru-RU")} – {filters.salaryMax.toLocaleString("ru-RU")} ₽
            </label>
            <div className="space-y-2">
              <Slider value={[filters.salaryMin]} onValueChange={([v]) => onFiltersChange({ ...filters, salaryMin: v })} min={0} max={250000} step={10000} />
              <Slider value={[filters.salaryMax]} onValueChange={([v]) => onFiltersChange({ ...filters, salaryMax: v })} min={0} max={250000} step={10000} />
            </div>
          </div>

          {/* Score */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Минимальный AI-скор: {filters.scoreMin}</label>
            <Slider value={[filters.scoreMin]} onValueChange={([v]) => onFiltersChange({ ...filters, scoreMin: v })} min={0} max={100} step={5} />
          </div>

          <Separator />

          {/* 1. Work Format — 3 checkboxes */}
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

          {/* 2. Relocation */}
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

          {/* 2b. Business Trips */}
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

          {/* 3. Experience */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Опыт работы: {filters.experienceMin} – {filters.experienceMax} лет
            </label>
            <Slider
              value={[filters.experienceMin, filters.experienceMax]}
              onValueChange={([min, max]) => onFiltersChange({ ...filters, experienceMin: min, experienceMax: max })}
              min={0} max={20} step={1}
            />
          </div>

          <Separator />

          {/* 4. Funnel Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Статус в воронке</label>
            <div className="space-y-1">
              {FUNNEL_STATUSES.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <Checkbox
                    id={`funnel-${s}`}
                    checked={filters.funnelStatuses.includes(s)}
                    onCheckedChange={() => onFiltersChange({ ...filters, funnelStatuses: toggleArray(filters.funnelStatuses, s) })}
                  />
                  <label htmlFor={`funnel-${s}`} className="text-sm cursor-pointer">{s}</label>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Demo Progress */}
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
                  onClick={() => onFiltersChange({ ...filters, dateRange: filters.dateRange === p.id ? "" : p.id, dateFrom: "", dateTo: "" })}
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

          {/* 7. Age */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Возраст: {filters.ageMin} – {filters.ageMax} лет
            </label>
            <Slider
              value={[filters.ageMin, filters.ageMax]}
              onValueChange={([min, max]) => onFiltersChange({ ...filters, ageMin: min, ageMax: max })}
              min={18} max={65} step={1}
            />
          </div>

          <Separator />

          {/* 8. Education */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Образование</label>
            <div className="space-y-1">
              {EDUCATION_OPTIONS.map((e) => (
                <div key={e} className="flex items-center gap-2">
                  <Checkbox
                    id={`edu-${e}`}
                    checked={filters.education.includes(e)}
                    onCheckedChange={() => onFiltersChange({ ...filters, education: toggleArray(filters.education, e) })}
                  />
                  <label htmlFor={`edu-${e}`} className="text-sm cursor-pointer">{e}</label>
                </div>
              ))}
            </div>
          </div>

          {/* 9. Languages */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Языки</label>
            <div className="space-y-1">
              {LANGUAGE_OPTIONS.map((l) => (
                <div key={l} className="flex items-center gap-2">
                  <Checkbox
                    id={`lang-${l}`}
                    checked={filters.languages.includes(l)}
                    onCheckedChange={() => {
                      const next = toggleArray(filters.languages, l)
                      if (l === "Другие" && filters.languages.includes("Другие")) {
                        onFiltersChange({ ...filters, languages: next, otherLanguages: [] })
                      } else {
                        onFiltersChange({ ...filters, languages: next })
                      }
                    }}
                  />
                  <label htmlFor={`lang-${l}`} className="text-sm cursor-pointer">{l}</label>
                </div>
              ))}
            </div>
            {filters.languages.includes("Другие") && (
              <div className="pl-5 pt-1 space-y-1.5">
                {(filters.otherLanguages?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {filters.otherLanguages!.map((l) => (
                      <Badge key={l} variant="secondary" className="text-xs gap-1 pr-1">
                        {l}
                        <button onClick={() => onFiltersChange({ ...filters, otherLanguages: filters.otherLanguages!.filter((x) => x !== l) })} className="hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {OTHER_LANGUAGES.filter((l) => !(filters.otherLanguages || []).includes(l)).map((l) => (
                    <button
                      key={l}
                      onClick={() => onFiltersChange({ ...filters, otherLanguages: [...(filters.otherLanguages || []), l] })}
                      className="text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded px-1.5 py-0.5 hover:border-primary/50 transition-colors"
                    >
                      + {l}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Введите язык..."
                    value={langInput}
                    onChange={(e) => setLangInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        const v = langInput.trim()
                        if (v && !(filters.otherLanguages || []).includes(v)) {
                          onFiltersChange({ ...filters, otherLanguages: [...(filters.otherLanguages || []), v] })
                        }
                        setLangInput("")
                      }
                    }}
                    className="h-8 text-sm flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => {
                      const v = langInput.trim()
                      if (v && !(filters.otherLanguages || []).includes(v)) {
                        onFiltersChange({ ...filters, otherLanguages: [...(filters.otherLanguages || []), v] })
                      }
                      setLangInput("")
                    }}
                  >+</Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* 10. Skills — combobox */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ключевые навыки</label>
            <Popover open={skillsOpen} onOpenChange={setSkillsOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full h-8 justify-between text-sm font-normal text-muted-foreground">
                  {filters.skills.length > 0
                    ? `Выбрано: ${filters.skills.length}`
                    : "Выберите навык..."}
                  <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Поиск навыка..." className="h-8 text-sm" />
                  <CommandList className="max-h-48">
                    <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Не найдено</CommandEmpty>
                    <CommandGroup>
                      {SKILLS_OPTIONS.map((s) => (
                        <CommandItem
                          key={s}
                          value={s}
                          onSelect={() => onFiltersChange({ ...filters, skills: toggleArray(filters.skills, s) })}
                          className="text-sm"
                        >
                          <Check className={cn("w-3.5 h-3.5 mr-2 shrink-0", filters.skills.includes(s) ? "opacity-100" : "opacity-0")} />
                          {s}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {filters.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {filters.skills.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs gap-1 pr-1">
                    {s}
                    <button onClick={() => onFiltersChange({ ...filters, skills: filters.skills.filter((x) => x !== s) })} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* 11. Industry — combobox */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Текущая отрасль</label>
            <Popover open={industryOpen} onOpenChange={setIndustryOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full h-8 justify-between text-sm font-normal text-muted-foreground">
                  {filters.industries.length > 0
                    ? `Выбрано: ${filters.industries.length}`
                    : "Выберите отрасль..."}
                  <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Поиск отрасли..." className="h-8 text-sm" />
                  <CommandList className="max-h-48">
                    <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Не найдено</CommandEmpty>
                    <CommandGroup>
                      {INDUSTRY_OPTIONS.map((ind) => (
                        <CommandItem
                          key={ind}
                          value={ind}
                          onSelect={() => onFiltersChange({ ...filters, industries: toggleArray(filters.industries, ind) })}
                          className="text-sm"
                        >
                          <Check className={cn("w-3.5 h-3.5 mr-2 shrink-0", filters.industries.includes(ind) ? "opacity-100" : "opacity-0")} />
                          {ind}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {filters.industries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {filters.industries.map((ind) => (
                  <Badge key={ind} variant="secondary" className="text-xs gap-1 pr-1">
                    {ind}
                    <button onClick={() => onFiltersChange({ ...filters, industries: filters.industries.filter((x) => x !== ind) })} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button variant="default" className="w-full h-8 text-sm" onClick={() => setIsOpen(false)}>
            Применить
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
