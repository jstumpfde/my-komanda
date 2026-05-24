// HR-020: общий клиентский фильтр кандидатов для списка/канбана.
// Все фильтры из FilterState применяются здесь. Если у кандидата нет
// данных по полю (null/undefined) — он НЕ отфильтровывается (включается),
// чтобы фильтр не «съедал» неполные карточки и не зависел от seed.

import type { FilterState } from "@/components/dashboard/candidate-filters"
import type { Candidate } from "@/components/dashboard/candidate-card"

// ТЗ-3 Ч.4: filters.funnelStatuses содержит ТОЛЬКО slug стадий из
// lib/stages.ts. Legacy UI-метки («Демо пройдено» и т.п.) больше не
// поддерживаются — фильтр всегда генерируется из PLATFORM_STAGES.

function getDemoPercent(c: Candidate): number | null {
  // Приоритет — поле progressPercent из API (page-based, согласовано с UI)
  const apiPct = (c as any).progressPercent
  if (typeof apiPct === "number") return apiPct
  // Fallback — старый расчёт
  const dp = c.demoProgressJson
  if (!dp || !Array.isArray(dp.blocks)) return null
  const total = dp.totalBlocks ?? dp.blocks.length
  if (!total) return null
  if (dp.completedAt || dp.blocks.some((b) => b.blockId === "__complete__")) return 100
  const completed = dp.blocks.filter((b) => b.status === "completed").length
  return Math.round((completed / total) * 100)
}

function passesDemoProgress(c: Candidate, demoProgress: string[]): boolean {
  if (demoProgress.length === 0) return true
  const pct = getDemoPercent(c)
  return demoProgress.some((label) => {
    if (label === "Не начал")          return pct == null || pct === 0
    if (label === "В процессе")        return pct != null && pct > 0 && pct < 85
    if (label === "Завершил (≥85%)")   return pct != null && pct >= 85
    if (label === "Завершил (<85%)")   return pct != null && pct > 0 && pct < 85
    return false
  })
}

