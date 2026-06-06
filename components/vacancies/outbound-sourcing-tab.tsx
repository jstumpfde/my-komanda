"use client"

// components/vacancies/outbound-sourcing-tab.tsx
//
// Таб «Исходящий подбор» внутри вакансии (Фаза 1). Минималистичный UI:
//   - блок критериев (автозаполнен из вакансии, редактируемый) + «Найти»
//   - полоска статуса: доступ к базе резюме + просмотров сегодня X/50
//   - компактная таблица найденных резюме с AI-score бейджами и чекбоксами
//   - сортировка по AI-score (лучшие сверху)
//   - «Пригласить выбранных» — дизейбл без доступа/при исчерпании лимита
//
// Дедуп: приглашённые помечаются и не предлагаются повторно (по статусу строки).
//
// Оптимизация токенов: авто-скоринг только топ-20 (AUTO_SCORE_LIMIT).
// Остальные — по кнопке «Оценить ещё» или «Оценить выбранных».

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Search, Send, AlertCircle, CheckCircle2, ChevronDown, Wand2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

// hh experience ids → человекочитаемо.
const EXPERIENCE_OPTIONS = [
  { value: "any", label: "Любой опыт" },
  { value: "noExperience", label: "Нет опыта" },
  { value: "between1And3", label: "1–3 года" },
  { value: "between3And6", label: "3–6 лет" },
  { value: "moreThan6", label: "Более 6 лет" },
]

// ─── Справочники hh (сверены с /dictionaries и /languages) ───────────────────
// id = значение, которое уходит в hh; label — русский лейбл из справочника hh.
const EMPLOYMENT_OPTIONS = [
  { id: "full", label: "Полная" },
  { id: "part", label: "Частичная" },
  { id: "project", label: "Проектная" },
  { id: "probation", label: "Стажировка" },
  { id: "volunteer", label: "Волонтёрство" },
]

const SCHEDULE_OPTIONS = [
  { id: "fullDay", label: "Полный день" },
  { id: "remote", label: "Удалённо" },
  { id: "flexible", label: "Гибкий" },
  { id: "shift", label: "Сменный" },
  { id: "flyInFlyOut", label: "Вахта" },
]

const EDUCATION_OPTIONS = [
  { value: "any", label: "Любое" },
  { value: "secondary", label: "Среднее" },
  { value: "special_secondary", label: "Среднее специальное" },
  { value: "unfinished_higher", label: "Неоконченное высшее" },
  { value: "higher", label: "Высшее" },
  { value: "bachelor", label: "Бакалавр" },
  { value: "master", label: "Магистр" },
  { value: "candidate", label: "Кандидат наук" },
  { value: "doctor", label: "Доктор наук" },
]

const GENDER_OPTIONS = [
  { value: "any", label: "Не важно" },
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
]

const RELOCATION_OPTIONS = [
  { value: "any", label: "Не важно" },
  { value: "living", label: "Живёт в городе" },
  { value: "living_or_relocation", label: "Живёт или готов переехать" },
  { value: "living_but_relocation", label: "Живёт и готов переехать" },
  { value: "relocation", label: "Готов переехать в город" },
]

const ORDER_BY_OPTIONS = [
  { value: "relevance", label: "По соответствию" },
  { value: "publication_time", label: "По дате обновления" },
  { value: "salary_asc", label: "ЗП по возрастанию" },
  { value: "salary_desc", label: "ЗП по убыванию" },
]

const LABEL_OPTIONS = [
  { id: "only_with_photo", label: "С фотографией" },
  { id: "only_with_salary", label: "С указанной ЗП" },
  { id: "only_with_age", label: "С указанным возрастом" },
  { id: "only_with_vehicle", label: "С личным авто" },
]

// Языки (id из /languages) и уровни (language_level). Формат поля hh — "{id}.{level}".
const LANGUAGE_OPTIONS = [
  { id: "eng", label: "Английский" },
  { id: "deu", label: "Немецкий" },
  { id: "fra", label: "Французский" },
  { id: "spa", label: "Испанский" },
  { id: "ita", label: "Итальянский" },
  { id: "zho", label: "Китайский" },
]
const LANGUAGE_LEVEL_OPTIONS = [
  { value: "a1", label: "A1" },
  { value: "a2", label: "A2" },
  { value: "b1", label: "B1" },
  { value: "b2", label: "B2" },
  { value: "c1", label: "C1" },
  { value: "c2", label: "C2" },
  { value: "l1", label: "Родной" },
]

