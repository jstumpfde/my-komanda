// Сборка ScoringSpec из анкеты вакансии и текста резюме из полей кандидата.
// Чистый модуль (без серверных импортов) — типы из ./types.

import type { ScoringSpec, WeightLevel, Criterion } from "./types"

// Встроенные оси оценки ПРОФЕССИОНАЛЬНОЙ пригодности.
//
// ВАЖНО (TZ-SCORING-FILTERS-SPLIT): город и формат работы здесь НАМЕРЕННО
// отсутствуют — это жёсткие ФИЛЬТРЫ (vacancy.stopFactorsJson → проверяются в
// process-queue ДО скоринга), а не балльные критерии. Раньше они были осями с
// весом nice и давали по 100 баллов за «Москва»/«удалёнка», вытягивая слабых
// кандидатов вверх. Теперь оценка считает только профпригодность.
//
// Дефолтные веса: профессиональное ядро (опыт в отрасли + конкретные навыки) —
// «Критично»; зарплата — «Важно»; образование/управление — «Желательно».
// HR переопределяет любой вес в анкете (aiWeights), а сверх этих осей может
// добавить СВОИ критерии под конкретную вакансию (aiCustomCriteria).
const WEIGHT_AXES: Array<{ key: string; label: string; hint: string; def: WeightLevel }> = [
  { key: "industry_experience", label: "Опыт в отрасли",          hint: "релевантный опыт в этой сфере", def: "critical" },
  { key: "specific_skills",     label: "Конкретные навыки",       hint: "наличие требуемых hard-навыков", def: "critical" },
  { key: "salary_match",        label: "Зарплатное соответствие", hint: "ожидания в пределах вилки", def: "important" },
  { key: "management",          label: "Опыт управления",         hint: "руководство людьми/проектами", def: "nice" },
  { key: "education",           label: "Профильное образование",  hint: "профильное образование", def: "nice" },
]

const VALID: WeightLevel[] = ["critical", "important", "nice", "irrelevant"]

// Кастомный критерий из анкеты вакансии (anketa.aiCustomCriteria).
// Позволяет HR задать произвольное число своих осей оценки сверх встроенных —
// движок (rubric.ts) строит схему динамически, число критериев не ограничено.
interface RawCustomCriterion { key?: unknown; label?: unknown; hint?: unknown; weight?: unknown }

function parseCustomCriteria(raw: unknown, usedKeys: Set<string>): Criterion[] {
  if (!Array.isArray(raw)) return []
  const out: Criterion[] = []
  for (const item of raw as RawCustomCriterion[]) {
    if (!item || typeof item !== "object") continue
    const label = typeof item.label === "string" ? item.label.trim() : ""
    if (!label) continue
    const weight = (typeof item.weight === "string" && VALID.includes(item.weight as WeightLevel)
      ? item.weight : "important") as WeightLevel
    if (weight === "irrelevant") continue
    // Ключ: из item.key или slug из label; гарантируем уникальность.
    let key = typeof item.key === "string" && item.key.trim()
      ? item.key.trim()
      : "custom_" + label.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40)
    if (!key) key = "custom"
    let uniq = key, i = 2
    while (usedKeys.has(uniq)) uniq = `${key}_${i++}`
    usedKeys.add(uniq)
    out.push({
      key: uniq,
      label: label.slice(0, 80),
      weight,
      hint: typeof item.hint === "string" ? item.hint.trim().slice(0, 200) : undefined,
    })
  }
  return out
}

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

  const builtin: Criterion[] = WEIGHT_AXES
    .map(ax => {
      const w = weights[ax.key]
      return {
        key: ax.key,
        label: ax.label,
        weight: (typeof w === "string" && VALID.includes(w as WeightLevel) ? w : ax.def) as WeightLevel,
        hint: ax.hint,
      }
    })
    // Оси с весом «Не важно» в анкете не оцениваем и не показываем
    // (например «Опыт управления» для ассистента).
    .filter(c => c.weight !== "irrelevant")

  // Кастомные критерии вакансии (anketa.aiCustomCriteria) — произвольное число
  // сверх встроенных. Ключи уникализируются относительно встроенных.
  const usedKeys = new Set(builtin.map(c => c.key))
  const custom = parseCustomCriteria(a.aiCustomCriteria, usedKeys)
  const criteria: Criterion[] = [...builtin, ...custom]

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
    screeningQuestions: strArr(a.screeningQuestions).length ? strArr(a.screeningQuestions) : undefined,
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
