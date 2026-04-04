"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, Plus, X, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnketaData {
  // 1. Компания
  companyName: string
  industry: string
  companyCity: string
  revenue: string
  // 2. Продукт
  productDescription: string
  averageCheck: string
  dealCycle: string
  segments: string[]
  crm: string
  // 3. Должность
  positionTitle: string
  positionType: string
  workFormats: string[]
  employment: string
  positionCity: string
  // 4. Деньги
  salaryFrom: string
  salaryTo: string
  bonus: string
  payFrequency: string
  showSalary: boolean
  // 5. Портрет кандидата
  requiredSkills: string[]
  desiredSkills: string[]
  experienceMin: string
  experienceIdeal: string
  // 6. Условия
  bonuses: string
  training: string
  careerGrowth: string
  socialPackage: string[]
  // 7. Стоп-факторы
  stopFactors: StopFactor[]
  // 8. Желаемые параметры
  desiredParams: DesiredParam[]
  // 9. Квалификационные вопросы
  questions: string[]
}

interface StopFactor {
  id: string
  label: string
  enabled: boolean
  value?: string
  ageRange?: [number, number]
  custom?: boolean
}

interface DesiredParam {
  id: string
  label: string
  enabled: boolean
  weight: number
  custom?: boolean
}

const DEFAULT_STOP_FACTORS: StopFactor[] = [
  { id: "city", label: "Город проживания", enabled: false },
  { id: "format", label: "Формат работы", enabled: false },
  { id: "age", label: "Возраст", enabled: false, ageRange: [18, 65] },
  { id: "experience", label: "Опыт работы", enabled: false },
  { id: "documents", label: "Документы", enabled: false },
  { id: "skills", label: "Навыки", enabled: false },
  { id: "citizenship", label: "Гражданство", enabled: false },
  { id: "salaryMax", label: "Зарплата максимальная", enabled: false },
]

const DEFAULT_DESIRED_PARAMS: DesiredParam[] = [
  { id: "experience", label: "Опыт в отрасли", enabled: false, weight: 3 },
  { id: "education", label: "Профильное образование", enabled: false, weight: 2 },
  { id: "crm", label: "Знание CRM", enabled: false, weight: 3 },
  { id: "english", label: "Английский язык", enabled: false, weight: 2 },
  { id: "management", label: "Управленческий опыт", enabled: false, weight: 4 },
  { id: "relocation", label: "Готовность к переезду", enabled: false, weight: 2 },
  { id: "travel", label: "Готовность к командировкам", enabled: false, weight: 2 },
]

const SOCIAL_PACKAGE_OPTIONS = [
  "ДМС", "Фитнес", "Питание", "Обучение", "Парковка",
  "Мобильная связь", "Корпоративный транспорт", "Страхование жизни",
]

const SEGMENT_OPTIONS = ["B2B", "B2C", "B2G"]

function emptyAnketa(): AnketaData {
  return {
    companyName: "", industry: "", companyCity: "", revenue: "",
    productDescription: "", averageCheck: "", dealCycle: "", segments: [], crm: "",
    positionTitle: "", positionType: "", workFormats: [], employment: "", positionCity: "",
    salaryFrom: "", salaryTo: "", bonus: "", payFrequency: "monthly", showSalary: true,
    requiredSkills: [], desiredSkills: [], experienceMin: "", experienceIdeal: "",
    bonuses: "", training: "", careerGrowth: "", socialPackage: [],
    stopFactors: DEFAULT_STOP_FACTORS.map(f => ({ ...f })),
    desiredParams: DEFAULT_DESIRED_PARAMS.map(p => ({ ...p })),
    questions: ["", "", ""],
  }
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, number, children, filled }: {
  title: string; number: number; children: React.ReactNode; filled: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
            filled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {number}
          </span>
          <span className="font-medium text-sm">{title}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-4 border-t">{children}</div>}
    </div>
  )
}

