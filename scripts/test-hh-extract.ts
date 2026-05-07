// Самодостаточный smoke-тест для extractHhResumeFields / toCandidateColumns.
// Запуск: `pnpm tsx scripts/test-hh-extract.ts`
// Не требует test-фреймворка. Падает на первой неудаче с понятным сообщением.

import { extractHhResumeFields, toCandidateColumns } from "@/lib/hh/extract-resume-fields"

let failed = 0
let passed = 0

function eq(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed++
  } else {
    failed++
    console.error(`✗ ${name}`)
    console.error(`  expected: ${JSON.stringify(expected)}`)
    console.error(`  actual:   ${JSON.stringify(actual)}`)
  }
}

function truthy(name: string, value: unknown) {
  if (value) { passed++ } else { failed++; console.error(`✗ ${name}: expected truthy, got ${JSON.stringify(value)}`) }
}

// ─── 1) Пустой / невалидный вход ────────────────────────────────────────────

eq("empty resume → {}", extractHhResumeFields(undefined), {})
eq("null resume → {}", extractHhResumeFields(null), {})
eq("string resume → {}", extractHhResumeFields("not-an-object"), {})
eq("toCandidateColumns({}) → {}", toCandidateColumns({}), {})

// ─── 2) birth_date приоритетнее age ─────────────────────────────────────────

const fromBirthDate = extractHhResumeFields({ birth_date: "1995-03-15", age: 99 })
eq("birth_date → birthDate exact", fromBirthDate.birthDate, "1995-03-15")

const fromAge = extractHhResumeFields({ age: 30 })
const expectedYear = new Date().getUTCFullYear() - 30
eq("age=30 → derived birth_date", fromAge.birthDate, `${expectedYear}-01-01`)

eq("age=12 (нереально) → null", extractHhResumeFields({ age: 12 }).birthDate, null)
eq("age='30' (string) → null", extractHhResumeFields({ age: "30" } as unknown as Record<string, unknown>).birthDate, null)
eq("birth_date='abc' (мусор) → null/age fallback нет → null", extractHhResumeFields({ birth_date: "abc" }).birthDate, null)

// ─── 3) area / salary ───────────────────────────────────────────────────────

eq("area.name → city", extractHhResumeFields({ area: { name: "Москва" } }).city, "Москва")
eq("area.name отсутствует → city undefined", extractHhResumeFields({ area: {} }).city, undefined)
eq("salary.amount=120000 → salaryMin=salaryMax", extractHhResumeFields({ salary: { amount: 120_000 } }).salaryMin, 120_000)
eq("salary.amount=120000 → salaryMax", extractHhResumeFields({ salary: { amount: 120_000 } }).salaryMax, 120_000)

// ─── 4) experience ──────────────────────────────────────────────────────────

eq(
  "total_experience.months=64 → 5 лет",
  extractHhResumeFields({ total_experience: { months: 64 } }).experienceYears,
  5,
)
eq(
  "experience[].total_months sum",
  extractHhResumeFields({ experience: [{ total_months: 30 }, { total_months: 50 }] }).experienceYears,
  Math.round((30 + 50) / 12),
)
eq(
  "experience text label",
  extractHhResumeFields({ total_experience: { months: 60 } }).experience,
  "5 лет",
)

// ─── 5) education ───────────────────────────────────────────────────────────

eq(
  "education.level.id=bachelor → higher",
  extractHhResumeFields({ education: { level: { id: "bachelor" } } }).educationLevel,
  "higher",
)
eq(
  "education.level.id=special_secondary → specialized",
  extractHhResumeFields({ education: { level: { id: "special_secondary" } } }).educationLevel,
  "specialized",
)
eq(
  "education.level.id=mba → mba",
  extractHhResumeFields({ education: { level: { id: "mba" } } }).educationLevel,
  "mba",
)
eq(
  "education.level.id=unknown → null",
  extractHhResumeFields({ education: { level: { id: "garbage" } } }).educationLevel,
  null,
)

