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
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Target, Plus, X, Loader2, ShieldAlert, FileText, Gauge,
  ArrowRightLeft, AlertTriangle, Sparkles, Wand2, CheckCircle2, Check,
  Lightbulb,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  normalizeMustHave,
  normalizeNiceToHave,
  normalizeDealBreakers,
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
import { computeRealism, REALISM_TONE_CLASS } from "./spec-editor-helpers"
import { useVacancySectionRegister, useVacancySettings } from "./vacancy-settings-context"
import { VacancyAdvisor } from "./vacancy-advisor"

// ─── Константы ───────────────────────────────────────────────────────────────

// 🟢 «Подходит» — важность на пункте. ТРИ уровня (согласованный дизайн): 🟢 только
// поднимает балл, НИКОГДА не отсекает. Отсев — это 🔴 (стоп-фактор / точные требования).
// Цвет = важность: оранжевый → светло-зелёный → тёмно-зелёный. Подпись — по наведению.
const GOOD_LEVELS = [
  { value: "nice",      label: "Желательно",  solid: "bg-orange-500",  text: "text-orange-600 dark:text-orange-400"   },
  { value: "important", label: "Важно",       solid: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { value: "very",      label: "Обязательно", solid: "bg-emerald-700", text: "text-emerald-700 dark:text-emerald-300" },
] as const
type GoodLevel = (typeof GOOD_LEVELS)[number]["value"]

// Куда зовём при авто-приглашении (короткий ярлык для зоны и опции селекта).
const NEXT_STEP_LABEL: Record<string, string> = {
  demo:      "на демо",
  interview: "на интервью",
  video:     "на видео",
  call:      "на звонок",
}

// 🔴 «Не подходит по смыслу» — стоп-фактор (отказ) vs минус к баллу.
const BAD_KINDS = [
  { hard: true,  label: "Стоп-фактор",   solid: "bg-red-500"   },
  { hard: false, label: "Минус к баллу", solid: "bg-amber-500" },
] as const

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

/** Ответ POST /api/modules/hr/vacancies/[id]/requirements/suggest. */
interface SuggestionResult {
  must_have:     string[]
  nice_to_have:  string[]
  deal_breakers: string[]
  ideal_profile: string
}

/** Ответ POST .../requirements/synonyms */
interface SynonymsResult {
  synonyms: string[]
}

/** Одна конфликтующая пара из .../portrait/check-conflicts */
interface ConflictItem {
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
          maxLength={200}
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
          maxLength={200}
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

// ─── Блок синонимов под критерием ────────────────────────────────────────────

function SynonymBlock({
  text, side, vacancyId, onAdd, onAddMany,
}: {
  text:       string
  side:       "good" | "bad"
  vacancyId:  string
  onAdd:      (synonym: string) => void
  onAddMany?: (synonyms: string[]) => number
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
            {state.synonyms.map((syn, i) => (
              <button
                key={i}
                type="button"
                onClick={() => addOne(syn)}
                className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                {syn}
              </button>
            ))}
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
  mustHave, niceToHave, onChange, vacancyId,
}: {
  mustHave:   MustHaveEntry[]
  niceToHave: NiceToHaveEntry[]
  onChange:   (next: { mustHave: MustHaveItem[]; niceToHave: NiceToHaveItem[] }) => void
  vacancyId:  string
}) {
  // 🟢 = только балл, не отсев → всё в niceToHave (3 уровня). Старые жёсткие
  // must-have (если были) показываем как «Очень важно» и при правке переводим в
  // niceToHave; mustHave очищаем (criteria-нокаута больше нет — отсев это 🔴).
  const rows: { text: string; level: GoodLevel }[] = [
    ...normalizeMustHave(mustHave).map(m => ({ text: m.text, level: "very" as GoodLevel })),
    ...normalizeNiceToHave(niceToHave).map(n => ({ text: n.text, level: n.importance as GoodLevel })),
  ]
  const commit = (next: { text: string; level: GoodLevel }[]) => {
    const niceToHave = next.map(r => ({ text: r.text, importance: r.level as NiceImportance }))
    if (niceToHave.length > 10) { toast.error("Не больше 10 пунктов"); return }
    onChange({ mustHave: [], niceToHave })
  }
  const setLevel = (i: number, level: GoodLevel) => commit(rows.map((r, idx) => idx === i ? { ...r, level } : r))
  const remove   = (i: number) => commit(rows.filter((_, idx) => idx !== i))

  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (rows.some(r => r.text.toLowerCase() === t.toLowerCase())) { toast.error("Уже есть такой пункт"); return }
    if (rows.length >= 10) { toast.error("Максимум 10"); return }
    commit([...rows, { text: t, level: "nice" }])
    setDraft("")
  }
  const ph = LIST_PLACEHOLDERS.must[rows.length % LIST_PLACEHOLDERS.must.length] || ""

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
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">Что хотим видеть</Label>
        <ListCounter count={rows.length} max={10} />
      </div>
      <p className="text-xs text-muted-foreground">
        Есть в резюме → плюс к баллу. Нет → балл ниже, но <b>не отказ</b>. Цвет справа = важность:{" "}
        <span className="text-orange-600 dark:text-orange-400">оранжевый — желательно</span>,{" "}
        <span className="text-emerald-600 dark:text-emerald-400">светло-зелёный — важно</span>,{" "}
        <span className="text-emerald-700 dark:text-emerald-300">тёмно-зелёный — обязательно</span> (сильнее влияет). Наведите — увидите подпись.
      </p>
      <OverRecommendedHint count={rows.length} />
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="rounded-md border p-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm min-w-0 break-words">{r.text}</span>
              <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Важность пункта">
                {GOOD_LEVELS.map(l => {
                  const active = r.level === l.value
                  return (
                    <button key={l.value} type="button" title={l.label} aria-label={l.label} aria-pressed={active}
                      onClick={() => setLevel(i, l.value)}
                      className={cn(
                        "w-7 h-[22px] rounded-md border border-transparent flex items-center justify-center text-white transition-all",
                        l.solid,
                        active ? "opacity-100 shadow-sm" : "opacity-30 hover:opacity-60",
                      )}
                    >
                      {active && <Check className="w-3.5 h-3.5" />}
                    </button>
                  )
                })}
              </div>
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
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={ph} maxLength={200} disabled={rows.length >= 10} className="h-9" />
        <Button type="button" size="icon" variant="outline" onClick={add}
          disabled={rows.length >= 10 || !draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── 🔴 «Не подходит по смыслу»: стоп-фактор vs минус к баллу ─────────────────

function BadEditor({
  items, onChange, vacancyId,
}: {
  items:      DealBreakerEntry[]
  onChange:   (next: DealBreakerItem[]) => void
  vacancyId:  string
}) {
  const rows = normalizeDealBreakers(items)
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
      <p className="text-xs text-muted-foreground">
        Стоп-фактор — отказ, только если AI прямо видит это в резюме. Минус к баллу — просто ниже балл, не отказ. Можно фразой. Кружок справа:{" "}
        <span className="text-red-600 dark:text-red-400">красный — стоп-фактор</span>,{" "}
        <span className="text-amber-600 dark:text-amber-400">янтарный — минус к баллу</span>.
      </p>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="rounded-md border p-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm min-w-0 break-words">{r.text}</span>
              {/* Кружки справа: красный — стоп-фактор (отказ), янтарный — минус к баллу */}
              {BAD_KINDS.map(k => {
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
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
          placeholder={ph} maxLength={200} disabled={rows.length >= 10} className="h-9" />
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
  /** Данные анкеты вакансии для AI-советчика зоны «Портрет».
   *  Если не передан — панель советчика не показывается. */
  vacancyAnketaData?: Record<string, unknown>
}

export function SpecEditor({ vacancyId, onSaved, portraitScoring, onAdopted, onNavigateNext, vacancyAnketaData }: SpecEditorProps) {
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

  // AI «Собрать из вакансии» (POST /requirements/suggest → подтверждающий диалог)
  const [suggesting, setSuggesting]         = useState(false)
  const [suggestionOpen, setSuggestionOpen] = useState(false)
  const [editedSuggestion, setEditedSuggestion] = useState<SuggestionResult | null>(null)
  const [suggestUnavailable, setSuggestUnavailable] = useState(false)

  // Проверка противоречий «Подходит» ↔ «Не подходит»
  const [conflictsChecking, setConflictsChecking]   = useState(false)
  const [conflictsResult, setConflictsResult]       = useState<ConflictItem[] | null>(null)

  // CSV-строки для списочных стоп-факторов (как в VacancyStopFactorsSettings)
  const [cityCsv, setCityCsv]               = useState("")
  const [citizenshipCsv, setCitizenshipCsv] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch(`/api/core/spec/${vacancyId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { spec?: CandidateSpec; source?: "spec" | "legacy" } | null) => {
        if (cancelled) return
        if (d?.spec) {
          setSpec(d.spec)
          setSource(d.source ?? null)
          setCityCsv((d.spec.stopFactors.city?.allowedCities ?? []).join(", "))
          setCitizenshipCsv((d.spec.stopFactors.citizenship?.allowed ?? []).join(", "))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])

  // Универсальный апдейтер
  const patch = (p: Partial<CandidateSpec>) => setSpec(prev => prev ? { ...prev, ...p } : prev)

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
      stopFactors: {
        ...spec.stopFactors,
        city: spec.stopFactors.city
          ? { ...spec.stopFactors.city, allowedCities: csvToList(cityCsv) }
          : undefined,
        citizenship: spec.stopFactors.citizenship
          ? { ...spec.stopFactors.citizenship, allowed: csvToList(citizenshipCsv) }
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
    watchedValues: { spec, cityCsv, citizenshipCsv },
    save,
  })

  // «Далее → Контент» отдаём в общий sticky-бар, чтобы стоять в один ряд с
  // «Сохранить настройки» (а не друг под другом). setNextAction стабилен (useState).
  const settingsCtx = useVacancySettings()
  const setNext = settingsCtx?.setNextAction
  const saveRef = useRef(save); saveRef.current = save
  const navRef = useRef(onNavigateNext); navRef.current = onNavigateNext
  useEffect(() => {
    if (!setNext || !onNavigateNext) return
    setNext({
      label: "Далее → Контент",
      onClick: async () => { try { await saveRef.current(); navRef.current?.() } catch { /* save показал ошибку */ } },
    })
    return () => setNext(null)
  }, [setNext, !!onNavigateNext])

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
      const json = await res.json() as { suggestion?: SuggestionResult }
      if (!json.suggestion) {
        toast.error("AI вернул пустой ответ")
        return
      }
      setEditedSuggestion(json.suggestion)
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
    // Сильные требования AI → niceToHave «Очень важно», прочие плюсы → «Желательно».
    const niceToHave = [
      ...editedSuggestion.must_have.map(text => ({ text, importance: "very" as NiceImportance })),
      ...editedSuggestion.nice_to_have.map(text => ({ text, importance: "nice" as NiceImportance })),
    ].slice(0, 10)
    const dealBreakers = editedSuggestion.deal_breakers.slice(0, 10).map(text => ({ text, hard: false }))
    patch({
      idealProfile: editedSuggestion.ideal_profile.slice(0, 500),
      mustHave:     [],
      niceToHave,
      // Пред-заполнение НЕ создаёт жёстких стоп-факторов: deal_breakers от AI кладём
      // мягкими (hard:false = минус к баллу, не отказ). Жёсткий отсев HR включает сам,
      // осознанно — иначе «опыт B2B» зарубит того, кто написал «продавал CRM».
      dealBreakers,
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
    (["city", "format", "age", "experience", "citizenship", "salaryExpectation", "driverLicense", "jobHopping"] as const)
      .filter(k => sf[k]?.enabled).length +
    (sf.customFactors?.filter(f => f.enabled).length ?? 0)
  const dbItems   = normalizeDealBreakers(spec.dealBreakers)
  const dbHardCnt = dbItems.filter(d => d.hard).length
  const dbSoftCnt = dbItems.length - dbHardCnt

  return (
    <div className="space-y-6 max-w-3xl">
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
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!suggestUnavailable && (
            <Button type="button" size="sm" onClick={requestSuggestion} disabled={suggesting}>
              {suggesting
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Анализ…</>
                : <><Sparkles className="w-4 h-4 mr-1.5" /> Заполнить из вакансии</>}
            </Button>
          )}
          {source === "legacy" && (
            <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400">
              Собрано из текущих настроек — проверьте и сохраните
            </Badge>
          )}
          {source === "spec" && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              Сохранённый Spec
            </Badge>
          )}
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

      {/* ── Статус-плашка противоречий (над секциями «Подходит» и «Не подходит») ── */}
      {conflictsResult !== null && (
        <div className="space-y-1.5">
          {conflictsResult.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              <span>«Подходит» и «Не подходит» не противоречат</span>
            </div>
          ) : (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 px-3 py-2.5 space-y-1.5">
              {conflictsResult.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-red-800 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                  <span>
                    Противоречие: «{c.good}» и «{c.bad}» — {c.why}; оставьте одно
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => checkConflicts()}
          disabled={conflictsChecking}
          className="text-xs h-7"
        >
          {conflictsChecking
            ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Проверяю…</>
            : <><AlertTriangle className="w-3 h-3 mr-1.5" /> Проверить на противоречия</>}
        </Button>
      </div>

      {/* Пояснение про бота */}
      <p className="text-xs text-muted-foreground -mt-2">
        Если бот включён — спорное он уточнит у кандидата и в «Подходит», и в «Не подходит», а не отрежет сразу.
      </p>

      {/* ── 🟢 Подходит ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Подходит
          </CardTitle>
          <CardDescription>
            Что хотим видеть в кандидате. Важность — на каждом пункте; всё учитывается вместе.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoodEditor
            mustHave={spec.mustHave}
            niceToHave={spec.niceToHave}
            onChange={({ mustHave, niceToHave }) => patch({ mustHave, niceToHave })}
            vacancyId={vacancyId}
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
            Что отсекает кандидата или роняет балл.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <BadEditor
            items={spec.dealBreakers}
            onChange={v => patch({ dealBreakers: v })}
            vacancyId={vacancyId}
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
            </div>
          </FactorRow>

          <FactorRow
            title="Формат работы"
            help="Если кандидат предпочитает не разрешённый формат — стоп"
            enabled={sf.format?.enabled ?? false}
            onToggle={v => toggleFactor("format", v)}
          >
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
          </FactorRow>

          <FactorRow
            title="Гражданство"
            help="Список разрешённых стран. Через запятую: RU, BY"
            enabled={sf.citizenship?.enabled ?? false}
            onToggle={v => toggleFactor("citizenship", v)}
          >
            <Input
              value={citizenshipCsv}
              onChange={e => setCitizenshipCsv(e.target.value)}
              placeholder="RU, BY"
              className="h-8 text-sm"
            />
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

            <p className="text-[11px] text-muted-foreground">
              Тексты отказов для этих условий — в блоке «Стоп-факторы по резюме» Конструктора воронки.
            </p>
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
            <div className={cn("rounded-md border py-2", rt.autoRejectEnabled ? "border-red-400/40 bg-red-500/10" : "border-border bg-muted/30")}>
              <div className={cn("font-bold", rt.autoRejectEnabled ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>&lt; {rt.lowerThreshold}</div>
              <div className="text-muted-foreground">{rt.autoRejectEnabled ? "отказ" : "ручной разбор"}</div>
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

          {/* Авто-отказ слабых: порог + задержка + письмо отказа */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Label className="text-sm font-medium">Авто-отказ слабых</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Балл &lt; {rt.lowerThreshold} → система сама отправляет мягкий отказ. Выкл — слабые ждут ручного разбора.</p>
              </div>
              <Switch
                checked={rt.autoRejectEnabled}
                onCheckedChange={v => patch({ resumeThresholds: { ...rt, autoRejectEnabled: v, enabled: true } })}
              />
            </div>
            {rt.autoRejectEnabled && (<>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs">Порог отказа (ниже балл — отказ)</Label>
                  <span className="text-sm font-bold text-red-600">&lt;{rt.lowerThreshold}</span>
                </div>
                <Slider
                  value={[rt.lowerThreshold]}
                  onValueChange={([v]) => patch({ resumeThresholds: { ...rt, lowerThreshold: Math.min(v, rt.upperThreshold - 5) } })}
                  min={0} max={95} step={5}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Задержка отказа, мин</Label>
                <Input
                  type="number"
                  value={rt.rejectionDelayMinutes}
                  onChange={e => patch({ resumeThresholds: { ...rt, rejectionDelayMinutes: Math.max(0, Number(e.target.value) || 0) } })}
                  className="w-24 h-8 text-sm"
                />
                {rt.rejectionDelayMinutes >= 60 && (
                  <span className="text-[11px] text-muted-foreground">= {Math.floor(rt.rejectionDelayMinutes / 60)} ч{rt.rejectionDelayMinutes % 60 ? ` ${rt.rejectionDelayMinutes % 60} мин` : ""}</span>
                )}
                <span className="text-[11px] text-muted-foreground">не сразу — время передумать</span>
              </div>
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

          {/* Авто-приглашение сильных + выбор следующего этапа */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Label className="text-sm font-medium">Авто-приглашение сильных</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Балл ≥ {rt.upperThreshold} → система сама зовёт дальше. Выкл — сильные ждут вашего решения.</p>
              </div>
              <Switch
                checked={rt.autoInviteEnabled ?? false}
                onCheckedChange={v => patch({ resumeThresholds: { ...rt, autoInviteEnabled: v, enabled: true } })}
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
                  onValueChange={([v]) => patch({ resumeThresholds: { ...rt, upperThreshold: Math.max(v, rt.lowerThreshold + 5) } })}
                  min={10} max={100} step={5}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Следующий этап</Label>
                <Select
                  value={rt.inviteNextStep ?? "demo"}
                  onValueChange={v => patch({ resumeThresholds: { ...rt, inviteNextStep: v as "demo" | "interview" | "video" | "call" } })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">Демо-страница</SelectItem>
                    <SelectItem value="interview">Запись на интервью (календарь)</SelectItem>
                    <SelectItem value="video">Видео-интервью</SelectItem>
                    <SelectItem value="call">Телефонный звонок</SelectItem>
                  </SelectContent>
                </Select>
                {(rt.inviteNextStep ?? "demo") !== "demo" && (
                  <p className="text-[11px] text-muted-foreground">Сейчас меняет текст приглашения; автозапись в календарь/видео — в доработке движка.</p>
                )}
              </div>
            </>)}
          </div>
        </CardContent>
      </Card>

      {/* «Оценка анкеты (после демо)» перенесена в настройки анкеты (блок «После демо»). */}

      {/* ── (г) Реалистичность портрета ── */}
      <RealismIndicator spec={spec} />

      <p className="text-xs text-muted-foreground pt-1">
        Заполненный Портрет используется для AI-оценки откликов (новый контур).
        У вакансий с пустым Портретом действуют прежние настройки воронки.
        Изменения сохраняются общей кнопкой «Сохранить настройки» внизу.
      </p>

      {/* ── AI-советчик зоны «Портрет» ─────────────────────────────────────
          Показывает только портретные секции (стоп-факторы, навыки must/nice).
          Встроен inline без боковой панели — vacancyAnketaData передаётся из
          page.tsx через prop, если доступны данные анкеты вакансии. */}
      {vacancyAnketaData && (
        <div className="pt-2">
          <VacancyAdvisor
            vacancyId={vacancyId}
            vacancyData={vacancyAnketaData}
            zone="portrait"
          />
        </div>
      )}

      {/* «Далее → Контент» перенесена в общий sticky-бар (рядом с «Сохранить
          настройки») — см. useEffect с setNextAction выше. */}

      {/* Диалог подтверждения AI-предложения */}
      <SuggestionDialog
        open={suggestionOpen}
        onOpenChange={setSuggestionOpen}
        edited={editedSuggestion}
        onEdited={setEditedSuggestion}
        onApply={applySuggestion}
      />
    </div>
  )
}

// ─── Индикатор «Реалистичность портрета» (Этап 1b, решение #7) ────────────────

function RealismIndicator({ spec }: { spec: CandidateSpec }) {
  const { level, tone, warn } = computeRealism(spec)
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs space-y-1", REALISM_TONE_CLASS[tone])}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Реалистичность портрета: {level}</span>
        <span className="opacity-70" title="Ориентир, не строгий показатель">
          сколько кандидатов подойдёт
        </span>
      </div>
      {warn && (
        <p className="leading-snug">
          ⚠️ Слишком много жёстких условий — подходящих кандидатов будет мало.
          Смягчите часть must-have, отключите лишние стоп-факторы или снизьте верхний порог.
        </p>
      )}
    </div>
  )
}
