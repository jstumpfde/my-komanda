export const SIDEBAR_SECTIONS = [
  "Продажи",
  "IT",
  "Операции",
  "Логистика",
  "Строительство",
  "Розница",
  "Металлоконструкции",
]

export interface VacancyDraft {
  // Step 1
  title: string
  city: string
  format: "office" | "hybrid" | "remote" | ""
  employment: "full" | "part" | ""
  category: string
  sidebarSection: string

  // Step 2
  salaryMin: number
  salaryMax: number

  // Step 3
  experienceLevel: string
  employmentTypes: string[]
  scheduleTypes: string[]
  companyDescription: string
  dailyTasks: string
  requirements: string
  benefits: string
  extraLink: string

  // Step 4
  generatedText: string
  idealExperience: string
  idealSkills: string[]
  idealSalaryMin: number
  idealSalaryMax: number
}

export const emptyDraft: VacancyDraft = {
  title: "",
  city: "",
  format: "",
  employment: "",
  category: "",
  sidebarSection: "",
  salaryMin: 80000,
  salaryMax: 150000,
  experienceLevel: "",
  employmentTypes: [],
  scheduleTypes: [],
  companyDescription: "",
  dailyTasks: "",
  requirements: "",
  benefits: "",
  extraLink: "",
  generatedText: "",
  idealExperience: "3-5 лет",
  idealSkills: [],
  idealSalaryMin: 80000,
  idealSalaryMax: 150000,
}

export const FORMAT_LABELS: Record<string, string> = {
  office: "Офис",
  hybrid: "Гибрид",
  remote: "Удалёнка",
}

export const EMPLOYMENT_LABELS: Record<string, string> = {
  full: "Полная занятость",
  part: "Частичная занятость",
}

export const VACANCY_CATEGORIES = [
  "Продажи",
  "IT / Разработка",
  "Маркетинг",
  "Финансы",
  "HR",
  "Операции / Логистика",
  "Дизайн",
  "Аналитика",
  "Поддержка",
]

export const CITIES = [
  "Москва",
  "Санкт-Петербург",
  "Казань",
  "Новосибирск",
  "Екатеринбург",
  "Нижний Новгород",
  "Краснодар",
  "Удалённо",
]