// ─── 6) skills (skill_set) ──────────────────────────────────────────────────

eq(
  "skill_set → keySkills + skills",
  extractHhResumeFields({ skill_set: ["Python", "SQL"] }).keySkills,
  ["Python", "SQL"],
)

// ─── 7) languages ───────────────────────────────────────────────────────────

eq(
  "language[] с уровнем → 'Имя (Уровень)'",
  extractHhResumeFields({
    language: [{ name: "Русский", level: { name: "Свободно" } }, { name: "Английский", level: { name: "B2" } }],
  }).languages,
  ["Русский (Свободно)", "Английский (B2)"],
)
eq("language[] пустой → undefined", extractHhResumeFields({ language: [] }).languages, undefined)

// ─── 8) relocation / business trips ─────────────────────────────────────────

eq(
  "relocation.type.id=no_relocation → false",
  extractHhResumeFields({ relocation: { type: { id: "no_relocation" } } }).relocationReady,
  false,
)
eq(
  "relocation.type.id=relocation_possible → true",
  extractHhResumeFields({ relocation: { type: { id: "relocation_possible" } } }).relocationReady,
  true,
)
eq(
  "business_trip_readiness=ready → true",
  extractHhResumeFields({ business_trip_readiness: { id: "ready" } }).businessTripsReady,
  true,
)
eq(
  "business_trip_readiness=never → false",
  extractHhResumeFields({ business_trip_readiness: { id: "never" } }).businessTripsReady,
  false,
)

// ─── 9) toCandidateColumns: только осмысленные поля ─────────────────────────

const cols = toCandidateColumns({
  city:                "Москва",
  salaryMin:           100,
  birthDate:           "1990-01-01",
  experienceYears:     5,
  experience:          "5 лет",
  educationLevel:      "higher",
  keySkills:           ["A"],
  skills:              ["A"],
  languages:           ["Русский"],
  relocationReady:     null,
  businessTripsReady:  null,
  workFormat:          null,
})
truthy("toCandidateColumns: city присутствует", "city" in cols)
truthy("toCandidateColumns: birthDate присутствует", "birthDate" in cols)
eq("toCandidateColumns: relocationReady=null НЕ пишется", "relocationReady" in cols, false)
eq("toCandidateColumns: businessTripsReady=null НЕ пишется", "businessTripsReady" in cols, false)
eq("toCandidateColumns: workFormat=null НЕ пишется", "workFormat" in cols, false)

// ─── 10) Реалистичный full resume hh с возрастом 29 (как в логах PM2) ───────

const realistic = extractHhResumeFields({
  age: 29,
  area: { name: "Санкт-Петербург" },
  salary: { amount: 150_000, currency: "RUR" },
  total_experience: { months: 84 },
  skill_set: ["JavaScript", "React", "Next.js"],
  education: { level: { id: "higher" } },
  language: [{ name: "Русский", level: { name: "Родной" } }, { name: "Английский", level: { name: "B2" } }],
  relocation: { type: { id: "no_relocation" } },
  business_trip_readiness: { id: "sometimes" },
})

const realCols = toCandidateColumns(realistic)
truthy("realistic: birthDate выведен из age", realCols.birthDate)
eq("realistic: city",            realCols.city,           "Санкт-Петербург")
eq("realistic: salaryMin",       realCols.salaryMin,      150_000)
eq("realistic: experienceYears", realCols.experienceYears, 7)
eq("realistic: educationLevel",  realCols.educationLevel, "higher")
eq("realistic: relocationReady", realCols.relocationReady, false)
eq("realistic: businessTripsReady", realCols.businessTripsReady, true)
eq("realistic: keySkills.length", (realCols.keySkills as string[])?.length, 3)
eq("realistic: languages.length", (realCols.languages as string[])?.length, 2)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