function passesDateRange(c: Candidate, filters: FilterState): boolean {
  const { dateRange, dateFrom, dateTo } = filters
  if (!dateRange && !dateFrom && !dateTo) return true
  const created = c.createdAt ? new Date(c.createdAt) : c.addedAt
  if (!created) return true
  const ts = created.getTime()
  const now = Date.now()
  if (dateRange) {
    const day = 24 * 60 * 60 * 1000
    const windowMs =
      dateRange === "today" ? 1 * day :
      dateRange === "3days" ? 3 * day :
      dateRange === "week"  ? 7 * day :
      dateRange === "month" ? 31 * day : 0
    if (windowMs > 0 && now - ts > windowMs) return false
    return true
  }
  if (dateFrom) {
    if (ts < new Date(dateFrom).getTime()) return false
  }
  if (dateTo) {
    // include the entire "to" day
    if (ts > new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false
  }
  return true
}

function passesAgeRange(c: Candidate, filters: FilterState): boolean {
  const { ageMin, ageMax } = filters
  if (ageMin === 18 && ageMax === 65) return true
  if (!c.birthDate) return false  // нет данных — фильтр активен, исключаем (Вариант B)
  const bd = c.birthDate instanceof Date ? c.birthDate : new Date(c.birthDate)
  if (Number.isNaN(bd.getTime())) return true
  const now = new Date()
  let age = now.getFullYear() - bd.getFullYear()
  const m = now.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--
  return age >= ageMin && age <= ageMax
}

function passesExperience(c: Candidate, filters: FilterState): boolean {
  const { experienceMin, experienceMax } = filters
  if (experienceMin === 0 && experienceMax === 20) return true
  const ey = c.experienceYears
  if (ey == null) return true
  return ey >= experienceMin && ey <= experienceMax
}

function passesSalary(c: Candidate, filters: FilterState): boolean {
  const { salaryMin, salaryMax } = filters
  if (salaryMin === 0 && salaryMax === 250000) return true
  // Кандидат проходит, если его диапазон [salaryMin..salaryMax] пересекается с фильтром.
  const cMin = c.salaryMin || 0
  const cMax = c.salaryMax || cMin
  if (cMax === 0 && cMin === 0) return true   // нет данных — не блокируем
  return cMin <= salaryMax && cMax >= salaryMin
}

function passesArrayMembership<T extends string>(
  candidateValues: T[] | null | undefined,
  filterValues: string[],
): boolean {
  if (filterValues.length === 0) return true
  if (!candidateValues || candidateValues.length === 0) return true   // нет данных — не блокируем
  return candidateValues.some((v) => filterValues.includes(v))
}

function passesBoolFlag(value: boolean | null | undefined, filter: "any" | "yes" | "no"): boolean {
  if (filter === "any") return true
  if (value == null) return true   // нет данных — не блокируем
  return filter === "yes" ? value === true : value === false
}

interface FilterableColumn {
  id: string
  candidates: Candidate[]
  count: number
}

export function applyCandidateFilters<C extends FilterableColumn>(
  columns: C[],
  filters: FilterState,
): C[] {
  return columns.map((col) => {
    const filtered = col.candidates.filter((c) => {
      if (filters.searchText && !c.name.toLowerCase().includes(filters.searchText.toLowerCase())) return false
      if (filters.cities.length > 0 && !filters.cities.includes(c.city)) return false
      if (((c as any).aiScore ?? c.score ?? 0) < filters.scoreMin) return false
      // Раздельные слайдеры AI-скор: по резюме (resumeScore) и по анкете
      // (aiScore). 0 = «не задан», фильтр пропускается. Кандидатов без
      // скора (null) при активном фильтре — исключаем.
      if ((filters.scoreMinResume ?? 0) > 0) {
        const rs = (c as any).resumeScore
        if (rs == null || rs < filters.scoreMinResume) return false
      }
      if ((filters.scoreMinAnketa ?? 0) > 0) {
        const ai = (c as any).aiScore
        if (ai == null || ai < filters.scoreMinAnketa) return false
      }
      if (filters.sources.length > 0 && !filters.sources.includes(c.source)) return false

      // Work format
      if (filters.workFormats.length > 0) {
        if (c.workFormat && !filters.workFormats.includes(c.workFormat)) return false
        // если null — пропускаем (не блокируем)
      }

      // Relocation / business trips
      if (!passesBoolFlag(c.relocationReady, filters.relocation)) return false
      if (!passesBoolFlag(c.businessTripsReady, filters.businessTrips)) return false

      // Experience years (slider)
      if (!passesExperience(c, filters)) return false

      // ТЗ-3 Ч.4: фильтр по slug стадий. Если список пуст — пользователь
      // снял все галочки → показываем всё.
      if (filters.funnelStatuses.length > 0) {
        if (!filters.funnelStatuses.includes(col.id)) return false
      }

      // Demo progress
      if (!passesDemoProgress(c, filters.demoProgress)) return false

      // Salary
      if (!passesSalary(c, filters)) return false

      // Date range
      if (!passesDateRange(c, filters)) return false

      // Age
      if (!passesAgeRange(c, filters)) return false

      // Education level (codes)
      if (!passesArrayMembership(c.educationLevel ? [c.educationLevel] : null, filters.education)) return false

      // Languages (codes) — учитываем otherLanguages если выбрано "other"
      if (filters.languages.length > 0) {
        const langs = c.languages ?? []
        if (langs.length > 0) {
          const matched = langs.some((l) => filters.languages.includes(l))
          if (!matched) return false
        }
      }

      // Skills (Russian labels) — на keySkills (новое) или skills (legacy fallback)
      if (filters.skills.length > 0) {
        const cs = c.keySkills && c.keySkills.length > 0 ? c.keySkills : (c.skills ?? [])
        if (cs.length > 0) {
          const matched = cs.some((s) => filters.skills.includes(s))
          if (!matched) return false
        }
      }

      // Industry
      if (filters.industries.length > 0) {
        if (c.industry && !filters.industries.includes(c.industry)) return false
      }

      return true
    })
    return { ...col, candidates: filtered, count: filtered.length }
  })
}
