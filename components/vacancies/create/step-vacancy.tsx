"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { Vacancy, HiringGoal, CurrentProblem, VacancyFunction, Segment } from "@/lib/company-types"
import {
  HIRING_GOALS,
  CURRENT_PROBLEMS,
  FUNCTIONS,
  EXPERIENCE_OPTIONS,
  WORK_FORMATS,
  HIRING_URGENCIES,
  SEGMENTS,
} from "@/lib/company-types"
import {
  classifyPosition,
  POSITION_CATEGORIES,
  type PositionCategory,
  type ClassificationResult,
} from "@/lib/position-classifier"
import { CheckCircle, ChevronDown, ChevronUp } from "lucide-react"

export interface StepVacancyProps {
  data: Partial<Vacancy>
  onChange: (data: Partial<Vacancy>) => void
}

// ─── Reusable sub-components ────────────────────────────────────────────────

function RadioGroup({
  label,
  options,
  value,
  onChange,
  required,
  hint,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
  required?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-sm transition-colors",
              value === opt.value
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function CheckboxGroup({
  label,
  options,
  value,
  onChange,
  required,
  hint,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
  required?: boolean
  hint?: string
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-sm transition-colors",
              value.includes(opt.value)
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      <Separator className="mt-2" />
    </div>
  )
}

// ─── Position Classifier Banner ──────────────────────────────────────────────

function ClassifierBanner({
  result,
  onConfirm,
  onChangeCategory,
}: {
  result: ClassificationResult
  onConfirm: () => void
  onChangeCategory: (cat: PositionCategory) => void
}) {
  const [showPicker, setShowPicker] = useState(false)

  const allCategories = (
    Object.entries(POSITION_CATEGORIES).filter(([key]) => key !== "other") as unknown
  ) as [PositionCategory, { label: string; keywords: readonly string[]; defaultFunctions: readonly string[] }][]

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <span className="font-medium">Мы определили должность как:</span>{" "}
            {result.label}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result.confidence === "medium" && (
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:no-underline whitespace-nowrap"
            >
              {showPicker ? "Скрыть" : "Изменить →"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowPicker(false)
              onConfirm()
            }}
            className="text-xs px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Верно
          </button>
        </div>
      </div>

      {result.defaultFunctions.length > 0 && (
        <p className="text-xs text-blue-700 dark:text-blue-300 pl-6">
          Для этой должности предзаполнены функции и добавлены дополнительные поля
        </p>
      )}

      {showPicker && (
        <div className="pt-1 pl-6 space-y-1.5">
          <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Выберите тип должности:</p>
          <div className="flex flex-wrap gap-1.5">
            {allCategories.map(([key, cat]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChangeCategory(key)
                  setShowPicker(false)
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md border text-xs transition-colors",
                  key === result.category
                    ? "border-blue-500 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-600 font-medium"
                    : "border-blue-200 text-blue-700 dark:border-blue-700 dark:text-blue-300 hover:border-blue-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/40"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Adaptive Fields ─────────────────────────────────────────────────────────

const ROP_FUNCTIONS = [
  { value: "hiring",          label: "Найм" },
  { value: "training",        label: "Обучение" },
  { value: "kpi_control",     label: "Контроль KPI" },
  { value: "scripts",         label: "Скрипты" },
  { value: "crm",             label: "CRM" },
  { value: "funnel",          label: "Воронка" },
  { value: "meetings_mgmt",   label: "Планёрки" },
  { value: "personal_sales",  label: "Личные продажи" },
  { value: "reporting",       label: "Отчётность" },
  { value: "key_accounts",    label: "Ключевые клиенты" },
] as const

function AdaptiveFields({
  category,
  data,
  onChange,
}: {
  category: PositionCategory
  data: Partial<Vacancy>
  onChange: (data: Partial<Vacancy>) => void
}) {
  const [open, setOpen] = useState(true)

  const af = (data.adaptive_fields ?? {}) as Record<string, unknown>

  const set = (key: string, value: unknown) => {
    onChange({ ...data, adaptive_fields: { ...af, [key]: value } })
  }

  const getStr = (key: string, fallback = "") => (af[key] as string) ?? fallback
  const getNum = (key: string) => (af[key] as number | undefined)
  const getBool = (key: string) => !!(af[key] as boolean | undefined)
  const getArr = (key: string): string[] => (af[key] as string[]) ?? []

  const categoryLabel =
    POSITION_CATEGORIES[category]?.label ?? "должности"

  // For ROP, we render the special functions block elsewhere;
  // this component only renders the adaptive extra fields section.
  // The main form skips the standard functions CheckboxGroup when category === "rop".

  const renderFields = () => {
    switch (category) {
      case "sales_hunter":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="af-calls-day">План звонков в день</Label>
                <Input
                  id="af-calls-day"
                  type="number"
                  min={0}
                  placeholder="50"
                  value={getNum("calls_per_day") ?? ""}
                  onChange={(e) => set("calls_per_day", parseInt(e.target.value) || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="af-new-clients">План новых клиентов в месяц</Label>
                <Input
                  id="af-new-clients"
                  type="number"
                  min={0}
                  placeholder="10"
                  value={getNum("new_clients_per_month") ?? ""}
                  onChange={(e) => set("new_clients_per_month", parseInt(e.target.value) || undefined)}
                />
              </div>
            </div>
            <CheckboxGroup
              label="Каналы привлечения"
              options={[
                { value: "cold_calls",   label: "Холодные звонки" },
                { value: "email",        label: "Email" },
                { value: "social",       label: "Соцсети" },
                { value: "referrals",    label: "Рефералы" },
                { value: "exhibitions",  label: "Выставки" },
              ]}
              value={getArr("acquisition_channels")}
              onChange={(v) => set("acquisition_channels", v)}
            />
            <RadioGroup
              label="Опыт холодных продаж"
              options={[
                { value: "required",    label: "Обязателен" },
                { value: "preferred",   label: "Желателен" },
                { value: "not_needed",  label: "Не важно" },
              ]}
              value={getStr("cold_sales_exp") || undefined}
              onChange={(v) => set("cold_sales_exp", v)}
            />
            <RadioGroup
              label="Своя клиентская база"
              options={[
                { value: "required",    label: "Обязательно" },
                { value: "preferred",   label: "Желательно" },
                { value: "not_needed",  label: "Не нужно" },
              ]}
              value={getStr("own_client_base") || undefined}
              onChange={(v) => set("own_client_base", v)}
            />
          </div>
        )

      case "sales_farmer":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="af-base-size">Размер базы на менеджера (клиентов)</Label>
                <Input
                  id="af-base-size"
                  type="number"
                  min={0}
                  placeholder="100"
                  value={getNum("base_size_per_manager") ?? ""}
                  onChange={(e) => set("base_size_per_manager", parseInt(e.target.value) || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="af-revenue-growth">Целевой рост выручки с базы, %</Label>
                <Input
                  id="af-revenue-growth"
                  type="number"
                  min={0}
                  placeholder="20"
                  value={getNum("target_revenue_growth_pct") ?? ""}
                  onChange={(e) => set("target_revenue_growth_pct", parseFloat(e.target.value) || undefined)}
                />
              </div>
            </div>
            <RadioGroup
              label="Частота контакта с клиентом"
              options={[
                { value: "weekly",        label: "Еженедельно" },
                { value: "twice_monthly", label: "2 раза в месяц" },
                { value: "monthly",       label: "Ежемесячно" },
              ]}
              value={getStr("contact_frequency") || undefined}
              onChange={(v) => set("contact_frequency", v)}
            />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="af-upsell" className="text-sm font-medium">Upsell / cross-sell важен</Label>
                <p className="text-xs text-muted-foreground">Ожидается активное развитие клиентов</p>
              </div>
              <Switch
                id="af-upsell"
                checked={getBool("upsell_important")}
                onCheckedChange={(v) => set("upsell_important", v)}
              />
            </div>
          </div>
        )

      case "sales_closer":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="af-deal-size">Средний размер сделки, ₽</Label>
                <Input
                  id="af-deal-size"
                  type="number"
                  min={0}
                  placeholder="500 000"
                  value={getNum("avg_deal_size") ?? ""}
                  onChange={(e) => set("avg_deal_size", parseFloat(e.target.value) || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="af-deals-sim">Кол-во сделок одновременно</Label>
                <Input
                  id="af-deals-sim"
                  type="number"
                  min={0}
                  placeholder="5"
                  value={getNum("simultaneous_deals") ?? ""}
                  onChange={(e) => set("simultaneous_deals", parseInt(e.target.value) || undefined)}
                />
              </div>
            </div>
            <RadioGroup
              label="Работа с тендерами"
              options={[
                { value: "yes",       label: "Да" },
                { value: "no",        label: "Нет" },
                { value: "sometimes", label: "Иногда" },
              ]}
              value={getStr("tenders") || undefined}
              onChange={(v) => set("tenders", v)}
            />
            <RadioGroup
              label="Уровень переговоров"
              options={[
                { value: "employees",  label: "С рядовыми сотрудниками" },
                { value: "managers",   label: "С менеджерами" },
                { value: "lpr",        label: "С ЛПР" },
                { value: "owners",     label: "С собственниками" },
              ]}
              value={getStr("negotiation_level") || undefined}
              onChange={(v) => set("negotiation_level", v)}
            />
          </div>
        )

      case "rop":
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="af-team-size">Размер команды</Label>
              <Input
                id="af-team-size"
                type="number"
                min={0}
                placeholder="5"
                value={getNum("team_size") ?? ""}
                onChange={(e) => set("team_size", parseInt(e.target.value) || undefined)}
              />
            </div>
            <RadioGroup
              label="Команда"
              options={[
                { value: "exists",    label: "Уже есть" },
                { value: "hire",      label: "Нужно нанять" },
                { value: "partial",   label: "Частично есть" },
              ]}
              value={getStr("team_status") || undefined}
              onChange={(v) => set("team_status", v)}
            />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="af-playing-coach" className="text-sm font-medium">Играющий тренер</Label>
                <p className="text-xs text-muted-foreground">РОП сам активно продаёт</p>
              </div>
              <Switch
                id="af-playing-coach"
                checked={getBool("playing_coach")}
                onCheckedChange={(v) => set("playing_coach", v)}
              />
            </div>
          </div>
        )

      case "telemarketer":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="af-calls-tm">План звонков в день</Label>
                <Input
                  id="af-calls-tm"
                  type="number"
                  min={0}
                  placeholder="80–150"
                  value={getNum("calls_per_day") ?? ""}
                  onChange={(e) => set("calls_per_day", parseInt(e.target.value) || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="af-leads-day">План лидов/встреч в день</Label>
                <Input
                  id="af-leads-day"
                  type="number"
                  min={0}
                  placeholder="5"
                  value={getNum("leads_per_day") ?? ""}
                  onChange={(e) => set("leads_per_day", parseInt(e.target.value) || undefined)}
                />
              </div>
            </div>
            <RadioGroup
              label="Работа по скрипту"
              options={[
                { value: "strict",   label: "Строго по скрипту" },
                { value: "partial",  label: "Частично" },
                { value: "free",     label: "Свободный разговор" },
              ]}
              value={getStr("script_usage") || undefined}
              onChange={(v) => set("script_usage", v)}
            />
            <CheckboxGroup
              label="Источники баз"
              options={[
                { value: "purchased",  label: "Купленные базы" },
                { value: "parsed",     label: "Парсинг" },
                { value: "crm",        label: "CRM компании" },
              ]}
              value={getArr("base_sources")}
              onChange={(v) => set("base_sources", v)}
            />
          </div>
        )

      default:
        return null
    }
  }

  const fields = renderFields()
  if (!fields) return null

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
      >
        <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          Дополнительные вопросы для: {categoryLabel}
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          : <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1">
          {fields}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function StepVacancy({ data, onChange }: StepVacancyProps) {
  const update = <K extends keyof Vacancy>(field: K, value: Vacancy[K]) =>
    onChange({ ...data, [field]: value })

  const mainPainLength = data.main_pain?.length ?? 0

  // ── Classifier state ──────────────────────────────────────────────────────
  const [classResult, setClassResult] = useState<ClassificationResult | null>(null)
  const [detectedCategory, setDetectedCategory] = useState<PositionCategory | null>(null)
  // true = user has confirmed (or it was auto high-confidence applied); banner hidden
  const [confirmed, setConfirmed] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rerun classifier with 600ms debounce whenever position_title changes
  useEffect(() => {
    const title = data.position_title ?? ""

    if (title.length < 3) {
      setClassResult(null)
      setDetectedCategory(null)
      setConfirmed(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const result = classifyPosition(title)
      if (result.category === "other") {
        setClassResult(null)
        setDetectedCategory(null)
        setConfirmed(false)
        return
      }

      setClassResult(result)
      setConfirmed(false)

      // High confidence: auto-apply functions + set detected category
      if (result.confidence === "high") {
        applyClassification(result)
      }
    }, 600)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.position_title])

  const applyClassification = (result: ClassificationResult) => {
    setDetectedCategory(result.category)
    setConfirmed(true)
    // Pre-fill functions only if currently empty
    if (result.defaultFunctions.length > 0 && (!data.functions || data.functions.length === 0)) {
      onChange({
        ...data,
        functions: [...result.defaultFunctions] as VacancyFunction[],
      })
    }
  }

  const handleConfirm = () => {
    if (!classResult) return
    applyClassification(classResult)
  }

  const handleChangeCategory = (cat: PositionCategory) => {
    const catData = POSITION_CATEGORIES[cat] as unknown as { label: string; keywords: readonly string[]; defaultFunctions: readonly string[] }
    const syntheticResult: ClassificationResult = {
      category: cat,
      confidence: "high",
      label: catData.label,
      defaultFunctions: catData.defaultFunctions,
    }
    setClassResult(syntheticResult)
    applyClassification(syntheticResult)
  }

  // For ROP: replace the standard functions block with the special chips
  const isRop = detectedCategory === "rop"
  const ropFunctionsValue = (data.adaptive_fields?.rop_functions as string[]) ?? []
  const toggleRopFunction = (v: string) => {
    const next = ropFunctionsValue.includes(v)
      ? ropFunctionsValue.filter((x) => x !== v)
      : [...ropFunctionsValue, v]
    onChange({ ...data, adaptive_fields: { ...(data.adaptive_fields ?? {}), rop_functions: next } })
  }

  return (
    <div className="space-y-8">

      {/* ── Позиция ── */}
      <div className="space-y-4">
        <SectionTitle>Позиция</SectionTitle>

        <div className="space-y-1.5">
          <Label htmlFor="position-title">
            Должность <span className="text-destructive">*</span>
          </Label>
          <Input
            id="position-title"
            placeholder="Менеджер по продажам"
            value={data.position_title ?? ""}
            onChange={(e) => update("position_title", e.target.value)}
          />
        </div>

        {/* Classifier banner — shown when title ≥ 3 chars and result found and not yet confirmed */}
        {classResult && !confirmed && (
          <ClassifierBanner
            result={classResult}
            onConfirm={handleConfirm}
            onChangeCategory={handleChangeCategory}
          />
        )}

        {/* Confirmed badge */}
        {detectedCategory && confirmed && detectedCategory !== "other" && (
          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>
              Тип должности: <span className="font-medium">{POSITION_CATEGORIES[detectedCategory].label}</span>
            </span>
            <button
              type="button"
              onClick={() => setConfirmed(false)}
              className="underline underline-offset-2 hover:no-underline"
            >
              Изменить
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="headcount">
              Количество человек <span className="text-destructive">*</span>
            </Label>
            <Input
              id="headcount"
              type="number"
              placeholder="1"
              min={1}
              value={data.headcount ?? ""}
              onChange={(e) => update("headcount", parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-sales">План продаж/мес на человека</Label>
            <Input
              id="plan-sales"
              type="number"
              placeholder="10"
              min={0}
              value={data.plan_sales_per_month ?? ""}
              onChange={(e) => update("plan_sales_per_month", parseFloat(e.target.value) || undefined)}
            />
            <p className="text-xs text-muted-foreground">Необязательно</p>
          </div>
        </div>

        <RadioGroup
          label="Срочность найма"
          options={HIRING_URGENCIES}
          value={data.hiring_urgency}
          onChange={(v) => update("hiring_urgency", v as Vacancy["hiring_urgency"])}
        />
      </div>

      {/* ── Цели найма ── */}
      <div className="space-y-4">
        <SectionTitle>Цели найма</SectionTitle>

        <CheckboxGroup
          label="Зачем нанимаете"
          options={HIRING_GOALS}
          value={data.hiring_goals ?? []}
          onChange={(v) => update("hiring_goals", v as HiringGoal[])}
          required
          hint="Выберите один или несколько вариантов"
        />

        <div className="space-y-1.5">
          <Label htmlFor="main-goal">Главная цель одним предложением</Label>
          <Input
            id="main-goal"
            placeholder="Нанять 2 менеджеров для масштабирования входящего потока"
            value={data.main_goal ?? ""}
            onChange={(e) => update("main_goal", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Используется в демонстрации должности кандидату</p>
        </div>
      </div>

      {/* ── Текущие проблемы ── */}
      <div className="space-y-4">
        <SectionTitle>Текущие проблемы в продажах</SectionTitle>

        <CheckboxGroup
          label="Что сейчас не работает"
          options={CURRENT_PROBLEMS}
          value={data.current_problems ?? []}
          onChange={(v) => update("current_problems", v as CurrentProblem[])}
          hint="Необязательно, но помогает AI подобрать кандидата с нужным опытом"
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="main-pain">Главная боль / проблема</Label>
            <span className={cn("text-xs", mainPainLength > 280 ? "text-orange-500" : "text-muted-foreground")}>
              {mainPainLength}/300
            </span>
          </div>
          <Textarea
            id="main-pain"
            placeholder="Опишите главную сложность, с которой должен помочь новый сотрудник"
            value={data.main_pain ?? ""}
            onChange={(e) => {
              if (e.target.value.length <= 300) update("main_pain", e.target.value)
            }}
            rows={3}
            maxLength={300}
          />
        </div>
      </div>

      {/* ── Функционал ── */}
      <div className="space-y-4">
        <SectionTitle>Функционал</SectionTitle>

        {isRop ? (
          /* ROP: replace standard functions with special chips */
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Зоны ответственности РОПа <span className="text-destructive">*</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {ROP_FUNCTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleRopFunction(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm transition-colors",
                    ropFunctionsValue.includes(opt.value)
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Выберите всё, за что отвечает РОП</p>
          </div>
        ) : (
          <CheckboxGroup
            label="Основные задачи"
            options={FUNCTIONS}
            value={data.functions ?? []}
            onChange={(v) => update("functions", v as VacancyFunction[])}
            required
            hint="Выберите всё, чем будет заниматься сотрудник"
          />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="core-function">Основная задача (80% времени)</Label>
          <Input
            id="core-function"
            placeholder="Холодный обзвон и квалификация лидов"
            value={data.core_function ?? ""}
            onChange={(e) => update("core_function", e.target.value)}
          />
        </div>
      </div>

      {/* ── Требования ── */}
      <div className="space-y-4">
        <SectionTitle>Требования к кандидату</SectionTitle>

        <RadioGroup
          label="Опыт в продажах"
          options={EXPERIENCE_OPTIONS}
          value={data.experience}
          onChange={(v) => update("experience", v as Vacancy["experience"])}
          required
        />

        <CheckboxGroup
          label="Опыт работы с сегментами"
          options={[...SEGMENTS.map((s) => ({ value: s, label: s })), { value: "any", label: "Любой" }]}
          value={data.segment_experience ?? []}
          onChange={(v) => update("segment_experience", v as Segment[])}
        />

        <div className="space-y-1.5">
          <Label htmlFor="mandatory">Обязательные критерии</Label>
          <Textarea
            id="mandatory"
            placeholder="Опыт в B2B продажах, знание CRM, наличие клиентской базы..."
            value={data.mandatory_criteria ?? ""}
            onChange={(e) => update("mandatory_criteria", e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dealbreakers">Что неприемлемо (dealbreakers)</Label>
          <Textarea
            id="dealbreakers"
            placeholder="Опыт только в рознице, без опыта активных продаж..."
            value={data.dealbreakers ?? ""}
            onChange={(e) => update("dealbreakers", e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">Используется для автоматической фильтрации кандидатов</p>
        </div>
      </div>

      {/* ── Условия ── */}
      <div className="space-y-4">
        <SectionTitle>Условия работы</SectionTitle>

        <RadioGroup
          label="Формат работы"
          options={WORK_FORMATS}
          value={data.work_format}
          onChange={(v) => update("work_format", v as Vacancy["work_format"])}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="salary-fix">
              Оклад, ₽/мес <span className="text-destructive">*</span>
            </Label>
            <Input
              id="salary-fix"
              type="number"
              placeholder="80 000"
              min={1}
              value={data.salary_fix || ""}
              onChange={(e) => update("salary_fix", parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bonus-desc">Бонус / KPI</Label>
            <Input
              id="bonus-desc"
              placeholder="% от выручки, KPI квартала..."
              value={data.bonus_description ?? ""}
              onChange={(e) => update("bonus_description", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="avg-income">Средний доход, ₽/мес</Label>
            <Input
              id="avg-income"
              type="number"
              placeholder="120 000"
              min={0}
              value={data.avg_income ?? ""}
              onChange={(e) => update("avg_income", parseFloat(e.target.value) || undefined)}
            />
            <p className="text-xs text-muted-foreground">Оклад + бонус при выполнении плана</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max-income">Потолок дохода, ₽/мес</Label>
            <Input
              id="max-income"
              type="number"
              placeholder="200 000"
              min={0}
              value={data.max_income ?? ""}
              onChange={(e) => update("max_income", parseFloat(e.target.value) || undefined)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="extra-conditions">Дополнительные условия</Label>
          <Textarea
            id="extra-conditions"
            placeholder="ДМС, корпоративный автомобиль, обучение за счёт компании..."
            value={data.extra_conditions ?? ""}
            onChange={(e) => update("extra_conditions", e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">Необязательно</p>
        </div>
      </div>

      {/* ── Adaptive extra fields (position-classifier driven) ── */}
      {detectedCategory && detectedCategory !== "other" && (
        <AdaptiveFields
          category={detectedCategory}
          data={data}
          onChange={onChange}
        />
      )}

    </div>
  )
}
