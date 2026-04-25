"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, X, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

// Уровень в БД (enum): yearly / monthly / weekly.
// Горизонт в UI (4): yearly / quarterly / monthly / weekly.
// «Квартальная» маппится на level='yearly' + префикс [Квартальная цель] в описании
// до тех пор, пока не добавим 'quarterly' в enum БД.
export type DbLevel = "yearly" | "monthly" | "weekly"
export type Horizon = "yearly" | "quarterly" | "monthly" | "weekly"
export type MetricType = "count" | "money" | "percent" | "custom"

export const QUARTERLY_PREFIX = "[Квартальная цель]"

export type GoalInput = {
  id?: string
  level: DbLevel
  parentId: string | null
  title: string
  description: string | null
  targetValue: string | null
  targetUnit: string | null
  currentValue: string | null
  deadline: string | null
  isFocusToday: boolean
  status: "active" | "completed" | "paused" | "archived"
}

export type ExistingGoal = GoalInput & { id: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getHorizon(g: Pick<GoalInput, "level" | "description">): Horizon {
  if (g.level === "yearly" && g.description?.startsWith(QUARTERLY_PREFIX)) return "quarterly"
  return g.level
}

export function stripQuarterlyPrefix(desc: string | null): string {
  if (!desc) return ""
  const trimmed = desc.startsWith(QUARTERLY_PREFIX) ? desc.slice(QUARTERLY_PREFIX.length).trimStart() : desc
  return trimmed
}

function defaultDeadlineFor(h: Horizon): string {
  const now = new Date()
  if (h === "yearly" || h === "quarterly") return `${now.getFullYear()}-12-31`
  if (h === "monthly") {
    const y = now.getFullYear(), m = now.getMonth()
    return new Date(y, m + 1, 0).toISOString().slice(0, 10)
  }
  const d = new Date(now)
  const dow = d.getDay()
  const add = dow === 0 ? 7 : 7 - dow
  d.setDate(d.getDate() + add)
  return d.toISOString().slice(0, 10)
}

function inferMetricType(unit: string | null): MetricType {
  const u = (unit ?? "").trim().toLowerCase()
  if (!u) return "custom"
  if (u.includes("%")) return "percent"
  if (u.includes("₽") || u.includes("руб") || u.includes("$") || u.includes("€")) return "money"
  if (/^(клиент|сделк|шт|продаж|лид|контракт|встреч|собеседован|модул|курс|мероприят|статеj|заказ)/.test(u))
    return "count"
  return "custom"
}

function unitForType(t: MetricType): string {
  return t === "count" ? "клиентов" : t === "money" ? "₽" : t === "percent" ? "%" : ""
}

function fmtRu(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (Number.isInteger(n)) return new Intl.NumberFormat("ru-RU").format(n)
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n)
}

function generateDecomposition(
  horizon: Horizon,
  metricType: MetricType,
  target: number,
  unit: string,
): string | null {
  if (!(horizon === "yearly" || horizon === "quarterly")) return null
  if (!Number.isFinite(target) || target <= 0) return null

  const u = unit.trim() || (metricType === "money" ? "₽" : metricType === "percent" ? "%" : "")

  if (horizon === "yearly") {
    if (metricType === "money") {
      return `Разбить ${fmtRu(target)} ${u} на 12 месячных целей. С учётом сезонности: зима — ниже среднего, лето-осень — выше. Итого — ${fmtRu(target)} ${u}.`
    }
    if (metricType === "percent") {
      return `Разбить ${fmtRu(target)} ${u} на 4 квартальные цели по ${fmtRu(target / 4)} ${u}. Ежемесячно сверять, чтобы не упустить тренд.`
    }
    // count / custom
    const low  = Math.round(target * 0.06)
    const mid  = Math.round(target * 0.085)
    const high = Math.round(target * 0.095)
    return `Разбить ${fmtRu(target)} ${u} на 12 месячных целей с учётом сезонности: январь–март по ${fmtRu(low)}/мес, апрель–октябрь по ${fmtRu(mid)}/мес, ноябрь–декабрь по ${fmtRu(high)}/мес. Итого — ${fmtRu(target)} ${u}.`
  }

  // quarterly
  return `Разбить ${fmtRu(target)} ${u} на 3 месячные цели и 13 недельных. Примерно ${fmtRu(target / 3)} ${u} в месяц.`
}

