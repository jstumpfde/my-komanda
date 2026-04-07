"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Sparkles, ChevronRight, ChevronLeft, Search, X, Check } from "lucide-react"

// ═══ TYPES ═══

interface ClarifyQuestion {
  id: string
  question: string
  type: "single" | "multi" | "text"
  options?: { value: string; label: string; skillsAdd?: string[]; skillsRemove?: string[] }[]
  dependsOn?: { questionId: string; value: string }
}

interface PositionTemplate {
  id: string
  title: string
  category: string
  clarifyingQuestions: ClarifyQuestion[]
  baseSkills: { required: string[]; desired: string[] }
  baseSalary: { from: string; to: string }
  baseStopFactors: string[]
  baseConditions: string[]
  workFormats: string[]
  employment: string[]
}

export interface WizardResult {
  positionTitle: string
  positionCategory: string
  workFormats: string[]
  employment: string[]
  positionCity: string
  salaryFrom: string
  salaryTo: string
  requiredSkills: string[]
  desiredSkills: string[]
  stopFactors: string[]
  conditions: string[]
  clarifyingAnswers: Record<string, string | string[]>
}

// ═══ TEMPLATES ═══

const POSITION_TEMPLATES: PositionTemplate[] = [
  {
    id: "sales-manager",
    title: "Менеджер по продажам",
    category: "Продажи",
    clarifyingQuestions: [
      { id: "sales-type", question: "Тип продаж", type: "single", options: [
        { value: "b2b", label: "B2B", skillsAdd: ["B2B продажи", "Коммерческие предложения", "Тендеры"] },
        { value: "b2c", label: "B2C", skillsAdd: ["Розничные продажи", "Работа с физлицами"] },
        { value: "b2g", label: "B2G (госзакупки)", skillsAdd: ["Госзакупки", "44-ФЗ", "Тендерные площадки"] },
      ]},
      { id: "sales-cycle", question: "Цикл сделки", type: "single", options: [
        { value: "short", label: "Короткий (до 1 месяца)" },
        { value: "long", label: "Длинный (1-6 месяцев)", skillsAdd: ["Длинные сделки", "Построение отношений"] },
        { value: "very-long", label: "Очень длинный (6+ месяцев)", skillsAdd: ["Стратегические продажи", "Key Account Management"] },
      ]},
      { id: "industry", question: "Отрасль", type: "single", options: [
        { value: "it", label: "IT / Технологии", skillsAdd: ["IT продукты", "SaaS"] },
        { value: "construction", label: "Строительство", skillsAdd: ["Строительные материалы"] },
        { value: "fmcg", label: "FMCG", skillsAdd: ["FMCG", "Работа с ритейлом", "Мерчандайзинг"] },
        { value: "finance", label: "Финансы / Банки", skillsAdd: ["Финансовые продукты"] },
        { value: "pharma", label: "Фарма / Медицина", skillsAdd: ["Фармацевтика"] },
        { value: "industrial", label: "Промышленность", skillsAdd: ["Промышленное оборудование"] },
        { value: "other", label: "Другая" },
      ]},
      { id: "avg-check", question: "Средний чек сделки", type: "single", options: [
        { value: "small", label: "до 100 000 ₽" },
        { value: "medium", label: "100 000 — 1 000 000 ₽" },
        { value: "large", label: "1 — 10 млн ₽", skillsAdd: ["Крупные сделки"] },
        { value: "enterprise", label: "10+ млн ₽", skillsAdd: ["Enterprise продажи", "C-level переговоры"] },
      ]},
      { id: "team", question: "Управление командой", type: "single", options: [
        { value: "no", label: "Нет, индивидуальный вклад" },
        { value: "small", label: "Да, 2-5 человек", skillsAdd: ["Управление командой", "Наставничество"] },
        { value: "large", label: "Да, 5+ человек", skillsAdd: ["Управление отделом", "Мотивация команды", "KPI"] },
      ]},
    ],
    baseSkills: { required: ["Холодные звонки", "Переговоры", "CRM", "Презентации", "Работа с возражениями", "Активные продажи"], desired: ["Английский язык", "Аналитика", "Excel"] },
    baseSalary: { from: "80000", to: "150000" },
    baseStopFactors: ["Без опыта продаж", "Частая смена работы"],
    baseConditions: ["ДМС", "Обучение", "Гибкий график"],
    workFormats: ["Офис"],
    employment: ["Полная"],
  },
  {
    id: "hr-recruiter",
    title: "HR / Рекрутер",
    category: "HR",
    clarifyingQuestions: [
      { id: "hr-type", question: "Направление", type: "single", options: [
        { value: "recruiter", label: "Рекрутинг", skillsAdd: ["Подбор персонала", "Скрининг резюме", "Интервью"] },
        { value: "hrm", label: "HR-менеджер", skillsAdd: ["Кадровое делопроизводство", "Адаптация", "Мотивация"] },
        { value: "hrbp", label: "HR бизнес-партнёр", skillsAdd: ["HR стратегия", "Организационное развитие"] },
        { value: "training", label: "Обучение и развитие", skillsAdd: ["Тренинги", "Разработка курсов", "LMS"] },
      ]},
      { id: "hr-volume", question: "Объём подбора", type: "single", options: [
        { value: "small", label: "до 5 вакансий" },
        { value: "medium", label: "5-15 вакансий", skillsAdd: ["Массовый подбор"] },
        { value: "large", label: "15+ вакансий", skillsAdd: ["Массовый подбор", "Автоматизация HR"] },
      ]},
    ],
    baseSkills: { required: ["Подбор персонала", "Интервью", "hh.ru", "Деловая переписка"], desired: ["1С ЗУП", "Английский язык", "HR аналитика"] },
    baseSalary: { from: "60000", to: "120000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Обучение", "Удалённые дни"],
    workFormats: ["Гибрид"],
    employment: ["Полная"],
  },
  {
    id: "developer",
    title: "Разработчик",
    category: "IT",
    clarifyingQuestions: [
      { id: "dev-type", question: "Направление", type: "single", options: [
        { value: "frontend", label: "Frontend", skillsAdd: ["React", "TypeScript", "CSS", "HTML"] },
        { value: "backend", label: "Backend", skillsAdd: ["Node.js", "Python", "PostgreSQL", "API"] },
        { value: "fullstack", label: "Fullstack", skillsAdd: ["React", "Node.js", "PostgreSQL", "TypeScript"] },
        { value: "mobile", label: "Mobile", skillsAdd: ["React Native", "Swift", "Kotlin"] },
        { value: "devops", label: "DevOps", skillsAdd: ["Docker", "Kubernetes", "CI/CD", "Linux"] },
      ]},
      { id: "dev-level", question: "Уровень", type: "single", options: [
        { value: "junior", label: "Junior (0-2 года)" },
        { value: "middle", label: "Middle (2-5 лет)" },
        { value: "senior", label: "Senior (5+ лет)", skillsAdd: ["Архитектура", "Code Review", "Менторинг"] },
        { value: "lead", label: "Team Lead", skillsAdd: ["Управление командой", "Agile/Scrum", "Архитектура"] },
      ]},
    ],
    baseSkills: { required: ["Git", "Командная работа"], desired: ["Английский язык", "Agile/Scrum"] },
    baseSalary: { from: "150000", to: "300000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Удалённые дни", "Обучение", "Гибкий график"],
    workFormats: ["Удалёнка", "Гибрид"],
    employment: ["Полная"],
  },
  {
    id: "accountant",
    title: "Бухгалтер",
    category: "Финансы",
    clarifyingQuestions: [
      { id: "acc-type", question: "Специализация", type: "single", options: [
        { value: "main", label: "Главный бухгалтер", skillsAdd: ["Управленческий учёт", "Налоговая отчётность", "Аудит"] },
        { value: "regular", label: "Бухгалтер", skillsAdd: ["Первичная документация", "Расчёт зарплаты"] },
        { value: "ved", label: "ВЭД", skillsAdd: ["Валютные операции", "Таможенное оформление", "ВЭД"] },
      ]},
    ],
    baseSkills: { required: ["1С Бухгалтерия", "Налоговый кодекс", "Excel", "Документооборот"], desired: ["МСФО", "Английский язык"] },
    baseSalary: { from: "60000", to: "120000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Обучение"],
    workFormats: ["Офис"],
    employment: ["Полная"],
  },
  {
    id: "marketer",
    title: "Маркетолог",
    category: "Маркетинг",
    clarifyingQuestions: [
      { id: "mkt-type", question: "Направление", type: "single", options: [
        { value: "digital", label: "Digital маркетинг", skillsAdd: ["Таргетированная реклама", "Контекстная реклама", "Google Analytics"] },
        { value: "content", label: "Контент-маркетинг", skillsAdd: ["Копирайтинг", "SEO", "Контент-план"] },
        { value: "smm", label: "SMM", skillsAdd: ["SMM", "Telegram", "VK"] },
        { value: "product", label: "Продуктовый маркетинг", skillsAdd: ["Product Marketing", "Конкурентный анализ"] },
        { value: "brand", label: "Бренд-менеджер", skillsAdd: ["Брендинг", "Стратегия бренда"] },
      ]},
    ],
    baseSkills: { required: ["Маркетинговая стратегия", "Аналитика"], desired: ["Figma", "Adobe Photoshop", "Английский язык"] },
    baseSalary: { from: "70000", to: "150000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Обучение", "Гибкий график"],
    workFormats: ["Гибрид"],
    employment: ["Полная"],
  },
  {
    id: "logist",
    title: "Логист",
    category: "Логистика",
    clarifyingQuestions: [
      { id: "log-type", question: "Направление", type: "single", options: [
        { value: "transport", label: "Транспортная логистика", skillsAdd: ["Маршрутизация", "Транспортные компании", "TMS"] },
        { value: "warehouse", label: "Складская логистика", skillsAdd: ["Складской учёт", "WMS", "Инвентаризация"] },
        { value: "ved", label: "ВЭД логистика", skillsAdd: ["ВЭД", "Таможенное оформление", "Инкотермс"] },
      ]},
    ],
    baseSkills: { required: ["1С", "Excel", "Документооборот"], desired: ["Английский язык", "SAP"] },
    baseSalary: { from: "50000", to: "100000" },
    baseStopFactors: [],
    baseConditions: ["ДМС"],
    workFormats: ["Офис"],
    employment: ["Полная"],
  },
  {
    id: "call-center",
    title: "Оператор call-центра",
    category: "Продажи",
    clarifyingQuestions: [
      { id: "cc-type", question: "Тип звонков", type: "single", options: [
        { value: "inbound", label: "Входящие", skillsAdd: ["Обработка входящих звонков", "Консультирование"] },
        { value: "outbound", label: "Исходящие (холодные)", skillsAdd: ["Холодные звонки", "Телемаркетинг"] },
        { value: "support", label: "Техподдержка", skillsAdd: ["Техническая поддержка", "Тикет-система"] },
      ]},
    ],
    baseSkills: { required: ["Грамотная речь", "Стрессоустойчивость", "CRM"], desired: ["Продажи по телефону"] },
    baseSalary: { from: "35000", to: "60000" },
    baseStopFactors: [],
    baseConditions: ["Обучение"],
    workFormats: ["Офис", "Удалёнка"],
    employment: ["Полная", "Частичная"],
  },
  {
    id: "office-manager",
    title: "Офис-менеджер",
    category: "Администрация",
    clarifyingQuestions: [
      { id: "om-scope", question: "Зона ответственности", type: "single", options: [
        { value: "basic", label: "Стандартный функционал", skillsAdd: ["Делопроизводство", "Приём гостей"] },
        { value: "extended", label: "Расширенный (+ закупки, HR)", skillsAdd: ["Закупки", "Кадровое делопроизводство"] },
      ]},
    ],
    baseSkills: { required: ["MS Office", "Деловая переписка", "Документооборот"], desired: ["1С", "Английский язык"] },
    baseSalary: { from: "40000", to: "70000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Питание"],
    workFormats: ["Офис"],
    employment: ["Полная"],
  },
  {
    id: "lawyer",
    title: "Юрист",
    category: "Администрация",
    clarifyingQuestions: [
      { id: "law-type", question: "Специализация", type: "single", options: [
        { value: "corporate", label: "Корпоративное право", skillsAdd: ["Корпоративное право", "M&A", "Due Diligence"] },
        { value: "labor", label: "Трудовое право", skillsAdd: ["Трудовое право", "Трудовые споры"] },
        { value: "contract", label: "Договорная работа", skillsAdd: ["Договорная работа", "Проверка контрагентов"] },
        { value: "litigation", label: "Судебная практика", skillsAdd: ["Арбитраж", "Исковая работа"] },
      ]},
    ],
    baseSkills: { required: ["Юридическая экспертиза", "КонсультантПлюс", "Деловая переписка"], desired: ["Английский язык"] },
    baseSalary: { from: "70000", to: "150000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Обучение"],
    workFormats: ["Офис", "Гибрид"],
    employment: ["Полная"],
  },
  {
    id: "designer",
    title: "Дизайнер",
    category: "IT",
    clarifyingQuestions: [
      { id: "des-type", question: "Направление", type: "single", options: [
        { value: "ui", label: "UI/UX дизайн", skillsAdd: ["Figma", "Прототипирование", "UX исследования"] },
        { value: "graphic", label: "Графический дизайн", skillsAdd: ["Adobe Photoshop", "Adobe Illustrator", "Полиграфия"] },
        { value: "motion", label: "Моушн-дизайн", skillsAdd: ["After Effects", "Видеомонтаж"] },
        { value: "web", label: "Веб-дизайн", skillsAdd: ["Figma", "HTML/CSS", "Tilda"] },
      ]},
    ],
    baseSkills: { required: ["Портфолио", "Дизайн-мышление"], desired: ["Английский язык"] },
    baseSalary: { from: "80000", to: "180000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Гибкий график", "Удалённые дни"],
    workFormats: ["Удалёнка", "Гибрид"],
    employment: ["Полная", "Проектная"],
  },
  {
    id: "data-analyst",
    title: "Аналитик данных",
    category: "IT",
    clarifyingQuestions: [
      { id: "da-type", question: "Специализация", type: "single", options: [
        { value: "bi", label: "BI аналитик", skillsAdd: ["Power BI", "Tableau", "Дашборды"] },
        { value: "product", label: "Продуктовый аналитик", skillsAdd: ["A/B тесты", "Юнит-экономика", "Метрики продукта"] },
        { value: "data-engineer", label: "Data Engineer", skillsAdd: ["ETL", "Airflow", "Data Warehouse"] },
      ]},
    ],
    baseSkills: { required: ["SQL", "Excel", "Python"], desired: ["Английский язык", "Статистика"] },
    baseSalary: { from: "100000", to: "220000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Обучение", "Гибкий график"],
    workFormats: ["Удалёнка", "Гибрид"],
    employment: ["Полная"],
  },
  {
    id: "project-manager",
    title: "Руководитель проекта",
    category: "Администрация",
    clarifyingQuestions: [
      { id: "pm-type", question: "Методология", type: "single", options: [
        { value: "agile", label: "Agile/Scrum", skillsAdd: ["Agile/Scrum", "JIRA", "Спринты"] },
        { value: "waterfall", label: "Waterfall", skillsAdd: ["MS Project", "Диаграмма Ганта"] },
        { value: "hybrid", label: "Гибридный подход", skillsAdd: ["Agile/Scrum", "MS Project"] },
      ]},
      { id: "pm-team", question: "Размер команды", type: "single", options: [
        { value: "small", label: "3-7 человек" },
        { value: "medium", label: "8-15 человек", skillsAdd: ["Управление рисками"] },
        { value: "large", label: "15+ человек", skillsAdd: ["Программное управление", "Бюджетирование"] },
      ]},
    ],
    baseSkills: { required: ["Управление проектами", "Коммуникации", "Планирование"], desired: ["PMP", "Английский язык"] },
    baseSalary: { from: "120000", to: "250000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Обучение", "Гибкий график"],
    workFormats: ["Гибрид"],
    employment: ["Полная"],
  },
  {
    id: "product-manager",
    title: "Продакт-менеджер",
    category: "IT",
    clarifyingQuestions: [
      { id: "prod-stage", question: "Стадия продукта", type: "single", options: [
        { value: "startup", label: "Стартап / 0→1", skillsAdd: ["Customer Development", "MVP", "Lean"] },
        { value: "growth", label: "Рост / Масштабирование", skillsAdd: ["Growth Hacking", "Юнит-экономика", "Когортный анализ"] },
        { value: "mature", label: "Зрелый продукт", skillsAdd: ["Оптимизация", "Retention", "Монетизация"] },
      ]},
    ],
    baseSkills: { required: ["Продуктовая стратегия", "Аналитика", "Roadmap"], desired: ["SQL", "Figma", "Английский язык"] },
    baseSalary: { from: "150000", to: "300000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Обучение", "Гибкий график", "Удалённые дни"],
    workFormats: ["Гибрид", "Удалёнка"],
    employment: ["Полная"],
  },
  {
    id: "engineer",
    title: "Инженер",
    category: "Производство",
    clarifyingQuestions: [
      { id: "eng-type", question: "Направление", type: "single", options: [
        { value: "construction", label: "Строительство / ПГС", skillsAdd: ["AutoCAD", "Проектная документация", "СНиПы"] },
        { value: "industrial", label: "Промышленное оборудование", skillsAdd: ["ТОиР", "Наладка оборудования"] },
        { value: "energy", label: "Энергетика", skillsAdd: ["Электроснабжение", "ПУЭ"] },
        { value: "quality", label: "Контроль качества", skillsAdd: ["ISO 9001", "Метрология", "ОТК"] },
      ]},
    ],
    baseSkills: { required: ["Техническая документация", "Чтение чертежей"], desired: ["AutoCAD", "MS Office"] },
    baseSalary: { from: "60000", to: "130000" },
    baseStopFactors: [],
    baseConditions: ["ДМС", "Корпоративный транспорт"],
    workFormats: ["Офис"],
    employment: ["Полная"],
  },
  {
    id: "driver",
    title: "Водитель",
    category: "Логистика",
    clarifyingQuestions: [
      { id: "drv-type", question: "Категория", type: "single", options: [
        { value: "b", label: "Легковой (кат. B)", skillsAdd: ["Водительские права B"] },
        { value: "c", label: "Грузовой (кат. C)", skillsAdd: ["Водительские права C", "Тахограф"] },
        { value: "d", label: "Автобус (кат. D)", skillsAdd: ["Водительские права D"] },
        { value: "ce", label: "Фура (кат. CE)", skillsAdd: ["Водительские права CE", "Международные перевозки"] },
      ]},
    ],
    baseSkills: { required: ["Безаварийное вождение", "Знание города"], desired: ["Экспедирование"] },
    baseSalary: { from: "45000", to: "90000" },
    baseStopFactors: ["Нет водительских прав"],
    baseConditions: ["Оплата ГСМ", "Корпоративный транспорт"],
    workFormats: ["Офис"],
    employment: ["Полная"],
  },
]

