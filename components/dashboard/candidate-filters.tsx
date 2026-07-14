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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Search, Settings, X, ChevronsUpDown, Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Candidate } from "./candidate-card"
import {
  PLATFORM_STAGES,
  ALL_STAGE_SLUGS,
  LEGACY_STAGE_LABELS,
  getEnabledStages,
  getStageLabel,
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
  /** Минимальный AI-скор по анкете (поле candidates.demoAnswersScore —
   *  колонка «Анкета»). 0 = «не задан», фильтр не применяется. */
  scoreMinAnketa: number
  /** Минимальный балл по тесту (тот же источник, что колонка «Тест»:
   *  AI-балл последней сдачи либо объективный). 0 = «не задан». */
  scoreMinTest: number
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
  /** Фильтр по анкете: "filled" = заполнили форму; "not_filled" = открыли демо, но не заполнили. */
  anketaFilled?: "filled" | "not_filled"
  /** #43: ответившие на вопросы анкеты — посчитан балл demo_answers_score.
   *  Критерий счётчика «N анкет» в шапке вакансии (клик по счётчику).
   *  НЕ путать с anketaFilled — тот про контактную форму (survey_responses). */
  demoAnswered?: boolean
  /** #43 (доделка): прошли 2-ю часть демо — есть балл 2-го блока в
   *  demo_block_scores (≥2 ключей). Критерий счётчика «N демо-2» в шапке. */
  secondDemoPassed?: boolean
  /** #43 (доделка): кликнули по кнопке-ссылке в демо — demo_progress_json.
   *  ctaClicks непустой. Критерий счётчика «N перешли по ссылке» в шапке. */
  ctaClicked?: boolean
  /** #43 (доделка): разбивка «прошлые + текущая = итог» откликов с hh —
   *  клик по «прошлые» / «текущая» части счётчика «N откликов всего».
   *  "current" — кандидат пришёл с ТЕКУЩЕЙ hh-публикации вакансии,
   *  "previous" — с любой ПРОШЛОЙ публикации (перепубликация на hh). */
  hhPublication?: "current" | "previous"
  /** Пресет «На разбор» (воронка-v2, Фаза 1г): прошли 1-ю часть, но застряли —
   *  есть балл ответов демо, не приглашены на 2-ю часть, не в отказе. Только
   *  видимость для ручной проверки перед авто-отказом. */
  reviewQueue: boolean
  demoProgress: string[]
  /** Задача 4 (14.07): «Демо: ДN / не проходил» — номер наивысшего пройденного
   *  демо-блока вакансии. Значения — "1"/"2"/"3"/... или "none". Заменяет
   *  снятую нотацию «частей: N/M». См. lib/demo/block-completion.ts. */
  demoBlock: string[]
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
  /** #18: серверные фасеты по ВСЕЙ вакансии (города/источники со счётчиками).
   *  Если заданы — дропдауны строятся из них, а не из загруженной страницы. */
  facets?: { cities: { city: string; count: number }[]; sources: { source: string; count: number }[] } | null
  /**
   * #18: pipeline текущей вакансии. Лейблы стадий берутся с учётом
   * custom-переименований (getStageLabel). Fallback-источник списка стадий,
   * если stageOptions не задан.
   */
  vacancyPipeline?: VacancyPipelineV2 | null
  /**
   * #42: единый список стадий вакансии (источник = воронка v2 / pipeline),
   * тот же, что рендерит дропдаун «Стадия» в карточке кандидата. Если задан —
   * секция «Статус в воронке» строится из него (карта и фильтр читают ОДНО).
   * Если нет — fallback на getEnabledStages(pipeline) / ALL_STAGE_SLUGS
   * (мульти-вакансийные экраны, где единой воронки нет).
   * Считается родителем через resolveVacancyStageOptions() (lib/stages.ts).
   */
  stageOptions?: { slug: string; label: string }[] | null
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
  scoreMin: 0, scoreMinResume: 0, scoreMinAnketa: 0, scoreMinTest: 0,
  sources: [], workFormats: [],
  relocation: "any", businessTrips: "any", experienceMin: 0, experienceMax: 20,
  funnelStatuses: DEFAULT_FUNNEL_STATUSES.slice(),
  // По умолчанию отказы СКРЫТЫ — HR работает с активной воронкой, отказных
  // не видим, пока явно не нажмём «Показать отказы». (Решение Юрия.)
  hideRejected: true,
  hideNoSalary: false,
  activeNow: false,
  reviewQueue: false,
  demoAnswered: false,
  secondDemoPassed: false,
  ctaClicked: false,
  hhPublication: undefined,
  demoProgress: [],
  demoBlock: [],
  dateRange: "", dateFrom: "", dateTo: "", ageMin: 18, ageMax: 65, education: [], languages: [], otherLanguages: [],
  skills: [], industries: [],
}

