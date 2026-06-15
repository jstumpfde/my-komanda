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
 * ВАЖНО: рантайм скоринга этот Spec пока НЕ читает (спящий контур).
 * Legacy-формы (Портрет, AI-профиль, блоки воронки) продолжают работать.
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
import { toast } from "sonner"
import {
  Target, Plus, X, Loader2, ShieldAlert, FileText, Gauge,
  ArrowRightLeft, AlertTriangle, Sparkles, Save,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DEFAULT_SCORING_WEIGHTS,
  type CandidateSpec,
  type ScoringWeights,
  type MidRangeAction,
} from "@/lib/core/spec/types"
import { useVacancySectionRegister } from "./vacancy-settings-context"

// ─── Константы ───────────────────────────────────────────────────────────────

const WEIGHT_LABELS: Record<keyof ScoringWeights, string> = {
  relevant_experience: "Релевантный опыт",
  hard_skills:         "Hard skills",
  tenure_stability:    "Стабильность работы",
  results_in_numbers:  "Цифры результатов",
  soft_skills_fit:     "Soft skills fit",
  company_size_match:  "Размер компаний",
  managerial_match:    "Управленческий опыт",
  education:           "Образование",
  location_readiness:  "Готовность к локации",
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

// ─── Теги-редактор списков (must/nice/deal) ──────────────────────────────────

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
        <span className="text-xs text-muted-foreground">{items.length}/{maxItems}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
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

// ─── Главный компонент ───────────────────────────────────────────────────────

interface SpecEditorProps {
  vacancyId: string
  onSaved?:  () => void
}

export function SpecEditor({ vacancyId, onSaved }: SpecEditorProps) {
  const [spec, setSpec]     = useState<CandidateSpec | null>(null)
  const [source, setSource] = useState<"spec" | "legacy" | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  // Излишки при переносе v1→v2 (то, что не влезло в лимиты must=5/nice=5/deal=3)
  const [overflow, setOverflow] = useState<{ must: string[]; nice: string[]; deal: string[] } | null>(null)

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

  const weightSum = spec
    ? (Object.keys(spec.scoringWeights) as (keyof ScoringWeights)[])
        .reduce((s, k) => s + (spec.scoringWeights[k] ?? 0), 0)
    : 0
  const weightsValid = weightSum === 100

  // ── Сохранение ─────────────────────────────────────────────────────────────
  const save = async () => {
    if (!spec) return
    if (!weightsValid) {
      toast.error("Сумма весов должна быть равна 100")
      throw new Error("weights sum != 100")
    }
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

  return (
    <div className="space-y-6 max-w-3xl">
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
              <p>Обязательные (лимит 5): не перенесено — {overflow.must.join("; ")}</p>
            )}
            {overflow.nice.length > 0 && (
              <p>Желательные (лимит 5): не перенесено — {overflow.nice.join("; ")}</p>
            )}
            {overflow.deal.length > 0 && (
              <p>Неприемлемо (лимит 3): не перенесено — {overflow.deal.join("; ")}</p>
            )}
            <p className="text-muted-foreground">
              Сократите формулировки или объедините пункты, чтобы уложиться в лимиты.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* ── (а) Критерии оценки ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Критерии оценки
          </CardTitle>
          <CardDescription>
            Что AI проверяет в резюме и анкете. Must-have активирует
            структурированный скоринг v2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListEditor
            label="Обязательные (must-have)"
            hint="Без этого кандидат не подходит. Можно целой фразой, напр.: «Опыт руководителем проектов в промышленном строительстве ≥ 5 лет». Enter или + — добавить."
            maxItems={10}
            items={spec.mustHave}
            setItems={v => patch({ mustHave: v })}
            placeholders={LIST_PLACEHOLDERS.must}
          />
          <ListEditor
            label="Желательные (nice-to-have)"
            hint="Повышают оценку, но не дисквалифицируют. Можно фразой."
            maxItems={10}
            items={spec.niceToHave}
            setItems={v => patch({ niceToHave: v })}
            placeholders={LIST_PLACEHOLDERS.nice}
          />
          <ListEditor
            label="Неприемлемо (deal-breakers)"
            hint="При совпадении — отказ, даже если общий балл высокий. Можно фразой."
            maxItems={6}
            items={spec.dealBreakers}
            setItems={v => patch({ dealBreakers: v })}
            placeholders={LIST_PLACEHOLDERS.deal}
          />

          {/* Веса */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-baseline justify-between">
              <Label className="text-sm font-medium">Веса критериев</Label>
              <span className={cn(
                "text-xs font-semibold",
                weightsValid ? "text-emerald-600" : "text-destructive",
              )}>
                Σ = {weightSum} / 100
              </span>
            </div>
            {/* Прогресс-бар суммы */}
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  weightsValid ? "bg-primary" : weightSum > 100 ? "bg-destructive" : "bg-amber-500",
                )}
                style={{ width: `${Math.min(100, weightSum)}%` }}
              />
            </div>
            {!weightsValid && (
              <p className="text-xs text-destructive">
                Сумма весов должна быть ровно 100 — иначе сохранение заблокировано.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {(Object.keys(WEIGHT_LABELS) as (keyof ScoringWeights)[]).map(k => (
                <div key={k} className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs">{WEIGHT_LABELS[k]}</span>
                    <span className="text-xs font-semibold tabular-nums">{spec.scoringWeights[k]}</span>
                  </div>
                  <Slider
                    value={[spec.scoringWeights[k]]}
                    onValueChange={([v]) => patch({ scoringWeights: { ...spec.scoringWeights, [k]: v } })}
                    min={0} max={100} step={1}
                  />
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="ghost" className="text-xs"
              onClick={() => patch({ scoringWeights: DEFAULT_SCORING_WEIGHTS })}>
              Сбросить к дефолтным
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── (б) Стоп-факторы ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Стоп-факторы
          </CardTitle>
          <CardDescription>
            Жёсткий отсев ДО AI-оценки. При срабатывании — авто-отказ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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

          <p className="text-[11px] text-muted-foreground">
            Тексты отказов настраиваются в блоке «Стоп-факторы по резюме»
            Конструктора воронки — здесь только условия отсева.
          </p>
        </CardContent>
      </Card>

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

      {/* ── (г) Идеальный профиль ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4" /> Идеальный профиль
          </CardTitle>
          <CardDescription>
            1–2 предложения для AI: кто идеально подходит на эту позицию.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={spec.idealProfile}
            onChange={e => patch({ idealProfile: e.target.value.slice(0, 500) })}
            placeholder="Опытный B2B продавец из стройиндустрии, готовый к длинным сделкам с крупными клиентами. Самостоятельный, ориентирован на результат."
            rows={3}
            maxLength={500}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
            {spec.idealProfile.length}/500
          </p>
        </CardContent>
      </Card>

      <div className="flex items-end justify-between gap-3 pt-1">
        <p className="text-xs text-muted-foreground max-w-[70%]">
          Заполненный Портрет используется для AI-оценки откликов (новый контур).
          У вакансий с пустым Портретом действуют прежние настройки воронки.
        </p>
        {/* Явная кнопка сохранения (дублирует sticky-бар настроек — чтобы её было видно). */}
        <Button
          onClick={async () => { setSaving(true); try { await save() } catch { /* toast в save */ } finally { setSaving(false) } }}
          disabled={saving || !spec}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}
