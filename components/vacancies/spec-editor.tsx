"use client"

/**
 * components/vacancies/spec-editor.tsx
 *
 * R4 «Candidate Spec» — единый экран «Кого ищем» (Этап 2, новый контур).
 * Секция настроек вакансии: ?tab=settings&section=spec.
 *
 * Источник данных: GET /api/core/spec/[vacancyId]
 *   - source="spec"   — сохранённый Spec из vacancy_specs
 *   - source="legacy" — собрано мостом buildSpecFromLegacy из текущих
 *     legacy-настроек (показываем бейдж «проверьте и сохраните»)
 * Сохранение: PUT /api/core/spec/[vacancyId] (zod-валидация на сервере).
 *
 * КОНТУР: при vacancies.portrait_scoring=true рантайм скоринга резюме читает
 * этот Spec ПОЛНОСТЬЮ — критерии, пороги (resumeThresholds), жёсткость (hard/soft).
 * При false действует legacy (ai_process_settings + конструктор). Кнопка
 * «Перенести в Портрет» (portraitScoring=false) переводит вакансию на новый контур.
 */

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { VacancyFollowupSettings } from "@/components/vacancies/vacancy-followup-settings"
import { CitizenshipFactorField, citizenshipSummary } from "@/components/vacancies/citizenship-factor-field"
import { NativeLanguageFactorField, nativeLanguageSummary } from "@/components/vacancies/native-language-factor-field"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { toast } from "sonner"
import {
  Target, Plus, Minus, X, Loader2, ShieldAlert, FileText, Gauge,
  ArrowRightLeft, AlertTriangle, Sparkles, Wand2, CheckCircle2, Check,
  Lightbulb, Save,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  normalizeMustHave,
  normalizeNiceToHave,
  normalizeDealBreakers,
  dealBreakerPenalty,
  DEFAULT_REJECT_LETTER,
  type CandidateSpec,
  type MustHaveItem,
  type MustHaveEntry,
  type NiceToHaveItem,
  type NiceToHaveEntry,
  type NiceImportance,
  type DealBreakerItem,
  type DealBreakerEntry,
  type MidRangeAction,
} from "@/lib/core/spec/types"
import { useVacancySectionRegister } from "./vacancy-settings-context"
import { PortraitAdvisor } from "./portrait-advisor"
import { useContentBlocks } from "@/hooks/use-content-blocks"
import { DEFAULT_INVITE_MESSAGE, DEFAULT_OFF_HOURS_MESSAGE } from "@/lib/hh/default-messages"
import { AutoResponderSettings } from "./auto-responder-settings"

