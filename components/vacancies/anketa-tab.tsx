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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronUp, Plus, X, Save, Loader2, Trash2, GripVertical, Upload, Link2, Eye } from "lucide-react"
import { toast } from "sonner"
import { POSITION_CATEGORIES } from "@/lib/position-classifier"
import { type Question, type QuestionAnswerType, defaultQuestion } from "@/lib/course-types"
import { CompanySelector } from "@/components/vacancies/company-selector"

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnketaData {
  // Top-level
  vacancyTitle: string
  // 1. Компания
  companyMode: "own" | "client"
  companyName: string
  industry: string
  companyCity: string
  workFormat: string
  clientCompanyId: string | null
  clientContactId: string | null
  // 2. Должность
  positionCategory: string
  workFormats: string[]
  employment: string[]
  positionCity: string
  // 3. Мотивация
  salaryFrom: string
  salaryTo: string
  bonus: string
  payFrequency: string[]
  showSalary: boolean
  // 4. Обязанности и требования
  responsibilities: string
  requirements: string
  // 5. Портрет кандидата
  requiredSkills: string[]
  desiredSkills: string[]
  unacceptableSkills: string[]
  experienceMin: string
  experienceIdeal: string
  stopFactors: StopFactor[]
  desiredParams: DesiredParam[]
  // 6. Условия
  conditions: string[]
  conditionsCustom: string[]
  // removed: questions (moved to Demonstration)
  questions: Question[]
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

// ─── Constants ───────────────────────────────────────────────────────────────

const POSITION_CATEGORY_OPTIONS = Object.entries(POSITION_CATEGORIES).map(([key, val]) => ({
  value: key,
  label: val.label,
}))

const WORK_FORMAT_OPTIONS = ["Офис", "Гибрид", "Удалёнка"]
const COMPANY_WORK_FORMAT_OPTIONS = [
  { value: "office",   label: "Офис" },
  { value: "remote",   label: "Удалённо" },
  { value: "hybrid",   label: "Гибрид" },
  { value: "rotation", label: "Вахта" },
  { value: "travel",   label: "Разъездной" },
]
const EMPLOYMENT_OPTIONS = ["Полная", "Частичная", "Проектная"]

const PAY_FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Ежемесячно" },
  { value: "biweekly", label: "2 раза в месяц" },
  { value: "weekly", label: "Еженедельно" },
]

const REQUIRED_SKILL_SUGGESTIONS = [
  "Холодные звонки", "Переговоры", "CRM", "B2B продажи", "Презентации",
  "Работа с возражениями", "Коммерческие предложения", "Тендеры",
  "1С", "Excel", "Документооборот", "Ведение базы клиентов",
  "Активные продажи", "Телефонные продажи", "Работа с дебиторкой",
]

const DESIRED_SKILL_SUGGESTIONS = [
  "Английский язык", "Управление командой", "Аналитика", "Маркетинг",
  "Финансовый анализ", "Публичные выступления", "Наставничество",
  "Стратегическое планирование", "Знание ERP", "Power BI", "SQL",
]

const UNACCEPTABLE_SUGGESTIONS = [
  "Без опыта продаж", "Частая смена работы", "Нет высшего образования",
  "Судимость", "Нет водительских прав", "Не готов к командировкам",
]

const DEFAULT_STOP_FACTORS: StopFactor[] = [
  { id: "age", label: "Возраст", enabled: false, ageRange: [18, 65] },
  { id: "experience", label: "Опыт работы (мин. лет)", enabled: false },
  { id: "citizenship", label: "Гражданство", enabled: false },
  { id: "city", label: "Город проживания", enabled: false },
  { id: "format", label: "Формат работы", enabled: false },
  { id: "documents", label: "Документы", enabled: false },
  { id: "salaryMax", label: "Зарплата максимальная", enabled: false },
]

const DEFAULT_DESIRED_PARAMS: DesiredParam[] = [
  { id: "industry_exp", label: "Опыт в отрасли", enabled: false, weight: 3 },
  { id: "education", label: "Профильное образование", enabled: false, weight: 2 },
  { id: "crm", label: "Знание CRM", enabled: false, weight: 3 },
  { id: "english", label: "Английский язык", enabled: false, weight: 2 },
  { id: "management", label: "Управленческий опыт", enabled: false, weight: 4 },
  { id: "relocation", label: "Готовность к переезду", enabled: false, weight: 2 },
  { id: "travel", label: "Готовность к командировкам", enabled: false, weight: 2 },
]