// ─── Tile component ──────────────────────────────────────────────────────────

function Tile({
  title, subtitle, selected, onClick,
}: {
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 min-w-0 rounded-md text-left px-3 py-2.5 transition-colors",
        "border bg-card hover:bg-accent/40",
        selected
          ? "border-2 border-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/10"
          : "border-border/70"
      )}
    >
      <div className={cn(
        "text-[13px] font-medium leading-tight",
        selected ? "text-indigo-600 dark:text-indigo-300" : "text-foreground"
      )}>
        {title}
      </div>
      <div className={cn(
        "text-[11px] mt-0.5 leading-tight",
        selected ? "text-indigo-600/80 dark:text-indigo-300/80" : "text-muted-foreground"
      )}>
        {subtitle}
      </div>
    </button>
  )
}

// ─── Main form ───────────────────────────────────────────────────────────────

type LinkedMetric = { name: string; value: string; unit: string }

const HORIZONS: { id: Horizon; title: string; subtitle: string }[] = [
  { id: "yearly",    title: "Годовая",     subtitle: "12 месяцев" },
  { id: "quarterly", title: "Квартальная", subtitle: "3 месяца" },
  { id: "monthly",   title: "Месячная",    subtitle: "4 недели" },
  { id: "weekly",    title: "Недельная",   subtitle: "7 дней" },
]

const METRIC_TYPES: { id: MetricType; title: string; subtitle: string }[] = [
  { id: "count",   title: "Количество", subtitle: "клиенты, сделки, штуки" },
  { id: "money",   title: "Деньги",     subtitle: "выручка, прибыль ₽" },
  { id: "percent", title: "Процент",    subtitle: "конверсия, удержание" },
  { id: "custom",  title: "Своя",       subtitle: "часы, встречи, метры" },
]