// «180» → «через 3 мин», «3600» → «через 1 ч», «15» → «через 15 сек».
// Используется в компактной сводке блока «Авто-приглашение» (08.07:
// редактирование текстов/задержек переехало в «Коммуникации», здесь только
// просмотр — см. onNavigateToCommunications).
function formatDelayLabel(seconds: number): string {
  if (seconds < 60) return `через ${seconds} сек`
  const min = Math.round(seconds / 60)
  if (min < 60) return `через ${min} мин`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`
}

// ─── Константы ───────────────────────────────────────────────────────────────

// 🟢 «Подходит» — важность на пункте. ТРИ уровня (согласованный дизайн): 🟢 только
// поднимает балл, НИКОГДА не отсекает. Отсев — это 🔴 (стоп-фактор / точные требования).
// Цвет = важность: оранжевый → светло-зелёный → тёмно-зелёный. Подпись — по наведению.
// Мягкие «прозрачные» уровни важности (в стиле приложения): тинт-фон + цветная
// рамка + цветная галочка, без плотной заливки. «Обязательно» — фирменным
// primary (фиолетовый) + кольцо, чтобы ЧЁТКО выделялся среди остальных
// (раньше были два почти одинаковых зелёных). Ни один уровень НЕ отсекает —
// отсев живёт в 🔴 «Не подходит» (решение Юрия 26.06).
const GOOD_LEVELS = [
  { value: "nice",      label: "Желательно",    soft: "bg-orange-500/15 border-orange-500/50 text-orange-600 dark:text-orange-400" },
  { value: "important", label: "Средне важный", soft: "bg-lime-500/15 border-lime-500/55 text-lime-600 dark:text-lime-400"        },
  { value: "very",      label: "Важный",        soft: "bg-green-600/15 border-green-600/60 text-green-700 dark:text-green-400"     },
] as const
type GoodLevel = (typeof GOOD_LEVELS)[number]["value"]

/**
 * ЭФФЕКТИВНЫЕ веса осей — ТА ЖЕ формула, что buildAxes (axis-scorer.ts):
 * у оси с заданным weight берём его; ОСТАВШИЙСЯ бюджет (100 − сумма заданных,
 * не меньше 0) делим ПОРОВНУ между осями без weight (остаток +1 первым таким).
 * `manual[i]` === undefined → ось без ручного веса. Возвращает массив весов по индексу.
 */
function axisWeights(manual: (number | undefined)[]): number[] {
  const n = manual.length
  if (n <= 0) return []
  const fixedSum = manual.reduce<number>((s, w) => s + (typeof w === "number" ? w : 0), 0)
  const freeCount = manual.filter(w => typeof w !== "number").length
  const budget = Math.max(0, 100 - fixedSum)
  const base = freeCount > 0 ? Math.floor(budget / freeCount) : 0
  const rem = freeCount > 0 ? budget - base * freeCount : 0
  let freeSeen = 0
  return manual.map(w => {
    if (typeof w === "number") return w
    const v = base + (freeSeen < rem ? 1 : 0)
    freeSeen++
    return v
  })
}

/**
 * Компактный степпер «− N ед. +» с hold-to-repeat (десктоп/мышь).
 * Клик = ±step; удержание кнопки → авто-повтор с ускорением (интервал сжимается).
 * Интервал очищается на pointerup/leave и на размонтировании.
 */
function Stepper({
  value, onChange, min = 0, max = 100, step = 1, suffix, valueClassName, ariaLabel,
}: {
  value:           number
  onChange:        (next: number) => void
  min?:            number
  max?:            number
  step?:           number
  suffix?:         string
  valueClassName?: string
  ariaLabel?:      string
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  // Держим актуальное значение в ref, чтобы hold-repeat читал свежее (не stale-замыкание).
  const valueRef = useRef(value)
  valueRef.current = value

  const clear = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }
  useEffect(() => clear, [])

  const bump = (dir: 1 | -1) => {
    const next = clamp(valueRef.current + dir * step)
    if (next !== valueRef.current) onChange(next)
  }

  // Hold: первый повтор через 400 мс, дальше интервал сжимается 250→60 мс (ускорение).
  const startHold = (dir: 1 | -1) => {
    clear()
    let delay = 250
    const tick = () => {
      const before = valueRef.current
      bump(dir)
      if (valueRef.current === before) { clear(); return } // упёрлись в предел
      delay = Math.max(60, delay - 25)
      timerRef.current = setTimeout(tick, delay)
    }
    timerRef.current = setTimeout(tick, 400)
  }

  const btn = "flex items-center justify-center w-6 h-6 rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none select-none transition-colors"

  return (
    <div className="inline-flex items-center gap-1 select-none" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={btn}
        aria-label="Уменьшить"
        disabled={value <= min}
        onClick={() => bump(-1)}
        onPointerDown={e => { e.preventDefault(); startHold(-1) }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className={cn("text-xs tabular-nums text-center min-w-[52px]", valueClassName)}>
        {value}{suffix ?? ""}
      </span>
      <button
        type="button"
        className={btn}
        aria-label="Увеличить"
        disabled={value >= max}
        onClick={() => bump(1)}
        onPointerDown={e => { e.preventDefault(); startHold(1) }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// Куда зовём при авто-приглашении (короткий ярлык для зоны и опции селекта).
const NEXT_STEP_LABEL: Record<string, string> = {
  demo:      "на демо",
  interview: "на интервью",
  video:     "на видео",
  call:      "на звонок",
}

/** Локальная сборка «идеального профиля» из структурных списков (без AI) —
 *  всегда в синхроне с «Подходит/Не подходит». Это эталон-рамка для AI-скоринга. */
function composeIdealProfile(spec: CandidateSpec): string {
  const must  = normalizeMustHave(spec.mustHave).map(m => m.text)
  const wants = normalizeNiceToHave(spec.niceToHave).map(n => n.text)
  const bad   = normalizeDealBreakers(spec.dealBreakers)
  const hard  = bad.filter(b => b.hard).map(b => b.text)
  const soft  = bad.filter(b => !b.hard).map(b => b.text)
  const parts: string[] = []
  if (must.length)  parts.push(`Обязательно: ${must.join(", ")}`)
  if (wants.length) parts.push(`Желательно: ${wants.join(", ")}`)
  if (hard.length)  parts.push(`Не подходит (отказ): ${hard.join(", ")}`)
  if (soft.length)  parts.push(`Минус к баллу: ${soft.join(", ")}`)
  return parts.join(". ").slice(0, 500)
}

const MID_RANGE_LABELS: Record<MidRangeAction, string> = {
  direct_demo:      "Сразу на демо",
  prequalification: "Предквалификация (AI-вопросы)",
  keep_new:         "Оставить на ручной разбор",
}

const FORMAT_OPTIONS: Array<{ id: "office" | "hybrid" | "remote"; label: string }> = [
  { id: "office", label: "Офис" },
  { id: "hybrid", label: "Гибрид" },
  { id: "remote", label: "Удалёнка" },
]

const LIST_PLACEHOLDERS = {
  must: ["Опыт B2B продаж 3+ года", "Знание Битрикс24"],
  nice: ["Опыт работы с тендерами", "Английский B1+"],
  deal: ["Только B2C опыт", "Меньше 1 года в роли"],
}

function csvToList(s: string): string[] {
  return s.split(",").map(x => x.trim()).filter(x => x.length > 0)
}

/** Ответ POST /api/modules/hr/vacancies/[id]/requirements/suggest (сырое API-поле). */
interface RawSuggestionResult {
  must_have:     string[]
  nice_to_have:  { text: string; weight: number }[]
  deal_breakers: string[]
  ideal_profile: string
}

/**
 * Редактируемое состояние диалога подтверждения — nice_to_have здесь ПРОСТЫЕ
 * строки (диалог использует общий ListEditor, как must_have/deal_breakers).
 * Веса из API держим рядом в niceToHaveWeights (по тексту пункта) и применяем
 * в applySuggestion(); если HR отредактировал/добавил текст в диалоге — для
 * такого пункта веса нет, он попадёт в «свободный» пул buildAxes() (равная доля).
 */
interface SuggestionResult {
  must_have:          string[]
  nice_to_have:       string[]
  niceToHaveWeights:  Record<string, number>
  deal_breakers:      string[]
  ideal_profile:      string
}

/** Ответ POST .../requirements/synonyms */
interface SynonymsResult {
  synonyms: string[]
}

/** Дифф из POST .../requirements/actualize (актуализация под изменившуюся вакансию). */
interface ActualizeDiff {
  add:            { good: string[]; bad: string[] }
  maybe_outdated: { good: string[]; bad: string[] }
}

/** Локальное состояние диалога «Актуализировать» — отмеченность чекбоксов. */
interface ActualizeSelection {
  /** Какие из «предлагаем добавить» отмечены (по умолчанию все — добавить). */
  addGood:      Record<string, boolean>
  addBad:       Record<string, boolean>
  /** Какие из «возможно устарело» оставлены (true) — снятые удаляются. */
  keepGood:     Record<string, boolean>
  keepBad:      Record<string, boolean>
}

/** Одна конфликтующая пара из .../portrait/check-conflicts */
export interface ConflictItem {
  good: string
  bad:  string
  why:  string
}

/** Состояние блока синонимов для одного критерия */
interface SynonymState {
  loading:  boolean
  synonyms: string[]
  open:     boolean
}

// ─── Теги-редактор списков (must/nice/deal) ──────────────────────────────────

/** Рекомендуемое число критериев в списке (мягкий ориентир, не лимит). */
const RECOMMENDED_ITEMS = 5

/**
 * Счётчик списка с мягкой рекомендацией: при превышении RECOMMENDED_ITEMS
 * счётчик становится янтарным + появляется подсказка. Запрета нет (лимит = maxItems).
 */
function ListCounter({ count, max }: { count: number; max: number }) {
  const over = count > RECOMMENDED_ITEMS
  return (
    <span className={cn(
      "text-xs tabular-nums",
      over ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground",
    )}>
      {count}/{max}
    </span>
  )
}

function OverRecommendedHint({ count }: { count: number }) {
  if (count <= RECOMMENDED_ITEMS) return null
  return (
    <p className="text-[11px] text-amber-600 dark:text-amber-400">
      Рекомендуем до {RECOMMENDED_ITEMS} — больше критериев размывают оценку.
    </p>
  )
}

function ListEditor({
  label, hint, maxItems, items, setItems, placeholders,
}: {
  label:        string
  hint:         string
  maxItems:     number
  items:        string[]
  setItems:     (next: string[]) => void
  placeholders: string[]
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (items.some(x => x.toLowerCase() === t.toLowerCase())) {
      toast.error("Уже есть такой пункт"); return
    }
    if (items.length >= maxItems) {
      toast.error(`Максимум ${maxItems}`); return
    }
    setItems([...items, t])
    setDraft("")
  }
  const ph = placeholders[items.length % placeholders.length] || ""

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <ListCounter count={items.length} max={maxItems} />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <OverRecommendedHint count={items.length} />
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border px-2.5 py-1.5">
            <span className="flex-1 text-sm min-w-0 break-words">{it}</span>
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="rounded-full hover:bg-muted-foreground/20 p-0.5 shrink-0 mt-0.5"
              aria-label={`Убрать «${it}»`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={ph}
          maxLength={1000}
          disabled={items.length >= maxItems}
          className="h-9"
        />
        <Button type="button" size="icon" variant="outline" onClick={add}
          disabled={items.length >= maxItems || !draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Редактор must-have с per-пункт hard/soft (Этап 1b, решение #3) ───────────

function MustHaveEditor({
  items, setItems, maxItems, placeholders,
}: {
  items:        MustHaveItem[]
  setItems:     (next: MustHaveItem[]) => void
  maxItems:     number
  placeholders: string[]
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (items.some(x => x.text.toLowerCase() === t.toLowerCase())) {
      toast.error("Уже есть такой пункт"); return
    }
    if (items.length >= maxItems) {
      toast.error(`Максимум ${maxItems}`); return
    }
    setItems([...items, { text: t, hard: true }])
    setDraft("")
  }
  const setHard = (i: number, hard: boolean) =>
    setItems(items.map((it, idx) => idx === i ? { ...it, hard } : it))
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const ph = placeholders[items.length % placeholders.length] || ""

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">Обязательные (must-have)</Label>
        <ListCounter count={items.length} max={maxItems} />
      </div>
      <p className="text-xs text-muted-foreground">
        Без этого кандидат не подходит. Можно целой фразой, напр.: «Опыт руководителем проектов
        в промышленном строительстве ≥ 5 лет». Enter или + — добавить.
      </p>
      <OverRecommendedHint count={items.length} />

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
              <span className="flex-1 text-sm break-words">{it.text}</span>
              {/* Переключатель жёсткий / мягкий */}
              <div className="flex shrink-0 rounded-md border p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setHard(i, true)}
                  className={cn(
                    "rounded px-2 py-0.5 transition-colors",
                    it.hard
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Несоответствие → отсев кандидата"
                >
                  Жёсткий
                </button>
                <button
                  type="button"
                  onClick={() => setHard(i, false)}
                  className={cn(
                    "rounded px-2 py-0.5 transition-colors",
                    !it.hard
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Несоответствие → только снижает балл"
                >
                  Мягкий
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 rounded-full hover:bg-muted-foreground/20 p-1"
                aria-label={`Убрать «${it.text}»`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={ph}
          maxLength={1000}
          disabled={items.length >= maxItems}
          className="h-9"
        />
        <Button type="button" size="icon" variant="outline" onClick={add}
          disabled={items.length >= maxItems || !draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        <b>Жёсткий</b> — несоответствие отсеивает кандидата (нокаут). <b>Мягкий</b> — только
        влияет на балл. Все пункты учитываются вместе (И).
      </p>
    </div>
  )
}

// Дефолты фактора «Часовой пояс» при первом включении (поля со schema-default,
// поэтому fallback должен быть полностью заполнен — просто { enabled: true }
// не типизируется).
const TZ_FACTOR_DEFAULTS = { enabled: true, baseUtcOffset: 3, maxDiffHours: 3, penalty: 15 } as const

// ─── Строка стоп-фактора (тумблер + параметры) ───────────────────────────────

function FactorRow({
  title, help, enabled, onToggle, children,
}: {
  title: string
  help?: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          {help && <p className="text-[11px] text-muted-foreground mt-0.5">{help}</p>}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && <div className="pl-1">{children}</div>}
    </div>
  )
}

// Живая сводка под фактором: зелёным — кого пропускаем, красным — кому
// авто-отказ (Юрий 03.07: «здесь тоже лучше подписывать» — как у «Формата
// работы», чтобы семантика каждого фильтра читалась без догадок).
function FactorSummary({ pass, cut, idle }: { pass?: string | null; cut?: string | null; idle?: string | null }) {
  if (idle) return <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{idle}</p>
  if (!pass && !cut) return null
  return (
    <p className="mt-1.5 text-[11px] leading-snug">
      {pass && <span className="text-success">{pass} </span>}
      {cut && <span className="text-destructive">{cut}</span>}
    </p>
  )
}

// Текст отказа под точным требованием (перенесено из VacancyStopFactorsSettings,
// Юрий 08.07 — стоп-факторы теперь редактируются только в «Портрете»).
const FACTOR_REJECTION_PLACEHOLDERS = ["name", "vacancy", "company"]

function FactorRejectionText({
  refEl, value, onChange,
}: {
  refEl:    React.RefObject<HTMLTextAreaElement | null>
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5 mt-2">
      <Label className="text-[11px] text-muted-foreground">Текст отказа</Label>
      <textarea
        ref={refEl}
        value={value}
        onChange={e => onChange(e.target.value.slice(0, 2000))}
        placeholder="{{name}}, спасибо за интерес к {{vacancy}}. По итогам рассмотрения продолжим с другими кандидатами. Благодарим и желаем успехов!"
        rows={3}
        className="w-full border rounded-lg p-2 text-sm resize-y bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
      />
      <PlaceholderBadges
        textareaRef={refEl}
        placeholders={FACTOR_REJECTION_PLACEHOLDERS}
        value={value}
        onValueChange={onChange}
      />
    </div>
  )
}

// ─── Диалог подтверждения AI-предложения (паттерн VacancyRequirementsSettings) ─

function SuggestionDialog({
  open, onOpenChange, edited, onEdited, onApply,
}: {
  open:         boolean
  onOpenChange: (v: boolean) => void
  edited:       SuggestionResult | null
  onEdited:     (v: SuggestionResult) => void
  onApply:      () => void
}) {
  if (!edited) return null
  const setField = (field: keyof SuggestionResult, value: string[] | string) => {
    onEdited({ ...edited, [field]: value } as SuggestionResult)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" /> AI собрал портрет из вакансии
          </DialogTitle>
          <DialogDescription>
            Проверьте и при необходимости отредактируйте. После «Применить» поля Портрета
            заполнятся — не забудьте сохранить.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ListEditor
            label="Сильные плюсы"
            hint="Войдут в «Подходит» как «Очень важно»"
            maxItems={10}
            items={edited.must_have}
            setItems={v => setField("must_have", v)}
            placeholders={LIST_PLACEHOLDERS.must}
          />
          <ListEditor
            label="Плюсы"
            hint="Войдут в «Подходит» как «Желательно»"
            maxItems={10}
            items={edited.nice_to_have}
            setItems={v => setField("nice_to_have", v)}
            placeholders={LIST_PLACEHOLDERS.nice}
          />
          <ListEditor
            label="Не подходит"
            hint="Войдут в «Не подходит» (минус к баллу / стоп-фактор)"
            maxItems={10}
            items={edited.deal_breakers}
            setItems={v => setField("deal_breakers", v)}
            placeholders={LIST_PLACEHOLDERS.deal}
          />
          <div className="space-y-2">
            <Label className="text-sm font-medium">Идеальный профиль</Label>
            <Textarea
              value={edited.ideal_profile}
              onChange={e => setField("ideal_profile", e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={onApply}>Применить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Диалог «Актуализировать» (аддитивный дифф под изменившуюся вакансию) ────

/**
 * Показывает дифф от .../requirements/actualize:
 *   - «Предлагаем добавить» — чекбоксы, по умолчанию ОТМЕЧЕНЫ (добавятся).
 *   - «Возможно устарело — проверьте» — чекбоксы, по умолчанию ОТМЕЧЕНЫ
 *     (= оставить). Снять галочку = удалить пункт при применении.
 * Применение делает MERGE на стороне родителя (existing НЕ затирается).
 */
function ActualizeDialog({
  open, onOpenChange, diff, selection, onSelection, onApply, applying,
}: {
  open:         boolean
  onOpenChange: (v: boolean) => void
  diff:         ActualizeDiff | null
  selection:    ActualizeSelection
  onSelection:  (next: ActualizeSelection) => void
  onApply:      () => void
  applying:     boolean
}) {
  if (!diff) return null
  const nothingToAdd =
    diff.add.good.length === 0 && diff.add.bad.length === 0
  const nothingOutdated =
    diff.maybe_outdated.good.length === 0 && diff.maybe_outdated.bad.length === 0

  const checkRow = (
    text: string,
    checked: boolean,
    onToggle: (v: boolean) => void,
    tone: "good" | "bad",
  ) => (
    <label
      key={text}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer transition-colors",
        checked
          ? tone === "good"
            ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20"
            : "border-red-300 bg-red-50/60 dark:bg-red-950/20"
          : "border-border bg-muted/30",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={v => onToggle(Boolean(v))} className="mt-0.5" />
      <span className={cn("flex-1 text-sm min-w-0 break-words", !checked && "text-muted-foreground line-through")}>
        {text}
      </span>
    </label>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" /> Актуализация Портрета под вакансию
          </DialogTitle>
          <DialogDescription>
            Текущие критерии <b>сохраняются</b>. Отметьте, что добавить, и снимите то, что устарело.
            Ничего лишнего не сотрётся.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {nothingToAdd && nothingOutdated && (
            <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2.5 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              <span>Портрет уже соответствует вакансии — добавлять и убирать нечего.</span>
            </div>
          )}

          {/* ── Предлагаем добавить ── */}
          {!nothingToAdd && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <Label className="text-sm font-medium">Предлагаем добавить</Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Новое из обновлённого описания. Отмеченные добавятся к текущим (✅ по умолчанию).
              </p>
              {diff.add.good.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">В «Подходит»</p>
                  {diff.add.good.map(t =>
                    checkRow(t, selection.addGood[t] ?? true,
                      v => onSelection({ ...selection, addGood: { ...selection.addGood, [t]: v } }), "good"))}
                </div>
              )}
              {diff.add.bad.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">В «Не подходит»</p>
                  {diff.add.bad.map(t =>
                    checkRow(t, selection.addBad[t] ?? true,
                      v => onSelection({ ...selection, addBad: { ...selection.addBad, [t]: v } }), "bad"))}
                </div>
              )}
            </div>
          )}

          {/* ── Возможно устарело ── */}
          {!nothingOutdated && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <Label className="text-sm font-medium">Возможно устарело — проверьте</Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Эти пункты под новое описание выглядят неактуальными. <b>Снимите галочку</b>, чтобы убрать; оставьте — сохранится.
              </p>
              {diff.maybe_outdated.good.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">В «Подходит»</p>
                  {diff.maybe_outdated.good.map(t =>
                    checkRow(t, selection.keepGood[t] ?? true,
                      v => onSelection({ ...selection, keepGood: { ...selection.keepGood, [t]: v } }), "good"))}
                </div>
              )}
              {diff.maybe_outdated.bad.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">В «Не подходит»</p>
                  {diff.maybe_outdated.bad.map(t =>
                    checkRow(t, selection.keepBad[t] ?? true,
                      v => onSelection({ ...selection, keepBad: { ...selection.keepBad, [t]: v } }), "bad"))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>Отмена</Button>
          <Button onClick={onApply} disabled={applying || (nothingToAdd && nothingOutdated)}>
            {applying ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Применяю…</> : "Применить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Блок синонимов под критерием ────────────────────────────────────────────

function SynonymBlock({
  text, side, vacancyId, onAdd, onAddMany, onRemove,
}: {
  text:       string
  side:       "good" | "bad"
  vacancyId:  string
  onAdd:      (synonym: string) => void
  onAddMany?: (synonyms: string[]) => number
  onRemove?:  (synonym: string) => void
}) {
  const [state, setState] = useState<SynonymState>({ loading: false, synonyms: [], open: false })
  const [customDraft, setCustomDraft] = useState("")

  const load = async () => {
    if (state.open) { setState(s => ({ ...s, open: false })); return }
    if (state.synonyms.length > 0) { setState(s => ({ ...s, open: true })); return }
    setState(s => ({ ...s, loading: true, open: false }))
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/requirements/synonyms`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text, side }),
      })
      const json = await res.json() as SynonymsResult | { error?: string }
      if (!res.ok || "error" in json) {
        toast.error(("error" in json && json.error) ? json.error : "Не удалось получить синонимы")
        setState(s => ({ ...s, loading: false }))
        return
      }
      setState({ loading: false, synonyms: (json as SynonymsResult).synonyms, open: true })
    } catch {
      toast.error("Ошибка запроса синонимов")
      setState(s => ({ ...s, loading: false }))
    }
  }

  const addOne = (syn: string) => {
    onAdd(syn)
    toast.success(`Добавлено: ${syn}`)
  }

  const removeOne = (syn: string) => {
    onRemove?.(syn)
    toast.success(`Убрано: ${syn}`)
  }

  const addAll = () => {
    // Одним коммитом (иначе stale-замыкание перезапишет всё, кроме последнего).
    const n = onAddMany
      ? onAddMany(state.synonyms)
      : (state.synonyms.forEach(s => onAdd(s)), state.synonyms.length)
    toast.success(n > 0 ? `Добавлено вариантов: ${n}` : "Все варианты уже добавлены")
    setState(s => ({ ...s, open: false }))
  }

  const addCustom = () => {
    const t = customDraft.trim()
    if (!t) return
    onAdd(t)
    toast.success(`Добавлено: ${t}`)
    setCustomDraft("")
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={load}
        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
        disabled={state.loading}
      >
        {state.loading
          ? <><Loader2 className="w-3 h-3 animate-spin" /> Загрузка…</>
          : <><Lightbulb className="w-3 h-3" /> + Похожие</>}
      </button>

      {state.open && state.synonyms.length > 0 && (
        <div className="mt-2 rounded-md border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 p-2.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-muted-foreground leading-snug">
              AI и так учтёт по смыслу; добавьте, если хотите зафиксировать явно:
            </p>
            <button
              type="button"
              onClick={addAll}
              className="shrink-0 text-[11px] text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              + Добавить все
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              // Что уже добавлено в критерий (для серого вида + тоггла удаления)
              const added = new Set(text.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))
              return state.synonyms.map((syn, i) => {
                const isAdded = added.has(syn.trim().toLowerCase())
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => isAdded ? removeOne(syn) : addOne(syn)}
                    title={isAdded ? "Добавлено — нажмите, чтобы убрать" : "Нажмите, чтобы добавить"}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors",
                      isAdded
                        ? "bg-muted text-muted-foreground/60 border-border hover:text-muted-foreground hover:bg-muted-foreground/10"
                        : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50",
                    )}
                  >
                    {isAdded && <Check className="w-3 h-3 shrink-0" />}
                    {syn}
                  </button>
                )
              })
            })()}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={customDraft}
              onChange={e => setCustomDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom() } }}
              placeholder="свой вариант…"
              className="h-7 text-xs"
              maxLength={150}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7 shrink-0"
              onClick={addCustom}
              disabled={!customDraft.trim()}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 🟢 «Подходит»: единый список с важностью на пункте ──────────────────────

/**
 * Один редактор для всего, что «хотим видеть»: объединяет mustHave (hard =
 * «Обязательно») и niceToHave (важность на пункте). На выходе разбивает обратно
 * в два поля Spec — «Обязательно» → mustHave {hard:true}, остальное → niceToHave
 * {importance}. Так движок читает поля как раньше (hard must-have = нокаут).
 */
