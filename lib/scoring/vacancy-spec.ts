// Сборка ScoringSpec из анкеты вакансии и текста резюме из полей кандидата.
// Чистый модуль (без серверных импортов) — типы из ./types.

import type { ScoringSpec, WeightLevel, Criterion } from "./types"

const WEIGHT_AXES: Array<{ key: string; label: string; hint: string; def: WeightLevel }> = [
  { key: "industry_experience", label: "Опыт в отрасли",          hint: "релевантный опыт в этой сфере", def: "important" },
  { key: "management",          label: "Опыт управления",         hint: "руководство людьми/проектами", def: "nice" },
  { key: "education",           label: "Профильное образование",  hint: "профильное образование", def: "nice" },
  { key: "specific_skills",     label: "Конкретные навыки",       hint: "наличие требуемых hard-навыков", def: "important" },
  { key: "salary_match",        label: "Зарплатное соответствие", hint: "ожидания в пределах вилки", def: "important" },
  { key: "work_format",         label: "Формат работы",           hint: "готовность к указанному формату", def: "nice" },
  { key: "location",            label: "Город / локация",         hint: "соответствие локации", def: "nice" },
]

const VALID: WeightLevel[] = ["critical", "important", "nice", "irrelevant"]

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""))
  return Number.isFinite(n) ? n : undefined
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(x => typeof x === "string") as string[] : []
}
function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

// Анкета вакансии (descriptionJson.anketa) → ScoringSpec.
export function buildSpecFromAnketa(anketa: Record<string, unknown> | null | undefined): ScoringSpec {
  const a = anketa ?? {}
  const weights = (a.aiWeights && typeof a.aiWeights === "object" ? a.aiWeights : {}) as Record<string, unknown>

  const criteria: Criterion[] = WEIGHT_AXES.map(ax => {
    const w = weights[ax.key]
    return {
      key: ax.key,
      label: ax.label,
      weight: (typeof w === "string" && VALID.includes(w as WeightLevel) ? w : ax.def) as WeightLevel,
      hint: ax.hint,
    }
  })

  const responsibilities = str(a.responsibilities)
  const requirements = str(a.requirements)
  const summary = [responsibilities, requirements].filter(Boolean).join("\n").slice(0, 1500)

  const knockouts = [...strArr(a.aiStopFactors), ...strArr(a.unacceptableSkills)]

  return {
    vacancyTitle: str(a.vacancyTitle) || "Вакансия",
    positionSummary: summary || str(a.vacancyTitle) || "—",
    requiredSkills: strArr(a.aiRequiredHardSkills).length ? strArr(a.aiRequiredHardSkills) : strArr(a.requiredSkills),
    niceSkills: strArr(a.desiredSkills),
    idealProfile: str(a.aiIdealProfile) || undefined,
    minExperienceYears: num(a.aiMinExperience) ?? num(a.experienceMin),
    salaryFrom: num(a.salaryFrom),
    salaryTo: num(a.salaryTo),
    location: str(a.positionCity) || undefined,
    workFormat: strArr(a.workFormats)[0] || undefined,
    knockouts: knockouts.length ? knockouts : undefined,
    criteria,
  }
}

const EDU_LABELS: Record<string, string> = {
  secondary: "среднее", specialized: "среднее специальное", higher: "высшее", mba: "MBA",
}
const FORMAT_LABELS: Record<string, string> = {
  office: "офис", hybrid: "гибрид", remote: "удалённо",
}

// Поля кандидата → связный текст резюме для движка.
export function buildResumeText(c: {
  name?: string | null
  city?: string | null
  salaryMin?: number | null
  experienceYears?: number | null
  keySkills?: string[] | null
  educationLevel?: string | null
  workFormat?: string | null
  anketaAnswers?: unknown
}): string {
  const L: string[] = []
  if (c.name) L.push(`Имя: ${c.name}`)
  if (c.city) L.push(`Город: ${c.city}`)
  if (c.experienceYears != null) L.push(`Опыт работы: ${c.experienceYears} лет`)
  if (c.salaryMin != null) L.push(`Зарплатные ожидания от: ${c.salaryMin} ₽`)
  if (c.educationLevel) L.push(`Образование: ${EDU_LABELS[c.educationLevel] ?? c.educationLevel}`)
  if (c.workFormat) L.push(`Желаемый формат: ${FORMAT_LABELS[c.workFormat] ?? c.workFormat}`)
  if (Array.isArray(c.keySkills) && c.keySkills.length) L.push(`Навыки: ${c.keySkills.join(", ")}`)

  // Ответы анкеты кандидата (если есть): [{question, answer}]
  if (Array.isArray(c.anketaAnswers)) {
    const qa = (c.anketaAnswers as Array<{ question?: string; answer?: string }>)
      .filter(x => x && (x.question || x.answer))
      .map(x => `${x.question ?? ""}: ${x.answer ?? ""}`.trim())
    if (qa.length) L.push(`\nОтветы анкеты:\n${qa.join("\n")}`)
  }

  return L.join("\n") || "Данных в резюме недостаточно."
}
