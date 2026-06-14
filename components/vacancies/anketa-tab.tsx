"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import { hasSkill, dedupeSkills } from "@/lib/skills/normalize"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {ChevronDown, ChevronUp, Plus, X, Save, Loader2, Trash2, Eye, Copy, FileDown, Sparkles, RefreshCw, Check, PenLine, Upload, File, FileSpreadsheet, FileImage} from "lucide-react"
import { toast } from "sonner"
import { POSITION_CATEGORIES } from "@/lib/position-classifier"
// AnketaPublicSection переехал в отдельный таб «Анкета» (Ф5.1) и рендерится
// из app/(modules)/hr/vacancies/[id]/page.tsx — здесь больше не используется.
import { type Question, type QuestionAnswerType, defaultQuestion } from "@/lib/course-types"
import { CompanySelector } from "@/components/vacancies/company-selector"
import { type ParsedVacancy } from "@/components/vacancies/anketa-wizard"
import { VacancyAdvisor } from "@/components/vacancies/vacancy-advisor"

// ─── Types ───────────────────────────────────────────────────────────────────

type AiWeightLevel = "critical" | "important" | "nice" | "irrelevant"

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
  requiredExperience: string
  hiringPlan: number
  // 3. Мотивация
  salaryFrom: string
  salaryTo: string
  bonus: string
  payFrequency: string[]
  showSalary: boolean
  // 4. О компании
  companyDescription: string
  // O1 мультикомпанийность: под какую компанию-бренд идёт вакансия.
  // "" = основная компания из кабинета (Брендинг), №1. Иначе — id бренда
  // из companies.hiringDefaultsJson.brandCompanies (№2+). Кандидат видит
  // имя/описание выбранного бренда. Основная компания не редактируется здесь.
  brandCompanyId: string
  // 5. Обязанности и требования
  responsibilities: string
  requirements: string
  // 5. Портрет кандидата
  requiredSkills: string[]
  desiredSkills: string[]
  unacceptableSkills: string[]
  experienceMin: string
  experienceIdeal: string
  // Языки (hh language id) с уровнями (hh уровень a1..c2/l1) — для исходящего подбора
  aiLanguages: { lang: string; level: string }[]
  // Уровень образования (hh education_level id), "" = любое
  educationLevel: string
  stopFactors: StopFactor[]
  desiredParams: DesiredParam[]
  // 6. Условия
  conditions: string[]
  conditionsCustom: string[]
  employmentType: string[]
  schedule: string
  employeeType: string
  // removed: questions (moved to Demonstration)
  questions: Question[]
  // 7. AI-генерация
  screeningQuestions: string[]
  hhDescription: string
  // Специфика продаж (section 4)
  avgDealSize: string
  salesCycle: string
  salesType: string[]
  targetAudience: string[]
  // Фильтры критериев отбора
  filterCities: string[]
  filterCitizenship: { mode: "russia" | "any" | "custom"; countries: string[]; isStopFactor: boolean }
  // 8. AI-профиль кандидата
  aiMinExperience: string
  aiRequiredHardSkills: string[]
  aiStopFactors: string[]
  aiIdealProfile: string
  aiWeights: Record<string, AiWeightLevel>
  // Кастомные критерии оценки сверх встроенных (произвольное число под вакансию).
  aiCustomCriteria: { label: string; weight: AiWeightLevel; hint?: string }[]
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

interface AttachmentAnalysis {
  type: string
  relevance: "high" | "medium" | "low"
  summary: string
  extractedData: {
    responsibilities: string
    requirements: string
    conditions: string[]
  }
}

interface Attachment {
  name: string
  url: string
  size: number
  type: string
  uploadedAt: string
  analysis?: AttachmentAnalysis
  analyzing?: boolean
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

const REQUIRED_EXPERIENCE_OPTIONS = [
  { value: "none", label: "Без опыта" },
  { value: "1-3", label: "1–3 года" },
  { value: "3-6", label: "3–6 лет" },
  { value: "6+", label: "от 6 лет" },
]

const EMPLOYMENT_TYPE_OPTIONS = ["Трудовой договор (ТК РФ)", "ГПХ", "Самозанятый", "ИП"]

const SCHEDULE_OPTIONS = [
  { value: "5/2", label: "5/2" },
  { value: "2/2", label: "2/2" },
  { value: "free", label: "Свободный" },
  { value: "shift", label: "Сменный" },
  { value: "rotation", label: "Вахта" },
  { value: "other", label: "Другое" },
]

const EMPLOYEE_TYPE_OPTIONS = [
  { value: "permanent", label: "Постоянный" },
  { value: "temporary", label: "Временный / Проектный" },
]

const SALES_CYCLE_OPTIONS = [
  { value: "1-3d", label: "1-3 дня" },
  { value: "1-2w", label: "1-2 недели" },
  { value: "1-3m", label: "1-3 месяца" },
  { value: "3-6m", label: "3-6 месяцев" },
  { value: "6m+", label: "6+ месяцев" },
]

const SALES_TYPE_OPTIONS = ["Холодные звонки", "Входящие лиды", "Демонстрации", "Партнёрские", "Тендеры", "Нетворкинг"]

const TARGET_AUDIENCE_OPTIONS = ["Собственники", "Директора/CEO", "HR-директора", "Коммерческие директора", "Руководители отделов"]

const AI_WEIGHT_OPTIONS: { value: AiWeightLevel; label: string }[] = [
  { value: "critical", label: "Критично" },
  { value: "important", label: "Важно" },
  { value: "nice", label: "Желательно" },
  { value: "irrelevant", label: "Не важно" },
]

// Встроенные критерии ОЦЕНКИ профпригодности. Город и формат работы убраны
// намеренно — это жёсткие ФИЛЬТРЫ (стоп-факторы вакансии), а не баллы
// (см. lib/scoring/vacancy-spec.ts и TZ-SCORING-FILTERS-SPLIT). Сверх этих осей
// HR может добавить свои критерии ниже (aiCustomCriteria).
const AI_WEIGHT_CRITERIA = [
  { id: "industry_experience", label: "Опыт в отрасли" },
  { id: "specific_skills", label: "Конкретные навыки" },
  { id: "salary_match", label: "Зарплатное соответствие" },
  { id: "management", label: "Опыт управления" },
  { id: "education", label: "Образование" },
]

const DEFAULT_AI_WEIGHTS: Record<string, AiWeightLevel> = {
  industry_experience: "critical",
  specific_skills: "critical",
  salary_match: "important",
  management: "nice",
  education: "nice",
}

const PAY_FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Ежемесячно" },
  { value: "biweekly", label: "2 раза в месяц" },
  { value: "weekly", label: "Еженедельно" },
]

const REQUIRED_SKILL_SUGGESTIONS = [
  "Холодные звонки", "Переговоры", "CRM", "B2B продажи", "Презентации",
  "Работа с возражениями", "Коммерческие предложения", "Тендеры", "1С", "Excel",
  "Документооборот", "Ведение базы клиентов", "Активные продажи", "Телефонные продажи",
  "Работа с дебиторкой", "Аналитика продаж", "Управление командой", "Маркетинг",
  "Финансовый анализ", "Бухгалтерия", "Кадровое делопроизводство", "Подбор персонала",
  "Обучение персонала", "Деловая переписка", "Тайм-менеджмент", "Проектное управление",
  "Agile/Scrum", "JIRA", "Confluence", "MS Office", "Google Workspace",
  "Python", "JavaScript", "SQL", "Power BI", "Tableau", "SAP", "Битрикс24",
  "AmoCRM", "Salesforce", "Figma", "Adobe Photoshop", "Adobe Illustrator",
  "Контент-маркетинг", "SEO", "SMM", "Таргетированная реклама", "Контекстная реклама",
  "Email-маркетинг", "Копирайтинг", "Видеомонтаж", "Фотография",
  "Логистика", "Закупки", "Складской учёт", "ВЭД", "Таможенное оформление",
  "Английский язык", "Немецкий язык", "Китайский язык", "Французский язык",
  "Водительские права B", "Командировки", "Работа в команде", "Лидерство",
  "Стрессоустойчивость", "Многозадачность", "Клиентоориентированность",
]

const DESIRED_SKILL_SUGGESTIONS = [
  "Английский язык", "Управление командой", "Аналитика", "Маркетинг",
  "Финансовый анализ", "Публичные выступления", "Наставничество",
  "Стратегическое планирование", "Знание ERP", "Power BI", "SQL",
  "Немецкий язык", "Китайский язык", "Французский язык",
  "Agile/Scrum", "JIRA", "Confluence", "Figma", "Tableau",
  "Проектное управление", "Тайм-менеджмент", "Деловая переписка",
  "Копирайтинг", "SEO", "SMM", "Email-маркетинг", "Контент-маркетинг",
  "Python", "JavaScript", "MS Office", "Google Workspace",
  "Лидерство", "Коучинг", "Фасилитация", "Медиация", "Дизайн-мышление",
  "Водительские права B", "Командировки", "Работа в команде",
]

const UNACCEPTABLE_SUGGESTIONS = [
  "Без опыта продаж", "Частая смена работы", "Нет высшего образования",
  "Судимость", "Нет водительских прав", "Не готов к командировкам",
  "Нет опыта в отрасли", "Завышенные зарплатные ожидания", "Курение",
  "Нет регистрации", "Не владеет ПК", "Работа только удалённо",
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

// hh language id → русский лейбл (только точно известные id из hh /languages)
const LANGUAGE_OPTIONS: { id: string; label: string }[] = [
  { id: "eng", label: "Английский" },
  { id: "deu", label: "Немецкий" },
  { id: "fra", label: "Французский" },
  { id: "spa", label: "Испанский" },
  { id: "ita", label: "Итальянский" },
  { id: "zho", label: "Китайский" },
]
// hh уровень владения языком
const LANGUAGE_LEVEL_OPTIONS: { id: string; label: string }[] = [
  { id: "a1", label: "A1 — начальный" },
  { id: "a2", label: "A2 — элементарный" },
  { id: "b1", label: "B1 — средний" },
  { id: "b2", label: "B2 — средне-продвинутый" },
  { id: "c1", label: "C1 — продвинутый" },
  { id: "c2", label: "C2 — в совершенстве" },
  { id: "l1", label: "Родной" },
]
// hh education_level id → русский лейбл
const EDUCATION_LEVEL_OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "Любое" },
  { id: "secondary", label: "Среднее" },
  { id: "special_secondary", label: "Среднее специальное" },
  { id: "unfinished_higher", label: "Неоконченное высшее" },
  { id: "higher", label: "Высшее" },
  { id: "bachelor", label: "Бакалавр" },
  { id: "master", label: "Магистр" },
  { id: "candidate", label: "Кандидат наук" },
  { id: "doctor", label: "Доктор наук" },
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
    requiredExperience: "", hiringPlan: 1,
    salaryFrom: "", salaryTo: "", bonus: "", payFrequency: [], showSalary: true,
    companyDescription: "", brandCompanyId: "",
    responsibilities: "", requirements: "",
    requiredSkills: [], desiredSkills: [], unacceptableSkills: [],
    experienceMin: "", experienceIdeal: "",
    aiLanguages: [], educationLevel: "",
    stopFactors: DEFAULT_STOP_FACTORS.map(f => ({ ...f })),
    desiredParams: DEFAULT_DESIRED_PARAMS.map(p => ({ ...p })),
    conditions: [], conditionsCustom: [],
    employmentType: [], schedule: "", employeeType: "permanent",
    avgDealSize: "", salesCycle: "", salesType: [], targetAudience: [],
    filterCities: [],
    filterCitizenship: { mode: "russia", countries: [], isStopFactor: false },
    questions: [],
    screeningQuestions: [], hhDescription: "",
    aiMinExperience: "", aiRequiredHardSkills: [], aiStopFactors: [],
    aiIdealProfile: "", aiWeights: { ...DEFAULT_AI_WEIGHTS }, aiCustomCriteria: [],
  }
}