function GoodEditor({
  mustHave, niceToHave, onChange, vacancyId, axesMode = false,
}: {
  mustHave:   MustHaveEntry[]
  niceToHave: NiceToHaveEntry[]
  onChange:   (next: { mustHave: MustHaveItem[]; niceToHave: NiceToHaveItem[] }) => void
  vacancyId:  string
  /** scoringMode==="axes": скрыть переключатель важности, показать бейдж баллов. */
  axesMode?:  boolean
}) {
  // 🟢 = только балл, не отсев → всё в niceToHave (3 уровня). Старые жёсткие
  // must-have (если были) показываем как «Очень важно» и при правке переводим в
  // niceToHave; mustHave очищаем (criteria-нокаута больше нет — отсев это 🔴).
  const rows: { text: string; level: GoodLevel; weight?: number }[] = [
    ...normalizeMustHave(mustHave).map(m => ({ text: m.text, level: "very" as GoodLevel })),
    ...normalizeNiceToHave(niceToHave).map(n => ({ text: n.text, level: n.importance as GoodLevel, weight: n.weight })),
  ]
  const commit = (next: { text: string; level: GoodLevel; weight?: number }[]) => {
    const niceToHave: NiceToHaveItem[] = next.map(r => ({
      text: r.text,
      importance: r.level as NiceImportance,
      // Ручной вес оси (осевой режим) сохраняем, только если задан.
      ...(typeof r.weight === "number" ? { weight: r.weight } : {}),
    }))
    // Блокируем только ДОБАВЛЕНИЕ сверх 10. Удаление/правку существующих
    // (в т.ч. когда пунктов уже >10 из старых данных) всегда разрешаем — иначе
    // переполненный список нельзя почистить через ✕ (Юрий 26.06).
    if (niceToHave.length > 10 && niceToHave.length > rows.length) { toast.error("Не больше 10 пунктов"); return }
    onChange({ mustHave: [], niceToHave })
  }
  const setLevel = (i: number, level: GoodLevel) => commit(rows.map((r, idx) => idx === i ? { ...r, level } : r))
  // Осевой режим: задать ручной вес оси (0–100). Пишем weight на пункт.
  const setWeight = (i: number, weight: number) =>
    commit(rows.map((r, idx) => idx === i ? { ...r, weight: Math.max(0, Math.min(100, weight)) } : r))
  // «Поровну» — сбросить все ручные веса (weight → undefined), оси снова делят 100 равно.
  const resetWeights = () => commit(rows.map(r => ({ text: r.text, level: r.level })))
  const remove   = (i: number) => commit(rows.filter((_, idx) => idx !== i))
  // Убрать ОДИН синоним (часть критерия после запятой), сохранив основной термин.
  const removeSynonym = (i: number, syn: string) => commit(rows.map((r, idx) => {
    if (idx !== i) return r
    const parts = r.text.split(",").map(s => s.trim()).filter(Boolean)
    return { ...r, text: parts.filter(p => p !== syn).join(", ") }
  }))

  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (rows.some(r => r.text.toLowerCase() === t.toLowerCase())) { toast.error("Уже есть такой пункт"); return }
    if (rows.length >= 10) { toast.error("Максимум 10"); return }
    // По умолчанию критерий — «средне важный» (равный вес): все критерии
    // равнозначны, кто хочет — усилит/ослабит вручную (Юрий 26.06).
    commit([...rows, { text: t, level: "important" }])
    setDraft("")
  }
  const ph = LIST_PLACEHOLDERS.must[rows.length % LIST_PLACEHOLDERS.must.length] || ""

  // Осевой режим: ЭФФЕКТИВНЫЕ веса осей — та же формула, что buildAxes:
  // заданный weight, иначе равная доля остатка. Сумма — для «Всего X / 100».
  const weights = axesMode ? axisWeights(rows.map(r => r.weight)) : []
  const weightsTotal = weights.reduce((s, w) => s + w, 0)
  const anyManual = axesMode && rows.some(r => typeof r.weight === "number")

  /** Добавить синоним к критерию по индексу: дописываем через запятую, дедуп */
  const addSynonymToRow = (i: number, syn: string) => {
    const row = rows[i]
    if (!row) return
    // Дедуп: если синоним уже есть в тексте критерия (регистронезависимо) — пропускаем
    const existing = row.text.toLowerCase()
    if (existing.includes(syn.toLowerCase())) {
      toast.info(`«${syn}» уже есть в критерии`)
      return
    }
    const updated = rows.map((r, idx) => idx === i ? { ...r, text: `${r.text}, ${syn}` } : r)
    commit(updated)
  }

  /** Добавить несколько синонимов ОДНИМ коммитом (дедуп). Возвращает добавленное. */
  const addSynonymsToRow = (i: number, syns: string[]): number => {
    const row = rows[i]
    if (!row) return 0
    const existing = row.text.toLowerCase()
    const seen = new Set<string>()
    const toAdd = syns.filter(s => {
      const k = s.trim().toLowerCase()
      if (!k || existing.includes(k) || seen.has(k)) return false
      seen.add(k); return true
    })
    if (toAdd.length === 0) return 0
    commit(rows.map((r, idx) => idx === i ? { ...r, text: `${r.text}, ${toAdd.join(", ")}` } : r))
    return toAdd.length
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">
          {axesMode && rows.length > 0 ? "Разделы оценки (оси)" : "Что хотим видеть"}
        </Label>
        <div className="flex items-center gap-2 shrink-0">
          {axesMode && rows.length > 0 && (
            <>
              <span
                className={cn(
                  "text-[11px] tabular-nums font-medium",
                  weightsTotal === 100 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
                )}
                title={weightsTotal === 100
                  ? "Сумма весов осей"
                  : "Сумма ≠ 100 — не страшно: движок нормирует вклад на фактическую сумму"}
              >
                Всего: {weightsTotal} / 100
              </span>
              {anyManual && (
                <button type="button"
                  onClick={resetWeights}
                  title="Сбросить ручные баллы — снова поровну между осями"
                  className="text-[11px] text-muted-foreground hover:text-primary underline decoration-dotted underline-offset-2">
                  Поровну
                </button>
              )}
            </>
          )}
          {rows.length > 0 && (
            <button type="button"
              onClick={() => { if (rows.length <= 1 || confirm(`Удалить все критерии (${rows.length})?`)) commit([]) }}
              className="text-[11px] text-muted-foreground hover:text-red-600 underline decoration-dotted underline-offset-2">
              Очистить всё
            </button>
          )}
          <ListCounter count={rows.length} max={10} />
        </div>
      </div>
      {axesMode ? (
        <p className="text-xs text-muted-foreground">
          Каждый пункт — отдельная ось. По умолчанию 100 баллов делятся поровну; справа можно
          <b> усилить/ослабить</b> любую ось вручную (степпер «− балл +»). AI оценивает ось изолированно
          и только по явному тексту резюме — пустая ось не маскируется сильной.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Есть в резюме → плюс к баллу. Нет → балл ниже, но <b>не отказ</b>. Цвет справа = важность:{" "}
          <span className="text-orange-600 dark:text-orange-400">оранжевый — желательно</span>,{" "}
          <span className="text-lime-600 dark:text-lime-400">салатовый — средне важный</span>,{" "}
          <span className="text-green-700 dark:text-green-400">зелёный — важный</span> (сильнее влияет на балл; отсев — только в «Не подходит»). Наведите — увидите подпись.
        </p>
      )}
      <OverRecommendedHint count={rows.length} />
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="rounded-md border p-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                {(() => {
                  const parts = r.text.split(",").map(s => s.trim()).filter(Boolean)
                  const main = parts[0] ?? r.text
                  const syns = parts.slice(1)
                  return (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-sm break-words">{main}</span>
                      {syns.map((s, si) => (
                        <span key={si} className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                          {s}
                          <button type="button" onClick={() => removeSynonym(i, s)} className="hover:text-foreground" aria-label={`Убрать синоним «${s}»`}>
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )
                })()}
              </div>
              {axesMode ? (
                <div className="shrink-0" title="Балл этой оси. По умолчанию поровну; можно задать вручную">
                  <Stepper
                    value={weights[i] ?? 0}
                    onChange={v => setWeight(i, v)}
                    min={0} max={100} step={1}
                    suffix=" б."
                    ariaLabel={`Балл оси «${r.text}»`}
                    valueClassName={cn(
                      "font-medium",
                      typeof r.weight === "number" ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Важность пункта">
                  {GOOD_LEVELS.map(l => {
                    const active = r.level === l.value
                    return (
                      <button key={l.value} type="button" title={l.label} aria-label={l.label} aria-pressed={active}
                        onClick={() => setLevel(i, l.value)}
                        className={cn(
                          "w-7 h-[22px] rounded-md border flex items-center justify-center transition-all",
                          active
                            ? cn(l.soft, "shadow-sm")
                            : "border-border/50 text-muted-foreground/30 hover:text-muted-foreground/70 hover:border-border",
                        )}
                      >
                        {active && <Check className="w-3.5 h-3.5" />}
                      </button>
                    )
                  })}
                </div>
              )}
              <button type="button" onClick={() => remove(i)}
                className="rounded-full hover:bg-muted-foreground/20 p-0.5 shrink-0" aria-label={`Убрать «${r.text}»`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <SynonymBlock
              text={r.text}
              side="good"
              vacancyId={vacancyId}
              onAdd={syn => addSynonymToRow(i, syn)}
              onAddMany={syns => addSynonymsToRow(i, syns)}
              onRemove={syn => removeSynonym(i, syn)}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={ph} maxLength={1000} disabled={rows.length >= 10} className="h-9" />
        <Button type="button" size="icon" variant="outline" onClick={add}
          disabled={rows.length >= 10 || !draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── 🔴 «Не подходит по смыслу»: стоп-фактор vs минус к баллу ─────────────────

const BAD_KINDS = [
  { hard: true,  label: "Стоп-фактор",   solid: "bg-red-500"   },
  { hard: false, label: "Минус к баллу", solid: "bg-amber-500" },
] as const

function BadEditor({
  items, onChange, vacancyId, axesMode = false,
}: {
  items:      DealBreakerEntry[]
  onChange:   (next: DealBreakerItem[]) => void
  vacancyId:  string
  /** scoringMode==="axes": слайдер величины штрафа; holistic читает только hard → кружки. */
  axesMode?:  boolean
}) {
  const rows = normalizeDealBreakers(items)
  // Осевой режим — величина штрафа: −N баллов (0..100, шаг 5), 100 = полный
  // стоп (обнуление). Синхронизируем item.hard = (penalty>=100) для legacy.
  const setPenalty = (i: number, penalty: number) => {
    const p = Math.max(0, Math.min(100, penalty))
    onChange(rows.map((r, idx) => idx === i ? { ...r, penalty: p, hard: p >= 100 } : r))
  }
  // Holistic — движок читает только hard (стоп/минус), величина не действует.
  const setHard = (i: number, hard: boolean) => onChange(rows.map((r, idx) => idx === i ? { ...r, hard } : r))
  const remove  = (i: number) => onChange(rows.filter((_, idx) => idx !== i))

  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (rows.some(r => r.text.toLowerCase() === t.toLowerCase())) { toast.error("Уже есть такой пункт"); return }
    if (rows.length >= 10) { toast.error("Максимум 10"); return }
    onChange([...rows, { text: t, hard: true }])
    setDraft("")
  }
  const ph = LIST_PLACEHOLDERS.deal[rows.length % LIST_PLACEHOLDERS.deal.length] || ""

  /** Добавить синоним к критерию по индексу: дописываем через запятую, дедуп */
  const addSynonymToRow = (i: number, syn: string) => {
    const row = rows[i]
    if (!row) return
    if (row.text.toLowerCase().includes(syn.toLowerCase())) {
      toast.info(`«${syn}» уже есть в критерии`)
      return
    }
    onChange(rows.map((r, idx) => idx === i ? { ...r, text: `${r.text}, ${syn}` } : r))
  }

  /** Добавить несколько синонимов ОДНИМ onChange (дедуп). Возвращает добавленное. */
  const addSynonymsToRow = (i: number, syns: string[]): number => {
    const row = rows[i]
    if (!row) return 0
    const existing = row.text.toLowerCase()
    const seen = new Set<string>()
    const toAdd = syns.filter(s => {
      const k = s.trim().toLowerCase()
      if (!k || existing.includes(k) || seen.has(k)) return false
      seen.add(k); return true
    })
    if (toAdd.length === 0) return 0
    onChange(rows.map((r, idx) => idx === i ? { ...r, text: `${r.text}, ${toAdd.join(", ")}` } : r))
    return toAdd.length
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">
          По смыслу <span className="font-normal text-muted-foreground">— AI читает резюме</span>
        </Label>
        <ListCounter count={rows.length} max={10} />
      </div>
      {axesMode ? (
        <p className="text-xs text-muted-foreground">
          Насколько пункт снижает балл, если AI прямо видит это в резюме. Задайте величину штрафа справа:{" "}
          <b>100 = полный стоп</b> (кандидат обнуляется). Итог не опускается ниже 0 — минуса не бывает.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Стоп-фактор — отказ, только если AI прямо видит это в резюме. Минус к баллу — просто ниже балл, не отказ. Можно фразой. Кружок справа:{" "}
          <span className="text-red-600 dark:text-red-400">красный — стоп-фактор</span>,{" "}
          <span className="text-amber-600 dark:text-amber-400">янтарный — минус к баллу</span>.
        </p>
      )}
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="rounded-md border p-2">
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm min-w-0 break-words">{r.text}</span>
              {/* Осевой режим: величина штрафа степпером «− N б. +» (0..100, шаг 1, 100 = полный стоп).
                  Holistic: прежние кружки стоп/минус — движок читает только hard,
                  степпер там был бы мёртвым и молча снимал бы стоп-фактор. */}
              {axesMode ? (() => {
                const pen = dealBreakerPenalty(r)
                const full = pen >= 100
                return (
                  <div className="flex items-center gap-2 shrink-0" title="−N баллов (100 = полный стоп)">
                    <Stepper
                      value={pen}
                      onChange={v => setPenalty(i, v)}
                      min={0} max={100} step={1}
                      suffix=" б."
                      ariaLabel={`Штраф для «${r.text}»`}
                      valueClassName={cn(
                        "font-medium",
                        full ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
                      )}
                    />
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap w-[64px]">
                      {full ? "полный стоп" : "100 = стоп"}
                    </span>
                  </div>
                )
              })() : BAD_KINDS.map(k => {
                const active = r.hard === k.hard
                return (
                  <button key={String(k.hard)} type="button" onClick={() => setHard(i, k.hard)} title={k.label} aria-label={k.label}
                    className={cn(
                      "w-7 h-[22px] rounded-md border border-transparent flex items-center justify-center text-white shrink-0 transition-all",
                      k.solid,
                      active ? "opacity-100 shadow-sm" : "opacity-30 hover:opacity-60",
                    )}
                  >
                    {active && <Check className="w-3.5 h-3.5" />}
                  </button>
                )
              })}
              <button type="button" onClick={() => remove(i)}
                className="rounded-full hover:bg-muted-foreground/20 p-0.5 shrink-0" aria-label={`Убрать «${r.text}»`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <SynonymBlock
              text={r.text}
              side="bad"
              vacancyId={vacancyId}
              onAdd={syn => addSynonymToRow(i, syn)}
              onAddMany={syns => addSynonymsToRow(i, syns)}
              onRemove={syn => onChange(rows.map((rr, idx) => idx === i
                ? { ...rr, text: rr.text.split(",").map(s => s.trim()).filter(Boolean).filter(p => p !== syn).join(", ") }
                : rr))}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={ph} maxLength={1000} disabled={rows.length >= 10} className="h-9" />
        <Button type="button" size="icon" variant="outline" onClick={add}
          disabled={rows.length >= 10 || !draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── «Добавить свой» точный фактор (произвольное требование фразой → AI) ──────

function CustomFactorsEditor({
  items, onChange,
}: {
  items:    { label: string; enabled: boolean }[]
  onChange: (next: { label: string; enabled: boolean }[]) => void
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (items.some(x => x.label.toLowerCase() === t.toLowerCase())) { toast.error("Уже есть"); return }
    if (items.length >= 15) { toast.error("Максимум 15"); return }
    onChange([...items, { label: t, enabled: true }])
    setDraft("")
  }
  return (
    <div className="space-y-1.5">
      {items.map((f, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-1.5">
          <span className={cn("flex-1 text-sm min-w-0 break-words", !f.enabled && "text-muted-foreground line-through")}>{f.label}</span>
          <Switch checked={f.enabled}
            onCheckedChange={v => onChange(items.map((x, idx) => idx === i ? { ...x, enabled: v } : x))} />
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="rounded-full hover:bg-muted-foreground/20 p-0.5 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Убрать">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder="Напр. «Готовность к командировкам», «Образование высшее», «Без перерывов в стаже»"
          maxLength={160} className="h-8 text-sm" />
        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={add} disabled={!draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────

interface SpecEditorProps {
  vacancyId: string
  onSaved?:  () => void
  /** vacancies.portrait_scoring — оценивается ли вакансия из «Портрета» (новый контур). */
  portraitScoring?: boolean
  /** Вызвать после успешного «Перенести в Портрет» (рефетч вакансии). */
  onAdopted?: () => void
  /** «Далее → Контент» — переход на следующий этап. */
  onNavigateNext?: () => void
  /**
   * Переход в секцию «Коммуникации» (08.07: тексты приглашения/нерабочего
   * времени редактируются там, здесь — только сводка). Если не передан —
   * кнопка «Редактировать в Коммуникациях» не рендерится.
   */
  onNavigateToCommunications?: () => void
  /** Данные анкеты вакансии для AI-советчика зоны «Портрет».
   *  Если не передан — панель советчика не показывается. */
  vacancyAnketaData?: Record<string, unknown>
}

export function SpecEditor({ vacancyId, onSaved, portraitScoring, onAdopted, onNavigateNext, onNavigateToCommunications, vacancyAnketaData }: SpecEditorProps) {
  // #2: контент-блоки вакансии — для выбора, на какой блок отправлять приглашённого.
  // v1: только презентационные (демо) блоки → ссылка /demo/, без правок движка.
  const { blocks: contentBlocks, loading: contentBlocksLoading } = useContentBlocks(vacancyId)
  const inviteBlockChoices = contentBlocks.filter(b => b.contentType === "presentation")
  const [adopting, setAdopting] = useState(false)
  async function adoptPortrait() {
    setAdopting(true)
    try {
      const r = await fetch(`/api/modules/hr/vacancies/${vacancyId}/portrait-adopt`, { method: "POST" }).then(x => x.json())
      if (r?.error) { toast.error(r.error); return }
      toast.success("Вакансия переведена на «Портрет» — оценка идёт отсюда")
      onAdopted?.()
    } catch (e) {
      toast.error("Не удалось перевести: " + (e as Error).message)
    } finally { setAdopting(false) }
  }
  const [spec, setSpec]     = useState<CandidateSpec | null>(null)
  const [source, setSource] = useState<"spec" | "legacy" | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Излишки при переносе v1→v2 (то, что не влезло в лимиты must=10/nice=10/deal=6)
  const [overflow, setOverflow] = useState<{ must: string[]; nice: string[]; deal: string[] } | null>(null)

  // Спиннер для кнопки «Сохранить» в шапке «Портрета»
  const [isSaving, setIsSaving] = useState(false)

  // AI «Собрать из вакансии» (POST /requirements/suggest → подтверждающий диалог)
  const [suggesting, setSuggesting]         = useState(false)
  const [suggestionOpen, setSuggestionOpen] = useState(false)
  const [editedSuggestion, setEditedSuggestion] = useState<SuggestionResult | null>(null)
  const [suggestUnavailable, setSuggestUnavailable] = useState(false)

  // AI «Актуализировать» (POST /requirements/actualize → дифф-диалог, MERGE)
  const [actualizing, setActualizing]       = useState(false)
  const [actualizeOpen, setActualizeOpen]   = useState(false)
  const [actualizeDiff, setActualizeDiff]   = useState<ActualizeDiff | null>(null)
  const [actualizeSel, setActualizeSel]     = useState<ActualizeSelection>({
    addGood: {}, addBad: {}, keepGood: {}, keepBad: {},
  })

  // Проверка противоречий «Подходит» ↔ «Не подходит»
  const [conflictsChecking, setConflictsChecking]   = useState(false)
  const [conflictsResult, setConflictsResult]       = useState<ConflictItem[] | null>(null)

  // CSV-строка для города (как в VacancyStopFactorsSettings). Гражданство
  // теперь редактируется чипами через CitizenshipFactorField — своего
  // CSV-состояния не требует.
  const [cityCsv, setCityCsv]               = useState("")

  // Ref для PlaceholderBadges под единым текстом отказа блока стоп-факторов
  // (Юрий 08.07: один текст отказа на ВЕСЬ блок, а не на каждый фактор).
  const refRejection = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/core/spec/${vacancyId}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { spec?: CandidateSpec; source?: "spec" | "legacy" } | null) => {
        if (cancelled) return
        if (d?.spec) {
          setSpec(d.spec)
          setSource(d.source ?? null)
          setCityCsv((d.spec.stopFactors.city?.allowedCities ?? []).join(", "))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Универсальный апдейтер
  const patch = (p: Partial<CandidateSpec>) => setSpec(prev => prev ? { ...prev, ...p } : prev)

  // БАГФИКС 06.07 (расследование инцидента вакансии 6916): точечные хэндлеры
  // ниже раньше строили патч через `{ ...rt, поле: значение }`, где `rt` —
  // переменная, зафиксированная на момент РЕНДЕРА (const rt = spec.resumeThresholds
  // ниже по файлу). Если два разных поля resumeThresholds патчатся близко по
  // времени до того, как React успел перерендерить компонент между ними
  // (напр. быстрый тумблер + слайдер, программные события, двойной вызов в
  // React StrictMode) — второй патч спредил СТАРЫЙ `rt`, целиком заменяя ключ
  // resumeThresholds и теряя то, что записал первый патч (весь объект
  // resumeThresholds заменяется, а не глубоко мёржится). Функциональная форма
  // читает АКТУАЛЬНОЕ spec.resumeThresholds на момент применения апдейта —
  // безопасна при любом порядке/частоте вызовов.
  const patchThresholds = (fn: (rt: CandidateSpec["resumeThresholds"]) => CandidateSpec["resumeThresholds"]) =>
    setSpec(prev => prev ? { ...prev, resumeThresholds: fn(prev.resumeThresholds) } : prev)

  // «Идеальный профиль» — производное поле: авто-собирается из «Подходит/Не
  // подходит» и держится в синхроне (решение Юрия — обновляется само).
  useEffect(() => {
    if (!spec) return
    const composed = composeIdealProfile(spec)
    // Если все списки пусты (composed===""), НЕ затираем существующий профиль —
    // страхует легаси-спеки, где скоринг держался только на ручном эталоне.
    if (composed && composed !== (spec.idealProfile ?? "")) patch({ idealProfile: composed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.mustHave, spec?.niceToHave, spec?.dealBreakers])

  // Веса теперь независимы (Σ=100 снято, решение #4). Сумма нужна лишь для
  // отображения доли каждой оси «%». Движок нормирует на фактическую сумму.
  // ── Сохранение ─────────────────────────────────────────────────────────────
  const save = async () => {
    if (!spec) return
    // CSV → массивы перед отправкой
    const payload: CandidateSpec = {
      ...spec,
      // БАГФИКС 06.07 (вакансия 6916): rt может содержать undefined-поля, если
      // spec пришёл из старой/партиальной записи (до бэкфилла на чтении —
      // см. lib/core/spec/store.ts getSpec). JSON.stringify молча ВЫРЕЗАЕТ такие
      // ключи из тела запроса → сервер видит поле «отсутствующим» и подставляет
      // дефолт схемы (напр. rejectionDelayMinutes=60), затирая реально введённое
      // значение другого поля того же patch(). Коэрсим явно перед отправкой —
      // что видно в UI, то и уходит на сервер, без дыр.
      resumeThresholds: {
        ...spec.resumeThresholds,
        upperThreshold:        Number(spec.resumeThresholds.upperThreshold) || 0,
        lowerThreshold:         Number(spec.resumeThresholds.lowerThreshold) || 0,
        // rejectAction — источник истины (три сценария); autoRejectEnabled —
        // производное поле схемы для обратной совместимости легаси-читателей,
        // коэрсим явно на всякий случай (схема сама пересчитает на сервере).
        rejectAction:           spec.resumeThresholds.rejectAction === "pending_manual"
          || spec.resumeThresholds.rejectAction === "pending_rejection"
          ? spec.resumeThresholds.rejectAction
          : "none",
        autoRejectEnabled:      spec.resumeThresholds.autoRejectEnabled === true,
        autoInviteEnabled:      spec.resumeThresholds.autoInviteEnabled === true,
        rejectionDelayMinutes:  Number.isFinite(spec.resumeThresholds.rejectionDelayMinutes)
          ? spec.resumeThresholds.rejectionDelayMinutes
          : 60,
        inviteDelaySeconds:     Number.isFinite(spec.resumeThresholds.inviteDelaySeconds)
          ? spec.resumeThresholds.inviteDelaySeconds
          : 180,
        offHoursDelaySeconds:   Number.isFinite(spec.resumeThresholds.offHoursDelaySeconds)
          ? spec.resumeThresholds.offHoursDelaySeconds
          : 15,
      },
      anketaThresholds: {
        ...spec.anketaThresholds,
        upperThreshold: Number(spec.anketaThresholds.upperThreshold) || 0,
        lowerThreshold: Number(spec.anketaThresholds.lowerThreshold) || 0,
      },
      stopFactors: {
        ...spec.stopFactors,
        city: spec.stopFactors.city
          ? { ...spec.stopFactors.city, allowedCities: csvToList(cityCsv) }
          : undefined,
      },
    }
    const res = await fetch(`/api/core/spec/${vacancyId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null) as { error?: string } | null
      toast.error(err?.error || "Не удалось сохранить Spec")
      throw new Error(err?.error || "spec save failed")
    }
    const json = await res.json().catch(() => null) as { spec?: CandidateSpec } | null
    if (json?.spec) setSpec(json.spec)
    setSource("spec")
    toast.success("«Портрет» сохранён")
    onSaved?.()
  }

  // Регистрация в sticky-баре настроек (жёлтая точка на сабтабе + общая кнопка)
  useVacancySectionRegister({
    sectionKey:    `core-spec:${vacancyId}`,
    tabKey:        "spec",
    loaded,
    watchedValues: { spec, cityCsv },
    save,
  })

  // #44: «Далее → Контент» рендерит единая нижняя панель вакансии (VacancyTabFooter)
  // по каноническому v2-ряду, чтобы не задваивать кнопку перехода. Прежний
  // setNextAction слал кнопку в неиспользуемый VacancyStickySaveBar (мёртвый код) —
  // удалён. Навигация «Далее» с этого экрана идёт через футер.

  // ── Перенос v1-портрета → v2-критерии (Этап 2, п.3) ───────────────────────
  const canTransferFromPortrait = !!spec
    && spec.mustHave.length === 0
    && spec.portraitRequiredSkills.length > 0

  const transferFromPortrait = () => {
    if (!spec) return
    const must = spec.portraitRequiredSkills.slice(0, 10)
    const nice = spec.portraitNiceSkills.slice(0, 10)
    const deal = spec.portraitKnockouts.slice(0, 6)
    const over = {
      must: spec.portraitRequiredSkills.slice(10),
      nice: spec.portraitNiceSkills.slice(10),
      deal: spec.portraitKnockouts.slice(6),
    }
    patch({
      mustHave:     must,
      niceToHave:   spec.niceToHave.length ? spec.niceToHave : nice,
      dealBreakers: spec.dealBreakers.length ? spec.dealBreakers : deal,
      // idealProfile уже учитывает приоритет v2>v1 в мосте — не трогаем,
      // если заполнен; иначе он и так из aiIdealProfile.
    })
    const hasOverflow = over.must.length + over.nice.length + over.deal.length > 0
    setOverflow(hasOverflow ? over : null)
    toast.success(hasOverflow
      ? "Перенесено с обрезкой по лимитам — проверьте излишки ниже"
      : "Перенесено из Портрета — проверьте и сохраните")
  }

  // ── AI «Собрать из вакансии» ─────────────────────────────────────────────────
  const requestSuggestion = async () => {
    setSuggesting(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/requirements/suggest`, {
        method: "POST",
      })
      if (!res.ok) {
        if (res.status === 404 || res.status === 501) {
          setSuggestUnavailable(true)
          toast.error("AI-предложение недоступно")
          return
        }
        const err = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(err?.error || "suggest failed")
      }
      const json = await res.json() as { suggestion?: RawSuggestionResult }
      if (!json.suggestion) {
        toast.error("AI вернул пустой ответ")
        return
      }
      const niceToHaveWeights: Record<string, number> = {}
      for (const item of json.suggestion.nice_to_have) niceToHaveWeights[item.text] = item.weight
      setEditedSuggestion({
        must_have:     json.suggestion.must_have,
        nice_to_have:  json.suggestion.nice_to_have.map(item => item.text),
        niceToHaveWeights,
        deal_breakers: json.suggestion.deal_breakers,
        ideal_profile: json.suggestion.ideal_profile,
      })
      setSuggestionOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка предложения")
    } finally {
      setSuggesting(false)
    }
  }

  const applySuggestion = () => {
    if (!editedSuggestion || !spec) return
    // Контур «Портрет»: 🟢 «Подходит» не отсеивает → mustHave всегда пуст.
    // Эталонный дефолт (07.07): осевой скоринг — каждый пункт несёт вес оси
    // из AI-предложения (niceToHaveWeights, по тексту пункта). Пункты, которые
    // HR добавил/отредактировал в диалоге (текст не совпал с предложенным) —
    // без явного веса, buildAxes() поделит остаток бюджета поровну между ними.
    const niceToHave = [
      ...editedSuggestion.must_have,
      ...editedSuggestion.nice_to_have,
    ].slice(0, 5).map(text => {
      const weight = editedSuggestion.niceToHaveWeights[text]
      return {
        text,
        importance: "important" as NiceImportance,
        ...(typeof weight === "number" ? { weight } : {}),
      }
    })
    const dealBreakers = editedSuggestion.deal_breakers.slice(0, 10).map(text => ({ text, hard: false }))
    patch({
      idealProfile: editedSuggestion.ideal_profile.slice(0, 500),
      mustHave:     [],
      niceToHave,
      // Пред-заполнение НЕ создаёт жёстких стоп-факторов: deal_breakers от AI кладём
      // мягкими (hard:false = минус к баллу, не отказ). Жёсткий отсев HR включает сам,
      // осознанно — иначе «опыт B2B» зарубит того, кто написал «продавал CRM».
      dealBreakers,
      // Эталонный дефолт: сгенерированный набор сразу в осевом режиме (Юрий 07.07).
      scoringMode: "axes",
    })
    setSuggestionOpen(false)
    toast.success("Портрет заполнен из вакансии — проверьте и сохраните")
    // Автозапуск проверки противоречий один раз после applySuggestion
    const goodTexts = niceToHave.map(n => n.text)
    const badTexts  = dealBreakers.map(d => d.text)
    if (goodTexts.length > 0 && badTexts.length > 0) {
      void checkConflicts(goodTexts, badTexts)
    }
  }

  // ── AI «Актуализировать» (аддитивный дифф под изменившуюся вакансию) ─────────
  const requestActualize = async () => {
    if (!spec) return
    // Текущие тексты «Подходит» / «Не подходит» — отправляем AI для диффа.
    const currentGood = normalizeNiceToHave(spec.niceToHave).map(n => n.text)
    const currentBad  = normalizeDealBreakers(spec.dealBreakers).map(d => d.text)
    setActualizing(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/requirements/actualize`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ currentGood, currentBad }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null) as { error?: string } | null
        toast.error(err?.error || "Не удалось актуализировать")
        return
      }
      const json = await res.json() as { diff?: ActualizeDiff }
      if (!json.diff) { toast.error("AI вернул пустой ответ"); return }
      // Дефолты выбора: «добавить» — всё отмечено; «устарело» — всё оставлено.
      const addGood:  Record<string, boolean> = {}
      const addBad:   Record<string, boolean> = {}
      const keepGood: Record<string, boolean> = {}
      const keepBad:  Record<string, boolean> = {}
      json.diff.add.good.forEach(t => { addGood[t] = true })
      json.diff.add.bad.forEach(t => { addBad[t] = true })
      json.diff.maybe_outdated.good.forEach(t => { keepGood[t] = true })
      json.diff.maybe_outdated.bad.forEach(t => { keepBad[t] = true })
      setActualizeDiff(json.diff)
      setActualizeSel({ addGood, addBad, keepGood, keepBad })
      setActualizeOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка актуализации")
    } finally {
      setActualizing(false)
    }
  }

  /**
   * MERGE: добавляет отмеченные в «Подходит/Не подходит», удаляет снятые
   * «устаревшие», существующие НЕ затирает. Лимит ≤10 — при переборе
   * предупреждает (не режет молча). Использует patch(), как applySuggestion.
   */
  const applyActualize = () => {
    if (!actualizeDiff || !spec) return

    // Тексты, помеченные «устарело» и СНЯТЫЕ (keep=false) → к удалению.
    const removeGood = new Set(
      actualizeDiff.maybe_outdated.good
        .filter(t => !(actualizeSel.keepGood[t] ?? true))
        .map(t => t.trim().toLowerCase()),
    )
    const removeBad = new Set(
      actualizeDiff.maybe_outdated.bad
        .filter(t => !(actualizeSel.keepBad[t] ?? true))
        .map(t => t.trim().toLowerCase()),
    )

    // Текущие пункты минус удаляемые (порядок и важность/жёсткость сохранены).
    const keptNice = normalizeNiceToHave(spec.niceToHave)
      .filter(n => !removeGood.has(n.text.trim().toLowerCase()))
    const keptDeal = normalizeDealBreakers(spec.dealBreakers)
      .filter(d => !removeBad.has(d.text.trim().toLowerCase()))

    // Отмеченные «добавить» (дедуп против оставшихся — на случай совпадений).
    const keptNiceKeys = new Set(keptNice.map(n => n.text.trim().toLowerCase()))
    const keptDealKeys = new Set(keptDeal.map(d => d.text.trim().toLowerCase()))
    const addNice = actualizeDiff.add.good
      .filter(t => (actualizeSel.addGood[t] ?? true) && !keptNiceKeys.has(t.trim().toLowerCase()))
      // Новые — средний вес (как applySuggestion), HR усилит/ослабит вручную.
      .map(text => ({ text, importance: "important" as NiceImportance }))
    const addDeal = actualizeDiff.add.bad
      .filter(t => (actualizeSel.addBad[t] ?? true) && !keptDealKeys.has(t.trim().toLowerCase()))
      // Новые «не подходит» — мягкими (минус к баллу), как в applySuggestion.
      .map(text => ({ text, hard: false }))

    const nextNice: NiceToHaveItem[]   = [...keptNice, ...addNice]
    const nextDeal: DealBreakerItem[]  = [...keptDeal, ...addDeal]

    // Лимит ≤10 — НЕ режем молча: предупреждаем и не применяем переполненную часть.
    if (nextNice.length > 10 || nextDeal.length > 10) {
      const over: string[] = []
      if (nextNice.length > 10) over.push(`«Подходит»: ${nextNice.length}/10`)
      if (nextDeal.length > 10) over.push(`«Не подходит»: ${nextDeal.length}/10`)
      toast.error(`Перебор лимита (${over.join(", ")}). Снимите часть добавляемых или уберите устаревшие.`)
      return
    }

    patch({ niceToHave: nextNice, dealBreakers: nextDeal })
    setActualizeOpen(false)
    const addedCnt   = addNice.length + addDeal.length
    const removedCnt = removeGood.size + removeBad.size
    toast.success(
      addedCnt || removedCnt
        ? `Актуализировано: +${addedCnt}, −${removedCnt}. Проверьте и сохраните.`
        : "Изменений не выбрано",
    )
  }

  // ── Проверка противоречий ──────────────────────────────────────────────────
  const checkConflicts = async (goodOverride?: string[], badOverride?: string[]) => {
    if (!spec) return
    const good = goodOverride ?? [
      ...normalizeMustHave(spec.mustHave).map(m => m.text),
      ...normalizeNiceToHave(spec.niceToHave).map(n => n.text),
    ]
    const bad = badOverride ?? normalizeDealBreakers(spec.dealBreakers).map(d => d.text)
    if (good.length === 0 || bad.length === 0) {
      setConflictsResult([])
      return
    }
    setConflictsChecking(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/portrait/check-conflicts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ good, bad }),
      })
      const json = await res.json() as { conflicts?: ConflictItem[]; error?: string }
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Не удалось проверить противоречия")
        return
      }
      setConflictsResult(json.conflicts ?? [])
    } catch {
      toast.error("Ошибка проверки противоречий")
    } finally {
      setConflictsChecking(false)
    }
  }

  // ── Рендер ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Загрузка «Портрета»…</span>
      </div>
    )
  }

  if (!spec) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>Не удалось загрузить Spec</AlertTitle>
        <AlertDescription>
          Попробуйте обновить страницу. Если ошибка повторяется — таблица
          vacancy_specs ещё не создана на этом окружении (миграция 0197).
        </AlertDescription>
      </Alert>
    )
  }

  const sf = spec.stopFactors
  const rt = spec.resumeThresholds
  const setSf = (next: CandidateSpec["stopFactors"]) => patch({ stopFactors: next })
  const toggleFactor = (key: keyof CandidateSpec["stopFactors"], on: boolean) => {
    const current = (sf[key] ?? { enabled: false }) as Record<string, unknown>
    setSf({ ...sf, [key]: { ...current, enabled: on } } as CandidateSpec["stopFactors"])
  }
  const enabledFactorCount = (Object.values(sf) as Array<{ enabled?: boolean } | undefined>)
    .filter(f => f?.enabled).length
  // Точные требования: стандартные включённые факторы + включённые customFactors
  const exactFactorCount =
    (["city", "format", "age", "experience", "citizenship", "nativeLanguage", "salaryExpectation", "driverLicense", "jobHopping"] as const)
      .filter(k => sf[k]?.enabled).length +
    (sf.customFactors?.filter(f => f.enabled).length ?? 0)
  const dbItems   = normalizeDealBreakers(spec.dealBreakers)
  const dbHardCnt = dbItems.filter(d => d.hard).length
  const dbSoftCnt = dbItems.length - dbHardCnt

  // Есть ли вообще смысловые критерии для AI-оценки. Пусто → балл «плоский»,
  // Портрет ничего не различает. Точные требования (город/возраст) сюда НЕ
  // входят — это формальный отсев, а не то, по чему AI ставит балл 0–100.
  const goodCount  = normalizeMustHave(spec.mustHave).length + normalizeNiceToHave(spec.niceToHave).length
  const hasCriteria = goodCount > 0 || dbItems.length > 0

  return (
    <div className={vacancyAnketaData ? "flex flex-col lg:flex-row items-stretch lg:items-start gap-6" : undefined}>
    <div className="space-y-6 min-w-0 flex-1">
      {/* Контур оценки: «Портрет» (активен) либо предложение перенести */}
      {portraitScoring === true && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5 flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>Оценка резюме идёт <b>только из «Портрета»</b> — критерии, пороги и жёсткость берутся отсюда.</span>
        </div>
      )}
      {portraitScoring === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-3 flex items-start gap-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-amber-900 dark:text-amber-300">Вакансия на старом контуре оценки</div>
            <div className="text-amber-800 dark:text-amber-400/90 text-xs mt-0.5">
              Отбор управляется старыми настройками («Воронка» + конструктор). Перенесите на «Портрет», чтобы оценка шла только отсюда — текущие критерии и пороги сохранятся.
            </div>
          </div>
          <Button size="sm" onClick={adoptPortrait} disabled={adopting} className="shrink-0">
            {adopting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Перенести в Портрет
          </Button>
        </div>
      )}

      {/* Заголовок секции + «Заполнить из вакансии» (согласованный макет: кнопка наверху) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Портрет
          </h3>
          <p className="text-sm text-muted-foreground">
            Опишите, кого ищете — по этим настройкам AI оценивает каждое резюме. Сначала эталон, затем плюсы и минусы.
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2 grow">
          {/* «Актуализировать» — обновить под изменившуюся вакансию БЕЗ затирания
              текущих критериев (аддитивный дифф). Не путать с «Сгенерировать заново». */}
          <Button type="button" size="sm" variant="outline" onClick={requestActualize}
            disabled={actualizing || suggesting}
            title="Дополнит и подчистит текущие критерии под обновлённую вакансию — ничего не сотрёт">
            {actualizing
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Анализ…</>
              : <><Wand2 className="w-4 h-4 mr-1.5" /> Актуализировать</>}
          </Button>
          {!suggestUnavailable && (
            <div className="flex flex-col items-stretch gap-0.5">
              <Button type="button" size="sm" onClick={requestSuggestion} disabled={suggesting || actualizing}>
                {suggesting
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Анализ…</>
                  : <><Sparkles className="w-4 h-4 mr-1.5" /> Сгенерировать заново</>}
              </Button>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 text-center leading-tight">
                заменит текущие критерии
              </span>
            </div>
          )}
          {/* Бейдж источника («Собрано из текущих настроек» / «Сохранённый Spec») и
              результат «Проверить на противоречия» переехали в правую панель
              советника (PortraitAdvisor) — Юрий 07.07: подсказки Портрета справа,
              а не сверху над формой. */}
          {/* «Проверить на противоречия» — в ряд с верхними кнопками, амбер-цвет (отличается от синей/нейтральной) */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => checkConflicts()}
            disabled={conflictsChecking}
            className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            {conflictsChecking
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Проверяю…</>
              : <><AlertTriangle className="w-4 h-4 mr-1.5" /> Проверить на противоречия</>}
          </Button>
          {/* Кнопка «Сохранить» в шапке — зеркалит sticky-бар для удобства */}
          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            className="ml-auto"
            onClick={async () => {
              setIsSaving(true)
              try { await save() } finally { setIsSaving(false) }
            }}
          >
            {isSaving
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Сохранение…</>
              : <><Save className="w-4 h-4 mr-1.5" /> Сохранить</>}
          </Button>
        </div>
      </div>

      {/* Плашка переноса v1 → v2 */}
      {canTransferFromPortrait && (
        <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
          <ArrowRightLeft className="w-4 h-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-300">
            Перенести из старого «Портрета кандидата»
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Критерии (must-have) пусты, но в старом Портрете заполнены навыки
              ({spec.portraitRequiredSkills.length} обяз., {spec.portraitNiceSkills.length} желат.,
              {" "}{spec.portraitKnockouts.length} неприемлемо). Перенести их сюда одним кликом —
              без AI, простым копированием. После переноса проверьте и сохраните.
            </p>
            <Button type="button" size="sm" variant="outline"
              className="border-amber-500 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              onClick={transferFromPortrait}>
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> Перенести из Портрета
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Излишки после переноса */}
      {overflow && (
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>Не всё влезло в лимиты</AlertTitle>
          <AlertDescription className="text-sm space-y-1">
            {overflow.must.length > 0 && (
              <p>Обязательные (лимит 10): не перенесено — {overflow.must.join("; ")}</p>
            )}
            {overflow.nice.length > 0 && (
              <p>Желательные (лимит 10): не перенесено — {overflow.nice.join("; ")}</p>
            )}
            {overflow.deal.length > 0 && (
              <p>Неприемлемо (лимит 6): не перенесено — {overflow.deal.join("; ")}</p>
            )}
            <p className="text-muted-foreground">
              Сократите формулировки или объедините пункты, чтобы уложиться в лимиты.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Статус проверки противоречий («Проверить на противоречия») переехал
          в правую панель советника (PortraitAdvisor) — Юрий 07.07. */}
      {/* ── Заметная подсказка «критерии не заданы» ──────────────────────────
          Пусто в «Подходит»/«Не подходит» → AI ставит всем почти одинаковый
          балл (плоский, бесполезный). Показываем, только когда критериев нет,
          и ведём прямо к кнопке «Сгенерировать» (AI соберёт из вакансии). */}
      {!hasCriteria && (
        <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
          <Lightbulb className="w-4 h-4 text-amber-600" />
          <AlertTitle className="text-amber-900 dark:text-amber-300">
            Задайте критерии — иначе Портрет не сможет оценивать
          </AlertTitle>
          <AlertDescription className="space-y-2.5">
            <p className="text-sm text-amber-800 dark:text-amber-400/90">
              Пока «Подходит» и «Не подходит» пусты, AI ставит всем откликам почти
              одинаковый балл — отбор не работает. Опишите 3–5 пунктов ниже или дайте
              AI собрать их из названия и описания вакансии — вы проверите и поправите
              перед сохранением.
            </p>
            {!suggestUnavailable && (
              <Button type="button" size="sm" onClick={requestSuggestion} disabled={suggesting || actualizing}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                {suggesting
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Анализ…</>
                  : <><Sparkles className="w-4 h-4 mr-1.5" /> Предложить критерии</>}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Пояснение про бота */}
      <p className="text-xs text-muted-foreground -mt-2">
        Если бот включён — спорное он уточнит у кандидата и в «Подходит», и в «Не подходит», а не отрежет сразу.
      </p>

      {/* ── Тумблер «Осевой скоринг» (над «Что хотим видеть») ── */}
      <div className="rounded-lg border p-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Осевой скоринг</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Каждый пункт — отдельная ось, оценивается изолированно и только по явному тексту
            резюме; баллы делятся поровну (100 / число осей). Пустая ось не маскируется сильной.
          </p>
        </div>
        <Switch
          checked={spec.scoringMode === "axes"}
          onCheckedChange={v => patch({ scoringMode: v ? "axes" : "holistic" })}
        />
      </div>

      {/* ── 🟢 Подходит ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Подходит
          </CardTitle>
          <CardDescription>
            Что хотим видеть в кандидате — есть в резюме, плюс к баллу. Важность на каждом
            пункте; всё учитывается вместе. Например: «Опыт B2B-продаж 3+ года», «Знание
            Битрикс24», «Английский B1+».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoodEditor
            mustHave={spec.mustHave}
            niceToHave={spec.niceToHave}
            onChange={({ mustHave, niceToHave }) => patch({ mustHave, niceToHave })}
            vacancyId={vacancyId}
            axesMode={spec.scoringMode === "axes"}
          />
        </CardContent>
      </Card>

      {/* ── 🔴 Не подходит ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" /> Не подходит
          </CardTitle>
          <CardDescription>
            Что отсекает кандидата или роняет балл. <b>Стоп-фактор</b> — сразу мимо, если AI
            видит это в резюме (напр. «Только B2C без B2B-опыта»). <b>Минус к баллу</b> —
            просто ниже балл, не отказ (напр. «Меньше 1 года в роли»).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <BadEditor
            items={spec.dealBreakers}
            onChange={v => patch({ dealBreakers: v })}
            vacancyId={vacancyId}
            axesMode={spec.scoringMode === "axes"}
          />

          <div className="pt-4 border-t space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Точные требования</Label>
                {exactFactorCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Включено: {exactFactorCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Формальные условия — режут кодом ещё ДО AI. Рекомендуем не больше 3, иначе отсев слишком широкий.
              </p>
              {exactFactorCount > 3 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Каждый включённый фильтр сужает воронку. Рекомендуем до 3.
                </p>
              )}
            </div>
          <FactorRow
            title="Город / релокация"
            help="Если кандидат не из списка и не готов к переезду — стоп"
            enabled={sf.city?.enabled ?? false}
            onToggle={v => toggleFactor("city", v)}
          >
            <div className="space-y-2">
              <Input
                value={cityCsv}
                onChange={e => setCityCsv(e.target.value)}
                placeholder="Москва, Московская область, Санкт-Петербург"
                className="h-8 text-sm"
              />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={Boolean(sf.city?.allowRelocation)}
                  onCheckedChange={v => setSf({ ...sf, city: { ...(sf.city ?? { enabled: true }), allowRelocation: Boolean(v) } })}
                />
                Засчитывать готовность к переезду как валидную
              </label>
              {cityCsv.trim()
                ? <FactorSummary
                    pass={`Пропускаем: ${cityCsv.trim()}${sf.city?.allowRelocation ? " + готовых к переезду" : ""}.`}
                    cut="Авто-отказ кандидатам из других городов."
                  />
                : <FactorSummary idle="Города не указаны — фактор не действует." />}
            </div>
          </FactorRow>

          {/* Семантика инвертируемая на глаз (инцидент 03.07: «Офис» отметили,
              думая что отсеивают офисных, а галочки — кого ПРОПУСКАЕМ) —
              явная подпись + живая сводка, как в vacancy-stop-factors-settings. */}
          <FactorRow
            title="Формат работы"
            help="Галочки — форматы, которые ПОДХОДЯТ вакансии. Кандидат, который хочет другой формат, получит авто-отказ"
            enabled={sf.format?.enabled ?? false}
            onToggle={v => toggleFactor("format", v)}
          >
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Пропускаем кандидатов с форматом:</p>
              <div className="flex gap-3">
                {FORMAT_OPTIONS.map(f => (
                  <label key={f.id} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={(sf.format?.allowedFormats ?? []).includes(f.id)}
                      onCheckedChange={v => {
                        const current = sf.format?.allowedFormats ?? []
                        const next = v ? [...new Set([...current, f.id])] : current.filter(x => x !== f.id)
                        setSf({ ...sf, format: { ...(sf.format ?? { enabled: true }), allowedFormats: next } })
                      }}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
              {(() => {
                const allowed = sf.format?.allowedFormats ?? []
                if (allowed.length === 0) {
                  return <p className="text-[11px] text-muted-foreground">Ничего не отмечено — фактор не действует.</p>
                }
                const pass = FORMAT_OPTIONS.filter(f => allowed.includes(f.id)).map(f => f.label).join(", ")
                const cut = FORMAT_OPTIONS.filter(f => !allowed.includes(f.id)).map(f => f.label).join(", ")
                return (
                  <p className="text-[11px] leading-snug">
                    <span className="text-success">Пропускаем: {pass}.</span>{" "}
                    {cut && <span className="text-destructive">Авто-отказ тем, кто хочет: {cut}.</span>}
                  </p>
                )
              })()}
            </div>
          </FactorRow>

          <FactorRow
            title="Возраст"
            help="Диапазон лет"
            enabled={sf.age?.enabled ?? false}
            onToggle={v => toggleFactor("age", v)}
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={sf.age?.minAge ?? ""}
                onChange={e => setSf({ ...sf, age: { ...(sf.age ?? { enabled: true }), minAge: e.target.value === "" ? undefined : Number(e.target.value) } })}
                placeholder="мин"
                className="w-20 h-8 text-sm"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="number"
                value={sf.age?.maxAge ?? ""}
                onChange={e => setSf({ ...sf, age: { ...(sf.age ?? { enabled: true }), maxAge: e.target.value === "" ? undefined : Number(e.target.value) } })}
                placeholder="макс"
                className="w-20 h-8 text-sm"
              />
            </div>
            {(() => {
              const min = sf.age?.minAge, max = sf.age?.maxAge
              if (min == null && max == null) return <FactorSummary idle="Границы не заданы — фактор не действует." />
              const parts = [min != null ? `младше ${min}` : null, max != null ? `старше ${max}` : null].filter(Boolean)
              return <FactorSummary pass={`Пропускаем: ${min ?? "…"}–${max ?? "…"} лет.`} cut={`Авто-отказ: ${parts.join(" и ")}.`} />
            })()}
          </FactorRow>

          <FactorRow
            title="Минимальный опыт"
            help="Меньше указанного — стоп"
            enabled={sf.experience?.enabled ?? false}
            onToggle={v => toggleFactor("experience", v)}
          >
            <Input
              type="number"
              value={sf.experience?.minYears ?? ""}
              onChange={e => setSf({ ...sf, experience: { ...(sf.experience ?? { enabled: true }), minYears: e.target.value === "" ? undefined : Number(e.target.value) } })}
              placeholder="лет"
              className="w-24 h-8 text-sm"
            />
            {sf.experience?.minYears != null
              ? <FactorSummary pass={`Пропускаем: опыт от ${sf.experience.minYears} лет.`} cut={`Авто-отказ: опыт меньше ${sf.experience.minYears} лет.`} />
              : <FactorSummary idle="Порог не задан — фактор не действует." />}
          </FactorRow>

          <FactorRow
            title="Гражданство"
            help="Разрешить только выбранные страны, либо исключить страны/континенты"
            enabled={sf.citizenship?.enabled ?? false}
            onToggle={v => toggleFactor("citizenship", v)}
          >
            <CitizenshipFactorField
              value={sf.citizenship}
              onChange={next => setSf({ ...sf, citizenship: next })}
            />
            {(() => {
              const s = citizenshipSummary(sf.citizenship)
              return s.idle
                ? <FactorSummary idle={s.idle} />
                : <FactorSummary pass={s.pass} cut={s.cut} />
            })()}
          </FactorRow>

          <FactorRow
            title="Родной язык"
            help="Родной язык из резюме hh. Разрешить только выбранные, либо исключить"
            enabled={sf.nativeLanguage?.enabled ?? false}
            onToggle={v => toggleFactor("nativeLanguage", v)}
          >
            <NativeLanguageFactorField
              value={sf.nativeLanguage}
              onChange={next => setSf({ ...sf, nativeLanguage: next })}
            />
            {(() => {
              const s = nativeLanguageSummary(sf.nativeLanguage)
              return s.idle
                ? <FactorSummary idle={s.idle} />
                : <FactorSummary pass={s.pass} cut={s.cut} />
            })()}
          </FactorRow>

          <FactorRow
            title="Часовой пояс"
            help="Не отказ — только штраф к баллу за удалённость пояса"
            enabled={sf.timezone?.enabled ?? false}
            onToggle={v => toggleFactor("timezone", v)}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Наш пояс (UTC+)</Label>
                <Input
                  type="number"
                  value={sf.timezone?.baseUtcOffset ?? 3}
                  onChange={e => setSf({ ...sf, timezone: { ...(sf.timezone ?? TZ_FACTOR_DEFAULTS), baseUtcOffset: e.target.value === "" ? 3 : Number(e.target.value) } })}
                  className="w-20 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Допустимая разница ± часов</Label>
                <Input
                  type="number"
                  min={0}
                  value={sf.timezone?.maxDiffHours ?? 3}
                  onChange={e => setSf({ ...sf, timezone: { ...(sf.timezone ?? TZ_FACTOR_DEFAULTS), maxDiffHours: e.target.value === "" ? 3 : Number(e.target.value) } })}
                  className="w-20 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Штраф к баллу</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={sf.timezone?.penalty ?? 15}
                  onChange={e => setSf({ ...sf, timezone: { ...(sf.timezone ?? TZ_FACTOR_DEFAULTS), penalty: e.target.value === "" ? 15 : Number(e.target.value) } })}
                  className="w-20 h-8 text-sm"
                />
              </div>
            </div>
            <FactorSummary idle={`Кандидатам дальше ±${sf.timezone?.maxDiffHours ?? 3} часов от нашего пояса (UTC+${sf.timezone?.baseUtcOffset ?? 3}) балл снижается на ${sf.timezone?.penalty ?? 15}. Пояс определяется по городу из резюме; неизвестный город не штрафуется.`} />
          </FactorRow>

          <FactorRow
            title="Макс. зарплатные ожидания"
            help="Если кандидат хочет больше — стоп"
            enabled={sf.salaryExpectation?.enabled ?? false}
            onToggle={v => toggleFactor("salaryExpectation", v)}
          >
            <Input
              type="number"
              value={sf.salaryExpectation?.maxAmount ?? ""}
              onChange={e => setSf({ ...sf, salaryExpectation: { ...(sf.salaryExpectation ?? { enabled: true }), maxAmount: e.target.value === "" ? undefined : Number(e.target.value) } })}
              placeholder="₽"
              className="w-32 h-8 text-sm"
            />
            {sf.salaryExpectation?.maxAmount != null
              ? <FactorSummary pass={`Пропускаем: ожидания до ${sf.salaryExpectation.maxAmount.toLocaleString("ru-RU")} ₽.`} cut="Авто-отказ тем, кто хочет больше." />
              : <FactorSummary idle="Потолок не задан — фактор не действует." />}
          </FactorRow>

          <FactorRow
            title="Водительские права"
            help="Нужны указанные категории — иначе стоп. Оценивает AI по резюме"
            enabled={sf.driverLicense?.enabled ?? false}
            onToggle={v => toggleFactor("driverLicense", v)}
          >
            <div className="flex flex-wrap gap-1.5">
              {["A", "B", "C", "D", "BE", "CE"].map(cat => {
                const active = (sf.driverLicense?.requiredCategories ?? []).includes(cat)
                return (
                  <button key={cat} type="button"
                    onClick={() => {
                      const cur = sf.driverLicense?.requiredCategories ?? []
                      const next = active ? cur.filter(c => c !== cat) : [...cur, cat]
                      setSf({ ...sf, driverLicense: { ...(sf.driverLicense ?? { enabled: true }), requiredCategories: next } })
                    }}
                    className={cn(
                      "text-xs px-2.5 py-0.5 rounded-md border transition-colors",
                      active ? "bg-primary text-primary-foreground border-transparent" : "text-muted-foreground border-border hover:text-foreground",
                    )}
                  >{cat}</button>
                )
              })}
            </div>
            {(sf.driverLicense?.requiredCategories ?? []).length > 0
              ? <FactorSummary pass={`Пропускаем: есть категории ${(sf.driverLicense!.requiredCategories!).join(", ")}.`} cut="Авто-отказ без указанных категорий." />
              : <FactorSummary idle="Категории не выбраны — фактор не действует." />}
          </FactorRow>

          <FactorRow
            title="Частая смена работы"
            help="Слишком много мест за короткий срок — стоп. Оценивает AI по истории опыта"
            enabled={sf.jobHopping?.enabled ?? false}
            onToggle={v => toggleFactor("jobHopping", v)}
          >
            <div className="flex items-center gap-1.5 text-sm flex-wrap">
              <span className="text-muted-foreground">больше</span>
              <Input
                type="number"
                value={sf.jobHopping?.maxJobs ?? 3}
                onChange={e => setSf({ ...sf, jobHopping: { ...(sf.jobHopping ?? { enabled: true }), maxJobs: Math.max(1, Number(e.target.value) || 3) } })}
                className="w-14 h-8 text-sm text-center"
              />
              <span className="text-muted-foreground">мест за</span>
              <Input
                type="number"
                value={sf.jobHopping?.withinYears ?? 2}
                onChange={e => setSf({ ...sf, jobHopping: { ...(sf.jobHopping ?? { enabled: true }), withinYears: Math.max(1, Number(e.target.value) || 2) } })}
                className="w-14 h-8 text-sm text-center"
              />
              <span className="text-muted-foreground">г./лет</span>
            </div>
            <FactorSummary
              pass={`Пропускаем: до ${sf.jobHopping?.maxJobs ?? 3} мест за ${sf.jobHopping?.withinYears ?? 2} г.`}
              cut={`Авто-отказ: больше ${sf.jobHopping?.maxJobs ?? 3} мест за ${sf.jobHopping?.withinYears ?? 2} г.`}
            />
          </FactorRow>

            <div className="pt-1 space-y-1.5">
              <Label className="text-xs font-medium">Добавить свой</Label>
              <p className="text-[11px] text-muted-foreground">
                Любое точное требование фразой — оценит AI по резюме (образование, командировки,
                перерывы в стаже, тип занятости и т.п.).
              </p>
              <CustomFactorsEditor
                items={sf.customFactors ?? []}
                onChange={v => setSf({ ...sf, customFactors: v })}
              />
            </div>

            <div className="pt-3 mt-1 border-t space-y-1.5">
              <Label className="text-xs font-medium">Текст отказа — один на все стоп-факторы</Label>
              <p className="text-[11px] text-muted-foreground">
                Отправляется кандидату, если он не прошёл по любому включённому стоп-фактору.
                <b> Не указывайте причину отказа</b> (возраст, гражданство, пол и т.п.) — по ТК РФ это незаконно.
                Пусто → отправим стандартный нейтральный отказ.
              </p>
              <FactorRejectionText
                refEl={refRejection}
                value={sf.rejectionText ?? ""}
                onChange={v => setSf({ ...sf, rejectionText: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 🤖 Спорное уточняет бот ── */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3.5 py-3">
        <Wand2 className="w-4 h-4 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <Label className="text-sm font-medium">Спорное уточняет бот в чате</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Если AI не уверен на 100% — не резать сразу, а дать боту уточнить у кандидата.
          </p>
        </div>
        <Switch
          checked={spec.botClarifyAmbiguous ?? false}
          onCheckedChange={v => patch({ botClarifyAmbiguous: v })}
        />
      </div>

      {/* ── Как считается балл: одним блоком, всегда видно (без раскрывашки) ── */}
      <div className="rounded-lg border bg-muted/30 px-3.5 py-2.5 text-sm space-y-1.5">
        <p className="font-medium">«Подходит» и «Не подходит» формируют балл <b>0–100</b>. Ниже — что с этим баллом делать.</p>
        <ul className="list-disc pl-4 space-y-1 text-xs text-muted-foreground">
          <li><b>«Подходит»</b> — каждый плюс тянет балл вверх; вес зависит от важности (желательно &lt; важно &lt; обязательно). Нет плюса → балл ниже, но <b>не отказ</b>.</li>
          <li><b>«Не подходит»</b> — стоп-фактор (AI прямо видит в резюме) резко роняет балл / отказ; «минус к баллу» просто снижает.</li>
          <li><b>«Точные требования»</b> — формальные отсечки (город, опыт, права…).</li>
        </ul>
      </div>

      {/* ── Идеальный профиль: производное от «Подходит/Не подходит», только чтение (выше авто-отбора) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4" /> Идеальный профиль
          </CardTitle>
          <CardDescription>
            Эталон-рамка для AI. Собирается автоматически из «Подходит / Не подходит» — менять вручную не нужно.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spec.idealProfile.trim() ? (
            <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground">{spec.idealProfile}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Заполните «Подходит» и «Не подходит» — профиль соберётся сам.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Автоматический отбор по баллу: два независимых действия (отказ / приглашение) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Автоматический отбор по баллу
          </CardTitle>
          <CardDescription>
            AI ставит балл 0–100. Авто-отказ и авто-приглашение включаются <b>независимо</b> — можно отказывать слабым, но сильных не звать сразу (и наоборот).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 3 зоны — подписи отражают, какие действия включены */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className={cn("rounded-md border py-2", rt.rejectAction !== "none" ? "border-red-400/40 bg-red-500/10" : "border-border bg-muted/30")}>
              <div className={cn("font-bold", rt.rejectAction !== "none" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>&lt; {rt.lowerThreshold}</div>
              <div className="text-muted-foreground">
                {rt.rejectAction === "pending_rejection" ? "отказ" : rt.rejectAction === "pending_manual" ? "пред. отказ (ручной)" : "ручной разбор"}
              </div>
            </div>
            <div className="rounded-md border border-amber-400/40 bg-amber-500/10 py-2">
              <div className="font-bold text-amber-600 dark:text-amber-400">{rt.lowerThreshold}–{Math.max(rt.lowerThreshold, rt.upperThreshold - 1)}</div>
              <div className="text-muted-foreground">{!(rt.autoInviteEnabled ?? false) ? "ручной разбор" : spec.botClarifyAmbiguous ? "уточнить ботом" : "на демо"}</div>
            </div>
            <div className={cn("rounded-md border py-2", (rt.autoInviteEnabled ?? false) ? "border-emerald-400/40 bg-emerald-500/10" : "border-border bg-muted/30")}>
              <div className={cn("font-bold", (rt.autoInviteEnabled ?? false) ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>≥ {rt.upperThreshold}</div>
              <div className="text-muted-foreground">{(rt.autoInviteEnabled ?? false) ? (NEXT_STEP_LABEL[rt.inviteNextStep ?? "demo"] ?? "приглашение") : "ручной разбор"}</div>
            </div>
          </div>

          {/* Авто-отказ по резюме: сценарий + порог + задержка + письмо отказа.
              БАГФИКС/ДОПОЛНЕНИЕ 06.07 (вакансия 6916): один тумблер autoRejectEnabled
              заменён на трёхвариантный сценарий rejectAction — та же семантика,
              что anketaPassInvite.failAction ниже («Если не прошёл гейт»):
                "none"              — ничего не делать (легаси-эквивалент выкл. тумблера).
                "pending_manual"    — пометка на ручной разбор HR, БЕЗ таймера,
                                      письмо НЕ уходит само (lib/hh/entry-gate.ts).
                "pending_rejection" — отложенный авто-отказ через N минут (прежнее
                                      поведение тумблера ВКЛ). */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="min-w-0">
              <Label className="text-sm font-medium">Авто-отказ по резюме</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Балл &lt; {rt.lowerThreshold} → что делать с кандидатом. «Ничего» — слабые ждут ручного разбора.</p>
            </div>
            <Select
              value={rt.rejectAction}
              onValueChange={v => patchThresholds(rt => ({
                ...rt,
                rejectAction: v as "none" | "pending_manual" | "pending_rejection",
                enabled: true,
              }))}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ничего не делать</SelectItem>
                <SelectItem value="pending_manual">Предварительный отказ — пометка на ручной разбор, письмо не уходит</SelectItem>
                <SelectItem value="pending_rejection">Отказ — авто-отправка через N минут</SelectItem>
              </SelectContent>
            </Select>
            {rt.rejectAction !== "none" && (<>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs">Порог отказа (ниже балл — отказ)</Label>
                  <span className="text-sm font-bold text-red-600">&lt;{rt.lowerThreshold}</span>
                </div>
                <Slider
                  value={[rt.lowerThreshold]}
                  onValueChange={([v]) => patchThresholds(rt => ({ ...rt, lowerThreshold: v }))}
                  min={0} max={95} step={5}
                />
              </div>
              {rt.rejectAction === "pending_rejection" && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Задержка отказа, мин</Label>
                  <Input
                    type="number"
                    value={rt.rejectionDelayMinutes}
                    onChange={e => patchThresholds(rt => ({ ...rt, rejectionDelayMinutes: Math.max(0, Number(e.target.value) || 0) }))}
                    className="w-24 h-8 text-sm"
                  />
                  {rt.rejectionDelayMinutes >= 60 && (
                    <span className="text-[11px] text-muted-foreground">= {Math.floor(rt.rejectionDelayMinutes / 60)} ч{rt.rejectionDelayMinutes % 60 ? ` ${rt.rejectionDelayMinutes % 60} мин` : ""}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">Отложенный отказ — мгновенный воспринимается тяжелее</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Письмо отказа (мягкое)</Label>
                <p className="text-[11px] text-muted-foreground">«{"{{имя}}"}» подставится само. Тон мягкий, без причин отказа.</p>
                <Textarea
                  value={spec.rejectLetter || DEFAULT_REJECT_LETTER}
                  onChange={e => patch({ rejectLetter: e.target.value.slice(0, 2000) })}
                  rows={4}
                  maxLength={2000}
                />
              </div>
            </>)}
          </div>

          {/* Авто-приглашение + выбор следующего этапа */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Label className="text-sm font-medium">Авто-приглашение</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Балл ≥ {rt.upperThreshold} → система сама зовёт дальше. Выкл — сильные ждут вашего решения.</p>
              </div>
              <Switch
                checked={rt.autoInviteEnabled ?? false}
                onCheckedChange={v => patchThresholds(rt => ({ ...rt, autoInviteEnabled: v, enabled: true }))}
              />
            </div>
            {(rt.autoInviteEnabled ?? false) && (<>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs">Порог приглашения (выше балл — приглашаем)</Label>
                  <span className="text-sm font-bold text-emerald-600">≥{rt.upperThreshold}</span>
                </div>
                <Slider
                  value={[rt.upperThreshold]}
                  onValueChange={([v]) => patchThresholds(rt => ({ ...rt, upperThreshold: v }))}
                  min={0} max={100} step={5}
                />
                {rt.upperThreshold === 0 && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Порог 0 — приглашаем всех (любой балл ≥ 0).</p>
                )}
              </div>
              {/* 08.07: текст приглашения, задержка и нерабочее время — единое
                  хранилище с секцией «Коммуникации» (components/vacancies/
                  first-contact-settings.tsx), редактируются там. Здесь —
                  компактная read-only сводка (значения ОСТАЮТСЯ в state
                  спеки — round-trip'ятся в PUT целиком, просто не
                  редактируются из этой формы). */}
              <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <Label className="text-xs flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Текст приглашения и нерабочее время</Label>
                  {onNavigateToCommunications && (
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-6 px-2 text-[11px] shrink-0"
                      onClick={onNavigateToCommunications}
                    >
                      Редактировать в Коммуникациях
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {(spec.inviteLetter || DEFAULT_INVITE_MESSAGE).slice(0, 120)}
                  {(spec.inviteLetter || DEFAULT_INVITE_MESSAGE).length > 120 ? "…" : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Задержка приглашения: <b>{formatDelayLabel(rt.inviteDelaySeconds ?? 180)}</b>
                  {" · "}Нерабочее время: <b>{(rt.offHoursEnabled ?? true) ? "вкл" : "выкл"}</b>
                  {(rt.offHoursEnabled ?? true) ? `, ${formatDelayLabel(rt.offHoursDelaySeconds ?? 15)}` : ""}
                </p>
              </div>
              {/* Контент-блок: что реально увидит приглашённый */}
              {inviteBlockChoices.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Что покажем приглашённому (контент-блок)</Label>
                  <Select
                    value={rt.inviteContentBlockId ?? "__live__"}
                    onValueChange={v => patchThresholds(rt => ({ ...rt, inviteContentBlockId: v === "__live__" ? null : v }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__live__">По умолчанию (боевой блок вакансии)</SelectItem>
                      {inviteBlockChoices.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">По умолчанию — блок, помеченный «боевым» в табе «Контент». Можно отправить на конкретный демо-блок из нескольких.</p>
                </div>
              )}
              {/* #4 hh-стадия: одиночные метки, дефолт «Первичный контакт» */}
              <div className="space-y-1.5">
                <Label className="text-xs">Стадия в hh.ru при приглашении</Label>
                <Select
                  value={rt.inviteHhStage ?? "consider"}
                  onValueChange={v => patchThresholds(rt => ({ ...rt, inviteHhStage: v as "phone_interview" | "consider" | "interview" | "assessment" }))}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consider">Первичный контакт</SelectItem>
                    <SelectItem value="phone_interview">Телефонное интервью</SelectItem>
                    <SelectItem value="interview">Собеседование</SelectItem>
                    <SelectItem value="assessment">Тестовое задание</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Куда кандидат попадёт в воронке работодателя на hh.ru. По умолчанию — «Первичный контакт».</p>
              </div>
              {/* #3 Итог: куда реально переводится кандидат */}
              <p className="text-[11px] text-muted-foreground rounded-md bg-muted/40 px-2.5 py-1.5 leading-relaxed">
                Итог: приглашённый получит ссылку на <b>{rt.inviteContentBlockId ? (inviteBlockChoices.find(b => b.id === rt.inviteContentBlockId)?.title ?? "выбранный блок") : "боевой демо-блок"}</b> и перейдёт в воронке hh.ru в стадию <b>{({ consider: "Первичный контакт", phone_interview: "Телефонное интервью", interview: "Собеседование", assessment: "Тестовое задание" } as Record<string, string>)[rt.inviteHhStage ?? "consider"]}</b>.
              </p>
            </>)}
          </div>
        </CardContent>
      </Card>

      {/* «Оценка анкеты (после демо)» перенесена в настройки анкеты (блок «После демо»). */}

      {/* ── После анкеты → 2-я часть «Путь менеджера» по баллу анкеты (Фаза 1; OFF by default) ── */}
      {(() => {
        // getSpec отдаёт сырой спек без дефолтов → у старых вакансий поля нет.
        // Fallback, иначе ap.enabled крашит Портрет (инцидент 30.06).
        const ap = spec.anketaPassInvite ?? { enabled: false, passThreshold: 35, aiEvalThreshold: 55, contentBlockId: null, messageText: "", delaySeconds: 900, transferMode: "both" as const, inlineContinue: true, passScreenTitle: "", passScreenText: "", passScreenButtonLabel: "", failScreenTitle: "", failScreenText: "", failAction: "none" as const, failRejectDelayMinutes: 60 }
        // Действие для НЕ прошедших гейт (старые спеки без поля → "none").
        // БАГФИКС 06.07: раньше распознавался только "pending_rejection" —
        // значение "pending_manual" (реально стоит у вакансии 6916) молча
        // схлопывалось до "none" в отображении, хотя в бэке (answer/route.ts)
        // обрабатывалось корректно. Три сценария схемы (types.ts failAction) —
        // все три должны доходить до UI как есть.
        const failActionRaw = (ap as { failAction?: "none" | "pending_manual" | "pending_rejection" }).failAction
        const failAction: "none" | "pending_manual" | "pending_rejection" =
          failActionRaw === "pending_manual" || failActionRaw === "pending_rejection" ? failActionRaw : "none"
        const failRejectDelayMinutes =
          typeof (ap as { failRejectDelayMinutes?: number }).failRejectDelayMinutes === "number"
            ? (ap as { failRejectDelayMinutes?: number }).failRejectDelayMinutes as number
            : 60
        // Порог AI-оценки может отсутствовать у старых спеков — дефолт 55 (как в схеме).
        const aiEvalThreshold = typeof ap.aiEvalThreshold === "number" ? ap.aiEvalThreshold : 55
        // Режим перехода. Обратная совместимость: старые спеки без transferMode →
        // маппинг из inlineContinue (false ⇒ message, иначе both).
        const transferMode: "seamless" | "message" | "both" =
          ap.transferMode === "seamless" || ap.transferMode === "message" || ap.transferMode === "both"
            ? ap.transferMode
            : ((ap as { inlineContinue?: boolean }).inlineContinue === false ? "message" : "both")
        const showSeamless = transferMode === "seamless" || transferMode === "both"
        const showMessage  = transferMode === "message"  || transferMode === "both"

        // Критерий «2-я часть контента реально существует» — тот же, что
        // проверяет отправка приглашения (lib/messaging/second-demo-invite.ts:220-228):
        // demos-строка этой вакансии с id === anketaPassInvite.contentBlockId.
        // contentBlocks (useContentBlocks выше) — клиентское зеркало таблицы demos
        // этой вакансии, тот же список, что наполняет Select ниже.
        const hasAnyContentBlock = contentBlocks.length > 0
        const assignedBlock = ap.contentBlockId ? contentBlocks.find(b => b.id === ap.contentBlockId) : undefined
        // Рассинхрон: тумблер включён, а назначенного блока нет (не выбран или
        // был удалён после включения) — приглашение реально слать некуда
        // (see "no_content_block"/"content_block_not_found" в second-demo-invite.ts).
        const isMisconfigured = ap.enabled && !assignedBlock
        // Прячем карточку только когда выключено И контента для неё нет вовсе —
        // иначе HR не сможет ни включить, ни узнать, что рассинхрон есть.
        // Не прячем, пока контент-блоки ещё грузятся (иначе карточка мигает у
        // вакансий с реально существующим контентом — гвард 07.07).
        if (!ap.enabled && !hasAnyContentBlock && !contentBlocksLoading) return null
        const cardTitle = assignedBlock?.title
          ? `После анкеты → 2-я часть «${assignedBlock.title}»`
          : "После анкеты → 2-я часть демо"
        return (
          <Card className={isMisconfigured ? "border-amber-300" : undefined}>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{cardTitle}</h3>
                  <p className="text-xs text-muted-foreground">
                    Приглашаем во 2-ю часть, если объективный балл по выбору ≥ порога <b>ИЛИ</b> AI-оценка
                    ответов анкеты ≥ своего порога (достаточно любого из двух — сильные по сути ответы
                    проходят даже при низком объективном балле). Открытые/AI-вопросы в объективный балл
                    не входят — он стабильный. ✓-варианты в «Контенте» = эталон.
                  </p>
                </div>
                <Switch checked={ap.enabled} onCheckedChange={v => patch({ anketaPassInvite: { ...ap, enabled: v } })} />
              </div>
              {isMisconfigured && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-3 flex items-start gap-2.5 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-amber-900 dark:text-amber-300">
                      Включено приглашение во 2-ю часть, но контент не найден
                    </div>
                    <div className="text-amber-800 dark:text-amber-400/90 text-xs mt-0.5">
                      Добавьте контент-блок 2-й части (см. вкладку «Контент») и выберите его ниже, или выключите приглашение.
                    </div>
                  </div>
                </div>
              )}
              {ap.enabled && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Порог теста (объективный балл по выбору): <b>{ap.passThreshold}</b> из 100 (≥ — приглашаем; ~70 = оба контрольных вопроса верно)</Label>
                    <Slider min={0} max={100} step={1} value={[ap.passThreshold]} onValueChange={([v]) => patch({ anketaPassInvite: { ...ap, passThreshold: v } })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Порог AI-оценки ответов: <b>{aiEvalThreshold}</b> из 100 (<b>ИЛИ</b> — достаточно любого из двух порогов)</Label>
                    <Slider min={0} max={100} step={1} value={[aiEvalThreshold]} onValueChange={([v]) => patch({ anketaPassInvite: { ...ap, aiEvalThreshold: v } })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Контент-блок 2-й части</Label>
                    <Select value={ap.contentBlockId ?? "__none__"} onValueChange={v => patch({ anketaPassInvite: { ...ap, contentBlockId: v === "__none__" ? null : v } })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Выберите блок" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— выберите блок 2-й части —</SelectItem>
                        {contentBlocks.map(b => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Режим перехода на блок 2. При смене синхронно пишем
                      inlineContinue (back-compat: seamless/both⇒true, message⇒false). */}
                  <div className="space-y-1.5 border-t pt-3">
                    <Label className="text-xs font-semibold">Как переводить на блок 2</Label>
                    <Select
                      value={transferMode}
                      onValueChange={v => patch({ anketaPassInvite: { ...ap, transferMode: v as "seamless" | "message" | "both", inlineContinue: v !== "message" } })}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seamless">Бесшовно (сразу на странице, без письма)</SelectItem>
                        <SelectItem value="message">Письмом с задержкой</SelectItem>
                        <SelectItem value="both">И так, и так (рекомендуется)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {transferMode === "seamless" && "Прошедший гейт кандидат сразу переходит на блок 2 прямо на странице, сверху — плашка-поздравление. Письмо не шлём."}
                      {transferMode === "message" && "Кандидат видит «Спасибо», а приглашение на блок 2 уходит письмом с задержкой. Инлайн-перехода нет."}
                      {transferMode === "both" && "Авто-переход на блок 2 + плашка на странице, а кто ушёл не продолжив — догоняем письмом (страховка)."}
                    </p>
                  </div>

                  {/* ✅ Плашка-поздравление сверху блока 2 (seamless/both) */}
                  {showSeamless && (
                    <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/40 p-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">✅ Плашка на блоке 2 — заголовок</Label>
                        <Input
                          value={ap.passScreenTitle ?? ""}
                          onChange={e => patch({ anketaPassInvite: { ...ap, passScreenTitle: e.target.value } })}
                          placeholder="Вы молодец!"
                          maxLength={200}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">✅ Плашка на блоке 2 — текст</Label>
                        <Textarea
                          value={ap.passScreenText ?? ""}
                          onChange={e => patch({ anketaPassInvite: { ...ap, passScreenText: e.target.value } })}
                          placeholder={`Вы прошли первую часть. Продолжим — впереди «${assignedBlock?.title ?? "2-я часть демо"}».`}
                          rows={3} maxLength={2000}
                        />
                      </div>
                    </div>
                  )}

                  {/* Письмо-приглашение (message/both) */}
                  {showMessage && (
                    <div className="space-y-3 border-t pt-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Текст письма (подставятся {"{{name}}"}, {"{{vacancy}}"}, {"{{demo_link}}"})</Label>
                        <Textarea
                          value={ap.messageText}
                          onChange={e => patch({ anketaPassInvite: { ...ap, messageText: e.target.value } })}
                          placeholder={`{{name}}, добрый день! Благодарим за ответы — вы нам подходите. Предлагаем 2-ю часть «${assignedBlock?.title ?? "демо"}»: {{demo_link}}`}
                          rows={4} maxLength={2000}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Задержка перед отправкой</Label>
                        <Select value={String(ap.delaySeconds)} onValueChange={v => patch({ anketaPassInvite: { ...ap, delaySeconds: Number(v) } })}>
                          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="60">1 минута</SelectItem>
                            <SelectItem value="180">3 минуты</SelectItem>
                            <SelectItem value="900">15 минут</SelectItem>
                            <SelectItem value="1800">30 минут</SelectItem>
                            <SelectItem value="3600">1 час</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* ❌ Экран «Спасибо» — только для НЕ прошедших гейт */}
                  <div className="space-y-3 border-t pt-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">❌ Экран «Спасибо» для не прошедших — заголовок</Label>
                      <Input
                        value={ap.failScreenTitle ?? ""}
                        onChange={e => patch({ anketaPassInvite: { ...ap, failScreenTitle: e.target.value } })}
                        placeholder="Спасибо за прохождение демонстрации!"
                        maxLength={200}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">❌ Экран «Спасибо» для не прошедших — текст</Label>
                      <Textarea
                        value={ap.failScreenText ?? ""}
                        onChange={e => patch({ anketaPassInvite: { ...ap, failScreenText: e.target.value } })}
                        placeholder="Мы рассмотрим ваши ответы и свяжемся с вами в ближайшее время."
                        rows={3} maxLength={2000}
                      />
                    </div>
                  </div>

                  {/* Предварительный отказ для НЕ прошедших гейт (Юрий 03.07) */}
                  <div className="space-y-3 border-t pt-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Если не прошёл гейт</Label>
                      <Select
                        value={failAction}
                        onValueChange={v => patch({ anketaPassInvite: { ...ap, failAction: v as "none" | "pending_manual" | "pending_rejection" } })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Ничего не делать</SelectItem>
                          <SelectItem value="pending_manual">Предварительный отказ — пометка на ручной разбор, письмо не уходит</SelectItem>
                          <SelectItem value="pending_rejection">Отказ — авто-отправка через N минут</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {failAction === "pending_rejection" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Задержка перед отказом, минут</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10080}
                          className="h-9 w-32"
                          value={failRejectDelayMinutes}
                          onChange={e => {
                            const v = Number(e.target.value)
                            patch({ anketaPassInvite: { ...ap, failRejectDelayMinutes: Number.isFinite(v) && v > 0 ? Math.floor(v) : 60 } })
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Отказ уйдёт автоматически через {failRejectDelayMinutes} мин — за это время его можно отменить в карточке кандидата.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* ── Telegram: подходящие кандидаты (Юрий 04.07) — компактная карточка. ── */}
      {(() => {
        const tg = spec.tgCandidateAlerts ?? { enabled: false, minResumeScore: null, minAnswersScore: null, onGatePassed: true, onBooked: false }
        return (
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Telegram: подходящие кандидаты</h3>
                  <p className="text-xs text-muted-foreground">
                    Присылать карточку кандидата в Telegram-канал компании, когда он проходит пороги.
                  </p>
                </div>
                <Switch checked={tg.enabled} onCheckedChange={v => patch({ tgCandidateAlerts: { ...tg, enabled: v } })} />
              </div>
              {tg.enabled && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Мин. балл Портрета</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="не проверять"
                        className="h-9"
                        value={tg.minResumeScore ?? ""}
                        onChange={e => {
                          const raw = e.target.value
                          const v = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw))))
                          patch({ tgCandidateAlerts: { ...tg, minResumeScore: Number.isFinite(v) ? v : null } })
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Мин. балл ответов анкеты</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="не проверять"
                        className="h-9"
                        value={tg.minAnswersScore ?? ""}
                        onChange={e => {
                          const raw = e.target.value
                          const v = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw))))
                          patch({ tgCandidateAlerts: { ...tg, minAnswersScore: Number.isFinite(v) ? v : null } })
                        }}
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={tg.onGatePassed}
                      onCheckedChange={v => patch({ tgCandidateAlerts: { ...tg, onGatePassed: Boolean(v) } })}
                      className="mt-0.5"
                    />
                    <span className="text-xs">Когда кандидат прошёл гейт 2-й части демо</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground rounded-md bg-muted/40 px-2.5 py-1.5 leading-relaxed">
                    Бот и чат настраиваются в Настройках HR → Telegram; сообщения идут в канал компании.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* ── «Горячий кандидат стынет» — открыл демо, высокий балл, 0 блоков
           (батч «конверсия демо» 05.07). Дефолт ВЫКЛ (legacy-инвариант). ── */}
      {(() => {
        const hot = spec.hotCandidateAlert ?? { enabled: false, threshold: 70, staleAfterHours: 3 }
        return (
          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Горячий кандидат стынет</h3>
                  <p className="text-xs text-muted-foreground">
                    Уведомить HR (in-app + Telegram), если кандидат с высоким баллом Портрета
                    открыл демо и не начал его проходить.
                  </p>
                </div>
                <Switch checked={hot.enabled} onCheckedChange={v => patch({ hotCandidateAlert: { ...hot, enabled: v } })} />
              </div>
              {hot.enabled && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Порог «высокого» балла Портрета</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-9"
                        value={hot.threshold}
                        onChange={e => {
                          const raw = Number(e.target.value)
                          const v = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : hot.threshold
                          patch({ hotCandidateAlert: { ...hot, threshold: v } })
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Бездействие после открытия демо, часов</Label>
                      <Input
                        type="number"
                        min={1}
                        max={72}
                        className="h-9"
                        value={hot.staleAfterHours}
                        onChange={e => {
                          const raw = Number(e.target.value)
                          const v = Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.min(72, Math.round(raw))) : hot.staleAfterHours
                          patch({ hotCandidateAlert: { ...hot, staleAfterHours: v } })
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground rounded-md bg-muted/40 px-2.5 py-1.5 leading-relaxed">
                    Условие: балл Портрета ≥ порога, демо открыто дольше {hot.staleAfterHours} ч, 0 пройденных
                    блоков, анкета не заполнена. Алерт шлётся один раз на кандидата.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* ── Автоответы кандидату — единый блок: стоп-слова → отказ + FAQ → авто-ответ.
           Работает независимо от режима (Портрет / Воронка v2 / AI чат-бот),
           гейт единым тумблером «Включить» (по умолчанию ВЫКЛ). ── */}
      <AutoResponderSettings vacancyId={vacancyId} />

      {/* ── Дожим (напоминания) — встроен в Портрет, чтобы был под рукой (Юрий 30.06).
           Тот же компонент, что в табе «Дожим»; на новой вакансии показывает дефолтные
           тексты с переменными — подставлено и готово к запуску. ── */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div>
            <h3 className="text-base font-semibold">Дожим — напоминания</h3>
            <p className="text-xs text-muted-foreground">
              Автоматические напоминания тем, кто не открыл или не досмотрел демо. Те же
              тексты с переменными ({"{{name}}"}, {"{{vacancy}}"}, {"{{demo_link}}"}), что
              в табе «Дожим» — правьте где удобно.
            </p>
          </div>
          <VacancyFollowupSettings vacancyId={vacancyId} />
        </CardContent>
      </Card>

      {/* Реалистичность портрета показывает ТОЛЬКО AI-панель справа
          (PortraitAdvisor) — баннер здесь дублировал её (Юрий 03.07). */}

      <p className="text-xs text-muted-foreground pt-1">
        Заполненный Портрет используется для AI-оценки откликов (новый контур).
        У вакансий с пустым Портретом действуют прежние настройки воронки.
        Изменения сохраняются общей кнопкой «Сохранить настройки» внизу.
      </p>

      {/* #44: «Далее → Контент» рендерит единая нижняя панель вакансии
          (VacancyTabFooter) — здесь собственной кнопки перехода нет, чтобы не
          задваивать. */}

      {/* Диалог подтверждения AI-предложения */}
      <SuggestionDialog
        open={suggestionOpen}
        onOpenChange={setSuggestionOpen}
        edited={editedSuggestion}
        onEdited={setEditedSuggestion}
        onApply={applySuggestion}
      />

      {/* Диалог «Актуализировать» — аддитивный дифф под изменившуюся вакансию */}
      <ActualizeDialog
        open={actualizeOpen}
        onOpenChange={setActualizeOpen}
        diff={actualizeDiff}
        selection={actualizeSel}
        onSelection={setActualizeSel}
        onApply={applyActualize}
        applying={false}
      />
    </div>

    {/* ── AI-советчик зоны «Портрет» — правая колонка ────────────────────────
        На широком экране (lg+) стоит справа рядом с формой. Читает ТОЛЬКО сам
        Портрет (spec) — критерии/стоп-факторы/эталон, а не поля вакансии
        (раньше тут стоял VacancyAdvisor с vacancyData → показывал «40 навыков»
        и «стоп-факторы критично» из вакансии; Юрий 26.06: только по Портрету). */}
    <PortraitAdvisor spec={spec} source={source} conflicts={conflictsResult} conflictsChecking={conflictsChecking} />
    </div>
  )
}

// «Реалистичность портрета» рендерится только в PortraitAdvisor (правая
// AI-панель) — локальный RealismIndicator удалён как дубль (Юрий 03.07).