// Авто-скоринг: скорим только первые N результатов hh (топ по релевантности).
// Остальные показываются без AI-балла, HR может дооценить по кнопке.
const AUTO_SCORE_LIMIT = 20

// vacancies.required_experience → hh experience id.
function mapVacancyExperience(req?: string | null): string {
  switch (req) {
    case "none": return "noExperience"
    case "1-3": return "between1And3"
    case "3-6": return "between3And6"
    case "6+": return "moreThan6"
    default: return "any"
  }
}

interface OutboundItem {
  id: string
  hhResumeId: string
  title: string | null
  status: string
  aiScore: number | null
  aiReasoning: string | null
  experienceYears: number | null
  area: string | null
  salary: { amount?: number | null; currency?: string | null } | null
}

interface StatusData {
  hhVacancyLinked: boolean
  databaseAccess: { active: boolean; reason: string | null }
  quota: {
    searchLimit: number; viewsFromSearch: number; searchRemaining: number
    totalLimit: number; totalViews: number; totalRemaining: number; exhausted: boolean
  }
  lastRunAt: string | null
}

interface Props {
  vacancyId: string
  // Автозаполнение критериев из вакансии.
  vacancyTitle?: string | null
  vacancyCity?: string | null
  vacancySalaryMin?: number | null
  vacancySalaryMax?: number | null
  vacancyRequiredExperience?: string | null
  vacancyKeywords?: string | null
  // Расширенные данные анкеты для кнопки «Заполнить из анкеты».
  // workFormats / employment — русские лейблы из анкеты
  // (["Офис","Гибрид","Удалёнка"] / ["Полная","Частичная","Проектная"]).
  anketaWorkFormats?: string[] | null
  anketaEmployment?: string[] | null
  // Языки анкеты — массив { lang: hh language id, level: hh уровень }.
  anketaLanguages?: { lang: string; level: string }[] | null
  // Уровень образования анкеты — hh education_level id ("" = любое).
  anketaEducation?: string | null
}

// ─── Маппинг анкета → hh для расширенного фильтра ────────────────────────────
// Только однозначные соответствия. Анкетный schedule (5/2, 2/2, free…) и языки/
// образование в анкете НЕ структурированы — поэтому не маппятся (см. отчёт).

// Формат работы (анкета, рус.) → hh schedule id (SCHEDULE_OPTIONS).
const ANKETA_WORKFORMAT_TO_HH_SCHEDULE: Record<string, string> = {
  "Офис": "fullDay",
  "Удалёнка": "remote",
  "Гибрид": "flexible",
}

// Занятость (анкета, рус.) → hh employment id (EMPLOYMENT_OPTIONS).
const ANKETA_EMPLOYMENT_TO_HH: Record<string, string> = {
  "Полная": "full",
  "Частичная": "part",
  "Проектная": "project",
}

// Цвет AI-score бейджа (та же шкала, что getStageColorClasses в lib/stages —
// зелёное/жёлтое/красное по порогам).
function scoreClasses(score: number | null): string {
  if (score == null) return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800"
  if (score >= 70) return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
  if (score >= 40) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
  return "bg-destructive/10 text-destructive border-destructive/20"
}

const STATUS_LABEL: Record<string, string> = {
  found: "Найден",
  viewed: "Просмотрен",
  invited: "Приглашён",
  responded: "Ответил",
  skipped: "Пропущен",
}

