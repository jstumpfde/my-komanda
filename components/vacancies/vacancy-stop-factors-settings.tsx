"use client"

// #61: per-vacancy стоп-факторы. UI блок в табе Воронка.
// Каждый фактор: тумблер ВКЛ/ВЫКЛ + параметры + шаблон сообщения отказа.
// Хранение в vacancies.stop_factors_json. Логика применения в process-queue
// будет в отдельной задаче (см. эскейп-клаузу).

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { ShieldAlert, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { VacancyStopFactors } from "@/lib/db/schema"
import { CitizenshipFactorField, citizenshipSummary } from "@/components/vacancies/citizenship-factor-field"

const PLACEHOLDERS = ["name", "vacancy", "company"]

const FORMAT_OPTIONS: Array<{ id: "office" | "hybrid" | "remote"; label: string }> = [
  { id: "office", label: "Офис" },
  { id: "hybrid", label: "Гибрид" },
  { id: "remote", label: "Удалёнка" },
]

function csvToList(s: string): string[] {
  return s.split(",").map(x => x.trim()).filter(x => x.length > 0)
}

interface Props {
  vacancyId: string
  initial?: VacancyStopFactors | null
  onSaved?: () => void
}

export function VacancyStopFactorsSettings({ vacancyId, initial, onSaved }: Props) {
  const [factors, setFactors] = useState<VacancyStopFactors>(initial ?? {})
  const [loaded, setLoaded] = useState(!!initial)
  const [saving, setSaving] = useState(false)

  // CSV-форма для города. Гражданство теперь редактируется чипами через
  // CitizenshipFactorField (см. ниже) — своего CSV-состояния не требует.
  const [cityCsv, setCityCsv] = useState("")

  // Refs для PlaceholderBadges — каждый стоп-фактор имеет свою textarea
  // под текст отказа.
  const refCity = useRef<HTMLTextAreaElement | null>(null)
  const refFormat = useRef<HTMLTextAreaElement | null>(null)
  const refAge = useRef<HTMLTextAreaElement | null>(null)
  const refExp = useRef<HTMLTextAreaElement | null>(null)
  const refCit = useRef<HTMLTextAreaElement | null>(null)
  const refSalary = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (initial) return // уже инициализировано из props
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/stop-factors`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { stopFactors?: VacancyStopFactors } | null) => {
        if (cancelled || !d?.stopFactors) return
        setFactors(d.stopFactors)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId, initial])

  // Когда factors меняется извне — синхронизируем CSV-поля.
  useEffect(() => {
    setCityCsv((factors.city?.allowedCities ?? []).join(", "))
  }, [factors])

  const set = <K extends keyof VacancyStopFactors>(key: K, value: VacancyStopFactors[K]) => {
    setFactors(prev => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    try {
      // Перед сохранением переносим CSV → массивы
      const payload: VacancyStopFactors = {
        ...factors,
        city: factors.city
          ? { ...factors.city, allowedCities: csvToList(cityCsv) }
          : undefined,
        documents: { enabled: false },
      }
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/stop-factors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopFactors: payload }),
      })
      if (!res.ok) { toast.error("Не удалось сохранить стоп-факторы"); return }
      const data = await res.json().catch(() => null) as { stopFactors?: VacancyStopFactors } | null
      if (data?.stopFactors) setFactors(data.stopFactors)
      toast.success("Стоп-факторы сохранены")
      onSaved?.()
    } finally { setSaving(false) }
  }

  // helpers — toggle enabled преобразует undefined → enabled-объект, иначе мутирует существующий.
  const toggleEnabled = (key: keyof VacancyStopFactors, on: boolean) => {
    setFactors(prev => {
      const next = { ...prev }
      const current = (next[key] ?? { enabled: false }) as Record<string, unknown>
      next[key] = { ...current, enabled: on } as VacancyStopFactors[typeof key]
      return next
    })
  }

  return (
    <Card className={cn(!loaded && "opacity-60")}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="size-4" /> Стоп-факторы по резюме
        </CardTitle>
        <CardDescription>
          Включённые факторы AI проверит при разборе резюме. При срабатывании
          — кандидат получит указанный текст отказа, стадия → rejected.
          Поведение применяется только когда фактор включён и заполнены
          параметры.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Город */}
        <FactorRow
          title="Город / релокация"
          help="Если кандидат не из списка и не готов к переезду — стоп"
          enabled={factors.city?.enabled ?? false}
          onToggle={(v) => toggleEnabled("city", v)}
        >
          <div className="space-y-2">
            <Input
              value={cityCsv}
              onChange={(e) => setCityCsv(e.target.value)}
              placeholder="Москва, Московская область, Санкт-Петербург"
              className="h-8 text-sm bg-[var(--input-bg)]"
            />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={Boolean(factors.city?.allowRelocation)}
                onCheckedChange={(v) => set("city", { ...(factors.city ?? { enabled: true }), allowRelocation: Boolean(v) })}
              />
              Засчитывать готовность к переезду как валидную
            </label>
            {cityCsv.trim()
              ? <FactorSummary
                  pass={`Пропускаем: ${cityCsv.trim()}${factors.city?.allowRelocation ? " + готовых к переезду" : ""}.`}
                  cut="Авто-отказ кандидатам из других городов."
                />
              : <FactorSummary idle="Города не указаны — фактор не действует." />}
            <RejectionText
              refEl={refCity}
              value={factors.city?.rejectionText ?? ""}
              onChange={(v) => set("city", { ...(factors.city ?? { enabled: true }), rejectionText: v })}
            />
          </div>
        </FactorRow>

        {/* Формат работы. Семантика инвертируемая на глаз (инцидент 03.07:
            Юрий отметил «Офис», думая что ОТСЕИВАЕТ офисных, а галочки — кого
            ПРОПУСКАЕМ) — поэтому явная подпись + живая сводка под галочками. */}
        <FactorRow
          title="Формат работы"
          help="Галочки — форматы, которые ПОДХОДЯТ вакансии. Кандидат, который хочет другой формат, получит авто-отказ"
          enabled={factors.format?.enabled ?? false}
          onToggle={(v) => toggleEnabled("format", v)}
        >
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Пропускаем кандидатов с форматом:</p>
            <div className="flex gap-3">
              {FORMAT_OPTIONS.map(f => (
                <label key={f.id} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={(factors.format?.allowedFormats ?? []).includes(f.id)}
                    onCheckedChange={(v) => {
                      const current = factors.format?.allowedFormats ?? []
                      const next = v ? [...new Set([...current, f.id])] : current.filter(x => x !== f.id)
                      set("format", { ...(factors.format ?? { enabled: true }), allowedFormats: next as Array<"office" | "hybrid" | "remote"> })
                    }}
                  />
                  {f.label}
                </label>
              ))}
            </div>
            {(() => {
              const allowed = factors.format?.allowedFormats ?? []
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
            <RejectionText
              refEl={refFormat}
              value={factors.format?.rejectionText ?? ""}
              onChange={(v) => set("format", { ...(factors.format ?? { enabled: true }), rejectionText: v })}
            />
          </div>
        </FactorRow>

        {/* Возраст */}
        <FactorRow
          title="Возраст"
          help="Диапазон лет"
          enabled={factors.age?.enabled ?? false}
          onToggle={(v) => toggleEnabled("age", v)}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={factors.age?.minAge ?? ""}
                onChange={(e) => set("age", { ...(factors.age ?? { enabled: true }), minAge: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="мин"
                className="w-20 h-8 text-sm bg-[var(--input-bg)]"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="number"
                value={factors.age?.maxAge ?? ""}
                onChange={(e) => set("age", { ...(factors.age ?? { enabled: true }), maxAge: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder="макс"
                className="w-20 h-8 text-sm bg-[var(--input-bg)]"
              />
            </div>
            {(() => {
              const min = factors.age?.minAge, max = factors.age?.maxAge
              if (min == null && max == null) return <FactorSummary idle="Границы не заданы — фактор не действует." />
              const parts = [min != null ? `младше ${min}` : null, max != null ? `старше ${max}` : null].filter(Boolean)
              return <FactorSummary pass={`Пропускаем: ${min ?? "…"}–${max ?? "…"} лет.`} cut={`Авто-отказ: ${parts.join(" и ")}.`} />
            })()}
            <RejectionText
              refEl={refAge}
              value={factors.age?.rejectionText ?? ""}
              onChange={(v) => set("age", { ...(factors.age ?? { enabled: true }), rejectionText: v })}
            />
          </div>
        </FactorRow>

        {/* Опыт */}
        <FactorRow
          title="Минимальный опыт"
          help="Меньше указанного — стоп"
          enabled={factors.experience?.enabled ?? false}
          onToggle={(v) => toggleEnabled("experience", v)}
        >
          <div className="space-y-2">
            <Input
              type="number"
              value={factors.experience?.minYears ?? ""}
              onChange={(e) => set("experience", { ...(factors.experience ?? { enabled: true }), minYears: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="лет"
              className="w-24 h-8 text-sm bg-[var(--input-bg)]"
            />
            {factors.experience?.minYears != null
              ? <FactorSummary pass={`Пропускаем: опыт от ${factors.experience.minYears} лет.`} cut={`Авто-отказ: опыт меньше ${factors.experience.minYears} лет.`} />
              : <FactorSummary idle="Порог не задан — фактор не действует." />}
            <RejectionText
              refEl={refExp}
              value={factors.experience?.rejectionText ?? ""}
              onChange={(v) => set("experience", { ...(factors.experience ?? { enabled: true }), rejectionText: v })}
            />
          </div>
        </FactorRow>

        {/* Гражданство */}
        <FactorRow
          title="Гражданство"
          help="Разрешить только выбранные страны, либо исключить страны/континенты"
          enabled={factors.citizenship?.enabled ?? false}
          onToggle={(v) => toggleEnabled("citizenship", v)}
        >
          <div className="space-y-2">
            <CitizenshipFactorField
              value={factors.citizenship}
              onChange={(next) => set("citizenship", next)}
            />
            {(() => {
              const s = citizenshipSummary(factors.citizenship)
              return s.idle
                ? <FactorSummary idle={s.idle} />
                : <FactorSummary pass={s.pass} cut={s.cut} />
            })()}
            <RejectionText
              refEl={refCit}
              value={factors.citizenship?.rejectionText ?? ""}
              onChange={(v) => set("citizenship", { ...(factors.citizenship ?? { enabled: true }), rejectionText: v })}
            />
          </div>
        </FactorRow>

        {/* Макс. зарплата */}
        <FactorRow
          title="Макс. зарплатные ожидания"
          help="Если кандидат хочет больше — стоп"
          enabled={factors.salaryExpectation?.enabled ?? false}
          onToggle={(v) => toggleEnabled("salaryExpectation", v)}
        >
          <div className="space-y-2">
            <Input
              type="number"
              value={factors.salaryExpectation?.maxAmount ?? ""}
              onChange={(e) => set("salaryExpectation", { ...(factors.salaryExpectation ?? { enabled: true }), maxAmount: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="₽"
              className="w-32 h-8 text-sm bg-[var(--input-bg)]"
            />
            {factors.salaryExpectation?.maxAmount != null
              ? <FactorSummary pass={`Пропускаем: ожидания до ${factors.salaryExpectation.maxAmount.toLocaleString("ru-RU")} ₽.`} cut="Авто-отказ тем, кто хочет больше." />
              : <FactorSummary idle="Потолок не задан — фактор не действует." />}
            <RejectionText
              refEl={refSalary}
              value={factors.salaryExpectation?.rejectionText ?? ""}
              onChange={(v) => set("salaryExpectation", { ...(factors.salaryExpectation ?? { enabled: true }), rejectionText: v })}
            />
          </div>
        </FactorRow>

        <div className="flex justify-end pt-2 border-t">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  // Локальный sub-компонент для текста отказа с PlaceholderBadges.
  function RejectionText({
    refEl,
    value,
    onChange,
  }: {
    refEl: React.RefObject<HTMLTextAreaElement | null>
    value: string
    onChange: (v: string) => void
  }) {
    return (
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">Текст отказа</Label>
        <textarea
          ref={refEl}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 2000))}
          placeholder="{{name}}, спасибо за интерес к {{vacancy}}. Сейчас мы рассматриваем кандидатов только..."
          rows={3}
          className="w-full border rounded-lg p-2 text-sm resize-y bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        />
        <PlaceholderBadges
          textareaRef={refEl}
          placeholders={PLACEHOLDERS}
          value={value}
          onValueChange={onChange}
        />
      </div>
    )
  }
}

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
// авто-отказ (Юрий 03.07, зеркало FactorSummary из spec-editor).
function FactorSummary({ pass, cut, idle }: { pass?: string | null; cut?: string | null; idle?: string | null }) {
  if (idle) return <p className="text-[11px] leading-snug text-muted-foreground">{idle}</p>
  if (!pass && !cut) return null
  return (
    <p className="text-[11px] leading-snug">
      {pass && <span className="text-success">{pass} </span>}
      {cut && <span className="text-destructive">{cut}</span>}
    </p>
  )
}