// ─── Tag input helper ────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }: {
  tags: string[]; onChange: (t: string[]) => void; placeholder: string
}) {
  const [input, setInput] = useState("")
  const add = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput("")
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <Badge key={t} variant="secondary" className="gap-1 text-xs">
            {t}
            <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
        />
        <Button type="button" variant="outline" size="sm" className="h-8 px-3" onClick={add}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AnketaTab({ vacancyId, descriptionJson }: {
  vacancyId: string
  descriptionJson: unknown
}) {
  const [data, setData] = useState<AnketaData>(() => {
    const saved = (descriptionJson as Record<string, unknown>)?.anketa as AnketaData | undefined
    return saved ? { ...emptyAnketa(), ...saved } : emptyAnketa()
  })
  const [saving, setSaving] = useState(false)

  // Re-sync when descriptionJson changes externally
  useEffect(() => {
    const saved = (descriptionJson as Record<string, unknown>)?.anketa as AnketaData | undefined
    if (saved) setData(prev => ({ ...prev, ...saved }))
  }, [descriptionJson])

  const set = useCallback(<K extends keyof AnketaData>(key: K, value: AnketaData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  // ── Progress calculation ──
  const progress = useMemo(() => {
    let filled = 0
    let total = 9
    if (data.companyName || data.industry || data.companyCity) filled++
    if (data.productDescription || data.averageCheck) filled++
    if (data.positionTitle || data.positionType) filled++
    if (data.salaryFrom || data.salaryTo) filled++
    if (data.requiredSkills.length > 0) filled++
    if (data.bonuses || data.training || data.careerGrowth || data.socialPackage.length > 0) filled++
    if (data.stopFactors.some(f => f.enabled)) filled++
    if (data.desiredParams.some(p => p.enabled)) filled++
    if (data.questions.some(q => q.trim())) filled++
    return Math.round((filled / total) * 100)
  }, [data])

  // ── Save ──
  const save = useCallback(async () => {
    setSaving(true)
    try {
      const existing = (descriptionJson as Record<string, unknown>) ?? {}
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { ...existing, anketa: data } }),
      })
      if (!res.ok) throw new Error("Ошибка сохранения")
      toast.success("Анкета сохранена")
    } catch {
      toast.error("Не удалось сохранить анкету")
    } finally {
      setSaving(false)
    }
  }, [data, descriptionJson, vacancyId])

  // ── Autosave on blur (debounce 2s) ──
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestData = useRef(data)
  latestData.current = data

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      save()
    }, 2000)
  }, [save])

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [])

  const handleBlur = useCallback(() => {
    scheduleAutosave()
  }, [scheduleAutosave])

  const sectionFilled = (idx: number) => {
    switch (idx) {
      case 1: return !!(data.companyName || data.industry || data.companyCity)
      case 2: return !!(data.productDescription || data.averageCheck)
      case 3: return !!(data.positionTitle || data.positionType)
      case 4: return !!(data.salaryFrom || data.salaryTo)
      case 5: return data.requiredSkills.length > 0
      case 6: return !!(data.bonuses || data.training || data.careerGrowth || data.socialPackage.length > 0)
      case 7: return data.stopFactors.some(f => f.enabled)
      case 8: return data.desiredParams.some(p => p.enabled)
      case 9: return data.questions.some(q => q.trim())
      default: return false
    }
  }

  return (
    <div className="space-y-4" onBlur={handleBlur}>
      {/* Progress */}
      <div className="flex items-center gap-3">
        <Progress value={progress} className="flex-1 h-2" />
        <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">{progress}%</span>
        <Button size="sm" className="gap-1.5 h-8" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
      </div>

      {/* 1. Компания */}
      <Section title="Компания" number={1} filled={sectionFilled(1)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Название компании</Label>
            <Input value={data.companyName} onChange={e => set("companyName", e.target.value)} placeholder="ООО Компания" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Отрасль</Label>
            <Input value={data.industry} onChange={e => set("industry", e.target.value)} placeholder="IT, ритейл, производство..." className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Город</Label>
            <Input value={data.companyCity} onChange={e => set("companyCity", e.target.value)} placeholder="Москва" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Оборот</Label>
            <Input value={data.revenue} onChange={e => set("revenue", e.target.value)} placeholder="100 млн ₽/год" className="h-9" />
          </div>
        </div>
      </Section>

      {/* 2. Продукт */}
      <Section title="Продукт" number={2} filled={sectionFilled(2)}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Что продаёт компания</Label>
            <Textarea value={data.productDescription} onChange={e => set("productDescription", e.target.value)} placeholder="Опишите продукт или услугу..." rows={2} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Средний чек</Label>
              <Input value={data.averageCheck} onChange={e => set("averageCheck", e.target.value)} placeholder="500 000 ₽" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Цикл сделки</Label>
              <Input value={data.dealCycle} onChange={e => set("dealCycle", e.target.value)} placeholder="3 месяца" className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Сегменты</Label>
            <div className="flex flex-wrap gap-2">
              {SEGMENT_OPTIONS.map(s => (
                <label key={s} className="flex items-center gap-1.5">
                  <Checkbox
                    checked={data.segments.includes(s)}
                    onCheckedChange={checked => {
                      set("segments", checked ? [...data.segments, s] : data.segments.filter(x => x !== s))
                    }}
                  />
                  <span className="text-sm">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CRM</Label>
            <Input value={data.crm} onChange={e => set("crm", e.target.value)} placeholder="Bitrix24, amoCRM..." className="h-9" />
          </div>
        </div>
      </Section>

      {/* 3. Должность */}
      <Section title="Должность" number={3} filled={sectionFilled(3)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Название должности</Label>
            <Input value={data.positionTitle} onChange={e => set("positionTitle", e.target.value)} placeholder="Менеджер по продажам" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Тип</Label>
            <Select value={data.positionType} onValueChange={v => set("positionType", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Выберите тип" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hunter">Хантер</SelectItem>
                <SelectItem value="farmer">Фермер</SelectItem>
                <SelectItem value="closer">Клозер</SelectItem>
                <SelectItem value="rop">РОП</SelectItem>
                <SelectItem value="other">Другое</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Формат работы</Label>
          <div className="flex flex-wrap gap-3">
            {(["Офис", "Гибрид", "Удалёнка"] as const).map(f => (
              <label key={f} className="flex items-center gap-1.5">
                <Checkbox
                  checked={data.workFormats.includes(f)}
                  onCheckedChange={checked => {
                    set("workFormats", checked ? [...data.workFormats, f] : data.workFormats.filter(x => x !== f))
                  }}
                />
                <span className="text-sm">{f}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Занятость</Label>
            <Select value={data.employment} onValueChange={v => set("employment", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Выберите" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Полная</SelectItem>
                <SelectItem value="part">Частичная</SelectItem>
                <SelectItem value="project">Проектная</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Город</Label>
            <Input value={data.positionCity} onChange={e => set("positionCity", e.target.value)} placeholder="Москва" className="h-9" />
          </div>
        </div>
      </Section>

      {/* 4. Деньги */}
      <Section title="Деньги" number={4} filled={sectionFilled(4)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Зарплата от</Label>
            <Input value={data.salaryFrom} onChange={e => set("salaryFrom", e.target.value)} placeholder="80 000 ₽" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Зарплата до</Label>
            <Input value={data.salaryTo} onChange={e => set("salaryTo", e.target.value)} placeholder="150 000 ₽" className="h-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Бонус</Label>
          <Input value={data.bonus} onChange={e => set("bonus", e.target.value)} placeholder="% от продаж, KPI..." className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Частота выплат</Label>
          <RadioGroup value={data.payFrequency} onValueChange={v => set("payFrequency", v)} className="flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="monthly" id="pay-monthly" />
              <Label htmlFor="pay-monthly" className="text-sm font-normal">Ежемесячно</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="biweekly" id="pay-biweekly" />
              <Label htmlFor="pay-biweekly" className="text-sm font-normal">2 раза в месяц</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="weekly" id="pay-weekly" />
              <Label htmlFor="pay-weekly" className="text-sm font-normal">Еженедельно</Label>
            </div>
          </RadioGroup>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={data.showSalary} onCheckedChange={v => set("showSalary", v)} />
          <Label className="text-sm font-normal">Показывать зарплату в вакансии</Label>
        </div>
      </Section>

      {/* 5. Портрет кандидата */}
      <Section title="Портрет кандидата" number={5} filled={sectionFilled(5)}>
        <div className="space-y-1.5">
          <Label className="text-xs">Обязательные навыки</Label>
          <TagInput tags={data.requiredSkills} onChange={v => set("requiredSkills", v)} placeholder="Добавить навык..." />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Желательные навыки</Label>
          <TagInput tags={data.desiredSkills} onChange={v => set("desiredSkills", v)} placeholder="Добавить навык..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Опыт минимальный (лет)</Label>
            <Input value={data.experienceMin} onChange={e => set("experienceMin", e.target.value)} placeholder="1" className="h-9" type="number" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Опыт идеальный (лет)</Label>
            <Input value={data.experienceIdeal} onChange={e => set("experienceIdeal", e.target.value)} placeholder="3" className="h-9" type="number" />
          </div>
        </div>
      </Section>

      {/* 6. Условия */}
      <Section title="Условия" number={6} filled={sectionFilled(6)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Бонусы</Label>
            <Input value={data.bonuses} onChange={e => set("bonuses", e.target.value)} placeholder="Бонус за выполнение KPI..." className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Обучение</Label>
            <Input value={data.training} onChange={e => set("training", e.target.value)} placeholder="Внутреннее обучение, курсы..." className="h-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Карьерный рост</Label>
          <Input value={data.careerGrowth} onChange={e => set("careerGrowth", e.target.value)} placeholder="Рост до РОП за 1-2 года..." className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Соцпакет</Label>
          <div className="flex flex-wrap gap-2">
            {SOCIAL_PACKAGE_OPTIONS.map(opt => (
              <label key={opt} className="flex items-center gap-1.5">
                <Checkbox
                  checked={data.socialPackage.includes(opt)}
                  onCheckedChange={checked => {
                    set("socialPackage", checked ? [...data.socialPackage, opt] : data.socialPackage.filter(x => x !== opt))
                  }}
                />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* 7. Стоп-факторы */}
      <Section title="Стоп-факторы" number={7} filled={sectionFilled(7)}>
        <div className="space-y-3">
          {data.stopFactors.map((f, idx) => (
            <div key={f.id} className="flex items-start gap-3">
              <Switch
                checked={f.enabled}
                onCheckedChange={v => {
                  const next = [...data.stopFactors]
                  next[idx] = { ...next[idx], enabled: v }
                  set("stopFactors", next)
                }}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm", !f.enabled && "text-muted-foreground")}>{f.label}</span>
                  {f.custom && (
                    <button type="button" onClick={() => set("stopFactors", data.stopFactors.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {f.enabled && f.id === "age" && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{f.ageRange?.[0] ?? 18}</span>
                    <Slider
                      value={f.ageRange ?? [18, 65]}
                      min={18} max={65} step={1}
                      onValueChange={v => {
                        const next = [...data.stopFactors]
                        next[idx] = { ...next[idx], ageRange: v as [number, number] }
                        set("stopFactors", next)
                      }}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground">{f.ageRange?.[1] ?? 65}</span>
                  </div>
                )}
                {f.enabled && f.id === "salaryMax" && (
                  <Input
                    value={f.value ?? ""}
                    onChange={e => {
                      const next = [...data.stopFactors]
                      next[idx] = { ...next[idx], value: e.target.value }
                      set("stopFactors", next)
                    }}
                    placeholder="Максимальная зарплата"
                    className="h-8 text-sm max-w-xs"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button" variant="outline" size="sm" className="gap-1.5 mt-2"
          onClick={() => {
            const id = `custom_${Date.now()}`
            set("stopFactors", [...data.stopFactors, { id, label: "Новый стоп-фактор", enabled: true, custom: true }])
          }}
        >
          <Plus className="w-3.5 h-3.5" />Добавить свой
        </Button>
      </Section>

      {/* 8. Желаемые параметры */}
      <Section title="Желаемые параметры" number={8} filled={sectionFilled(8)}>
        <div className="space-y-3">
          {data.desiredParams.map((p, idx) => (
            <div key={p.id} className="flex items-center gap-3">
              <Switch
                checked={p.enabled}
                onCheckedChange={v => {
                  const next = [...data.desiredParams]
                  next[idx] = { ...next[idx], enabled: v }
                  set("desiredParams", next)
                }}
              />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={cn("text-sm truncate", !p.enabled && "text-muted-foreground")}>{p.label}</span>
                {p.custom && (
                  <button type="button" onClick={() => set("desiredParams", data.desiredParams.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {p.enabled && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Вес:</span>
                  {[1, 2, 3, 4, 5].map(w => (
                    <button
                      key={w} type="button"
                      className={cn(
                        "w-6 h-6 rounded text-xs font-medium transition-colors",
                        p.weight === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                      onClick={() => {
                        const next = [...data.desiredParams]
                        next[idx] = { ...next[idx], weight: w }
                        set("desiredParams", next)
                      }}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button" variant="outline" size="sm" className="gap-1.5 mt-2"
          onClick={() => {
            const id = `custom_${Date.now()}`
            set("desiredParams", [...data.desiredParams, { id, label: "Новый параметр", enabled: true, weight: 3, custom: true }])
          }}
        >
          <Plus className="w-3.5 h-3.5" />Добавить свой
        </Button>
      </Section>

      {/* 9. Квалификационные вопросы */}
      <Section title="Квалификационные вопросы" number={9} filled={sectionFilled(9)}>
        <div className="space-y-3">
          {data.questions.map((q, idx) => (
            <div key={idx} className="space-y-1.5">
              <Label className="text-xs">Вопрос {idx + 1}</Label>
              <Textarea
                value={q}
                onChange={e => {
                  const next = [...data.questions]
                  next[idx] = e.target.value
                  set("questions", next)
                }}
                placeholder={`Квалификационный вопрос ${idx + 1}...`}
                rows={2}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