export function OutboundSourcingTab({
  vacancyId, vacancyTitle, vacancyCity, vacancySalaryMin, vacancySalaryMax,
  vacancyRequiredExperience, vacancyKeywords, anketaWorkFormats, anketaEmployment,
  anketaLanguages, anketaEducation,
}: Props) {
  // Критерии (автозаполнены, редактируемы).
  const [text, setText] = useState(vacancyKeywords ?? vacancyTitle ?? "")
  const [area, setArea] = useState(vacancyCity ?? "")
  const [experience, setExperience] = useState(mapVacancyExperience(vacancyRequiredExperience))
  const [salaryFrom, setSalaryFrom] = useState(vacancySalaryMin ? String(vacancySalaryMin) : "")
  const [salaryTo, setSalaryTo] = useState(vacancySalaryMax ? String(vacancySalaryMax) : "")

  // Расширенные критерии (структурированные поля hh).
  const [employment, setEmployment] = useState<string[]>([])
  const [schedule, setSchedule] = useState<string[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [educationLevel, setEducationLevel] = useState("any")
  const [gender, setGender] = useState("any")
  const [relocation, setRelocation] = useState("any")
  const [orderBy, setOrderBy] = useState("relevance")
  const [ageFrom, setAgeFrom] = useState("")
  const [ageTo, setAgeTo] = useState("")
  // Язык: один выбранный язык + минимальный уровень. В hh уходит как "{id}.{level}".
  const [languageId, setLanguageId] = useState("any")
  const [languageLevel, setLanguageLevel] = useState("b1")
  // Доп. языки из анкеты (несколько). Уходят в hh вместе с одиночным выбором.
  // Формат элемента — "{lang}.{level}" (например "eng.b2").
  const [extraLanguages, setExtraLanguages] = useState<string[]>([])

  const toggleInArray = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) =>
      setter((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val])),
    [],
  )

  // ── «Заполнить из анкеты» ──
  // Перезаписывает целевые РАСШИРЕННЫЕ поля (employment, schedule) значениями
  // из анкеты. Базовые (ключевики/город/опыт/ЗП) не трогает — они и так
  // автозаполнены. Маппит только однозначное; языки/образование/анкетный
  // schedule пропускаются (в анкете нет структурированных данных).
  const fillFromAnketa = useCallback(() => {
    // Языки анкеты → hh формат "{lang}.{level}" (только полностью заданные).
    const mappedLanguages = (anketaLanguages ?? [])
      .filter((l) => l.lang && l.level)
      .map((l) => `${l.lang}.${l.level}`)
    const hasAnketa =
      (anketaWorkFormats && anketaWorkFormats.length > 0) ||
      (anketaEmployment && anketaEmployment.length > 0) ||
      mappedLanguages.length > 0 ||
      !!anketaEducation
    if (!hasAnketa) {
      toast.info("В анкете нет данных для фильтра")
      return
    }

    // Формат работы анкеты → hh schedule.
    const mappedSchedule = (anketaWorkFormats ?? [])
      .map((f) => ANKETA_WORKFORMAT_TO_HH_SCHEDULE[f])
      .filter(Boolean)
    // Занятость анкеты → hh employment.
    const mappedEmployment = (anketaEmployment ?? [])
      .map((e) => ANKETA_EMPLOYMENT_TO_HH[e])
      .filter(Boolean)

    if (
      mappedSchedule.length === 0 &&
      mappedEmployment.length === 0 &&
      mappedLanguages.length === 0 &&
      !anketaEducation
    ) {
      toast.info("В анкете нет данных для фильтра")
      return
    }

    if (mappedSchedule.length) setSchedule([...new Set(mappedSchedule)])
    if (mappedEmployment.length) setEmployment([...new Set(mappedEmployment)])
    // Образование — hh education_level id; "" в анкете = любое (не трогаем).
    if (anketaEducation) setEducationLevel(anketaEducation)
    // Языки: одиночные UI-селекты заполняем ПЕРВЫМ языком анкеты,
    // а в поиск (criteria.language) уйдут ВСЕ языки из анкеты (extraLanguages).
    const uniqueLanguages = [...new Set(mappedLanguages)]
    setExtraLanguages(uniqueLanguages)
    if (uniqueLanguages.length > 0) {
      const [firstLang, firstLevel] = uniqueLanguages[0].split(".")
      setLanguageId(firstLang)
      setLanguageLevel(firstLevel || "b1")
    }
    toast.success("Поля заполнены из анкеты")
  }, [anketaWorkFormats, anketaEmployment, anketaLanguages, anketaEducation])

  async function generateCriteria() {
    const desc = description.trim()
    if (!desc) return
    setGeneratingCriteria(true)
    try {
      const res = await fetch("/api/modules/hr/outbound/generate-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc,
          vacancyTitle: vacancyTitle ?? undefined,
          vacancyCity: vacancyCity ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка генерации критериев"); return }
      const { criteria, softCriteria: sc } = data
      if (criteria.text) setText(criteria.text)
      if (criteria.area) setArea(criteria.area)
      if (criteria.experience && criteria.experience !== "any") setExperience(criteria.experience)
      if (criteria.salaryFrom) setSalaryFrom(String(criteria.salaryFrom))
      if (criteria.salaryTo) setSalaryTo(String(criteria.salaryTo))
      if (sc) setSoftCriteria(sc)
      toast.success("Критерии сгенерированы — проверьте и нажмите «Найти»")
    } catch {
      toast.error("Сеть недоступна при генерации критериев")
    } finally {
      setGeneratingCriteria(false)
    }
  }

  const [items, setItems] = useState<OutboundItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<StatusData | null>(null)

  // AI-генерация критериев из текстового описания.
  const [description, setDescription] = useState("")
  const [softCriteria, setSoftCriteria] = useState("")
  const [generatingCriteria, setGeneratingCriteria] = useState(false)

  const [searching, setSearching] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [inviting, setInviting] = useState(false)

  // Количество уже оценённых (с ai_score != null).
  const scoredCount = useMemo(() => items.filter((i) => i.aiScore != null).length, [items])
  // id кандидатов без оценки, первые AUTO_SCORE_LIMIT из текущего списка (по порядку hh).
  const unscoredItems = useMemo(() => items.filter((i) => i.aiScore == null), [items])
  // Следующая порция для «Оценить ещё».
  const nextBatchIds = useMemo(
    () => unscoredItems.slice(0, AUTO_SCORE_LIMIT).map((i) => i.id),
    [unscoredItems],
  )

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/hr/outbound/status?vacancyId=${vacancyId}`)
      if (res.ok) setStatus(await res.json())
    } catch { /* статус необязателен для работы поиска */ }
  }, [vacancyId])

  useEffect(() => { loadStatus() }, [loadStatus])

  const ranked = useMemo(
    () => [...items].sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1)),
    [items],
  )

  // Счётчик активных расширенных фильтров для бейджа на триггере.
  const advancedCount = useMemo(() => {
    let n = 0
    if (employment.length) n++
    if (schedule.length) n++
    if (labels.length) n++
    if (educationLevel !== "any") n++
    if (gender !== "any") n++
    if (relocation !== "any") n++
    if (orderBy !== "relevance") n++
    if (ageFrom || ageTo) n++
    if (languageId !== "any") n++
    return n
  }, [employment, schedule, labels, educationLevel, gender, relocation, orderBy, ageFrom, ageTo, languageId])

  // Резюме доступные для приглашения (не приглашённые/ответившие).
  const invitable = useMemo(
    () => ranked.filter((i) => i.status !== "invited" && i.status !== "responded"),
    [ranked],
  )

  async function runSearch() {
    setSearching(true)
    try {
      const res = await fetch("/api/modules/hr/outbound/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancyId,
          criteria: {
            text: text.trim() || undefined,
            // area — пока название города; реальный hh area id маппится позже
            // (Фаза 1: передаём как есть, hh поиск принимает text+area).
            area: area.trim() || undefined,
            experience: experience === "any" ? undefined : experience,
            salaryFrom: salaryFrom ? Number(salaryFrom) : undefined,
            salaryTo: salaryTo ? Number(salaryTo) : undefined,
            period: 30,
            perPage: 50,
            // Расширенные структурированные поля.
            employment: employment.length ? employment : undefined,
            schedule: schedule.length ? schedule : undefined,
            label: labels.length ? labels : undefined,
            educationLevel: educationLevel === "any" ? undefined : educationLevel,
            gender: gender === "any" ? undefined : gender,
            relocation: relocation === "any" ? undefined : relocation,
            orderBy: orderBy === "relevance" ? undefined : orderBy,
            ageFrom: ageFrom ? Number(ageFrom) : undefined,
            ageTo: ageTo ? Number(ageTo) : undefined,
            // Язык — массив "{id}.{level}". Объединяем одиночный выбор UI и
            // языки, подтянутые из анкеты (extraLanguages), без дублей.
            language: (() => {
              const langs = [...extraLanguages]
              if (languageId !== "any") langs.push(`${languageId}.${languageLevel}`)
              const unique = [...new Set(langs)]
              return unique.length ? unique : undefined
            })(),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка поиска"); return }
      const foundItems: OutboundItem[] = data.items ?? []
      setItems(foundItems)
      setSelected(new Set())
      const foundCount = data.found ?? foundItems.length ?? 0
      toast.success(`Найдено резюме: ${foundCount}`)
      // Авто-скоринг только первых AUTO_SCORE_LIMIT (топ по релевантности hh).
      const autoScoreIds = foundItems.slice(0, AUTO_SCORE_LIMIT).map((i: OutboundItem) => i.id)
      void runScore(autoScoreIds)
      void loadStatus()
    } catch {
      toast.error("Сеть недоступна")
    } finally {
      setSearching(false)
    }
  }

  // ids — конкретные outbound_candidate.id для порционного скоринга.
  // Если не переданы — скорит все без ai_score (старое поведение).
  async function runScore(ids?: string[]) {
    setScoring(true)
    try {
      const res = await fetch("/api/modules/hr/outbound/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId, ...(ids ? { ids } : {}), softCriteria: softCriteria.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка скоринга"); return }
      setItems(data.items ?? [])
    } catch {
      toast.error("Сеть недоступна при скоринге")
    } finally {
      setScoring(false)
    }
  }

  // Дооценить следующую порцию (nextBatchIds).
  async function runScoreNextBatch() {
    if (nextBatchIds.length === 0) return
    await runScore(nextBatchIds)
  }

  // Оценить выбранных (из selected — только не оценённые).
  async function runScoreSelected() {
    const selectedUnscored = items
      .filter((i) => selected.has(i.id) && i.aiScore == null)
      .map((i) => i.id)
    if (selectedUnscored.length === 0) {
      toast.info("Все выбранные уже оценены")
      return
    }
    await runScore(selectedUnscored)
  }

  async function runInvite() {
    const hhResumeIds = invitable.filter((i) => selected.has(i.id)).map((i) => i.hhResumeId)
    if (hhResumeIds.length === 0) { toast.error("Не выбрано ни одного резюме"); return }
    setInviting(true)
    try {
      const res = await fetch("/api/modules/hr/outbound/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancyId, hhResumeIds }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Ошибка приглашения"); return }
      const ok = data.invited ?? 0
      const limited = (data.results ?? []).filter((r: { status: string }) => r.status === "limit").length
      toast.success(`Приглашено: ${ok}${limited ? `, упёрлись в лимит: ${limited}` : ""}`)
      setSelected(new Set())
      await runScore(undefined)   // подтянуть обновлённые статусы (без ids = все)
      await loadStatus()          // обновить квоту
    } catch {
      toast.error("Сеть недоступна при приглашении")
    } finally {
      setInviting(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === invitable.length ? new Set() : new Set(invitable.map((i) => i.id)),
    )
  }

  const access = status?.databaseAccess
  const quota = status?.quota
  const inviteDisabled =
    inviting ||
    !status?.hhVacancyLinked ||
    !access?.active ||
    !!quota?.exhausted ||
    invitable.filter((i) => selected.has(i.id)).length === 0

  const inviteHint = !status?.hhVacancyLinked
    ? "Вакансия не связана с hh.ru"
    : !access?.active
      ? (access?.reason ?? "Доступ к базе резюме hh не активен")
      : quota?.exhausted
        ? "Дневной лимит просмотров исчерпан"
        : undefined

  return (
    <div className="space-y-4">
      {/* ─── Критерии ─── */}
      <div className="rounded-lg border p-4 space-y-3">
        {/* AI-описание → генерация критериев */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Опишите кандидата словами — AI заполнит критерии поиска</Label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5 text-xs shrink-0"
              onClick={generateCriteria}
              disabled={generatingCriteria || !description.trim()}
            >
              {generatingCriteria ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Сгенерировать критерии
            </Button>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`напр. «Продавал промышленное оборудование B2B, опыт 3+ лет, желательно работал в Siemens или Bosch, Москва»`}
            className="min-h-[68px] text-sm resize-none"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2 space-y-1.5">
            <Label className="text-xs">Ключевые слова</Label>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="напр. менеджер по продажам" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Город</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Москва" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Опыт</Label>
            <Select value={experience} onValueChange={setExperience}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPERIENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ЗП от</Label>
            <Input value={salaryFrom} onChange={(e) => setSalaryFrom(e.target.value.replace(/\D/g, ""))} placeholder="—" className="h-8 text-sm" inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ЗП до</Label>
            <Input value={salaryTo} onChange={(e) => setSalaryTo(e.target.value.replace(/\D/g, ""))} placeholder="—" className="h-8 text-sm" inputMode="numeric" />
          </div>
          <div className="flex items-end">
            <Button size="sm" className="h-8 gap-1.5 w-full" onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Найти
            </Button>
          </div>
        </div>

        {/* Мягкие критерии для AI-скоринга (не ограничивают поиск hh) */}
        <div className="space-y-1.5">
          <Label className="text-xs">Мягкие критерии для AI-оценки <span className="text-muted-foreground font-normal">(не ограничивают поиск hh)</span></Label>
          <Textarea
            value={softCriteria}
            onChange={(e) => setSoftCriteria(e.target.value)}
            placeholder="напр. «Желательно опыт в крупных B2B-продажах, знание немецкого языка — плюс»"
            className="min-h-[56px] text-sm resize-none"
          />
        </div>

        {/* ─── Расширенный фильтр — раскрыт по умолчанию ─── */}
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
            <span className="flex items-center gap-2">
              Расширенный фильтр
              {advancedCount > 0 && (
                <span className="text-[10px] rounded-full bg-primary/15 text-primary px-1.5 py-0.5 tabular-nums">{advancedCount}</span>
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            {/* «Заполнить из анкеты» — заметная вторичная кнопка над сеткой полей */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-muted-foreground">Уточните параметры поиска</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={fillFromAnketa}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Заполнить из анкеты
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Занятость */}
              <div className="space-y-1.5">
                <Label className="text-xs">Занятость</Label>
                <div className="space-y-1">
                  {EMPLOYMENT_OPTIONS.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={employment.includes(o.id)} onCheckedChange={() => toggleInArray(setEmployment, o.id)} />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* График */}
              <div className="space-y-1.5">
                <Label className="text-xs">График</Label>
                <div className="space-y-1">
                  {SCHEDULE_OPTIONS.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={schedule.includes(o.id)} onCheckedChange={() => toggleInArray(setSchedule, o.id)} />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Только резюме (label) */}
              <div className="space-y-1.5">
                <Label className="text-xs">Только резюме</Label>
                <div className="space-y-1">
                  {LABEL_OPTIONS.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={labels.includes(o.id)} onCheckedChange={() => toggleInArray(setLabels, o.id)} />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Селекты: образование / пол / переезд / сортировка */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Образование</Label>
                  <Select value={educationLevel} onValueChange={setEducationLevel}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EDUCATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Пол</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Переезд (требует город) */}
              <div className="space-y-1.5">
                <Label className="text-xs">Переезд</Label>
                <Select value={relocation} onValueChange={setRelocation}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELOCATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {relocation !== "any" && !area.trim() && (
                  <p className="text-[11px] text-amber-600">Укажите город — фильтр переезда без города hh игнорирует.</p>
                )}
              </div>
              {/* Сортировка */}
              <div className="space-y-1.5">
                <Label className="text-xs">Сортировка</Label>
                <Select value={orderBy} onValueChange={setOrderBy}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORDER_BY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Возраст */}
              <div className="space-y-1.5">
                <Label className="text-xs">Возраст</Label>
                <div className="flex items-center gap-1.5">
                  <Input value={ageFrom} onChange={(e) => setAgeFrom(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="от" className="h-8 text-sm" inputMode="numeric" />
                  <Input value={ageTo} onChange={(e) => setAgeTo(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="до" className="h-8 text-sm" inputMode="numeric" />
                </div>
              </div>
              {/* Язык + уровень */}
              <div className="space-y-1.5">
                <Label className="text-xs">Язык</Label>
                <div className="flex items-center gap-1.5">
                  <Select value={languageId} onValueChange={(v) => { setExtraLanguages([]); setLanguageId(v) }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Язык" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any" className="text-sm">Не важно</SelectItem>
                      {LANGUAGE_OPTIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={languageLevel} onValueChange={setLanguageLevel} disabled={languageId === "any"}>
                    <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_LEVEL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {extraLanguages.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    Из анкеты: {extraLanguages.join(", ")} — в поиск уйдут все.
                  </p>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ─── Полоска статуса ─── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5">
          {access?.active
            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
          Доступ к базе резюме:{" "}
          <span className={cn("font-medium", access?.active ? "text-green-600" : "text-amber-600")}>
            {access?.active ? "активен" : "не активен"}
          </span>
        </span>
        {quota && (
          <span className={cn("inline-flex items-center gap-1", quota.exhausted && "text-destructive font-medium")}>
            Просмотров сегодня: {quota.viewsFromSearch}/{quota.searchLimit}
          </span>
        )}
        {scoring && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> AI-скоринг…
          </span>
        )}
      </div>

      {/* ─── Список найденных ─── */}
      {ranked.length > 0 && (
        <TableCard>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Найдено: <span className="font-medium tabular-nums">{ranked.length}</span></span>
              {selected.size > 0 && <span>Выбрано: <span className="font-medium tabular-nums">{selected.size}</span></span>}
              {/* Счётчик оценённых */}
              <span className={cn(scoredCount < ranked.length ? "text-amber-600" : "text-green-600")}>
                Оценено AI: <span className="font-medium tabular-nums">{scoredCount}</span> из <span className="font-medium tabular-nums">{ranked.length}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Кнопки порционного скоринга */}
              {unscoredItems.length > 0 && (
                <>
                  {selected.size > 0 && items.filter((i) => selected.has(i.id) && i.aiScore == null).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={runScoreSelected}
                      disabled={scoring}
                      title="AI-оценка выбранных резюме без балла"
                    >
                      {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Оценить выбранных
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={runScoreNextBatch}
                    disabled={scoring}
                    title={`Дооценить следующие ${nextBatchIds.length} резюме`}
                  >
                    {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Оценить ещё {nextBatchIds.length}
                  </Button>
                </>
              )}
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={runInvite}
                disabled={inviteDisabled}
                title={inviteHint}
              >
                {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Пригласить выбранных
              </Button>
            </div>
          </div>
          {inviteHint && (
            <div className="px-3 py-1.5 text-[11px] text-amber-600 bg-amber-500/5 border-b">{inviteHint}</div>
          )}
          <DataTable>
            <DataHead>
              <DataHeadCell width="2rem">
                <Checkbox
                  checked={invitable.length > 0 && selected.size === invitable.length}
                  onCheckedChange={toggleAll}
                  aria-label="Выбрать все"
                />
              </DataHeadCell>
              <DataHeadCell>Заголовок резюме</DataHeadCell>
              <DataHeadCell width="5rem">Опыт</DataHeadCell>
              <DataHeadCell width="7rem">Ожид. ЗП</DataHeadCell>
              <DataHeadCell width="5rem">AI-score</DataHeadCell>
              <DataHeadCell width="6rem">Статус</DataHeadCell>
            </DataHead>
            <tbody>
              {ranked.map((i) => {
                const isInvited = i.status === "invited" || i.status === "responded"
                return (
                  <DataRow key={i.id} className={cn(isInvited && "opacity-60")}>
                    <DataCell className="align-top">
                      <Checkbox
                        checked={selected.has(i.id)}
                        onCheckedChange={() => toggle(i.id)}
                        disabled={isInvited}
                        aria-label="Выбрать резюме"
                      />
                    </DataCell>
                    <DataCell className="align-top">
                      <div className="font-medium leading-tight">{i.title ?? "Без заголовка"}</div>
                      {i.area && <div className="text-xs text-muted-foreground">{i.area}</div>}
                      {i.aiReasoning && (
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">{i.aiReasoning}</div>
                      )}
                    </DataCell>
                    <DataCell className="align-top tabular-nums text-muted-foreground">
                      {i.experienceYears != null ? `${i.experienceYears} л.` : "—"}
                    </DataCell>
                    <DataCell className="align-top tabular-nums text-muted-foreground">
                      {i.salary?.amount != null ? `${i.salary.amount.toLocaleString("ru")} ${i.salary.currency ?? ""}`.trim() : "—"}
                    </DataCell>
                    <DataCell className="align-top">
                      <span className={cn("inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums", scoreClasses(i.aiScore))}>
                        {i.aiScore != null ? i.aiScore : "—"}
                      </span>
                    </DataCell>
                    <DataCell className="align-top text-xs text-muted-foreground">
                      {STATUS_LABEL[i.status] ?? i.status}
                    </DataCell>
                  </DataRow>
                )
              })}
            </tbody>
          </DataTable>
        </TableCard>
      )}

      {ranked.length === 0 && !searching && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Задайте критерии и нажмите «Найти» — hh подберёт резюме, а AI отранжирует лучших.
        </div>
      )}
    </div>
  )
}
