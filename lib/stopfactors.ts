// ─── Типы стоп-факторов ──────────────────────────────────────────────────────

export interface StopFactor {
  id: string
  label: string
  enabled: boolean
  value?: string
  ageRange?: [number, number]
  custom?: boolean
}

export interface CandidateData {
  city?: string
  age?: number
  experience?: number          // лет опыта
  skills?: string[]
  salary_expectation?: number  // ожидаемая зарплата
  documents?: string[]         // наличие документов
  citizenship?: string
  work_format?: "office" | "remote" | "hybrid"
}

export interface FailedFactor {
  factor: string
  candidateValue: string
  requiredValue: string
}

export interface CheckResult {
  passed: boolean
  failedFactors: FailedFactor[]
}

// ─── Проверка стоп-факторов ──────────────────────────────────────────────────

export function checkStopFactors(
  stopFactors: StopFactor[],
  candidate: CandidateData
): CheckResult {
  const failedFactors: FailedFactor[] = []

  for (const sf of stopFactors) {
    if (!sf.enabled) continue

    switch (sf.id) {
      case "city":
        if (sf.value && candidate.city && candidate.city.toLowerCase() !== sf.value.toLowerCase()) {
          failedFactors.push({
            factor: sf.label,
            candidateValue: candidate.city,
            requiredValue: sf.value,
          })
        }
        break

      case "age":
        if (sf.ageRange && candidate.age != null) {
          const [min, max] = sf.ageRange
          if (candidate.age < min || candidate.age > max) {
            failedFactors.push({
              factor: sf.label,
              candidateValue: String(candidate.age),
              requiredValue: `${min}–${max}`,
            })
          }
        }
        break

      case "experience":
        if (sf.value && candidate.experience != null) {
          const required = parseFloat(sf.value)
          if (!isNaN(required) && candidate.experience < required) {
            failedFactors.push({
              factor: sf.label,
              candidateValue: `${candidate.experience} лет`,
              requiredValue: `от ${sf.value} лет`,
            })
          }
        }
        break

      case "skills":
        if (sf.value && candidate.skills) {
          const required = sf.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
          const has = candidate.skills.map((s) => s.toLowerCase())
          const missing = required.filter((r) => !has.some((h) => h.includes(r)))
          if (missing.length > 0) {
            failedFactors.push({
              factor: sf.label,
              candidateValue: candidate.skills.join(", "),
              requiredValue: sf.value,
            })
          }
        }
        break

      case "salaryMax":
        if (sf.value && candidate.salary_expectation != null) {
          const maxSalary = parseFloat(sf.value)
          if (!isNaN(maxSalary) && candidate.salary_expectation > maxSalary) {
            failedFactors.push({
              factor: sf.label,
              candidateValue: `${candidate.salary_expectation.toLocaleString("ru-RU")} ₽`,
              requiredValue: `до ${maxSalary.toLocaleString("ru-RU")} ₽`,
            })
          }
        }
        break

      case "documents":
        if (sf.value && candidate.documents) {
          const required = sf.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
          const has = candidate.documents.map((d) => d.toLowerCase())
          const missing = required.filter((r) => !has.includes(r))
          if (missing.length > 0) {
            failedFactors.push({
              factor: sf.label,
              candidateValue: candidate.documents.join(", ") || "нет",
              requiredValue: sf.value,
            })
          }
        }
        break

      case "citizenship":
        if (sf.value && candidate.citizenship && candidate.citizenship.toLowerCase() !== sf.value.toLowerCase()) {
          failedFactors.push({
            factor: sf.label,
            candidateValue: candidate.citizenship,
            requiredValue: sf.value,
          })
        }
        break

      case "format":
        if (sf.value && candidate.work_format && candidate.work_format !== sf.value) {
          const labels: Record<string, string> = { office: "Офис", remote: "Удалённо", hybrid: "Гибрид" }
          failedFactors.push({
            factor: sf.label,
            candidateValue: labels[candidate.work_format] || candidate.work_format,
            requiredValue: labels[sf.value] || sf.value,
          })
        }
        break
    }
  }

  return {
    passed: failedFactors.length === 0,
    failedFactors,
  }
}