const DEMO_PROGRESS = [
  "Не начал", "В процессе", "Завершил (≥85%)", "Завершил (<85%)",
]

// Задача 4 (14.07): бейдж «ДN» — номер наивысшего пройденного демо-блока.
// Фиксированный набор Д1–Д3 (не читаем реальное число демо-блоков вакансии —
// лишние варианты просто дают 0 совпадений, безвредно); покрывает и
// сегодняшний максимум (2 блока), и «скоро появится Демо-3» (владелец, 14.07).
const DEMO_BLOCK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "1", label: "Д1" },
  { value: "2", label: "Д2" },
  { value: "3", label: "Д3" },
  { value: "none", label: "Не проходил" },
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

const EDUCATION_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "secondary",   label: "Среднее" },
  { id: "specialized", label: "Среднее специальное" },
  { id: "higher",      label: "Высшее" },
  { id: "mba",         label: "MBA/Магистратура" },
]

const LANGUAGE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "russian", label: "Русский" },
  { id: "english", label: "Английский" },
  { id: "german",  label: "Немецкий" },
  { id: "other",   label: "Другие" },
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

export function CandidateFilters({ filters, onFiltersChange, candidates = [], vacancyPipeline, stageOptions, facets }: CandidateFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showAllCities, setShowAllCities] = useState(false)
  const [showAllSources, setShowAllSources] = useState(false)
  const [langInput, setLangInput] = useState("")
  const [industryOpen, setIndustryOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)

  // #42: секция «Статус в воронке» и дропдаун «Стадия» в карточке читают ОДИН
  // список. Приоритет источника — stageOptions (воронка v2 вакансии, считается
  // родителем через resolveVacancyStageOptions); при отсутствии — fallback на
  // getEnabledStages(pipeline) / ALL_STAGE_SLUGS (мульти-вакансийные экраны).
  // rejected исключён — им управляет тумблер «Показать отказы» ниже (он
  // охватывает и «Отказ», и «Отказался» — это одна стадия rejected,
  // различающаяся инициатором).
  const funnelStageItems = useMemo<{ slug: string; label: string }[]>(() => {
    // rejected И preliminary_reject исключены здесь: оба управляются
    // отдельными элементами ниже (тумблер «Показать отказы» и свой чекбокс
    // «обратимый»). Раньше fallback-ветка (без stageOptions — глобальная
    // /hr/candidates) не исключала preliminary_reject и он дублировался —
    // рисовался и тут, и отдельным чекбоксом (разведка 14.07, задача 2).
    const base: { slug: string; label: string }[] = stageOptions && stageOptions.length > 0
      ? stageOptions.filter((o) => o.slug !== "rejected" && o.slug !== "preliminary_reject")
      : (vacancyPipeline ? getEnabledStages(vacancyPipeline) : ALL_STAGE_SLUGS)
          .filter((slug) => slug !== "rejected" && slug !== "preliminary_reject")
          .map((slug) => ({ slug, label: getStageLabel(slug, vacancyPipeline) }))
    // Разведка 14.07 (задача 2): исходы решения по кандидату вне канона
    // PLATFORM_STAGES/lib/stages.ts, но АКТИВНО достижимые из карточки/канбана
    // ЛЮБОЙ вакансии (кнопки «В резерв» / «Подумаем над кандидатом» /
    // «Пребординг» — не гейтятся pipeline-конфигом, в отличие от обычных
    // стадий воронки). Раньше для них не было чекбокса нигде — нельзя было
    // отфильтровать НИ на одной странице, хотя сервер (candidates.stage
    // inArray) их и так принимал байт-в-байт (talent_pool живой на проде).
    // Добавляем, если слуга ещё нет в списке (напр. кастомный pipeline).
    const seen = new Set(base.map((o) => o.slug))
    const legacyLiveOutcomes: Array<{ slug: string; label: string }> = [
      { slug: "talent_pool", label: LEGACY_STAGE_LABELS.talent_pool },
      { slug: "pending", label: LEGACY_STAGE_LABELS.pending },
      { slug: "preboarding", label: LEGACY_STAGE_LABELS.preboarding },
    ]
    for (const item of legacyLiveOutcomes) {
      if (!seen.has(item.slug)) base.push(item)
    }
    return base
  }, [stageOptions, vacancyPipeline])

  // #18: если есть серверные фасеты по всей вакансии — берём их (полный список),
  // иначе fallback на подсчёт по загруженной странице.
  const cityCounts = useMemo(() => {
    if (facets?.cities?.length) {
      return facets.cities.filter(c => c.city).sort((a, b) => b.count - a.count)
    }
    const map = new Map<string, number>()
    candidates.forEach((c) => map.set(c.city, (map.get(c.city) || 0) + 1))
    return Array.from(map.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
  }, [candidates, facets])

  const sourceCounts = useMemo(() => {
    if (facets?.sources?.length) {
      return facets.sources.filter(s => s.source).sort((a, b) => b.count - a.count)
    }
    const map = new Map<string, number>()
    candidates.forEach((c) => map.set(c.source, (map.get(c.source) || 0) + 1))
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
  }, [candidates, facets])

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
    (filters.scoreMinTest ?? 0) > 0 ? 1 : 0,
    (filters.salaryMin ?? 0) > 0 || (filters.salaryMax ?? 250000) < 250000 ? 1 : 0,
    filters.hideNoSalary ? 1 : 0,
    (filters.relocation ?? "any") !== "any" ? 1 : 0,
    (filters.businessTrips ?? "any") !== "any" ? 1 : 0,
    (filters.experienceMin ?? 0) > 0 || (filters.experienceMax ?? 20) < 20 ? 1 : 0,
    (filters.funnelStatuses?.length ?? 0) > 0 ? 1 : 0,
    // Отказы скрыты по умолчанию → «активно» считаем ОТХОД от дефолта: когда
    // отказы ПОКАЗАНЫ (!hideRejected). Иначе бейдж горел бы на чистом экране.
    !filters.hideRejected ? 1 : 0,
    (filters.demoProgress?.length ?? 0) > 0 ? 1 : 0,
    (filters.demoBlock?.length ?? 0) > 0 ? 1 : 0,
    filters.anketaFilled ? 1 : 0,
    filters.demoAnswered ? 1 : 0,
    filters.secondDemoPassed ? 1 : 0,
    filters.ctaClicked ? 1 : 0,
    filters.hhPublication ? 1 : 0,
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
            {/* Кнопка постоянная (Юрий 07.07: условная «исчезала» и выглядела
                как пропавшая) — при пустых фильтрах просто неактивна. */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleReset}
              disabled={!hasActiveFilters}
            >
              Сбросить
            </Button>
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

          {/* Кто на сайте — кандидаты, кто прямо сейчас проходит демо/тест
              (активность за последние 30 минут). Наверху панели — частый фильтр. */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
            <Label htmlFor="active-now" className="text-sm cursor-pointer flex items-center gap-1.5 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Кто на сайте
            </Label>
            <Switch
              id="active-now"
              checked={filters.activeNow}
              onCheckedChange={(on) => onFiltersChange({ ...filters, activeNow: on })}
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
              Минимальный балл по Портрету: {filters.scoreMinResume > 0
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
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Минимальный балл по тесту: {(filters.scoreMinTest ?? 0) > 0
                ? filters.scoreMinTest
                : <span className="italic">не задан</span>}
            </label>
            <Slider
              value={[filters.scoreMinTest ?? 0]}
              onValueChange={([v]) => onFiltersChange({ ...filters, scoreMinTest: v })}
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
                {((filters.funnelStatuses?.length ?? 0) > 0 || !filters.hideRejected || (filters.demoProgress?.length ?? 0) > 0 || (filters.demoBlock?.length ?? 0) > 0 || !!filters.anketaFilled) && (
                  <span className="text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5">активны</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              {/* #42: Статус в воронке — единый список стадий вакансии
                  (funnelStageItems), тот же, что в дропдауне «Стадия» карточки.
                  rejected исключён — им управляет тумблер ниже. */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Статус в воронке</label>
                <div className="space-y-1">
                  {funnelStageItems.map(({ slug, label }) => {
                    const stage = PLATFORM_STAGES[slug as StageSlug]
                    return (
                      <div key={slug} className="flex items-center gap-2">
                        <Checkbox
                          id={`funnel-${slug}`}
                          checked={filters.funnelStatuses.includes(slug)}
                          onCheckedChange={() => onFiltersChange({ ...filters, funnelStatuses: toggleArray(filters.funnelStatuses, slug) })}
                        />
                        <label htmlFor={`funnel-${slug}`} className="text-sm cursor-pointer flex items-center gap-2">
                          <span>{label}</span>
                          {stage?.isTerminal && <span className="text-[10px] text-muted-foreground">терминальная</span>}
                        </label>
                      </div>
                    )
                  })}
                </div>
                {/* Скрыть/Показать отказы — групповой тумблер hideRejected
                    (сервер: stage != 'rejected'). Охватывает оба негативных
                    исхода — «Отказ» (company) и «Отказался» (candidate): это
                    одна стадия rejected, различающаяся инициатором. */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                  <Label htmlFor="show-rejections" className="text-sm cursor-pointer">
                    {filters.hideRejected ? "Показать отказы (Отказ / Отказался)" : "Скрыть отказы"}
                  </Label>
                  <Switch
                    id="show-rejections"
                    checked={!filters.hideRejected}
                    onCheckedChange={(show) => onFiltersChange({ ...filters, hideRejected: !show })}
                  />
                </div>
                {/* Воронка-v2 (Фаза 1г): «Предварительный отказ» — отдельный
                    негативный, но ОБРАТИМЫЙ исход (не прошли порог балла, ждут
                    ручной проверки). resolveVacancyStageOptions исключает его из
                    позитивного списка стадий, поэтому добавляем отдельным
                    чекбоксом рядом с «отказами». Фильтруется как обычный
                    funnelStatus (сервер: stage IN (...)). */}
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id="funnel-preliminary_reject"
                    checked={filters.funnelStatuses.includes("preliminary_reject")}
                    onCheckedChange={() => onFiltersChange({ ...filters, funnelStatuses: toggleArray(filters.funnelStatuses, "preliminary_reject") })}
                  />
                  <label htmlFor="funnel-preliminary_reject" className="text-sm cursor-pointer flex items-center gap-2">
                    <span>{getStageLabel("preliminary_reject", vacancyPipeline)}</span>
                    <span className="text-[10px] text-muted-foreground">обратимый</span>
                  </label>
                </div>
                {/* Разведка 14.07 (задача 3): «На ручной проверке» — низкий/
                    средний AI-балл, авто-отказ переведён в предварительный
                    режим (resumeThresholds.rejectAction='pending_manual' ИЛИ
                    midRangeAction='keep_new'). НЕ то же самое, что «Предв.
                    отказ» выше — тут решение об отказе ещё не принято вовсе,
                    кандидат просто ждёт ручного разбора HR. "manual_review" —
                    синтетический слуг (как preliminary_reject), сервер
                    разворачивает в OR по auto_processing_stopped_reason /
                    pendingRejectionReason (см. candidates/route.ts). */}
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id="funnel-manual_review"
                    checked={filters.funnelStatuses.includes("manual_review")}
                    onCheckedChange={() => onFiltersChange({ ...filters, funnelStatuses: toggleArray(filters.funnelStatuses, "manual_review") })}
                  />
                  <label htmlFor="funnel-manual_review" className="text-sm cursor-pointer flex items-center gap-2">
                    <span>На ручной проверке</span>
                    <span className="text-[10px] text-muted-foreground">низкий балл</span>
                  </label>
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
              {/* Задача 4 (14.07): «Демо: ДN» — номер наивысшего пройденного
                  демо-блока (заменяет снятую нотацию «частей: N/M»). */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Демо: пройденный блок</label>
                <div className="space-y-1">
                  {DEMO_BLOCK_OPTIONS.map(({ value, label }) => (
                    <div key={value} className="flex items-center gap-2">
                      <Checkbox
                        id={`demo-block-${value}`}
                        checked={filters.demoBlock.includes(value)}
                        onCheckedChange={() => onFiltersChange({ ...filters, demoBlock: toggleArray(filters.demoBlock, value) })}
                      />
                      <label htmlFor={`demo-block-${value}`} className="text-sm cursor-pointer">{label}</label>
                    </div>
                  ))}
                </div>
              </div>
              {/* Анкета (контактная форма после демо) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Анкета (контактная форма)</label>
                <div className="space-y-1">
                  {([
                    ["not_filled", "Анкета не заполнена"],
                    ["filled",     "Анкета заполнена"],
                  ] as const).map(([val, label]) => (
                    <div key={val} className="flex items-center gap-2">
                      <Checkbox
                        id={`anketa-${val}`}
                        checked={filters.anketaFilled === val}
                        onCheckedChange={(checked) =>
                          onFiltersChange({ ...filters, anketaFilled: checked ? val : undefined })
                        }
                      />
                      <label htmlFor={`anketa-${val}`} className="text-sm cursor-pointer">{label}</label>
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

          {/* 8. Education */}
          {false && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Образование</label>
            <div className="space-y-1">
              {EDUCATION_OPTIONS.map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`edu-${e.id}`}
                    checked={filters.education.includes(e.id)}
                    onCheckedChange={() => onFiltersChange({ ...filters, education: toggleArray(filters.education, e.id) })}
                  />
                  <label htmlFor={`edu-${e.id}`} className="text-sm cursor-pointer">{e.label}</label>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* 9. Languages */}
          {false && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Языки</label>
            <div className="space-y-1">
              {LANGUAGE_OPTIONS.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`lang-${l.id}`}
                    checked={filters.languages.includes(l.id)}
                    onCheckedChange={() => {
                      const next = toggleArray(filters.languages, l.id)
                      if (l.id === "other" && filters.languages.includes("other")) {
                        onFiltersChange({ ...filters, languages: next, otherLanguages: [] })
                      } else {
                        onFiltersChange({ ...filters, languages: next })
                      }
                    }}
                  />
                  <label htmlFor={`lang-${l.id}`} className="text-sm cursor-pointer">{l.label}</label>
                </div>
              ))}
            </div>
            {filters.languages.includes("other") && (
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
          )}

          {/* 10. Skills — combobox */}
          {false && (
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
          )}

          {/* 11. Industry — combobox */}
          {false && (
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
          )}

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