export function GoalForm({
  open, onOpenChange, existingGoals, initial, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existingGoals: ExistingGoal[]
  initial: ExistingGoal | null
  onSaved: () => void
}) {
  const [horizon, setHorizon] = useState<Horizon>("weekly")
  const [metricType, setMetricType] = useState<MetricType>("count")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [targetValue, setTargetValue] = useState("")
  const [targetUnit, setTargetUnit] = useState("")
  const [deadline, setDeadline] = useState("")
  const [parentId, setParentId] = useState<string>("none")
  const [linkedMetrics, setLinkedMetrics] = useState<LinkedMetric[]>([])
  const [dismissedHint, setDismissedHint] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset / hydrate on open
  useEffect(() => {
    if (!open) return
    if (initial) {
      const h = getHorizon(initial)
      setHorizon(h)
      setTitle(initial.title)
      setDescription(stripQuarterlyPrefix(initial.description))
      setTargetValue(initial.targetValue ?? "")
      setTargetUnit(initial.targetUnit ?? "")
      setMetricType(inferMetricType(initial.targetUnit))
      setDeadline(initial.deadline ?? "")
      setParentId(initial.parentId ?? "none")
    } else {
      setHorizon("weekly")
      setMetricType("count")
      setTitle("")
      setDescription("")
      setTargetValue("")
      setTargetUnit("")
      setDeadline(defaultDeadlineFor("weekly"))
      setParentId("none")
    }
    setLinkedMetrics([])
    setDismissedHint(false)
  }, [open, initial])

  // Автоподстановка дедлайна при смене горизонта — только если юзер ничего не менял руками
  useEffect(() => {
    if (!open || initial) return
    setDeadline(defaultDeadlineFor(horizon))
  }, [horizon, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Автоподстановка единицы при смене типа метрики
  function onMetricTypeChange(t: MetricType) {
    setMetricType(t)
    const suggestion = unitForType(t)
    if (!targetUnit.trim() || inferMetricType(targetUnit) !== t) {
      setTargetUnit(suggestion)
    }
  }

  // Допустимые родители по горизонту
  const parentOptions = useMemo(() => {
    if (horizon === "yearly") return []
    if (horizon === "quarterly") {
      return existingGoals.filter(
        (g) => g.level === "yearly" && g.status === "active" && !g.description?.startsWith(QUARTERLY_PREFIX),
      )
    }
    if (horizon === "monthly") {
      return existingGoals.filter((g) => g.level === "yearly" && g.status === "active")
    }
    return existingGoals.filter((g) => g.level === "monthly" && g.status === "active")
  }, [horizon, existingGoals])

  // Декомпозиция от Нэнси (только UI)
  const decompositionText = useMemo(() => {
    if (dismissedHint) return null
    const n = Number((targetValue || "").replace(",", "."))
    return generateDecomposition(horizon, metricType, n, targetUnit)
  }, [horizon, metricType, targetValue, targetUnit, dismissedHint])

  const currentNum = initial ? Number(initial.currentValue ?? 0) : 0
  const targetNum = Number((targetValue || "").replace(",", "."))
  const remainingHint = useMemo(() => {
    if (!Number.isFinite(targetNum) || targetNum <= 0) return null
    if (!initial) {
      return `Сейчас: 0 · Нужно набрать: ${fmtRu(targetNum)}${targetUnit ? " " + targetUnit : ""}`
    }
    const left = Math.max(0, targetNum - currentNum)
    return `Сейчас: ${fmtRu(currentNum)}${targetUnit ? " " + targetUnit : ""} · Осталось: ${fmtRu(left)}${targetUnit ? " " + targetUnit : ""}`
  }, [initial, currentNum, targetNum, targetUnit])

  function addMetric() {
    setLinkedMetrics((prev) => [...prev, { name: "", value: "", unit: "" }])
  }
  function updateMetric(i: number, patch: Partial<LinkedMetric>) {
    setLinkedMetrics((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }
  function removeMetric(i: number) {
    setLinkedMetrics((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    const t = title.trim()
    if (!t) { toast.error("Название обязательно"); return }

    setSaving(true)
    try {
      const dbLevel: DbLevel = horizon === "quarterly" ? "yearly" : horizon
      const cleanDescription = description.trim()
      const finalDescription =
        horizon === "quarterly"
          ? (cleanDescription ? `${QUARTERLY_PREFIX} ${cleanDescription}` : QUARTERLY_PREFIX)
          : (cleanDescription || null)

      const body = {
        level: dbLevel,
        title: t,
        description: finalDescription,
        target_value: targetValue.trim() ? Number(targetValue.replace(",", ".")) : null,
        target_unit: targetUnit.trim() || null,
        deadline: deadline || null,
        parent_id: parentId === "none" ? null : parentId,
      }

      const res = initial
        ? await fetch(`/api/goals/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error ?? "Не удалось сохранить")
        return
      }

      toast.success(initial ? "Цель обновлена" : "Цель создана")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  function onDecompositionAction() {
    toast.info("Декомпозиция будет доступна в ближайшем обновлении")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto max-h-screen p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-xl font-semibold tracking-tight">
            {initial ? "Редактировать цель" : "Создать цель"}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Определите что хотите достичь — Нэнси поможет разбить на шаги
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-5 space-y-5">

          {/* 1. Горизонт */}
          <div className="space-y-2">
            <Label className="text-[13px] font-medium">
              Горизонт <Req />
            </Label>
            <div className="flex gap-2">
              {HORIZONS.map((h) => (
                <Tile
                  key={h.id}
                  title={h.title}
                  subtitle={h.subtitle}
                  selected={horizon === h.id}
                  onClick={() => setHorizon(h.id)}
                />
              ))}
            </div>
          </div>

          {/* 2. Название */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-[13px] font-medium">
              Название цели <Req />
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: База клиентов на 2026 год"
              className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            />
          </div>

          {/* 3. Тип метрики (UI-only) */}
          <div className="space-y-2">
            <Label className="text-[13px] font-medium">Тип метрики</Label>
            <div className="grid grid-cols-2 gap-2">
              {METRIC_TYPES.map((m) => (
                <Tile
                  key={m.id}
                  title={m.title}
                  subtitle={m.subtitle}
                  selected={metricType === m.id}
                  onClick={() => onMetricTypeChange(m.id)}
                />
              ))}
            </div>
          </div>

          {/* 4. Целевое значение + единица */}
          <div className="space-y-2">
            <Label className="text-[13px] font-medium">Целевое значение</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="decimal"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="1000"
                className="flex-[2] h-10 text-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              />
              <Input
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
                placeholder="клиентов"
                className="flex-1 h-10 text-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              />
            </div>
            {remainingHint && (
              <p className="text-[11px] text-muted-foreground">{remainingHint}</p>
            )}
          </div>

          {/* 5. Связанные метрики (UI-only) */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label className="text-[13px] font-medium">
                Связанные метрики <span className="text-muted-foreground font-normal">(опционально)</span>
              </Label>
            </div>
            <div className="rounded-md border border-border bg-card p-3 space-y-2">
              {linkedMetrics.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  Добавьте метрики, которые помогают трекать эту цель — например, «Средний чек» или «Удержание».
                </p>
              )}
              {linkedMetrics.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={m.name}
                    onChange={(e) => updateMetric(i, { name: e.target.value })}
                    placeholder="Название метрики"
                    className="flex-[2] h-9 text-sm"
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={m.value}
                    onChange={(e) => updateMetric(i, { value: e.target.value })}
                    placeholder="30000"
                    className="flex-1 h-9 text-sm"
                  />
                  <Input
                    value={m.unit}
                    onChange={(e) => updateMetric(i, { unit: e.target.value })}
                    placeholder="₽/мес"
                    className="w-20 h-9 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeMetric(i)}
                    className="shrink-0 w-7 h-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors"
                    title="Удалить метрику"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addMetric}
                className="w-full h-9 rounded-md border border-dashed border-border/80 bg-transparent text-sm text-muted-foreground hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="size-4" /> Добавить метрику
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Сохранение связанных метрик появится в ближайшем обновлении — сейчас вы видите как это будет выглядеть.
            </p>
          </div>

          {/* 6. Описание */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-[13px] font-medium">Описание</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Зачем эта цель, контекст, что считаем успехом"
              rows={2}
              className="text-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            />
          </div>

          {/* 7. Дедлайн */}
          <div className="space-y-2">
            <Label htmlFor="deadline" className="text-[13px] font-medium">Дедлайн</Label>
            <Input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-10 text-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            />
          </div>

          {/* Родительская цель — компактно */}
          {parentOptions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">
                Родительская цель <span className="text-muted-foreground font-normal">(опционально)</span>
              </Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Нет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Нет</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Блок Нэнси — декомпозиция */}
          {decompositionText && (
            <div className="rounded-md bg-indigo-500/10 border border-indigo-500/30 p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 w-5 h-5 rounded-full bg-indigo-500 text-white text-[11px] font-semibold flex items-center justify-center">
                  N
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-indigo-700 dark:text-indigo-200 flex items-center gap-1">
                    <Sparkles className="size-3.5" />
                    Нэнси предлагает декомпозицию
                  </div>
                  <p className="text-[12px] leading-relaxed text-foreground/80 mt-1">
                    {decompositionText}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={onDecompositionAction}
                      className="h-8 bg-indigo-500 hover:bg-indigo-600 text-white border-0"
                    >
                      Разбить по месяцам
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onDecompositionAction}
                      className="h-8 border-indigo-400/60 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/10"
                    >
                      Равномерно
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDismissedHint(true)}
                      className="h-8 text-muted-foreground"
                    >
                      Не сейчас
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        <SheetFooter className="px-5 py-4 border-t border-border bg-background/60 flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 border-0"
          >
            {saving ? "Сохраняю…" : initial ? "Сохранить изменения" : "Создать цель"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Req() {
  return <span className="text-red-500">*</span>
}