const CATEGORIES = [...new Set(POSITION_TEMPLATES.map(t => t.category))]

// ═══ STEP INDICATOR ═══

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
            n === current ? "bg-primary text-primary-foreground" :
            n < current ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          )}>
            {n < current ? <Check className="w-4 h-4" /> : n}
          </div>
          {n < total && (
            <div className={cn("w-12 h-0.5", n < current ? "bg-primary/40" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  )
}

// ═══ COMPONENT ═══

interface AnketaWizardProps {
  onComplete: (result: WizardResult) => void
  onSkip: () => void
  initialTitle?: string
}

export function AnketaWizard({ onComplete, onSkip, initialTitle }: AnketaWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [searchQuery, setSearchQuery] = useState(initialTitle || "")
  const [selectedTemplate, setSelectedTemplate] = useState<PositionTemplate | null>(null)
  const [customTitle, setCustomTitle] = useState("")

  // Step 2
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})

  // Step 3
  const [result, setResult] = useState<WizardResult | null>(null)

  const filteredTemplates = POSITION_TEMPLATES.filter(t =>
    !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const groupedByCategory = CATEGORIES.map(cat => ({
    category: cat,
    templates: filteredTemplates.filter(t => t.category === cat),
  })).filter(g => g.templates.length > 0)

  const selectTemplate = (t: PositionTemplate) => {
    setSelectedTemplate(t)
    setCustomTitle(t.title)
    setAnswers({})
  }

  const setAnswer = (qId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [qId]: value }))
  }

  const generateResult = () => {
    if (!selectedTemplate) return
    const skills = { required: [...selectedTemplate.baseSkills.required], desired: [...selectedTemplate.baseSkills.desired] }

    for (const q of selectedTemplate.clarifyingQuestions) {
      const answer = answers[q.id]
      if (!answer) continue
      const values = Array.isArray(answer) ? answer : [answer]
      for (const v of values) {
        const opt = q.options?.find(o => o.value === v)
        if (opt?.skillsAdd) {
          for (const s of opt.skillsAdd) {
            if (!skills.required.includes(s)) skills.required.push(s)
          }
        }
      }
    }

    const r: WizardResult = {
      positionTitle: customTitle || selectedTemplate.title,
      positionCategory: selectedTemplate.category,
      workFormats: [...selectedTemplate.workFormats],
      employment: [...selectedTemplate.employment],
      positionCity: "",
      salaryFrom: selectedTemplate.baseSalary.from,
      salaryTo: selectedTemplate.baseSalary.to,
      requiredSkills: skills.required,
      desiredSkills: skills.desired,
      stopFactors: [...selectedTemplate.baseStopFactors],
      conditions: [...selectedTemplate.baseConditions],
      clarifyingAnswers: answers,
    }
    setResult(r)
    setStep(3)
  }

  const removeSkill = (list: "requiredSkills" | "desiredSkills", skill: string) => {
    if (!result) return
    setResult({ ...result, [list]: result[list].filter(s => s !== skill) })
  }

  const removeCondition = (c: string) => {
    if (!result) return
    setResult({ ...result, conditions: result.conditions.filter(x => x !== c) })
  }

  // ═══ STEP 1: Choose position ═══
  if (step === 1) {
    return (
      <div className="max-w-3xl mx-auto">
        <StepIndicator current={1} total={3} />
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Выберите должность</h2>
          <p className="text-sm text-muted-foreground">Мы подберём навыки, зарплату и условия</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск должности..."
            className="pl-9 h-10 bg-[var(--input-bg)]"
          />
        </div>

        <div className="space-y-4 mb-6">
          {groupedByCategory.map(g => (
            <div key={g.category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{g.category}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {g.templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t)}
                    className={cn(
                      "text-left p-3 rounded-lg border transition-all text-sm",
                      selectedTemplate?.id === t.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.baseSkills.required.slice(0, 3).join(", ")}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selectedTemplate && (
          <div className="space-y-3 mb-6">
            <Label className="text-sm">Название должности</Label>
            <Input
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              className="h-10 bg-[var(--input-bg)]"
              placeholder="Уточните название"
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={onSkip}>Заполнить вручную</Button>
          <Button onClick={() => setStep(2)} disabled={!selectedTemplate} className="gap-1.5">
            Далее <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ═══ STEP 2: Clarifying questions ═══
  if (step === 2 && selectedTemplate) {
    const visibleQuestions = selectedTemplate.clarifyingQuestions.filter(q => {
      if (!q.dependsOn) return true
      return answers[q.dependsOn.questionId] === q.dependsOn.value
    })

    return (
      <div className="max-w-3xl mx-auto">
        <StepIndicator current={2} total={3} />
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Уточните детали</h2>
          <p className="text-sm text-muted-foreground">Это поможет точнее подобрать навыки и условия</p>
        </div>

        <div className="space-y-5 mb-6">
          {visibleQuestions.map(q => (
            <div key={q.id} className="space-y-2">
              <Label className="text-sm font-medium">{q.question}</Label>
              {q.type === "single" && q.options && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {q.options.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setAnswer(q.id, o.value)}
                      className={cn(
                        "text-left p-2.5 rounded-lg border text-sm transition-all",
                        answers[q.id] === o.value
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {q.type === "text" && (
                <Input
                  value={(answers[q.id] as string) || ""}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  className="bg-[var(--input-bg)]"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => setStep(1)} className="gap-1.5">
            <ChevronLeft className="w-4 h-4" /> Назад
          </Button>
          <Button onClick={generateResult} className="gap-1.5">
            Сформировать <Sparkles className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ═══ STEP 3: Preview & edit ═══
  if (step === 3 && result) {
    return (
      <div className="max-w-3xl mx-auto">
        <StepIndicator current={3} total={3} />
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Проверьте результат</h2>
          <p className="text-sm text-muted-foreground">Уберите лишнее или добавьте недостающее</p>
        </div>

        <div className="space-y-4 mb-6">
          {/* Title */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Должность</Label>
              <Input
                value={result.positionTitle}
                onChange={e => setResult({ ...result, positionTitle: e.target.value })}
                className="h-9 bg-[var(--input-bg)]"
              />
            </CardContent>
          </Card>

          {/* Salary */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Зарплата</Label>
              <div className="flex gap-3">
                <Input
                  value={result.salaryFrom}
                  onChange={e => setResult({ ...result, salaryFrom: e.target.value })}
                  placeholder="от"
                  className="h-9 bg-[var(--input-bg)]"
                />
                <Input
                  value={result.salaryTo}
                  onChange={e => setResult({ ...result, salaryTo: e.target.value })}
                  placeholder="до"
                  className="h-9 bg-[var(--input-bg)]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Required skills */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Обязательные навыки</Label>
              <div className="flex flex-wrap gap-1.5">
                {result.requiredSkills.map(s => (
                  <Badge key={s} variant="secondary" className="gap-1 text-xs bg-primary/10 text-primary border-primary/20">
                    {s}
                    <button type="button" onClick={() => removeSkill("requiredSkills", s)} className="hover:text-destructive ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Desired skills */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Желательные навыки</Label>
              <div className="flex flex-wrap gap-1.5">
                {result.desiredSkills.map(s => (
                  <Badge key={s} variant="secondary" className="gap-1 text-xs">
                    {s}
                    <button type="button" onClick={() => removeSkill("desiredSkills", s)} className="hover:text-destructive ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Conditions */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label className="text-xs text-muted-foreground">Условия</Label>
              <div className="flex flex-wrap gap-1.5">
                {result.conditions.map(c => (
                  <Badge key={c} variant="secondary" className="gap-1 text-xs">
                    {c}
                    <button type="button" onClick={() => removeCondition(c)} className="hover:text-destructive ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Work format & employment */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex gap-6">
                <div>
                  <Label className="text-xs text-muted-foreground">Формат</Label>
                  <div className="flex gap-1.5 mt-1">
                    {result.workFormats.map(f => (
                      <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Занятость</Label>
                  <div className="flex gap-1.5 mt-1">
                    {result.employment.map(e => (
                      <Badge key={e} variant="outline" className="text-xs">{e}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => setStep(2)} className="gap-1.5">
            <ChevronLeft className="w-4 h-4" /> Назад
          </Button>
          <Button onClick={() => onComplete(result)} className="gap-1.5">
            <Check className="w-4 h-4" /> Применить
          </Button>
        </div>
      </div>
    )
  }

  return null
}