function isSalesCategory(category: string): boolean {
  if (!category) return false
  const lower = category.toLowerCase()
  return /продаж|sales|менеджер|b2b/i.test(lower) || lower === "sales"
}

/** Collapse double newlines into single, trim blank lines */
function cleanText(s: string): string {
  return s.replace(/\n{2,}/g, "\n").replace(/^\s*\n/gm, "").trim()
}

function migrateAnketa(saved: Record<string, unknown>): AnketaData {
  const d = { ...emptyAnketa(), ...saved } as AnketaData
  // aiCustomCriteria: защита от старого/битого значения (должен быть массив)
  if (!Array.isArray(d.aiCustomCriteria)) d.aiCustomCriteria = []
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
  // ensure arrays — split imported conditions into known/custom
  if (!Array.isArray(d.conditions)) d.conditions = []
  if (!Array.isArray(d.conditionsCustom)) d.conditionsCustom = []
  if (d.conditions.length > 0) {
    const known = new Set(CONDITIONS_OPTIONS)
    const knownItems = d.conditions.filter(c => known.has(c))
    const customItems = d.conditions.filter(c => !known.has(c))
    if (customItems.length > 0) {
      d.conditions = knownItems
      d.conditionsCustom = [...new Set([...d.conditionsCustom, ...customItems])]
    }
  }
  if (!Array.isArray(d.unacceptableSkills)) d.unacceptableSkills = []
  // Языки / образование — старые анкеты без этих полей не должны падать
  if (!Array.isArray(d.aiLanguages)) d.aiLanguages = []
  else d.aiLanguages = d.aiLanguages.filter(l => l && typeof l.lang === "string").map(l => ({ lang: l.lang, level: typeof l.level === "string" ? l.level : "" }))
  if (typeof d.educationLevel !== "string") d.educationLevel = ""

  // Apply parsed stop factors from file import
  const psf = (saved as Record<string, unknown>).parsedStopFactors as Record<string, string | boolean> | undefined
  if (psf) {
    d.stopFactors = d.stopFactors.map(f => {
      if (f.id in psf) {
        const val = psf[f.id]
        if (f.id === "age" && typeof val === "string" && val.includes("-")) {
          const [min, max] = val.split("-").map(Number)
          return { ...f, enabled: true, ageRange: [min || 18, max || 65] as [number, number] }
        }
        return { ...f, enabled: true, value: typeof val === "string" ? val : undefined }
      }
      return f
    })
  }

  // Apply parsed desired params from file import
  const pdp = (saved as Record<string, unknown>).parsedDesiredParams as string[] | undefined
  if (pdp && pdp.length > 0) {
    const enableSet = new Set(pdp)
    d.desiredParams = d.desiredParams.map(p =>
      enableSet.has(p.id) ? { ...p, enabled: true } : p
    )
  }

  // Clean up double newlines in text fields
  d.bonus = cleanText(d.bonus)
  d.responsibilities = cleanText(d.responsibilities)
  d.requirements = cleanText(d.requirements)

  return d
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, number, children, filled, id }: {
  title: string; number: number; children: React.ReactNode; filled: boolean; id?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border rounded-lg" id={id}>
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

function TagInput({ tags, onChange, placeholder, customType }: {
  tags: string[]; onChange: (t: string[]) => void; placeholder: string; customType?: string
}) {
  const [input, setInput] = useState("")
  const add = () => {
    const v = input.trim()
    // Дедуп по канону (см. lib/skills/normalize) — не плодим «B2B»/«B2B-».
    if (v && !hasSkill(tags, v)) {
      onChange([...tags, v])
      if (customType) {
        fetch("/api/custom-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: v, type: customType }),
        }).catch(() => {})
      }
    }
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
          className="h-8 text-sm bg-[var(--input-bg)] border border-input"
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

function TagInputWithSuggestions({ tags, onChange, placeholder, suggestions, customType }: {
  tags: string[]; onChange: (t: string[]) => void; placeholder: string; suggestions: string[]; customType?: string
}) {
  const [input, setInput] = useState("")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [customItems, setCustomItems] = useState<string[]>([])

  useEffect(() => {
    if (!customType) return
    fetch(`/api/custom-items?type=${customType}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { items?: { name: string }[] } | null) => {
        if (data?.items) setCustomItems(data.items.map(i => i.name))
      })
      .catch(() => {})
  }, [customType])

  const allSuggestions = useMemo(() => {
    const set = new Set([...suggestions, ...customItems])
    return Array.from(set)
  }, [suggestions, customItems])

  const available = allSuggestions.filter(s => !tags.includes(s))

  const addCustom = () => {
    const v = input.trim()
    // Дедуп по канону: «B2B маркетинг» = «B2B-маркетинг» = «b2b  маркетинг».
    if (v && !hasSkill(tags, v)) {
      onChange([...tags, v])
      if (customType && !suggestions.includes(v)) {
        fetch("/api/custom-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: v, type: customType }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(() => { if (!customItems.includes(v)) setCustomItems(prev => [...prev, v]) })
          .catch(() => {})
      }
      setInput("")
    }
  }

  return (
    <div className="space-y-2">
      {/* Выбранные навыки — чипы */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(t => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs bg-primary/10 text-primary border-primary/20">
              {t}
              <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} className="hover:text-destructive ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Кнопка добавления из списка + кастомное поле */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={input}
            onChange={e => { setInput(e.target.value); setDropdownOpen(true) }}
            onFocus={() => setDropdownOpen(true)}
            placeholder={tags.length > 0 ? "Добавить ещё..." : placeholder}
            className="h-8 text-sm bg-[var(--input-bg)] border border-input"
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); addCustom() }
              if (e.key === "Escape") setDropdownOpen(false)
            }}
          />
          {/* Выпадающий список доступных навыков */}
          {dropdownOpen && available.filter(s => !input || s.toLowerCase().includes(input.toLowerCase())).length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {available
                .filter(s => !input || s.toLowerCase().includes(input.toLowerCase()))
                .map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); if (!hasSkill(tags, s)) onChange([...tags, s]); setInput("") }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                  >
                    + {s}
                  </button>
                ))
              }
            </div>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 px-3 shrink-0 relative z-40" onClick={addCustom}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Кликаем вне — закрываем dropdown */}
      {dropdownOpen && <div className="fixed inset-0 z-30" onClick={() => setDropdownOpen(false)} />}
    </div>
  )
}

// ─── Question constructor ───────────────────────────────────────────────────

export function QuestionEditor({ questions, onChange }: {
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

// ─── Inline add button with input ────────────────────────────────────────────

function AddCustomInline({ placeholder, onAdd, itemType }: { placeholder: string; onAdd: (name: string) => void; itemType?: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")

  const submit = () => {
    const name = value.trim()
    if (name) {
      onAdd(name)
      if (itemType) {
        fetch("/api/custom-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, type: itemType }),
        }).catch(() => {})
      }
      setValue("")
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm max-w-xs bg-[var(--input-bg)] border border-input"
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); submit() }
            if (e.key === "Escape") { setEditing(false); setValue("") }
          }}
          onBlur={() => { if (value.trim()) submit(); else setEditing(false) }}
        />
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setEditing(false); setValue("") }}>
          Отмена
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setEditing(true)}>
      <Plus className="w-3 h-3" />Добавить свой
    </Button>
  )
}

// ─── Category field with custom categories ──────────────────────────────────

function CategoryField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [customCategories, setCustomCategories] = useState<{ value: string; label: string }[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch("/api/vacancy-categories")
      .then(r => r.ok ? r.json() : null)
      .then((data: { custom?: { id: string; name: string }[] } | null) => {
        if (data?.custom) {
          setCustomCategories(data.custom.map(c => ({ value: `custom:${c.id}`, label: c.name })))
        }
      })
      .catch(() => {})
  }, [])

  const allOptions = [
    ...POSITION_CATEGORY_OPTIONS,
    ...customCategories,
  ]

  const handleCreate = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await fetch("/api/vacancy-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || "Ошибка")
      }
      const created = await res.json() as { id: string; name: string }
      const newVal = `custom:${created.id}`
      setCustomCategories(prev => [...prev, { value: newVal, label: created.name }])
      onChange(newVal)
      setNewCategoryName("")
      setModalOpen(false)
      toast.success("Категория добавлена")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать категорию")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Категория</Label>
      <div className="flex items-center gap-3 w-full">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-9 bg-[var(--input-bg)] border border-input flex-1">
            <SelectValue placeholder="Выберите категорию" />
          </SelectTrigger>
          <SelectContent>
            {POSITION_CATEGORY_OPTIONS.length > 0 && (
              <>
                <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Системные</div>
                {POSITION_CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </>
            )}
            {customCategories.length > 0 && (
              <>
                <div className="px-2 py-1 mt-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-t">Пользовательские</div>
                {customCategories.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </>
            )}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs shrink-0 whitespace-nowrap" onClick={() => setModalOpen(true)}>
          <Plus className="w-3.5 h-3.5" />
          Категория
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая категория</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Название категории</Label>
            <Input
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Например: Логистика"
              maxLength={100}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCreate() } }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={creating || !newCategoryName.trim()}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

// Handle для page-level Save-кнопки (мы экспортим save через ref,
// чтобы родительская вкладка page.tsx могла триггерить сохранение из
// своего хедера — без дублирования логики save() внутри AnketaTab).
export interface AnketaTabHandle {
  save: () => Promise<void>
  /** Открыть предпросмотр описания вакансии на весь экран (верхняя кнопка тулбара). */
  openPreview: () => void
}

interface AnketaTabProps {
  vacancyId: string
  descriptionJson: unknown
  /** P0-28: pre-warmed AI-кеш из vacancies.ai_quality_*. */
  aiQualityDetails?: unknown
  aiQualityAnalyzedAt?: string | null
  onTitleChange?: (title: string) => void
  onNavigateTab?: (tab: string) => void
  onScoreChange?: (score: { score: number; label: string }) => void
  onSavingChange?: (saving: boolean) => void
  /** Ref-like callback: компонент передаст { save } сразу после mount. */
  registerHandle?: (handle: AnketaTabHandle) => void
}

// ── Индикатор жёсткости отбора (#23) ────────────────────────────────────────
// Подсказка, НЕ запрет. Чем больше обязательных навыков, неприемлемого,
// стоп-факторов и «критичных» критериев — тем строже и тем меньше кандидатов
// пройдёт. Скоринг НЕ меняет — только предупреждает HR.
function computeStrictness(d: AnketaData): { hint: number; level: string; tone: "emerald" | "blue" | "amber" | "red"; strict: boolean } {
  let s = 0
  s += (d.requiredSkills?.length ?? 0) * 1.0
  s += (d.unacceptableSkills?.length ?? 0) * 1.5
  s += (d.stopFactors ?? []).filter(f => f.enabled).length * 1.5
  if (d.filterCitizenship?.isStopFactor && d.filterCitizenship.mode !== "any") s += 1.5
  s += Object.values(d.aiWeights ?? {}).filter(w => w === "critical").length * 1.0
  s += (d.aiCustomCriteria ?? []).filter(c => c.weight === "critical").length * 1.0
  const hint = Math.min(100, Math.round(s * 6)) // ориентир 0–100, не строгий
  let level: string, tone: "emerald" | "blue" | "amber" | "red"
  if (s < 5) { level = "Мягкий"; tone = "emerald" }
  else if (s < 9) { level = "Средний"; tone = "blue" }
  else if (s < 13) { level = "Строгий"; tone = "amber" }
  else { level = "Очень строгий"; tone = "red" }
  return { hint, level, tone, strict: s >= 9 }
}

const STRICTNESS_TONE: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  blue:    "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
  amber:   "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  red:     "bg-red-50 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
}

function ScoringStrictness({ data }: { data: AnketaData }) {
  const { hint, level, tone, strict } = computeStrictness(data)
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs space-y-1", STRICTNESS_TONE[tone])}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Жёсткость отбора: {level}</span>
        <span className="tabular-nums opacity-70" title="Ориентир, не строгий показатель">~{hint}/100</span>
      </div>
      {strict && (
        <p className="leading-snug">
          ⚠️ Рекомендуем смягчить требования или снизить порог — подходящих кандидатов будет мало.
        </p>
      )}
    </div>
  )
}

export function AnketaTab({ vacancyId, descriptionJson, aiQualityDetails, aiQualityAnalyzedAt, onTitleChange, onNavigateTab, onScoreChange, onSavingChange, registerHandle }: AnketaTabProps) {
  const [data, setData] = useState<AnketaData>(() => {
    const saved = (descriptionJson as Record<string, unknown>)?.anketa as Record<string, unknown> | undefined
    return saved ? migrateAnketa(saved) : emptyAnketa()
  })
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Полноэкранный режим предпросмотра (верхняя кнопка тулбара). Нижняя кнопка
  // «Предпросмотр вакансии» открывает то же, но обычным окошком.
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const [advisorFocusedField, setAdvisorFocusedField] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiLoadingStep, setAiLoadingStep] = useState(0)
  const [showCompanySection, setShowCompanySection] = useState(false)
  const [companyDescription, setCompanyDescription] = useState("")
  // Задача #20: refs для авто-высоты textarea обязанностей и требований
  const responsibilitiesRef = useRef<HTMLTextAreaElement>(null)
  const requirementsRef = useRef<HTMLTextAreaElement>(null)
  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }
  // O1 мультикомпанийность: основная компания (№1, из кабинета) + бренды (№2+).
  type BrandCompany = { id: string; name: string; slogan?: string; description?: string }
  const [mainCompanyName, setMainCompanyName] = useState("")
  const [brandCompanies, setBrandCompanies] = useState<BrandCompany[]>([])
  const [brandSelectorEnabled, setBrandSelectorEnabled] = useState(false)
  useEffect(() => {
    setShowCompanySection(localStorage.getItem("mk_hr_show_company_selector") === "true")
  }, [])
  // Fetch company description + основная компания (имя) для advisor и O1-селектора
  useEffect(() => {
    fetch("/api/companies").then(r => r.ok ? r.json() : null).then(json => {
      // Строго один источник — только описание из «Настроек найма»
      // (companies.company_description). Без фолбэка на общий description
      // (авто-текст DaData), чтобы в вакансию не подтягивались левые тексты.
      const desc = json?.companyDescription
      if (desc) {
        setCompanyDescription(desc)
        setData(prev => prev.companyDescription ? prev : { ...prev, companyDescription: desc })
      }
      if (json) setMainCompanyName((json.brandName || json.name || "").toString())
    }).catch(() => {})
  }, [])
  // O1: список компаний-брендов + флаг показа селектора (Настройки найма)
  useEffect(() => {
    fetch("/api/modules/hr/company/hiring-defaults").then(r => r.ok ? r.json() : null).then(json => {
      const hd = json?.hiringDefaults
      if (!hd) return
      if (Array.isArray(hd.brandCompanies)) setBrandCompanies(hd.brandCompanies.filter((c: BrandCompany) => c?.name?.trim()))
      if (typeof hd.showCompanySelector === "boolean") setBrandSelectorEnabled(hd.showCompanySelector)
      // Дефолтная компания из настроек — предвыбираем для новой вакансии (если HR ещё не выбрал).
      if (typeof hd.defaultBrandCompanyId === "string" && hd.defaultBrandCompanyId) {
        setData(prev => prev.brandCompanyId ? prev : { ...prev, brandCompanyId: hd.defaultBrandCompanyId })
      }
    }).catch(() => {})
  }, [])

  const handleWizardComplete = useCallback((result: ParsedVacancy) => {
    // Find closest positionCategory
    const catMatch = POSITION_CATEGORY_OPTIONS.find(o =>
      o.label.toLowerCase().includes((result.positionCategory || "").toLowerCase()) ||
      (result.positionCategory || "").toLowerCase().includes(o.label.toLowerCase())
    )

    setData(prev => ({
      ...prev,
      vacancyTitle: result.positionTitle || prev.vacancyTitle,
      positionCategory: catMatch?.value || prev.positionCategory,
      industry: result.industry || prev.industry,
      positionCity: result.positionCity || prev.positionCity,
      workFormats: result.workFormats.length > 0 ? result.workFormats : prev.workFormats,
      employment: result.employment.length > 0 ? result.employment : prev.employment,
      salaryFrom: result.salaryFrom || prev.salaryFrom,
      salaryTo: result.salaryTo || prev.salaryTo,
      bonus: cleanText(result.bonus || "") || prev.bonus,
      responsibilities: cleanText(result.responsibilities || "") || prev.responsibilities,
      requirements: cleanText(result.requirements || "") || prev.requirements,
      requiredSkills: result.requiredSkills.length > 0 ? result.requiredSkills : prev.requiredSkills,
      desiredSkills: result.desiredSkills.length > 0 ? result.desiredSkills : prev.desiredSkills,
      unacceptableSkills: result.unacceptableSkills.length > 0 ? result.unacceptableSkills : prev.unacceptableSkills,
      experienceMin: result.experienceMin || prev.experienceMin,
      experienceIdeal: result.experienceIdeal || prev.experienceIdeal,
      requiredExperience: result.requiredExperience || prev.requiredExperience,
      employmentType: result.employmentType && result.employmentType.length > 0 ? result.employmentType : prev.employmentType,
      schedule: result.schedule || prev.schedule,
      employeeType: result.employeeType || prev.employeeType,
      hiringPlan: result.hiringPlan && result.hiringPlan > 1 ? result.hiringPlan : prev.hiringPlan,
      conditions: result.conditions.length > 0 ? result.conditions : prev.conditions,
      screeningQuestions: result.screeningQuestions.length > 0 ? result.screeningQuestions : prev.screeningQuestions,
      // AI-профиль кандидата — мержим только непустое, не затирая ручные правки.
      aiIdealProfile: result.aiIdealProfile || prev.aiIdealProfile,
      aiRequiredHardSkills: result.aiRequiredHardSkills && result.aiRequiredHardSkills.length > 0 ? result.aiRequiredHardSkills : prev.aiRequiredHardSkills,
      aiStopFactors: result.aiStopFactors && result.aiStopFactors.length > 0 ? result.aiStopFactors : prev.aiStopFactors,
      aiWeights: result.aiWeights && Object.keys(result.aiWeights).length > 0
        ? { ...prev.aiWeights, ...(result.aiWeights as Record<string, AiWeightLevel>) }
        : prev.aiWeights,
      hhDescription: result.hhDescription || prev.hhDescription,
    }))
    if (result.positionTitle) onTitleChange?.(result.positionTitle)
    toast.success("Анкета заполнена! Проверьте и дополните.")
  }, [onTitleChange])

  // P0-27 fix: re-sync извне затирал локальные правки пользователя при любом
  // refetch (saveBranding, save вакансии и т.п. → новый descriptionJson →
  // setData затирает несохранённые поля). dataDirtyRef переехал сюда из
  // блока autosave, чтобы быть доступным здесь раньше. Теперь догоняемся
  // только если правок нет (== синхронизировано с сервером). Если есть —
  // оставляем локальный state, save их допишет, после успеха ref сбросится.
  const dataDirtyRef = useRef(false)
  useEffect(() => {
    const saved = (descriptionJson as Record<string, unknown>)?.anketa as Record<string, unknown> | undefined
    if (!saved) return
    if (dataDirtyRef.current) return
    setData(prev => ({ ...prev, ...migrateAnketa(saved) }))
  }, [descriptionJson])

  // Auto-trigger AI parsing if sessionStorage has text from create-vacancy-dialog
  useEffect(() => {
    try {
      const aiText = sessionStorage.getItem("vacancy_ai_text")
      if (aiText) {
        sessionStorage.removeItem("vacancy_ai_text")
        setAiLoading(true)
        setAiLoadingStep(0)
        fetch("/api/ai/parse-vacancy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: aiText }),
        })
          .then(res => res.ok ? res.json() : Promise.reject(new Error("AI parse failed")))
          .then((json: { data: ParsedVacancy }) => handleWizardComplete(json.data))
          .catch(() => {
            toast.error("Не удалось автоматически заполнить анкету")
          })
          .finally(() => setAiLoading(false))
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rotate AI loading messages
  useEffect(() => {
    if (!aiLoading) return
    const timer = setInterval(() => setAiLoadingStep(s => s + 1), 4000)
    return () => clearInterval(timer)
  }, [aiLoading])

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
  // P0-27 fix: PATCH со server-side merge ({...currentJson, ...body.description_json})
  // вместо PUT-перезаписи. Раньше save брал stale `existing = descriptionJson`
  // из closure и при race condition с параллельным PUT (например attachments
  // autosave ниже) — одно из сохранений затирало другое. Теперь шлём ТОЛЬКО
  // ключ anketa: сервер сам мерджит с актуальным descriptionJson из БД.
  // После успешного save сбрасываем dirty-флаг, чтобы re-sync эффект мог
  // догнать локальный state из свежего refetch'а.
  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description_json: { anketa: data } }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || "Ошибка сохранения")
      }
      dataDirtyRef.current = false
      toast.success("Анкета сохранена")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить анкету")
    } finally {
      setSaving(false)
    }
  }, [data, vacancyId])

  // Прокидываем saving в page.tsx, чтобы кнопка «Сохранить» в шапке таба
  // умела показать spinner. На первом рендере (false) — состояние совпадает.
  useEffect(() => { onSavingChange?.(saving) }, [saving, onSavingChange])

  // Регистрируем handle при mount, чтобы родитель мог дёргать save().
  // registerHandle — стабильная ссылка из useCallback в page.tsx; не вызовет
  // лишних re-register'ов.
  useEffect(() => {
    registerHandle?.({
      save,
      openPreview: () => { setPreviewFullscreen(true); setPreviewOpen(true) },
    })
  }, [registerHandle, save])

  // ── AI Refill ──
  const handleAiRefill = useCallback(async () => {
    const text = [data.responsibilities, data.requirements, data.conditions.join(", "), data.conditionsCustom.join(", ")].filter(Boolean).join("\n\n")
    if (!text.trim()) {
      toast.error("Заполните обязанности, требования или условия для AI-анализа")
      return
    }
    if (!confirm("AI переформулирует анкету на основе текущих данных. Продолжить?")) return

    setAiLoading(true)
    setAiLoadingStep(0)
    try {
      const res = await fetch("/api/ai/parse-vacancy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error("AI parse failed")
      const json = (await res.json()) as { data: ParsedVacancy }
      handleWizardComplete(json.data)
    } catch {
      toast.error("Не удалось переформулировать анкету")
    } finally {
      setAiLoading(false)
    }
  }, [data.responsibilities, data.requirements, data.conditions, data.conditionsCustom, handleWizardComplete])

  // ── HH Description Generation ──
  const [hhGenerating, setHhGenerating] = useState(false)
  const [hhPreview, setHhPreview] = useState<string | null>(null)
  const [hhEditing, setHhEditing] = useState(false)
  const [hhEditText, setHhEditText] = useState("")

  const handleGenerateHh = useCallback(async () => {
    if (!data.responsibilities && !data.requirements) {
      toast.error("Заполните обязанности и требования для генерации")
      return
    }
    setHhGenerating(true)
    try {
      const res = await fetch("/api/ai/generate-hh-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anketa: {
            vacancyTitle: data.vacancyTitle,
            companyName: data.companyName,
            industry: data.industry,
            positionCity: data.positionCity,
            workFormats: data.workFormats,
            employment: data.employment,
            salaryFrom: data.salaryFrom,
            salaryTo: data.salaryTo,
            bonus: data.bonus,
            responsibilities: data.responsibilities,
            requirements: data.requirements,
            requiredSkills: data.requiredSkills,
            desiredSkills: data.desiredSkills,
            conditions: data.conditions,
            conditionsCustom: data.conditionsCustom,
            experienceMin: data.experienceMin,
          },
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || "Ошибка генерации")
      }
      const result = (await res.json()) as { html: string }
      setHhPreview(result.html)
      setHhEditing(false)
      toast.success("Описание сгенерировано")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сгенерировать описание")
    } finally {
      setHhGenerating(false)
    }
  }, [data])

  const handleAcceptHh = useCallback(() => {
    if (hhPreview) {
      set("hhDescription", hhPreview)
      setHhPreview(null)
      setHhEditing(false)
      toast.success("Описание принято")
    }
  }, [hhPreview, set])

  // ── Attachments ──
  const [attachments, setAttachments] = useState<Attachment[]>(() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      return Array.isArray(dj.attachments) ? (dj.attachments as Attachment[]) : []
    }
    return []
  })
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachDragOver, setAttachDragOver] = useState(false)
  const attachInputRef = useRef<HTMLInputElement>(null)

  // Analyze a single attachment via AI
  const analyzeAttachment = useCallback(async (attachment: Attachment, originalFile: File) => {
    // Mark as analyzing
    setAttachments(prev => prev.map(a => a.url === attachment.url ? { ...a, analyzing: true } : a))

    try {
      // Parse file text
      const parseForm = new FormData()
      parseForm.append("file", originalFile)
      const parseRes = await fetch("/api/core/parse-file", { method: "POST", body: parseForm })
      if (!parseRes.ok) return // silently skip analysis for unsupported files

      const parseData = (await parseRes.json()) as { text?: string }
      const text = parseData.text?.trim()
      if (!text || text.length < 30) return

      // AI analyze
      const aiRes = await fetch("/api/ai/analyze-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 3000), vacancyTitle: data.vacancyTitle }),
      })
      if (!aiRes.ok) return

      const analysis = (await aiRes.json()) as AttachmentAnalysis
      setAttachments(prev => prev.map(a => a.url === attachment.url ? { ...a, analysis, analyzing: false } : a))
    } catch {
      setAttachments(prev => prev.map(a => a.url === attachment.url ? { ...a, analyzing: false } : a))
    }
  }, [data.vacancyTitle])

  const handleAttachUpload = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files)
    if (fileArr.length === 0) return
    setAttachUploading(true)
    const uploaded: { attachment: Attachment; file: File }[] = []
    for (const file of fileArr) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: слишком большой (макс 20 МБ)`)
        continue
      }
      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/upload/vacancy-attachment", { method: "POST", body: formData })
        const resData = (await res.json()) as Attachment & { error?: string }
        if (!res.ok) throw new Error(resData.error || "Ошибка загрузки")
        const attachment: Attachment = { name: resData.name, url: resData.url, size: resData.size, type: resData.type, uploadedAt: resData.uploadedAt, analyzing: true }
        uploaded.push({ attachment, file })
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "ошибка"}`)
      }
    }
    if (uploaded.length > 0) {
      setAttachments(prev => [...prev, ...uploaded.map(u => u.attachment)])
      toast.success(`Загружено файлов: ${uploaded.length}`)
      // Trigger AI analysis for parseable files (not images)
      for (const { attachment, file } of uploaded) {
        const ext = file.name.split(".").pop()?.toLowerCase() || ""
        if (["pdf", "doc", "docx", "txt"].includes(ext)) {
          analyzeAttachment(attachment, file)
        } else {
          setAttachments(prev => prev.map(a => a.url === attachment.url ? { ...a, analyzing: false } : a))
        }
      }
    }
    setAttachUploading(false)
  }, [analyzeAttachment])

  const removeAttachment = useCallback((url: string) => {
    setAttachments(prev => prev.filter(a => a.url !== url))
  }, [])

  const applyExtractedData = useCallback((analysis: AttachmentAnalysis) => {
    setData(prev => {
      const next = { ...prev }
      if (analysis.extractedData.responsibilities) {
        next.responsibilities = prev.responsibilities
          ? `${prev.responsibilities}\n${analysis.extractedData.responsibilities}`
          : analysis.extractedData.responsibilities
      }
      if (analysis.extractedData.requirements) {
        next.requirements = prev.requirements
          ? `${prev.requirements}\n${analysis.extractedData.requirements}`
          : analysis.extractedData.requirements
      }
      if (analysis.extractedData.conditions.length > 0) {
        const existing = new Set([...prev.conditions, ...prev.conditionsCustom])
        const newConds = analysis.extractedData.conditions.filter(c => !existing.has(c))
        next.conditionsCustom = [...prev.conditionsCustom, ...newConds]
      }
      return next
    })
    toast.success("Данные из документа добавлены в анкету")
  }, [])

  // Save attachments with autosave.
  // P0-27 fix: PATCH со server-merge — раньше параллельный PUT с stale
  // descriptionJson затирал свежие правки анкеты (или наоборот).
  useEffect(() => {
    const existing = (descriptionJson as Record<string, unknown>) ?? {}
    const currentAttachments = Array.isArray(existing.attachments) ? existing.attachments as Attachment[] : []
    if (JSON.stringify(currentAttachments) === JSON.stringify(attachments)) return
    const timer = setTimeout(async () => {
      try {
        await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description_json: { attachments } }),
        })
      } catch {}
    }, 1500)
    return () => clearTimeout(timer)
  }, [attachments, descriptionJson, vacancyId])

  // ── Autosave ──
  // dataDirtyRef объявлен выше (рядом с re-sync эффектом). Здесь только таймер.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => save(), 800)
  }, [save])
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

  // Flush несохранённой анкеты при уходе со страницы (F5/закрытие/сворачивание),
  // пока не сработал автосейв. keepalive-fetch (в отличие от sendBeacon) шлёт
  // PATCH и переживает выгрузку страницы. Иначе быстрый F5 терял правку.
  const latestDataRef = useRef(data)
  useEffect(() => { latestDataRef.current = data }, [data])
  useEffect(() => {
    const flush = () => {
      if (!dataDirtyRef.current) return
      try {
        fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description_json: { anketa: latestDataRef.current } }),
          keepalive: true,
        })
        dataDirtyRef.current = false
      } catch { /* fire-and-forget */ }
    }
    const onVis = () => { if (document.visibilityState === "hidden") flush() }
    window.addEventListener("pagehide", flush)
    window.addEventListener("beforeunload", flush)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.removeEventListener("pagehide", flush)
      window.removeEventListener("beforeunload", flush)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [vacancyId])
  useEffect(() => {
    if (!dataDirtyRef.current) {
      dataDirtyRef.current = true
      return
    }
    scheduleAutosave()
  }, [data, scheduleAutosave])
  const handleBlur = useCallback(() => scheduleAutosave(), [scheduleAutosave])

  // Задача #20: авто-высота textarea при изменении значений и монтировании
  useEffect(() => { autoResizeTextarea(responsibilitiesRef.current) }, [data.responsibilities])
  useEffect(() => { autoResizeTextarea(requirementsRef.current) }, [data.requirements])

  const sectionFilled = (idx: number) => {
    switch (idx) {
      // Секция 1 теперь объединяет «Компания» + «О компании» (задача #19)
      case 1: return !!(data.companyName || data.clientCompanyId || data.companyMode === "own" || data.companyDescription)
      case 2: return !!data.positionCategory
      case 3: return !!(data.salaryFrom || data.salaryTo)
      // 4 = бывшая 5 «Обязанности и требования»
      case 4: return !!(data.responsibilities || data.requirements)
      // 5 = бывшая 6 «Портрет кандидата»
      case 5: return data.requiredSkills.length > 0
      // 6 = бывшая 7 «Условия»
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

  const AI_LOADING_MESSAGES = [
    "AI анализирует вакансию...",
    "Извлекаю обязанности и требования...",
    "Определяю навыки и условия...",
    "Формирую анкету...",
    "Почти готово...",
  ]

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
    <div className="relative space-y-4 flex-[2] min-w-0 w-full" onBlur={handleBlur}>
      {aiLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">{AI_LOADING_MESSAGES[aiLoadingStep % AI_LOADING_MESSAGES.length]}</p>
          </div>
        </div>
      )}
      {/* Progress */}
      <div className="flex items-center gap-3">
        <Progress value={progress} className="flex-1 h-2" />
        <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">{progress}%</span>
      </div>

      {/* ── Название вакансии (top-level) ── */}
      <div className="w-full space-y-1" id="section-title">
        <Label className="text-xs font-medium">Название вакансии</Label>
        <div className="w-full">
          <Input
            value={data.vacancyTitle}
            onChange={e => { set("vacancyTitle", e.target.value); onTitleChange?.(e.target.value) }}
            onFocus={() => setAdvisorFocusedField("title")}
            placeholder="Менеджер по продажам"
            className="h-11 text-lg bg-[var(--input-bg)] border border-input w-full"
            maxLength={75}
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{data.vacancyTitle.length}/75</p>
        </div>
      </div>

      {/* ── 1. Компания ── */}
      {/* Секция объединяет «Компания» (селектор) + «О компании» (описание).
          Показываем всегда: описание компании нужно любой вакансии.
          Агентский CompanySelector — только при включённой мультикомпании. */}
      <Section title="Компания" number={1} filled={sectionFilled(1)} id="section-1">
        {/* Карточка компании: без дублирующего заголовка и без радиокнопок «Своя/Для клиента».
            Агентский CompanySelector (с режимом «Для клиента») — только если явно включён флаг агентства.
            По умолчанию показываем карточку основной компании из кабинета. */}
        {(showCompanySection || brandSelectorEnabled) && data.companyMode === "client" ? (
          /* Агентский режим активен — показываем полный селектор (включая RadioGroup) */
          <CompanySelector
            mode={data.companyMode}
            clientCompanyId={data.clientCompanyId}
            clientContactId={data.clientContactId}
            onModeChange={v => set("companyMode", v)}
            onCompanyChange={v => set("clientCompanyId", v)}
            onContactChange={v => set("clientContactId", v)}
          />
        ) : (showCompanySection || brandSelectorEnabled) ? (
          /* Агентский режим доступен, но выбрана своя компания — компактная карточка + кнопка переключения */
          <div className="space-y-2">
            <div className="rounded-lg border px-3 py-2.5 bg-[var(--input-bg)] flex items-center gap-2 w-fit min-w-[260px] max-w-[50%]">
              <span className="text-sm font-medium truncate">{mainCompanyName || "Из кабинета"}</span>
            </div>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => set("companyMode", "client")}
            >
              Заполняю для клиента →
            </button>
          </div>
        ) : null}

        {/* O1: выбор компании-бренда, под которую идёт вакансия */}
        {brandSelectorEnabled && brandCompanies.length > 0 && (
          <div className="space-y-1.5 pb-3 border-b">
            <Label className="text-xs">Компания вакансии</Label>
            <Select
              value={data.brandCompanyId || "__main__"}
              onValueChange={(v) => {
                const id = v === "__main__" ? "" : v
                set("brandCompanyId", id)
                if (id === "") {
                  if (companyDescription) set("companyDescription", companyDescription)
                } else {
                  const bc = brandCompanies.find(c => c.id === id)
                  if (bc?.description?.trim()) set("companyDescription", bc.description)
                }
              }}
            >
              <SelectTrigger className="h-9 bg-[var(--input-bg)] border border-input w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__main__">Основная: {mainCompanyName || "из кабинета"}</SelectItem>
                {brandCompanies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Под какую компанию идёт вакансия. Кандидат увидит её название и описание ниже.
              Основная компания и список брендов настраиваются в{" "}
              <a href="/hr/hiring-settings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Настройках найма</a>.
            </p>
          </div>
        )}

        {/* Описание компании */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Описание компании</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1 px-2"
              disabled={!companyDescription}
              onClick={() => set("companyDescription", companyDescription)}
            >
              <RefreshCw className="w-3 h-3" /> Подтянуть из настроек
            </Button>
          </div>
          <Textarea
            value={data.companyDescription}
            onChange={e => set("companyDescription", e.target.value)}
            onFocus={() => setAdvisorFocusedField("company")}
            placeholder="Краткое описание компании для кандидатов..."
            rows={5}
            className="w-full text-sm bg-[var(--input-bg)] border border-input"
          />
          <p className="text-xs text-muted-foreground">Описание отображается в вакансии. По умолчанию подтягивается из настроек компании.</p>
        </div>
      </Section>

      {/* ── 2. Должность ── */}
      <Section title="Должность" number={2} filled={sectionFilled(2)} id="section-2">
        <CategoryField value={data.positionCategory} onChange={v => set("positionCategory", v)} />
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
        <div className="space-y-1.5">
          <Label className="text-xs">Город</Label>
          <Input value={data.positionCity} onChange={e => set("positionCity", e.target.value)} placeholder="Москва" className="h-9 bg-[var(--input-bg)] border border-input w-full" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Требуемый опыт</Label>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">hh.ru</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_EXPERIENCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("requiredExperience", data.requiredExperience === opt.value ? "" : opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm border transition-colors",
                  data.requiredExperience === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-[var(--input-bg)] border-input hover:bg-accent"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Количество вакантных мест</Label>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">hh.ru</Badge>
          </div>
          {/* QW6: компактный степпер вместо number-инпута с браузерными стрелками */}
          <div className="inline-flex items-center h-9 rounded-md border border-input bg-[var(--input-bg)] w-fit overflow-hidden">
            <button type="button" aria-label="Меньше" className="px-3 h-full text-muted-foreground hover:text-foreground hover:bg-accent" onClick={() => set("hiringPlan", Math.max(1, (data.hiringPlan || 1) - 1))}>−</button>
            <input
              type="number"
              min={1}
              value={data.hiringPlan}
              onChange={e => set("hiringPlan", Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 text-center bg-transparent outline-none text-sm border-x border-input [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button type="button" aria-label="Больше" className="px-3 h-full text-muted-foreground hover:text-foreground hover:bg-accent" onClick={() => set("hiringPlan", (data.hiringPlan || 1) + 1)}>+</button>
          </div>
        </div>
      </Section>

      {/* ── 3. Мотивация ── */}
      <Section title="Мотивация" number={3} filled={sectionFilled(3)} id="section-3">
        <div className="w-full space-y-4">
          <div className="grid grid-cols-2 gap-4" onFocus={() => setAdvisorFocusedField("salary")}>
            <div className="space-y-1.5">
              <Label className="text-xs">Зарплата от</Label>
              <Input value={data.salaryFrom} onChange={e => set("salaryFrom", e.target.value)} placeholder="80 000 ₽" className="h-9 bg-[var(--input-bg)] border border-input" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Зарплата до</Label>
              <Input value={data.salaryTo} onChange={e => set("salaryTo", e.target.value)} placeholder="150 000 ₽" className="h-9 bg-[var(--input-bg)] border border-input" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Бонусы</Label>
            <Textarea value={data.bonus} onChange={e => set("bonus", e.target.value)} placeholder="% от продаж, KPI, бонус за перевыполнение плана, квартальная премия..." rows={2} className="text-sm bg-[var(--input-bg)] border border-input w-full" />
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

      {/* ── 4. Обязанности и требования (бывшая 5) ── */}
      <Section title="Обязанности и требования" number={4} filled={sectionFilled(4)} id="section-4">
        <p className="text-xs text-muted-foreground mt-1">Описание задач и функционала должности</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Обязанности</Label>
          </div>
          {/* Задача #20: авто-высота по контенту, ручной ресайз сохранён */}
          <Textarea
            ref={responsibilitiesRef}
            value={data.responsibilities}
            onChange={e => set("responsibilities", e.target.value)}
            onInput={e => autoResizeTextarea(e.currentTarget)}
            onFocus={() => setAdvisorFocusedField("responsibilities")}
            placeholder="Опишите задачи и функционал должности..."
            className="text-sm bg-[var(--input-bg)] border border-input resize-vertical overflow-hidden"
            style={{ minHeight: "96px" }}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Требования</Label>
          </div>
          <Textarea
            ref={requirementsRef}
            value={data.requirements}
            onChange={e => set("requirements", e.target.value)}
            onInput={e => autoResizeTextarea(e.currentTarget)}
            onFocus={() => setAdvisorFocusedField("requirements")}
            placeholder="Что должен знать и уметь кандидат..."
            className="text-sm bg-[var(--input-bg)] border border-input resize-vertical overflow-hidden"
            style={{ minHeight: "96px" }}
          />
        </div>

        {/* Специфика продаж — показываем только для продажных категорий */}
        {isSalesCategory(data.positionCategory) && (
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold">💼 Специфика продаж</Label>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-primary border-primary/30">AI-профиль продавца</Badge>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Средний чек / стоимость продукта</Label>
              <Input
                value={data.avgDealSize}
                onChange={e => set("avgDealSize", e.target.value)}
                placeholder="от 100 000 до 990 000 ₽/год"
                className="h-9 bg-[var(--input-bg)] border border-input w-full"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Цикл сделки</Label>
              <div className="flex flex-wrap gap-2">
                {SALES_CYCLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("salesCycle", data.salesCycle === opt.value ? "" : opt.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm border transition-colors",
                      data.salesCycle === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-[var(--input-bg)] border-input hover:bg-accent"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Тип продаж</Label>
              <div className="flex flex-wrap gap-3">
                {SALES_TYPE_OPTIONS.map(opt => (
                  <label key={opt} className="flex items-center gap-1.5">
                    <Checkbox checked={data.salesType.includes(opt)} onCheckedChange={() => toggleArray("salesType", opt)} />
                    <span className="text-sm">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">ЛПР (лицо принимающее решение)</Label>
              <div className="flex flex-wrap gap-3">
                {TARGET_AUDIENCE_OPTIONS.map(opt => (
                  <label key={opt} className="flex items-center gap-1.5">
                    <Checkbox checked={data.targetAudience.includes(opt)} onCheckedChange={() => toggleArray("targetAudience", opt)} />
                    <span className="text-sm">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ── 5. Портрет кандидата (бывшая 6) ── */}
      <Section title="Портрет кандидата" number={5} filled={sectionFilled(5)} id="section-5">
        {/* Skills */}
        <div className="space-y-1.5" onFocus={() => setAdvisorFocusedField("skills")}>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Обязательные навыки</Label>
          </div>
          <TagInputWithSuggestions tags={data.requiredSkills} onChange={v => set("requiredSkills", v)} placeholder="Добавить навык..." suggestions={REQUIRED_SKILL_SUGGESTIONS} customType="skill" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Желательные навыки</Label>
          <TagInputWithSuggestions tags={data.desiredSkills} onChange={v => set("desiredSkills", v)} placeholder="Добавить навык..." suggestions={DESIRED_SKILL_SUGGESTIONS} customType="skill" />
        </div>
        <div className="space-y-1.5" onFocus={() => setAdvisorFocusedField("stopFactors")}>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-destructive/80">Неприемлемо</Label>
          </div>
          <TagInputWithSuggestions tags={data.unacceptableSkills} onChange={v => set("unacceptableSkills", v)} placeholder="Что неприемлемо..." suggestions={UNACCEPTABLE_SUGGESTIONS} customType="skill" />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Основные настройки AI-оценки — в блоке «Портрет: AI-оценка» ниже; эти поля используются как запасной вариант.
        </p>

        {/* Образование и языки — используются в «Исходящем подборе» (hh-фильтры) */}
        <div className="space-y-3 pt-2 border-t">
          {/* Задача #21: лейбл «Образование», триггер w-full в контейнере min-w-[220px] */}
          <div className="space-y-1.5" style={{ minWidth: "220px", maxWidth: "320px" }}>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Образование</Label>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">hh.ru</Badge>
            </div>
            <Select
              value={data.educationLevel || "any"}
              onValueChange={v => set("educationLevel", v === "any" ? "" : v)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Любое" />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_LEVEL_OPTIONS.map(o => (
                  <SelectItem key={o.id || "any"} value={o.id || "any"}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Языки</Label>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">hh.ru</Badge>
            </div>
            {data.aiLanguages.length > 0 && (
              <div className="space-y-1.5">
                {data.aiLanguages.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Select
                      value={l.lang || undefined}
                      onValueChange={v => {
                        const next = [...data.aiLanguages]
                        next[idx] = { ...next[idx], lang: v }
                        set("aiLanguages", next)
                      }}
                    >
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue placeholder="Язык" />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map(o => (
                          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={l.level || undefined}
                      onValueChange={v => {
                        const next = [...data.aiLanguages]
                        next[idx] = { ...next[idx], level: v }
                        set("aiLanguages", next)
                      }}
                    >
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue placeholder="Уровень" />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_LEVEL_OPTIONS.map(o => (
                          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => set("aiLanguages", data.aiLanguages.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => set("aiLanguages", [...data.aiLanguages, { lang: "", level: "" }])}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Добавить язык
            </Button>
          </div>
        </div>

        {/* Stop factors */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold">Критерии отбора</Label>
          </div>
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
                  <div className="flex items-center gap-4 ml-6 mt-1">
                    <div className="space-y-1 max-w-[200px]">
                      <Label className="text-[10px] text-muted-foreground">Возраст от</Label>
                      <Input
                        type="number" min={18} max={65}
                        value={f.ageRange?.[0] ?? 18}
                        onChange={e => {
                          const next = [...data.stopFactors]
                          next[idx] = { ...next[idx], ageRange: [Number(e.target.value) || 18, f.ageRange?.[1] ?? 65] }
                          set("stopFactors", next)
                        }}
                        className="h-7 text-xs bg-[var(--input-bg)] border border-input"
                      />
                    </div>
                    <div className="space-y-1 max-w-[200px]">
                      <Label className="text-[10px] text-muted-foreground">Возраст до</Label>
                      <Input
                        type="number" min={18} max={65}
                        value={f.ageRange?.[1] ?? 65}
                        onChange={e => {
                          const next = [...data.stopFactors]
                          next[idx] = { ...next[idx], ageRange: [f.ageRange?.[0] ?? 18, Number(e.target.value) || 65] }
                          set("stopFactors", next)
                        }}
                        className="h-7 text-xs bg-[var(--input-bg)] border border-input"
                      />
                    </div>
                  </div>
                )}
                {f.enabled && f.id === "city" && (
                  <div className="ml-6 mt-1.5">
                    <TagInput
                      tags={data.filterCities}
                      onChange={v => set("filterCities", v)}
                      placeholder="Введите город и нажмите Enter..."
                      customType="city"
                    />
                  </div>
                )}
                {f.enabled && f.id === "citizenship" && (
                  <div className="ml-6 mt-1.5 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {(["russia", "any", "custom"] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => set("filterCitizenship", { ...data.filterCitizenship, mode: m })}
                          className={cn(
                            "px-2.5 py-1 rounded text-xs border transition-colors",
                            data.filterCitizenship.mode === m
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-[var(--input-bg)] border-input hover:bg-accent"
                          )}
                        >
                          {m === "russia" ? "Только из России" : m === "any" ? "Любое гражданство" : "Указать страны"}
                        </button>
                      ))}
                    </div>
                    {data.filterCitizenship.mode === "custom" && (
                      <TagInput
                        tags={data.filterCitizenship.countries}
                        onChange={v => set("filterCitizenship", { ...data.filterCitizenship, countries: v })}
                        placeholder="Россия, Беларусь, Казахстан..."
                        customType="country"
                      />
                    )}
                    {data.filterCitizenship.mode !== "any" && (
                      <label className="flex items-center gap-1.5">
                        <Checkbox
                          checked={data.filterCitizenship.isStopFactor}
                          onCheckedChange={v => set("filterCitizenship", { ...data.filterCitizenship, isStopFactor: !!v })}
                        />
                        <span className="text-xs text-destructive/80">Стоп-фактор: автоотказ если не из указанных стран</span>
                      </label>
                    )}
                  </div>
                )}
                {f.enabled && (f.id === "experience" || f.id === "salaryMax" || f.id === "documents") && (
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
          <AddCustomInline
            placeholder="Название стоп-фактора..."
            itemType="stop_factor"
            onAdd={name => set("stopFactors", [...data.stopFactors, { id: `sf_${Date.now()}`, label: name, enabled: true, custom: true }])}
          />
        </div>

        {/* Desired params */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs font-semibold">Желаемые параметры</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.desiredParams.map((p, idx) => (
              <div key={p.id} className={cn("border rounded-lg p-3 transition-colors", p.enabled ? "border-primary/30 bg-primary/5" : "border-border")}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-sm font-medium truncate", !p.enabled && "text-muted-foreground")}>{p.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.custom && (
                      <button type="button" onClick={() => set("desiredParams", data.desiredParams.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={v => {
                        const next = [...data.desiredParams]
                        next[idx] = { ...next[idx], enabled: !!v }
                        set("desiredParams", next)
                      }}
                    />
                  </div>
                </div>
                {p.enabled && (
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-[10px] text-muted-foreground mr-1">Вес:</span>
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
          <AddCustomInline
            placeholder="Название параметра..."
            itemType="parameter"
            onAdd={name => set("desiredParams", [...data.desiredParams, { id: `dp_${Date.now()}`, label: name, enabled: true, weight: 3, custom: true }])}
          />
        </div>
      </Section>

      {/* ── 6. Условия (бывшая 7) ── */}
      <Section title="Условия" number={6} filled={sectionFilled(6)} id="section-6">
        <div className="flex flex-wrap gap-x-4 gap-y-2" onFocus={() => setAdvisorFocusedField("conditions")}>
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
        <TagInput tags={[]} onChange={tags => { if (tags.length > 0) set("conditionsCustom", [...data.conditionsCustom, ...tags]) }} placeholder="Добавить своё условие..." customType="condition" />

        <div className="space-y-1.5 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Оформление</Label>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">hh.ru</Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            {EMPLOYMENT_TYPE_OPTIONS.map(opt => (
              <label key={opt} className="flex items-center gap-1.5">
                <Checkbox checked={data.employmentType.includes(opt)} onCheckedChange={() => toggleArray("employmentType", opt)} />
                <span className="text-sm">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs">График работы</Label>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">hh.ru</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("schedule", data.schedule === opt.value ? "" : opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm border transition-colors",
                  data.schedule === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-[var(--input-bg)] border-input hover:bg-accent"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Тип сотрудника</Label>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">hh.ru</Badge>
          </div>
          <div className="flex gap-2">
            {EMPLOYEE_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("employeeType", opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm border transition-colors",
                  data.employeeType === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-[var(--input-bg)] border-input hover:bg-accent"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Дополнительные поля из hh-импорта (только если заполнены) ── */}
        {((data as Record<string,unknown>).driverLicenseTypes as string[] | undefined)?.length ? (
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs">Водительские права</Label>
            <div className="flex flex-wrap gap-1.5">
              {((data as Record<string,unknown>).driverLicenseTypes as string[]).map(cat => (
                <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
              ))}
            </div>
          </div>
        ) : null}
        {((data as Record<string,unknown>).department as string | undefined) ? (
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs">Отдел</Label>
            <p className="text-sm">{(data as Record<string,unknown>).department as string}</p>
          </div>
        ) : null}
        {((data as Record<string,unknown>).workingDaysText as string | undefined) ? (
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs">Рабочие дни</Label>
            <p className="text-sm text-muted-foreground">{(data as Record<string,unknown>).workingDaysText as string}</p>
          </div>
        ) : null}
        {((data as Record<string,unknown>).workingTimeText as string | undefined) ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Рабочие часы</Label>
            <p className="text-sm text-muted-foreground">{(data as Record<string,unknown>).workingTimeText as string}</p>
          </div>
        ) : null}
        {((data as Record<string,unknown>).specialConditions as string[] | undefined)?.length ? (
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs">Спецусловия</Label>
            <div className="flex flex-wrap gap-1.5">
              {((data as Record<string,unknown>).specialConditions as string[]).map(c => (
                <Badge key={c} variant="outline" className="text-xs text-emerald-700 border-emerald-300 bg-emerald-50">{c}</Badge>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      {/* ── Документы и файлы ── скрыто по решению Юрия (не нужно в основном потоке анкеты) */}
      {/* Код секции сохранён — при необходимости убрать обёртку <div className="hidden"> */}
      <div className="hidden">
      <Section title={`Документы${attachments.length > 0 ? ` (${attachments.length})` : ""}`} number={7} filled={attachments.length > 0}>
        <input ref={attachInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.jpg,.jpeg,.png,.webp" className="hidden"
          onChange={e => { if (e.target.files?.length) handleAttachUpload(e.target.files); e.target.value = "" }} />

        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map(a => {
              const ext = a.name.split(".").pop()?.toLowerCase() || ""
              const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext)
              const isSpreadsheet = ["xlsx", "xls"].includes(ext)
              const IconComp = isImage ? FileImage : isSpreadsheet ? FileSpreadsheet : File
              const sizeStr = a.size < 1024 ? `${a.size} Б` : a.size < 1024 * 1024 ? `${(a.size / 1024).toFixed(0)} КБ` : `${(a.size / (1024 * 1024)).toFixed(1)} МБ`
              const hasData = a.analysis?.extractedData && (a.analysis.extractedData.responsibilities || a.analysis.extractedData.requirements || a.analysis.extractedData.conditions.length > 0)
              const relevanceColor = a.analysis?.relevance === "high" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : a.analysis?.relevance === "low" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
              return (
                <div key={a.url} className="rounded-lg border bg-muted/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <IconComp className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 truncate">{a.name}</span>
                    {a.analyzing && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
                    {a.analysis && <Badge variant="secondary" className={cn("text-[10px] h-4 px-1.5 shrink-0", relevanceColor)}>{a.analysis.type}</Badge>}
                    <span className="text-xs text-muted-foreground shrink-0">{sizeStr}</span>
                    <a href={a.url} download={a.name} className="text-muted-foreground hover:text-foreground shrink-0"><FileDown className="w-3.5 h-3.5" /></a>
                    <button type="button" onClick={() => removeAttachment(a.url)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  {a.analyzing && (
                    <div className="px-3 pb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="w-3 h-3 text-primary" /> AI анализирует...
                    </div>
                  )}
                  {a.analysis && !a.analyzing && (
                    <div className="px-3 pb-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground">{a.analysis.summary}</p>
                      {a.analysis.relevance === "low" && (
                        <p className="text-xs text-red-600 dark:text-red-400">Документ не похож на описание должности</p>
                      )}
                      {hasData && (
                        <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={() => applyExtractedData(a.analysis!)}>
                          <Plus className="w-3 h-3" /> Дополнить анкету
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button type="button"
          className={cn(
            "w-full h-16 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-colors text-sm",
            attachDragOver ? "border-primary bg-primary/5 text-primary" : "border-muted-foreground/25 text-muted-foreground hover:border-primary/40 hover:text-primary",
            attachUploading && "pointer-events-none opacity-60",
          )}
          onClick={() => attachInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setAttachDragOver(true) }}
          onDragLeave={() => setAttachDragOver(false)}
          onDrop={e => { e.preventDefault(); setAttachDragOver(false); if (e.dataTransfer.files.length) handleAttachUpload(e.dataTransfer.files) }}
        >
          {attachUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {attachUploading ? "Загрузка..." : "Прикрепить файл (PDF, DOCX, XLSX, JPG, PNG)"}
        </button>
        <p className="text-[11px] text-muted-foreground">Внутренние документы — не видны кандидатам. До 20 МБ на файл.</p>
      </Section>
      </div>{/* /hidden Документы */}

      {/* ── 7. AI-генерация (бывшая 9) ── */}
      <Section title="AI-генерация" number={8} filled={data.screeningQuestions.length > 0 || !!data.hhDescription}>
        {/* Screening questions — блок виден всегда, чтобы можно было добавить
            первый вопрос вручную (а не только после AI-парса). БАГ-6. */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Вопросы для скрининга</Label>
          {data.screeningQuestions.length > 0 ? (
            <div className="space-y-1.5">
              {data.screeningQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground font-medium mt-2 w-5 shrink-0">{i + 1}.</span>
                  <Input
                    value={q}
                    onChange={e => {
                      const updated = [...data.screeningQuestions]
                      updated[i] = e.target.value
                      set("screeningQuestions", updated)
                    }}
                    className="h-8 text-sm bg-[var(--input-bg)] border border-input flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => set("screeningQuestions", data.screeningQuestions.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Пока нет вопросов — добавьте вручную или сгенерируйте через AI ниже.</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => set("screeningQuestions", [...data.screeningQuestions, ""])}
          >
            <Plus className="w-3 h-3" /> Добавить вопрос
          </Button>
        </div>

        {/* hh.ru description — generate / preview / edit */}
        <div className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Описание для hh.ru</Label>
            <div className="flex gap-1.5">
              {data.hhDescription && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={async () => {
                  await navigator.clipboard.writeText(data.hhDescription)
                  toast.success("Скопировано")
                }}>
                  <Copy className="w-3 h-3" /> Скопировать
                </Button>
              )}
              {data.hhDescription && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                  // Превращаем HTML → plain text через DOM (надёжнее regex —
                  // корректно обрабатывает &nbsp;, <br>, вложенные теги).
                  const div = document.createElement("div")
                  div.innerHTML = data.hhDescription
                  // Заменяем block-level теги на переносы строк ДО textContent,
                  // иначе абзацы склеятся в одну строку.
                  div.querySelectorAll("br").forEach(b => b.replaceWith("\n"))
                  div.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, div").forEach(el => {
                    el.append("\n")
                  })
                  const text = (div.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim()
                  const titleRaw = (data.vacancyTitle || "vacancy").trim()
                  const safe = titleRaw.replace(/[^\p{L}\p{N}\-_]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "vacancy"
                  const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = `${safe}.txt`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                  toast.success("Файл скачан")
                }}>
                  <FileDown className="w-3 h-3" /> Скачать .txt
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleGenerateHh}
                disabled={hhGenerating}
              >
                {hhGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {data.hhDescription ? "Перегенерировать" : "Сгенерировать"}
              </Button>
            </div>
          </div>

          {/* AI preview */}
          {hhPreview && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">Превью от AI</span>
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAcceptHh}>
                    <Check className="w-3 h-3" /> Принять
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateHh} disabled={hhGenerating}>
                    <RefreshCw className="w-3 h-3" /> Заново
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setHhEditing(true); setHhEditText(hhPreview) }}>
                    <PenLine className="w-3 h-3" /> Редактировать
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setHhPreview(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              {hhEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={hhEditText}
                    onChange={e => setHhEditText(e.target.value)}
                    rows={12}
                    className="text-sm bg-white dark:bg-gray-950 border border-input font-mono text-xs"
                  />
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setHhPreview(hhEditText); setHhEditing(false) }}>
                    <Check className="w-3 h-3" /> Сохранить правки
                  </Button>
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-sm [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:mt-1 [&_li]:text-sm"
                  dangerouslySetInnerHTML={{ __html: hhPreview }}
                />
              )}
            </div>
          )}

          {/* Saved description — preview/code toggle */}
          {data.hhDescription && !hhPreview && (
            <HhDescriptionView
              html={data.hhDescription}
              onChange={v => set("hhDescription", v)}
            />
          )}

          {!data.hhDescription && !hhPreview && !hhGenerating && (
            <p className="text-xs text-muted-foreground">Заполните обязанности и требования, затем нажмите «Сгенерировать»</p>
          )}

          {hhGenerating && !hhPreview && (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">AI генерирует описание...</span>
            </div>
          )}
        </div>
      </Section>

      {/* ── 8. AI-профиль кандидата ── */}
      <AiProfileSection data={data} set={set} />

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end mt-4">
        <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs" onClick={handleAiRefill} disabled={aiLoading}>
          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Перезаполнить через AI
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs" onClick={() => { setPreviewFullscreen(true); setPreviewOpen(true) }}>
          <Eye className="w-3.5 h-3.5" />
          Предпросмотр вакансии
        </Button>
        <Button size="sm" className="gap-1.5 h-9 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
        {onNavigateTab && (
          <Button size="sm" variant="default" className="gap-1.5 h-9 text-xs" onClick={async () => { await save(); onNavigateTab("course") }} disabled={saving}>
            Далее &rarr; Демонстрация
          </Button>
        )}
      </div>

      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={previewFullscreen
          ? "max-w-none w-screen h-screen sm:max-w-none rounded-none overflow-y-auto bg-white dark:bg-gray-950 p-6 sm:p-10"
          : "sm:max-w-2xl max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-950 p-6"}>
          <div className={previewFullscreen ? "mx-auto w-full max-w-3xl" : "w-full"}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-lg">{data.vacancyTitle || "Без названия"}</DialogTitle>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Скопировать" onClick={async () => {
                  const categoryLabel = POSITION_CATEGORY_OPTIONS.find(o => o.value === data.positionCategory)?.label || data.positionCategory
                  const lines = [
                    `Название: ${data.vacancyTitle}`,
                    data.positionCity && `Город: ${data.positionCity}`,
                    categoryLabel && `Категория: ${categoryLabel}`,
                    data.workFormats.length > 0 && `Формат: ${data.workFormats.join(", ")}`,
                    data.employment.length > 0 && `Занятость: ${data.employment.join(", ")}`,
                    (data.salaryFrom || data.salaryTo) && `Зарплата: ${[data.salaryFrom && `от ${data.salaryFrom}`, data.salaryTo && `до ${data.salaryTo}`].filter(Boolean).join(" ")} ₽`,
                    data.bonus && `Бонусы: ${data.bonus}`,
                    data.responsibilities && `\nОбязанности:\n${data.responsibilities}`,
                    data.requirements && `\nТребования:\n${data.requirements}`,
                    data.requiredSkills.length > 0 && `\nОбязательные навыки: ${data.requiredSkills.join(", ")}`,
                    data.desiredSkills.length > 0 && `Желательные навыки: ${data.desiredSkills.join(", ")}`,
                    (data.conditions.length > 0 || data.conditionsCustom.length > 0) && `\nУсловия: ${[...data.conditions, ...data.conditionsCustom].join(", ")}`,
                    data.companyDescription && `\nО компании:\n${data.companyDescription}`,
                  ].filter(Boolean).join("\n")
                  await navigator.clipboard.writeText(lines)
                  toast.success("Скопировано")
                }}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Печать / PDF" onClick={() => {
                  const categoryLabel = POSITION_CATEGORY_OPTIONS.find(o => o.value === data.positionCategory)?.label || data.positionCategory
                  const sections = [
                    `<h1 style="font-size:20px;margin:0 0 8px">${data.vacancyTitle || "Без названия"}</h1>`,
                    [data.positionCity, categoryLabel, ...data.workFormats, ...data.employment].filter(Boolean).join(" · "),
                    (data.salaryFrom || data.salaryTo) && `<p><b>Зарплата:</b> ${[data.salaryFrom && `от ${data.salaryFrom}`, data.salaryTo && `до ${data.salaryTo}`].filter(Boolean).join(" ")} ₽</p>`,
                    data.bonus && `<p><b>Бонусы:</b> ${data.bonus}</p>`,
                    data.responsibilities && `<h3>Обязанности</h3><p style="white-space:pre-line">${data.responsibilities}</p>`,
                    data.requirements && `<h3>Требования</h3><p style="white-space:pre-line">${data.requirements}</p>`,
                    data.requiredSkills.length > 0 && `<h3>Обязательные навыки</h3><p>${data.requiredSkills.join(", ")}</p>`,
                    data.desiredSkills.length > 0 && `<h3>Желательные навыки</h3><p>${data.desiredSkills.join(", ")}</p>`,
                    (data.conditions.length > 0 || data.conditionsCustom.length > 0) && `<h3>Условия</h3><p>${[...data.conditions, ...data.conditionsCustom].join(", ")}</p>`,
                    data.companyDescription && `<h3>О компании</h3><p style="white-space:pre-line">${data.companyDescription}</p>`,
                  ].filter(Boolean).join("")
                  const w = window.open("", "_blank")
                  if (w) {
                    w.document.write(`<html><head><title>${data.vacancyTitle}</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}h3{margin:16px 0 4px;font-size:14px}p{margin:4px 0}</style></head><body>${sections}</body></html>`)
                    w.document.close()
                    w.print()
                  }
                }}>
                  <FileDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed">
            {(data.positionCity || data.positionCategory) && (
              <div className="flex flex-wrap gap-2">
                {data.positionCity && <Badge variant="secondary">{data.positionCity}</Badge>}
                {data.positionCategory && (
                  <Badge variant="outline">
                    {POSITION_CATEGORY_OPTIONS.find(o => o.value === data.positionCategory)?.label || data.positionCategory}
                  </Badge>
                )}
                {data.workFormats.map(f => <Badge key={f} variant="outline">{f}</Badge>)}
                {data.employment.map(e => <Badge key={e} variant="outline">{e}</Badge>)}
              </div>
            )}
            {(data.salaryFrom || data.salaryTo) && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">Зарплата</p>
                <p>{[data.salaryFrom && `от ${data.salaryFrom}`, data.salaryTo && `до ${data.salaryTo}`].filter(Boolean).join(" ")} ₽</p>
              </div>
            )}
            {data.bonus && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">Бонусы</p>
                <p>{data.bonus}</p>
              </div>
            )}
            {data.responsibilities && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">Обязанности</p>
                <div className="whitespace-pre-line">{data.responsibilities}</div>
              </div>
            )}
            {data.requirements && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">Требования</p>
                <div className="whitespace-pre-line">{data.requirements}</div>
              </div>
            )}
            {data.requiredSkills.length > 0 && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">Обязательные навыки</p>
                <div className="flex flex-wrap gap-1.5">{data.requiredSkills.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}</div>
              </div>
            )}
            {data.desiredSkills.length > 0 && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">Желательные навыки</p>
                <div className="flex flex-wrap gap-1.5">{data.desiredSkills.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}</div>
              </div>
            )}
            {(data.conditions.length > 0 || data.conditionsCustom.length > 0) && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">Условия</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...data.conditions, ...data.conditionsCustom].map(c => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
                </div>
              </div>
            )}
            {data.companyDescription && (
              <div className="mb-4">
                <p className="font-semibold text-sm text-muted-foreground uppercase mb-1">О компании</p>
                <div className="whitespace-pre-line">{data.companyDescription}</div>
              </div>
            )}
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    {/* ── AI Advisor Panel ── */}
    <VacancyAdvisor
      vacancyId={vacancyId}
      vacancyData={data as unknown as Record<string, unknown>}
      companyDescription={companyDescription}
      focusedField={advisorFocusedField}
      initialResult={aiQualityDetails as never}
      initialAnalyzedAt={aiQualityAnalyzedAt ?? null}
      onScoreChange={onScoreChange}
      onApplySuggestion={(field, value) => {
        if (field === "vacancyTitle") {
          set("vacancyTitle", value as string)
          onTitleChange?.(value as string)
        } else if (field === "requiredSkills") {
          set("requiredSkills", value as string[])
        } else if (field === "unacceptableSkills") {
          set("unacceptableSkills", value as string[])
        } else if (field === "responsibilities") {
          set("responsibilities", value as string)
        } else if (field === "requirements") {
          set("requirements", value as string)
        } else if (field === "bonus") {
          set("bonus", value as string)
        }
      }}
    />
    </div>
  )
}

// ── AI Profile Section (collapsible) ────────────────────────────────────────

function AiProfileSection({ data, set }: {
  data: AnketaData
  set: <K extends keyof AnketaData>(key: K, value: AnketaData[K]) => void
}) {
  const [open, setOpen] = useState(true)
  // Индекс свежедобавленного критерия — на него ставим autoFocus
  const [focusCriterionIdx, setFocusCriterionIdx] = useState<number | null>(null)

  const hasSomeData = data.aiIdealProfile || data.aiRequiredHardSkills.length > 0
    || data.aiStopFactors.length > 0 || data.aiMinExperience

  return (
    <div className="border rounded-lg bg-violet-50/30 dark:bg-violet-950/10" id="section-8">
      <button
        type="button"
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex items-center justify-center w-6 h-6 rounded-full text-xs",
            hasSomeData ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            🤖
          </span>
          <div>
            <span className="font-medium text-sm">Портрет: AI-оценка</span>
            <p className="text-[10px] text-muted-foreground">Данные для автоматического скрининга и оценки</p>
          </div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t">
          {/* Auto-fill button */}
          {!hasSomeData && (data.requiredSkills.length > 0 || data.responsibilities || data.unacceptableSkills.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => {
                // Map requiredExperience to years
                const expMap: Record<string, string> = { "1-3": "1", "3-6": "3", "6+": "6", "none": "0" }
                const minExp = expMap[data.requiredExperience] || data.experienceMin || ""

                // Build ideal profile from responsibilities + requirements
                const keySkills = data.requiredSkills.slice(0, 5).join(", ")
                const keyDuties = data.responsibilities.split("\n").filter(l => l.trim()).slice(0, 3).map(l => l.replace(/^[•\-–]\s*/, "").trim()).join(", ")
                const profile = keySkills && keyDuties
                  ? `Кандидат с навыками: ${keySkills}. Ключевые задачи: ${keyDuties}.`
                  : keySkills ? `Кандидат с навыками: ${keySkills}.`
                  : ""

                set("aiMinExperience", minExp)
                // Дедуп при копировании: «B2B маркетинг»/«B2B-маркетинг» не
                // должны попадать в AI-профиль как два разных навыка (иначе
                // баллы скоринга размываются).
                set("aiRequiredHardSkills", dedupeSkills(data.requiredSkills))
                set("aiStopFactors", dedupeSkills(data.unacceptableSkills))
                if (profile) set("aiIdealProfile", profile)
                toast.success("AI-профиль заполнен из данных анкеты")
              }}
            >
              🤖 Заполнить из анкеты
            </Button>
          )}

          {/* Идеальный кандидат — общее описание в свободной форме */}
          <div className="space-y-1.5">
            <Label className="text-xs">Идеальный кандидат (в свободной форме)</Label>
            <Textarea
              value={data.aiIdealProfile}
              onChange={e => set("aiIdealProfile", e.target.value)}
              placeholder="Опытный руководитель продаж с B2B SaaS бэкграундом, который строил отдел с нуля, умеет продавать сам и растить команду. Управляет через метрики и CRM."
              rows={3}
              className="text-sm bg-[var(--input-bg)] border border-input"
            />
            <p className="text-[10px] text-muted-foreground">AI будет сравнивать каждое резюме с этим описанием</p>
          </div>

          {/* #23: индикатор жёсткости отбора (подсказка) */}
          <ScoringStrictness data={data} />

          {/* ── Подблок 1: Жёсткие требования (фильтры отсева) ── */}
          <div className="space-y-3 border-t pt-3">
            <div>
              <div className="text-sm font-semibold">🚫 Жёсткие требования (фильтры отсева)</div>
              <p className="text-[11px] text-muted-foreground">Не соответствует → отказ или низкий рейтинг</p>
            </div>

            {/* Required hard skills */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Обязательные компетенции (hard skills)</Label>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-primary border-primary/30">AI-скрининг</Badge>
              </div>
              <TagInput
                tags={data.aiRequiredHardSkills}
                onChange={v => set("aiRequiredHardSkills", v)}
                placeholder="Добавить навык..."
                customType="skill"
              />
              <p className="text-[10px] text-muted-foreground">
                Кандидат без этих навыков получит рейтинг ниже 50%. Совпадение
                считается по доле: чем больше навыков совпало, тем выше балл (не
                нужно, чтобы совпали все).
              </p>
              <p className={cn(
                "text-[10px]",
                data.aiRequiredHardSkills.length > 8
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
              )}>
                {data.aiRequiredHardSkills.length > 8
                  ? `⚠️ Навыков: ${data.aiRequiredHardSkills.length}. Слишком много обязательных навыков размывает оценку — почти ни одно резюме не закроет весь список, и баллы перестают различать кандидатов. Оставьте 4–6 ключевых, остальное перенесите в «Желательные навыки».`
                  : "Рекомендуем 4–6 ключевых навыков. Второстепенное — в «Желательные навыки»."}
              </p>
            </div>

            {/* AI stop factors */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-destructive/80">Автоматический отказ — стоп-факторы</Label>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-primary border-primary/30">AI-скрининг</Badge>
              </div>
              <TagInput
                tags={data.aiStopFactors}
                onChange={v => set("aiStopFactors", v)}
                placeholder="Нет опыта B2B, Нет опыта управления..."
                customType="stop_factor"
              />
              <p className="text-[10px] text-muted-foreground">Если у кандидата есть хотя бы один стоп-фактор — автоматический отказ (рейтинг 0)</p>
            </div>

            {/* Min experience */}
            <div className="space-y-1.5">
              <Label className="text-xs">Минимальный опыт для AI-фильтра (лет)</Label>
              <Input
                type="number"
                min={0}
                value={data.aiMinExperience}
                onChange={e => set("aiMinExperience", e.target.value)}
                placeholder="0"
                className="h-9 bg-[var(--input-bg)] border border-input w-24"
              />
              <p className="text-[10px] text-muted-foreground">AI будет автоматически снижать рейтинг кандидатам с опытом менее указанного</p>
            </div>
          </div>

          {/* ── Подблок 2: Критерии оценки (влияют на балл) ── */}
          <div className="space-y-2 border-t pt-3">
            <div>
              <div className="text-sm font-semibold">⚖️ Критерии оценки (влияют на балл)</div>
              <p className="text-[11px] text-muted-foreground">Влияют на итоговый балл, не отсеивают кандидата</p>
            </div>
            <div className="space-y-2">
              {AI_WEIGHT_CRITERIA.map(criterion => (
                <div key={criterion.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{criterion.label}</span>
                  <div className="flex gap-0.5">
                    {AI_WEIGHT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set("aiWeights", { ...data.aiWeights, [criterion.id]: opt.value })}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                          data.aiWeights[criterion.id] === opt.value
                            ? opt.value === "critical" ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800"
                              : opt.value === "important" ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                              : opt.value === "nice" ? "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800"
                              : "bg-muted text-muted-foreground border-border"
                            : "bg-background text-muted-foreground border-border hover:bg-accent"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Кастомные критерии: произвольное число под вакансию */}
            {data.aiCustomCriteria.length > 0 && (
              <div className="space-y-2 pt-1">
                {data.aiCustomCriteria.map((cc, idx) => (
                  <div key={idx} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Input
                        autoFocus={focusCriterionIdx === idx}
                        value={cc.label}
                        onChange={e => {
                          const next = [...data.aiCustomCriteria]
                          next[idx] = { ...next[idx], label: e.target.value }
                          set("aiCustomCriteria", next)
                        }}
                        placeholder="Например: Опыт в EdTech / Знание 1С"
                        className="h-7 text-sm"
                      />
                      <button
                        type="button"
                        title="Удалить критерий"
                        onClick={() => set("aiCustomCriteria", data.aiCustomCriteria.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive shrink-0 px-1"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {AI_WEIGHT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            const next = [...data.aiCustomCriteria]
                            next[idx] = { ...next[idx], weight: opt.value }
                            set("aiCustomCriteria", next)
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                            cc.weight === opt.value
                              ? opt.value === "critical" ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800"
                                : opt.value === "important" ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                                : opt.value === "nice" ? "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800"
                                : "bg-muted text-muted-foreground border-border"
                              : "bg-background text-muted-foreground border-border hover:bg-accent"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!cc.label.trim() && (
                    <p className="text-[11px] text-muted-foreground pl-0.5">
                      Введите название — пустой критерий игнорируется при оценке
                    </p>
                  )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const next = [...data.aiCustomCriteria, { label: "", weight: "important" as AiWeightLevel }]
                set("aiCustomCriteria", next)
                setFocusCriterionIdx(next.length - 1)
              }}
              className="text-xs text-primary hover:underline"
            >
              + Добавить свой критерий
            </button>

            <p className="text-[11px] text-muted-foreground leading-snug pt-1">
              Город и формат работы здесь не оцениваются баллом — это жёсткие фильтры
              (раздел «Стоп-факторы»): неподходящие кандидаты отсеиваются до оценки.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── HH Description View (preview/code toggle) ──────────────────────────────

function HhDescriptionView({ html, onChange }: { html: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<"preview" | "code">("preview")

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-1.5 bg-muted/50 border-b">
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium transition-colors",
            mode === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Предпросмотр
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium transition-colors",
            mode === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Код
        </button>
      </div>
      {mode === "preview" ? (
        <div
          className="p-4 prose prose-sm max-w-none text-sm [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-sm [&_p]:my-1.5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <Textarea
          value={html}
          onChange={e => onChange(e.target.value)}
          rows={12}
          className="border-0 rounded-none text-xs font-mono bg-[var(--input-bg)] resize-none focus-visible:ring-0"
        />
      )}
    </div>
  )
}