const CONDITIONS_OPTIONS = [
  "ДМС", "Фитнес", "Питание", "Обучение", "Парковка",
  "Мобильная связь", "Корпоративный транспорт", "Страхование жизни",
  "Оплата ГСМ", "13-я зарплата", "Гибкий график", "Удалённые дни",
  "Корпоративные мероприятия", "Программа релокации", "Stock options",
  "Материальная помощь", "Скидки на продукцию", "Компенсация обедов",
  "Оплачиваемые больничные сверх ТК", "Дополнительный отпуск",
  "Менторская программа", "Бюджет на конференции",
]

const ANKETA_QTYPES: { type: QuestionAnswerType; icon: string; label: string; desc: string }[] = [
  { type: "short", icon: "T", label: "Короткий текст", desc: "Одна строка" },
  { type: "long", icon: "≡", label: "Развёрнутый ответ", desc: "Абзац" },
  { type: "yesno", icon: "⊙", label: "Да / Нет", desc: "Один из двух" },
  { type: "single", icon: "◉", label: "Один из списка", desc: "Радио" },
  { type: "multiple", icon: "☑", label: "Несколько", desc: "Чекбоксы" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyAnketa(): AnketaData {
  return {
    vacancyTitle: "",
    companyMode: "own", companyName: "", industry: "", companyCity: "", workFormat: "",
    clientCompanyId: null, clientContactId: null,
    positionCategory: "", workFormats: [], employment: [], positionCity: "",
    salaryFrom: "", salaryTo: "", bonus: "", payFrequency: [], showSalary: true,
    responsibilities: "", requirements: "",
    requiredSkills: [], desiredSkills: [], unacceptableSkills: [],
    experienceMin: "", experienceIdeal: "",
    stopFactors: DEFAULT_STOP_FACTORS.map(f => ({ ...f })),
    desiredParams: DEFAULT_DESIRED_PARAMS.map(p => ({ ...p })),
    conditions: [], conditionsCustom: [],
    questions: [],
  }
}

function migrateAnketa(saved: Record<string, unknown>): AnketaData {
  const d = { ...emptyAnketa(), ...saved } as AnketaData
  // employment: string -> string[]
  if (typeof d.employment === "string" && d.employment) {
    d.employment = [d.employment as string]
  }
  // payFrequency: string -> string[]
  if (typeof d.payFrequency === "string" && d.payFrequency) {
    d.payFrequency = [d.payFrequency as string]
  }
  // questions: string[] -> Question[]
  if (d.questions?.length && typeof d.questions[0] === "string") {
    d.questions = (d.questions as unknown as string[]).filter(q => q.trim()).map(text => ({ ...defaultQuestion(), text }))
  }
  // positionTitle -> vacancyTitle
  if (!d.vacancyTitle && (saved as Record<string, string>).positionTitle) {
    d.vacancyTitle = (saved as Record<string, string>).positionTitle
  }
  // ensure arrays
  if (!Array.isArray(d.conditions)) d.conditions = []
  if (!Array.isArray(d.conditionsCustom)) d.conditionsCustom = []
  if (!Array.isArray(d.unacceptableSkills)) d.unacceptableSkills = []
  return d
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

// ─── Tag input ──────────────────────────────────────────────────────────────

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

// ─── Tag input with suggestions ─────────────────────────────────────────────

function TagInputWithSuggestions({ tags, onChange, placeholder, suggestions }: {
  tags: string[]; onChange: (t: string[]) => void; placeholder: string; suggestions: string[]
}) {
  const available = suggestions.filter(s => !tags.includes(s))
  return (
    <div className="space-y-2">
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...tags, s])}
              className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <TagInput tags={tags} onChange={onChange} placeholder={placeholder} />
    </div>
  )
}

// ─── Question constructor ───────────────────────────────────────────────────

