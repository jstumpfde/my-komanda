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

import { useEffect, useState } from "react"
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
  ArrowRightLeft, AlertTriangle, Sparkles, Wand2, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  normalizeMustHave,
  normalizeNiceToHave,
  normalizeDealBreakers,
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
import { useVacancySectionRegister } from "./vacancy-settings-context"

// ─── Константы ───────────────────────────────────────────────────────────────

// 🟢 «Подходит» — уровни важности на пункте (перестройка 21.06). Три верхних =
// важность (балл), «Обязательно» = жёсткий отсев (уходит в mustHave hard).
const GOOD_LEVELS = [
  { value: "nice",      label: "Желательно"  },
  { value: "important", label: "Важно"       },
  { value: "very",      label: "Очень важно" },
  { value: "required",  label: "Обязательно" },
] as const
type GoodLevel = (typeof GOOD_LEVELS)[number]["value"]

// 🔴 «Не подходит по смыслу» — стоп-фактор (отказ) vs минус к баллу.
const BAD_KINDS = [
  { hard: true,  label: "Стоп-фактор"   },
  { hard: false, label: "Минус к баллу" },
] as const

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

const IDEAL_PLACEHOLDER =
  "Опытный B2B продавец из стройиндустрии, готовый к длинным сделкам с крупными клиентами. Самостоятельный, ориентирован на результат."

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
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1 font-normal">
            {it}
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="rounded-full hover:bg-muted-foreground/20 p-0.5"
              aria-label={`Убрать «${it}»`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
            label="Обязательные (must-have)"
            hint="Жёсткие требования"
            maxItems={10}
            items={edited.must_have}
            setItems={v => setField("must_have", v)}
            placeholders={LIST_PLACEHOLDERS.must}
          />
          <ListEditor
            label="Желательные (nice-to-have)"
            hint="Повышают оценку, не дисквалифицируют"
            maxItems={10}
            items={edited.nice_to_have}
            setItems={v => setField("nice_to_have", v)}
            placeholders={LIST_PLACEHOLDERS.nice}
          />
          <ListEditor
            label="Неприемлемо (deal-breakers)"
            hint="При совпадении — отказ"
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

// ─── 🟢 «Подходит»: единый список с важностью на пункте ──────────────────────

/**
 * Один редактор для всего, что «хотим видеть»: объединяет mustHave (hard =
 * «Обязательно») и niceToHave (важность на пункте). На выходе разбивает обратно
 * в два поля Spec — «Обязательно» → mustHave {hard:true}, остальное → niceToHave
 * {importance}. Так движок читает поля как раньше (hard must-have = нокаут).
 */
function GoodEditor({
  mustHave, niceToHave, onChange,
}: {
  mustHave:   MustHaveEntry[]
  niceToHave: NiceToHaveEntry[]
  onChange:   (next: { mustHave: MustHaveItem[]; niceToHave: NiceToHaveItem[] }) => void
}) {
  const rows: { text: string; level: GoodLevel }[] = [
    ...normalizeMustHave(mustHave).map(m => ({ text: m.text, level: (m.hard ? "required" : "very") as GoodLevel })),
    ...normalizeNiceToHave(niceToHave).map(n => ({ text: n.text, level: n.importance as GoodLevel })),
  ]
  const commit = (next: { text: string; level: GoodLevel }[]) => {
    const mustHave   = next.filter(r => r.level === "required").map(r => ({ text: r.text, hard: true }))
    const niceToHave = next.filter(r => r.level !== "required").map(r => ({ text: r.text, importance: r.level as NiceImportance }))
    // Каждое поле в Spec лимитировано zod .max(10). Если правка вытолкнет бакет
    // за 10 (напр. >10 «Обязательно» после «Собрать из вакансии») — отклоняем с
    // подсказкой, иначе PUT вернул бы 400 и весь Портрет молча не сохранился.
    if (mustHave.length > 10)   { toast.error("Не больше 10 «Обязательно»"); return }
    if (niceToHave.length > 10) { toast.error("Не больше 10 пунктов «в баллах»"); return }
    onChange({ mustHave, niceToHave })
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

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">Что хотим видеть</Label>
        <ListCounter count={rows.length} max={10} />
      </div>
      <p className="text-xs text-muted-foreground">
        Важность — на самом пункте. «Обязательно» = без этого отказ; остальное поднимает балл, но не режет. Можно фразой.
      </p>
      <OverRecommendedHint count={rows.length} />
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="rounded-md border p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm min-w-0 break-words">{r.text}</span>
              <button type="button" onClick={() => remove(i)}
                className="rounded-full hover:bg-muted-foreground/20 p-0.5 shrink-0" aria-label={`Убрать «${r.text}»`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {GOOD_LEVELS.map(l => (
                <button key={l.value} type="button" onClick={() => setLevel(i, l.value)}
                  className={cn(
                    "text-[11px] px-1.5 py-1 rounded-md border text-center truncate transition-colors",
                    r.level === l.value
                      ? (l.value === "required"
                          ? "bg-amber-500 text-white border-transparent"
                          : "bg-primary text-primary-foreground border-transparent")
                      : "text-muted-foreground border-border hover:text-foreground",
                  )}
                >{l.label}</button>
              ))}
            </div>
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
  items, onChange,
}: {
  items:    DealBreakerEntry[]
  onChange: (next: DealBreakerItem[]) => void
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

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">
          По смыслу <span className="font-normal text-muted-foreground">— AI читает резюме</span>
        </Label>
        <ListCounter count={rows.length} max={10} />
      </div>
      <p className="text-xs text-muted-foreground">
        Стоп-фактор — отказ, только если AI прямо видит это в резюме. Минус к баллу — просто ниже балл, не отказ. Можно фразой.
      </p>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="rounded-md border p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm min-w-0 break-words">{r.text}</span>
              <button type="button" onClick={() => remove(i)}
                className="rounded-full hover:bg-muted-foreground/20 p-0.5 shrink-0" aria-label={`Убрать «${r.text}»`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:max-w-sm">
              {BAD_KINDS.map(k => (
                <button key={String(k.hard)} type="button" onClick={() => setHard(i, k.hard)}
                  className={cn(
                    "text-[11px] px-1.5 py-1 rounded-md border text-center truncate transition-colors",
                    r.hard === k.hard
                      ? (k.hard
                          ? "bg-red-500 text-white border-transparent"
                          : "bg-amber-500 text-white border-transparent")
                      : "text-muted-foreground border-border hover:text-foreground",
                  )}
                >{k.label}</button>
              ))}
            </div>
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

// ─── Главный компонент ───────────────────────────────────────────────────────

interface SpecEditorProps {
  vacancyId: string
  onSaved?:  () => void
  /** vacancies.portrait_scoring — оценивается ли вакансия из «Портрета» (новый контур). */
  portraitScoring?: boolean
  /** Вызвать после успешного «Перенести в Портрет» (рефетч вакансии). */
  onAdopted?: () => void
}

export function SpecEditor({ vacancyId, onSaved, portraitScoring, onAdopted }: SpecEditorProps) {
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
    patch({
      idealProfile: editedSuggestion.ideal_profile.slice(0, 500),
      // must-have → объекты {text, hard:true} (по умолчанию жёсткие)
      mustHave:     editedSuggestion.must_have.slice(0, 10).map(text => ({ text, hard: true })),
      niceToHave:   editedSuggestion.nice_to_have.slice(0, 10),
      dealBreakers: editedSuggestion.deal_breakers.slice(0, 10),
    })
    setSuggestionOpen(false)
    toast.success("Портрет заполнен из вакансии — проверьте и сохраните")
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
  const setSf = (next: CandidateSpec["stopFactors"]) => patch({ stopFactors: next })
  const toggleFactor = (key: keyof CandidateSpec["stopFactors"], on: boolean) => {
    const current = (sf[key] ?? { enabled: false }) as Record<string, unknown>
    setSf({ ...sf, [key]: { ...current, enabled: on } } as CandidateSpec["stopFactors"])
  }
  const enabledFactorCount = (Object.values(sf) as Array<{ enabled?: boolean } | undefined>)
    .filter(f => f?.enabled).length
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

      {/* Заголовок секции */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Портрет
          </h3>
          <p className="text-sm text-muted-foreground">
            Единый профиль кандидата: критерии, стоп-факторы, пороги AI-оценки.
          </p>
        </div>
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

      {/* ── (0) Идеальный профиль — наверху + «Собрать из вакансии» ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4" /> Идеальный профиль
              </CardTitle>
              <CardDescription>
                1–2 предложения для AI: кто идеально подходит на эту позицию. С него
                удобно начать — затем уточнить критерии и пороги ниже.
              </CardDescription>
            </div>
            {!suggestUnavailable && (
              <Button
                type="button" variant="outline" size="sm" className="shrink-0"
                onClick={requestSuggestion} disabled={suggesting}
              >
                {suggesting
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Анализ…</>
                  : <><Sparkles className="w-4 h-4 mr-1.5" /> Собрать из вакансии</>}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={spec.idealProfile}
            onChange={e => patch({ idealProfile: e.target.value.slice(0, 500) })}
            placeholder={IDEAL_PLACEHOLDER}
            rows={3}
            maxLength={500}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
            {spec.idealProfile.length}/500
          </p>
        </CardContent>
      </Card>

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
          />

          <div className="pt-4 border-t space-y-3">
            <div>
              <Label className="text-sm font-medium">Точные требования</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Формальные условия — режут кодом ещё ДО AI. Рекомендуем не больше 3, иначе отсев слишком широкий.
              </p>
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

      {/* ── Итог: что реально отсеется автоматически (safety-first: «режем только очевидное») ── */}
      <div className="rounded-lg border bg-muted/30 px-3.5 py-3 space-y-1.5">
        <div className="font-medium text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" /> Что отсеется автоматически
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>• <b className="text-foreground">Стоп-факторы</b> ({enabledFactorCount} вкл.) — формальное несоответствие, отказ сразу.</li>
          <li>• <b className="text-foreground">Стоп-факторы по смыслу</b> ({dbHardCnt}) — отказ, только если AI прямо видит это в резюме.{dbSoftCnt > 0 ? ` Ещё ${dbSoftCnt} «минус к баллу» — не режут, только снижают.` : ""}</li>
          {spec.resumeThresholds.autoRejectEnabled ? (
            <li>• <b className="text-foreground">Низкий балл</b> (&lt;{spec.resumeThresholds.lowerThreshold}) — авто-отказ <b className="text-amber-700 dark:text-amber-400">включён</b>.</li>
          ) : (
            <li>• <b className="text-foreground">Низкий балл</b> — <b className="text-emerald-700 dark:text-emerald-400">не отказ</b>: уходит в ручной разбор, спорное уточнит бот.</li>
          )}
        </ul>
      </div>

      {/* ── (в) Пороги — две карточки рядом ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Оценка резюме */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="w-4 h-4" /> Оценка резюме
              </CardTitle>
              <Switch
                checked={spec.resumeThresholds.enabled ?? true}
                onCheckedChange={v => patch({ resumeThresholds: { ...spec.resumeThresholds, enabled: v } })}
              />
            </div>
            <CardDescription>Пороги AI-скоринга резюме и действие между ними.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!(spec.resumeThresholds.enabled ?? true) ? (
              <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border">
                Оценка резюме отключена — скоринг резюме не применяется, кандидаты идут в ручной разбор.
              </p>
            ) : (<>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs">Зелёная зона (приглашение)</Label>
                <span className="text-sm font-bold text-emerald-600">≥{spec.resumeThresholds.upperThreshold}</span>
              </div>
              <Slider
                value={[spec.resumeThresholds.upperThreshold]}
                onValueChange={([v]) => patch({ resumeThresholds: { ...spec.resumeThresholds, upperThreshold: v } })}
                min={10} max={100} step={5}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs">Красная зона (отказ/разбор)</Label>
                <span className="text-sm font-bold text-amber-600">&lt;{spec.resumeThresholds.lowerThreshold}</span>
              </div>
              <Slider
                value={[spec.resumeThresholds.lowerThreshold]}
                onValueChange={([v]) => patch({ resumeThresholds: { ...spec.resumeThresholds, lowerThreshold: v } })}
                min={0} max={95} step={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Между порогами</Label>
              <Select
                value={spec.resumeThresholds.midRangeAction}
                onValueChange={(v: MidRangeAction) => patch({ resumeThresholds: { ...spec.resumeThresholds, midRangeAction: v } })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MID_RANGE_LABELS) as MidRangeAction[]).map(k => (
                    <SelectItem key={k} value={k}>{MID_RANGE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1 border-t">
              <div>
                <Label className="text-xs">Реальный авто-отказ ниже порога</Label>
                <p className="text-[11px] text-muted-foreground">Выкл = кандидаты идут в ручной разбор</p>
              </div>
              <Switch
                checked={spec.resumeThresholds.autoRejectEnabled}
                onCheckedChange={v => patch({ resumeThresholds: { ...spec.resumeThresholds, autoRejectEnabled: v } })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Задержка отказа, мин</Label>
              <Input
                type="number"
                value={spec.resumeThresholds.rejectionDelayMinutes}
                onChange={e => patch({ resumeThresholds: { ...spec.resumeThresholds, rejectionDelayMinutes: Math.max(0, Number(e.target.value) || 0) } })}
                className="w-24 h-8 text-sm"
              />
            </div>
            </>)}
          </CardContent>
        </Card>

        {/* Оценка анкеты */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" /> Оценка анкеты
              </CardTitle>
              <Switch
                checked={spec.anketaThresholds.enabled ?? true}
                onCheckedChange={v => patch({ anketaThresholds: { ...spec.anketaThresholds, enabled: v } })}
              />
            </div>
            <CardDescription>Пороги AI-скрининга ответов анкеты (после демо).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!(spec.anketaThresholds.enabled ?? true) ? (
              <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border">
                Оценка анкеты отключена — скрининг ответов не применяется.
              </p>
            ) : (<>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs">Зелёный уровень (на встречу)</Label>
                <span className="text-sm font-bold text-emerald-600">≥{spec.anketaThresholds.upperThreshold}</span>
              </div>
              <Slider
                value={[spec.anketaThresholds.upperThreshold]}
                onValueChange={([v]) => patch({ anketaThresholds: { ...spec.anketaThresholds, upperThreshold: v } })}
                min={10} max={100} step={5}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label className="text-xs">Красный уровень</Label>
                <span className="text-sm font-bold text-amber-600">&lt;{spec.anketaThresholds.lowerThreshold}</span>
              </div>
              <Slider
                value={[spec.anketaThresholds.lowerThreshold]}
                onValueChange={([v]) => patch({ anketaThresholds: { ...spec.anketaThresholds, lowerThreshold: v } })}
                min={0} max={95} step={5}
              />
            </div>
            <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border">
              Жёлтая зона (между порогами) — кандидат получает «мы свяжемся»,
              решение за HR. Тексты уровней — в блоке «AI-скрининг анкеты».
            </p>
            </>)}
          </CardContent>
        </Card>
      </div>

      {/* ── (г) Реалистичность портрета ── */}
      <RealismIndicator spec={spec} />

      <p className="text-xs text-muted-foreground pt-1">
        Заполненный Портрет используется для AI-оценки откликов (новый контур).
        У вакансий с пустым Портретом действуют прежние настройки воронки.
        Изменения сохраняются общей кнопкой «Сохранить настройки» внизу.
      </p>

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