function QuestionEditor({ questions, onChange }: {
  questions: Question[]; onChange: (q: Question[]) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingType, setAddingType] = useState(false)

  const addQuestion = (type: QuestionAnswerType) => {
    const q = { ...defaultQuestion(), id: `q-${Date.now()}`, answerType: type }
    if (type === "single" || type === "multiple") {
      q.options = ["Вариант 1", "Вариант 2"]
    }
    onChange([...questions, q])
    setExpandedId(q.id)
    setAddingType(false)
  }

  const updateQ = (id: string, patch: Partial<Question>) => {
    onChange(questions.map(q => q.id === id ? { ...q, ...patch } : q))
  }

  const removeQ = (id: string) => {
    onChange(questions.filter(q => q.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const moveQ = (idx: number, dir: -1 | 1) => {
    const next = [...questions]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {questions.map((q, idx) => {
        const isOpen = expandedId === q.id
        const meta = ANKETA_QTYPES.find(t => t.type === q.answerType) ?? ANKETA_QTYPES[0]
        return (
          <div key={q.id} className="border rounded-lg">
            {/* Header */}
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedId(isOpen ? null : q.id)}
            >
              <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}</span>
              <span className="flex-1 text-sm truncate">{q.text || "Новый вопрос"}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">{meta.icon} {meta.label}</Badge>
              {q.required && <span className="text-destructive text-xs font-bold">*</span>}
              <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
            </button>

            {/* Expanded */}
            {isOpen && (
              <div className="px-3 pb-3 pt-1 border-t space-y-3">
                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveQ(idx, -1)} disabled={idx === 0}>
                    <ChevronUp className="w-3 h-3" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveQ(idx, 1)} disabled={idx === questions.length - 1}>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  <div className="flex-1" />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox checked={q.required ?? false} onCheckedChange={v => updateQ(q.id, { required: !!v })} />
                    Обязательный
                  </label>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeQ(q.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                {/* Question text */}
                <div className="space-y-1">
                  <Label className="text-xs">Текст вопроса</Label>
                  <Textarea value={q.text} onChange={e => updateQ(q.id, { text: e.target.value })} placeholder="Введите вопрос..." rows={2} />
                </div>

                {/* Type picker */}
                <div className="space-y-1">
                  <Label className="text-xs">Тип ответа</Label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {ANKETA_QTYPES.map(t => (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => {
                          const patch: Partial<Question> = { answerType: t.type }
                          if ((t.type === "single" || t.type === "multiple") && q.options.length === 0) {
                            patch.options = ["Вариант 1", "Вариант 2"]
                          }
                          updateQ(q.id, patch)
                        }}
                        className={cn(
                          "flex flex-col items-center gap-0.5 p-2 rounded-lg border text-center transition-colors",
                          q.answerType === t.type ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                        )}
                      >
                        <span className="text-lg font-mono leading-none">{t.icon}</span>
                        <span className="text-[10px] font-medium leading-tight">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options for single/multiple */}
                {(q.answerType === "single" || q.answerType === "multiple") && (
                  <div className="space-y-2">
                    <Label className="text-xs">Варианты ответа</Label>
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          type="button"
                          title="Правильный ответ"
                          onClick={() => {
                            const cur = q.correctOptions ?? []
                            if (q.answerType === "single") {
                              updateQ(q.id, { correctOptions: cur.includes(oi) ? [] : [oi] })
                            } else {
                              updateQ(q.id, { correctOptions: cur.includes(oi) ? cur.filter(i => i !== oi) : [...cur, oi] })
                            }
                          }}
                          className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] shrink-0 transition-colors",
                            (q.correctOptions ?? []).includes(oi)
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-muted-foreground/30 hover:border-emerald-400"
                          )}
                        >
                          {(q.correctOptions ?? []).includes(oi) && "✓"}
                        </button>
                        <Input
                          value={opt}
                          onChange={e => {
                            const next = [...q.options]
                            next[oi] = e.target.value
                            updateQ(q.id, { options: next })
                          }}
                          className="h-7 text-xs flex-1"
                        />
                        <Button
                          type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => {
                            const next = q.options.filter((_, i) => i !== oi)
                            const nextCorrect = (q.correctOptions ?? []).filter(i => i !== oi).map(i => i > oi ? i - 1 : i)
                            updateQ(q.id, { options: next, correctOptions: nextCorrect })
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={() => updateQ(q.id, { options: [...q.options, `Вариант ${q.options.length + 1}`] })}
                    >
                      <Plus className="w-3 h-3" />Добавить вариант
                    </Button>
                  </div>
                )}

                {/* Yes/No correct answer */}
                {q.answerType === "yesno" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Правильный ответ</Label>
                    <div className="flex gap-2">
                      {(["yes", "no"] as const).map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => updateQ(q.id, { correctYesNo: q.correctYesNo === v ? undefined : v })}
                          className={cn(
                            "px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                            q.correctYesNo === v
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                              : "border-border hover:border-emerald-400"
                          )}
                        >
                          {v === "yes" ? "Да" : "Нет"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add question */}
      {addingType ? (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Выберите тип вопроса:</p>
          <div className="grid grid-cols-5 gap-1.5">
            {ANKETA_QTYPES.map(t => (
              <button
                key={t.type}
                type="button"
                onClick={() => addQuestion(t.type)}
                className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-xl font-mono leading-none">{t.icon}</span>
                <span className="text-[10px] font-semibold">{t.label}</span>
                <span className="text-[9px] text-muted-foreground">{t.desc}</span>
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setAddingType(false)}>Отмена</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => setAddingType(true)}>
          <Plus className="w-3.5 h-3.5" />Добавить вопрос
        </Button>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AnketaTab({ vacancyId, descriptionJson, onTitleChange }: {
  vacancyId: string
  descriptionJson: unknown
  onTitleChange?: (title: string) => void
}) {
  const [data, setData] = useState<AnketaData>(() => {
    const saved = (descriptionJson as Record<string, unknown>)?.anketa as Record<string, unknown> | undefined
    return saved ? migrateAnketa(saved) : emptyAnketa()
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const saved = (descriptionJson as Record<string, unknown>)?.anketa as Record<string, unknown> | undefined
    if (saved) setData(prev => ({ ...prev, ...migrateAnketa(saved) }))
  }, [descriptionJson])

  const set = useCallback(<K extends keyof AnketaData>(key: K, value: AnketaData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  // ── Progress ──
  const progress = useMemo(() => {
    let filled = 0
    const total = 7
    if (data.vacancyTitle) filled++
    if (data.companyName || data.clientCompanyId || data.companyMode === "own") filled++
    if (data.positionCategory) filled++
    if (data.salaryFrom || data.salaryTo) filled++
    if (data.responsibilities || data.requirements) filled++
    if (data.requiredSkills.length > 0) filled++
    if (data.conditions.length > 0 || data.conditionsCustom.length > 0) filled++
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

  // ── Autosave ──
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => save(), 2000)
  }, [save])
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])
  const handleBlur = useCallback(() => scheduleAutosave(), [scheduleAutosave])

  const sectionFilled = (idx: number) => {
    switch (idx) {
      case 1: return !!(data.companyName || data.clientCompanyId || data.companyMode === "own")
      case 2: return !!data.positionCategory
      case 3: return !!(data.salaryFrom || data.salaryTo)
      case 4: return !!(data.responsibilities || data.requirements)
      case 5: return data.requiredSkills.length > 0
      case 6: return data.conditions.length > 0 || data.conditionsCustom.length > 0
      default: return false
    }
  }

  // ── Toggle helpers ──
  const toggleArray = useCallback((key: keyof AnketaData, value: string) => {
    setData(prev => {
      const arr = prev[key] as string[]
      return { ...prev, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] }
    })
  }, [])

  return (
    <div className="space-y-4" onBlur={handleBlur}>
      {/* Progress */}
      <div className="flex items-center gap-3">
        <Progress value={progress} className="flex-1 h-2" />
        <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">{progress}%</span>
      </div>

      {/* ── Название вакансии (top-level) ── */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Название вакансии</Label>
        <Input
          value={data.vacancyTitle}
          onChange={e => { set("vacancyTitle", e.target.value); onTitleChange?.(e.target.value) }}
          placeholder="Менеджер по продажам"
          className="h-11 text-lg"
        />
      </div>

      {/* ── 1. Компания ── */}
      <Section title="Компания" number={1} filled={sectionFilled(1)}>
        <CompanySelector
          mode={data.companyMode}
          clientCompanyId={data.clientCompanyId}
          clientContactId={data.clientContactId}
          onModeChange={v => set("companyMode", v)}
          onCompanyChange={v => set("clientCompanyId", v)}
          onContactChange={v => set("clientContactId", v)}
        />
      </Section>

      {/* ── 2. Должность ── */}
      <Section title="Должность" number={2} filled={sectionFilled(2)}>
        <div className="space-y-1.5">
          <Label className="text-xs">Категория</Label>
          <div className="flex items-center gap-2">
            <Select value={data.positionCategory} onValueChange={v => set("positionCategory", v)}>
              <SelectTrigger className="h-9 border min-w-[300px]"><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
              <SelectContent>
                {POSITION_CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0" onClick={() => toast("Добавление категорий будет доступно в настройках")}>
              <Plus className="w-3.5 h-3.5" />
              Категория
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <Label className="text-xs">Формат работы</Label>
            <div className="flex flex-wrap gap-3">
              {WORK_FORMAT_OPTIONS.map(f => (
                <label key={f} className="flex items-center gap-1.5">
                  <Checkbox checked={data.workFormats.includes(f)} onCheckedChange={() => toggleArray("workFormats", f)} />
                  <span className="text-sm">{f}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Занятость</Label>
            <div className="flex flex-wrap gap-3">
              {EMPLOYMENT_OPTIONS.map(e => (
                <label key={e} className="flex items-center gap-1.5">
                  <Checkbox checked={data.employment.includes(e)} onCheckedChange={() => toggleArray("employment", e)} />
                  <span className="text-sm">{e}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs">Город</Label>
          <Input value={data.positionCity} onChange={e => set("positionCity", e.target.value)} placeholder="Москва" className="h-9 border" />
        </div>
      </Section>

      {/* ── 3. Мотивация ── */}
      <Section title="Мотивация" number={3} filled={sectionFilled(3)}>
        <div className="max-w-2xl space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div className="space-y-1.5">
              <Label className="text-xs">Зарплата от</Label>
              <Input value={data.salaryFrom} onChange={e => set("salaryFrom", e.target.value)} placeholder="80 000 ₽" className="h-9 border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Зарплата до</Label>
              <Input value={data.salaryTo} onChange={e => set("salaryTo", e.target.value)} placeholder="150 000 ₽" className="h-9 border" />
            </div>
          </div>
          <div className="space-y-1.5 max-w-lg">
            <Label className="text-xs">Бонусы</Label>
            <Textarea value={data.bonus} onChange={e => set("bonus", e.target.value)} placeholder="% от продаж, KPI, бонус за перевыполнение плана, квартальная премия..." rows={2} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Частота выплат</Label>
            <div className="flex flex-wrap gap-3">
              {PAY_FREQUENCY_OPTIONS.map(o => (
                <label key={o.value} className="flex items-center gap-1.5">
                  <Checkbox checked={data.payFrequency.includes(o.value)} onCheckedChange={() => toggleArray("payFrequency", o.value)} />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── 4. Обязанности и требования ── */}
      <Section title="Обязанности и требования" number={4} filled={sectionFilled(4)}>
        <p className="text-xs text-muted-foreground -mt-2">Описание задач и функционала должности</p>
        <div className="space-y-1.5">
          <Label className="text-xs">Обязанности</Label>
          <Textarea
            value={data.responsibilities}
            onChange={e => set("responsibilities", e.target.value)}
            placeholder="Что будет делать сотрудник..."
            rows={4}
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Требования</Label>
          <Textarea
            value={data.requirements}
            onChange={e => set("requirements", e.target.value)}
            placeholder="Что должен знать и уметь..."
            rows={4}
            className="text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => toast("Загрузка файлов будет доступна в ближайшем обновлении")}>
            <Upload className="w-3.5 h-3.5" />
            Загрузить описание
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => toast("Импорт из ссылки будет доступен в ближайшем обновлении")}>
            <Link2 className="w-3.5 h-3.5" />
            Импорт из ссылки
          </Button>
        </div>
      </Section>

      {/* ── 5. Портрет кандидата ── */}
      <Section title="Портрет кандидата" number={5} filled={sectionFilled(5)}>
        {/* Skills */}
        <div className="space-y-1.5">
          <Label className="text-xs">Обязательные навыки</Label>
          <TagInputWithSuggestions tags={data.requiredSkills} onChange={v => set("requiredSkills", v)} placeholder="Добавить навык..." suggestions={REQUIRED_SKILL_SUGGESTIONS} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Желательные навыки</Label>
          <TagInputWithSuggestions tags={data.desiredSkills} onChange={v => set("desiredSkills", v)} placeholder="Добавить навык..." suggestions={DESIRED_SKILL_SUGGESTIONS} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-destructive/80">Неприемлемо</Label>
          <TagInputWithSuggestions tags={data.unacceptableSkills} onChange={v => set("unacceptableSkills", v)} placeholder="Что неприемлемо..." suggestions={UNACCEPTABLE_SUGGESTIONS} />
        </div>

        {/* Experience */}
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

        {/* Stop factors */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs font-semibold">Стоп-факторы</Label>
          <div className="space-y-2">
            {data.stopFactors.map((f, idx) => (
              <div key={f.id}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={f.enabled}
                    onCheckedChange={v => {
                      const next = [...data.stopFactors]
                      next[idx] = { ...next[idx], enabled: !!v }
                      set("stopFactors", next)
                    }}
                  />
                  <span className={cn("text-sm flex-1", !f.enabled && "text-muted-foreground")}>{f.label}</span>
                  {f.custom && (
                    <button type="button" onClick={() => set("stopFactors", data.stopFactors.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {f.enabled && f.id === "age" && (
                  <div className="flex items-center gap-3 ml-6 mt-1">
                    <span className="text-xs text-muted-foreground w-6 text-right">{f.ageRange?.[0] ?? 18}</span>
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
                    <span className="text-xs text-muted-foreground w-6">{f.ageRange?.[1] ?? 65}</span>
                  </div>
                )}
                {f.enabled && (f.id === "experience" || f.id === "citizenship" || f.id === "salaryMax" || f.id === "city" || f.id === "documents") && (
                  <Input
                    value={f.value ?? ""}
                    onChange={e => {
                      const next = [...data.stopFactors]
                      next[idx] = { ...next[idx], value: e.target.value }
                      set("stopFactors", next)
                    }}
                    placeholder={f.id === "salaryMax" ? "Максимальная сумма" : f.id === "experience" ? "Мин. лет" : "Уточните..."}
                    className="h-7 text-xs max-w-xs ml-6 mt-1"
                  />
                )}
              </div>
            ))}
          </div>
          <Button
            type="button" variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => set("stopFactors", [...data.stopFactors, { id: `sf_${Date.now()}`, label: "Новый стоп-фактор", enabled: true, custom: true }])}
          >
            <Plus className="w-3 h-3" />Добавить свой
          </Button>
        </div>

        {/* Desired params */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs font-semibold">Желаемые параметры</Label>
          <div className="space-y-2">
            {data.desiredParams.map((p, idx) => (
              <div key={p.id} className="flex items-center gap-2">
                <Checkbox
                  checked={p.enabled}
                  onCheckedChange={v => {
                    const next = [...data.desiredParams]
                    next[idx] = { ...next[idx], enabled: !!v }
                    set("desiredParams", next)
                  }}
                />
                <span className={cn("text-sm flex-1 min-w-0 truncate", !p.enabled && "text-muted-foreground")}>{p.label}</span>
                {p.custom && (
                  <button type="button" onClick={() => set("desiredParams", data.desiredParams.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {p.enabled && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">Вес:</span>
                    {[1, 2, 3, 4, 5].map(w => (
                      <button
                        key={w} type="button"
                        className={cn(
                          "w-5 h-5 rounded text-[10px] font-medium transition-colors",
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
            type="button" variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => set("desiredParams", [...data.desiredParams, { id: `dp_${Date.now()}`, label: "Новый параметр", enabled: true, weight: 3, custom: true }])}
          >
            <Plus className="w-3 h-3" />Добавить свой
          </Button>
        </div>
      </Section>

      {/* ── 6. Условия ── */}
      <Section title="Условия" number={6} filled={sectionFilled(6)}>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {CONDITIONS_OPTIONS.map(opt => (
            <label key={opt} className="flex items-center gap-1.5">
              <Checkbox checked={data.conditions.includes(opt)} onCheckedChange={() => toggleArray("conditions", opt)} />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
        {data.conditionsCustom.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.conditionsCustom.map(c => (
              <Badge key={c} variant="secondary" className="gap-1 text-xs">
                {c}
                <button type="button" onClick={() => set("conditionsCustom", data.conditionsCustom.filter(x => x !== c))} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <TagInput tags={[]} onChange={tags => { if (tags.length > 0) set("conditionsCustom", [...data.conditionsCustom, ...tags]) }} placeholder="Добавить своё условие..." />
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-between mt-4">
        <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs" onClick={() => toast("Предпросмотр вакансии будет доступен в ближайшем обновлении")}>
          <Eye className="w-3.5 h-3.5" />
          Предпросмотр вакансии
        </Button>
        <Button size="sm" className="gap-1.5 h-9 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}
