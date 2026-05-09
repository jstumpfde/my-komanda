"use client"

import { useState, useEffect, useCallback } from "react"

// ─── Types (mirror DB schema fields returned by the API) ──────────────────────

export interface ApiCandidate {
  id: string
  vacancyId: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  source: string | null
  stage: string | null
  score: number | null
  salaryMin: number | null
  salaryMax: number | null
  experience: string | null
  skills: string[] | null
  // HR-020: новые поля для рабочих фильтров списка кандидатов.
  birthDate?: string | null
  experienceYears?: number | null
  workFormat?: string | null            // 'office'|'hybrid'|'remote'
  educationLevel?: string | null        // 'secondary'|'specialized'|'higher'|'mba'
  languages?: string[] | null
  keySkills?: string[] | null
  industry?: string | null
  relocationReady?: boolean | null
  businessTripsReady?: boolean | null
  photoUrl?: string | null
  token: string
  demoProgressJson: unknown
  // Реальный формат в БД — массив [{ blockId, answer, ... }] или legacy [{ question, answer }].
  // Внутренние тулзы рендеринга нормализуют тип, поэтому здесь — `unknown`.
  anketaAnswers: unknown
  // Снимок данных кандидата из анкетной формы (firstName/lastName/phone/
  // email/city/birthDate/telegram/portfolioUrl/...). Отдельно от
  // anketa_answers (там массив демо-блоков). Не перезаписывает основные
  // поля name/phone/email/city/birthDate.
  surveyResponses?: unknown
  aiScore: number | null
  aiSummary: string | null
  aiDetails: { question: string; score: number; comment: string }[] | null
  isFavorite: boolean | null
  createdAt: string | null
  updatedAt: string | null
  hhResponseId?: string | null
  hhRawData?: unknown
  demoLessons?: unknown
  stageHistory?: unknown
  shortId?: string | null
  referredByShortId?: string | null
  // Прогресс по страницам курса (вычисляется в API: total = lessons.length + 2)
  demoTotalBlocks?: number
  demoCompletedBlocks?: number
  progressPercent?: number | null
}

// ─── useCandidates ────────────────────────────────────────────────────────────

export interface CandidatesFilters {
  // Серверные фильтры (API применяет в SQL)
  minAge?: number
  maxAge?: number
  minExperience?: number
  maxExperience?: number
  workFormats?: string[]              // ['office','hybrid','remote']
  educationLevels?: string[]          // ['secondary','specialized','higher','mba']
  languages?: string[]
  keySkills?: string[]
  industries?: string[]
  relocationReady?: boolean | null    // true/false/null=any
  businessTripsReady?: boolean | null
  // Расширенные фильтры (страница вакансии)
  demoProgress?: string[]             // ['not_started','in_progress','completed_85','completed_below_85']
  dateFrom?: string                   // ISO date
  dateTo?: string                     // ISO date
  salaryMin?: number
  salaryMax?: number
  sources?: string[]                  // ['hh','manual','referral','demo','avito','telegram','site']
  cities?: string[]
  scoreMin?: number
}

export interface CandidatesSortParams {
  sort?: string
  order?: "asc" | "desc"
}

export function useCandidates(
  vacancyId: string | null,
  stageFilter?: string[],
  sortParams?: CandidatesSortParams,
  filters?: CandidatesFilters,
) {
  const [candidates, setCandidates] = useState<ApiCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    if (!vacancyId) {
      setCandidates([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ vacancy_id: vacancyId })
      if (stageFilter && stageFilter.length > 0) {
        params.set("stage", stageFilter.join(","))
      }
      if (sortParams?.sort) {
        params.set("sort", sortParams.sort)
        params.set("order", sortParams.order ?? "desc")
      }
      // Серверные фильтры — добавляются только если заданы (default-значения не шлём)
      if (filters) {
        if (typeof filters.minAge === "number" && filters.minAge > 18) {
          params.set("minAge", String(filters.minAge))
        }
        if (typeof filters.maxAge === "number" && filters.maxAge < 65) {
          params.set("maxAge", String(filters.maxAge))
        }
        if (typeof filters.minExperience === "number" && filters.minExperience > 0) {
          params.set("minExperience", String(filters.minExperience))
        }
        if (typeof filters.maxExperience === "number" && filters.maxExperience < 20) {
          params.set("maxExperience", String(filters.maxExperience))
        }
        if (filters.workFormats && filters.workFormats.length > 0) {
          params.set("workFormat", filters.workFormats.join(","))
        }
        if (filters.educationLevels && filters.educationLevels.length > 0) {
          params.set("educationLevel", filters.educationLevels.join(","))
        }
        if (filters.languages && filters.languages.length > 0) {
          params.set("languages", filters.languages.join(","))
        }
        if (filters.keySkills && filters.keySkills.length > 0) {
          params.set("keySkills", filters.keySkills.join(","))
        }
        if (filters.industries && filters.industries.length > 0) {
          params.set("industry", filters.industries.join(","))
        }
        if (filters.relocationReady === true) params.set("relocationReady", "true")
        if (filters.relocationReady === false) params.set("relocationReady", "false")
        if (filters.businessTripsReady === true) params.set("businessTripsReady", "true")
        if (filters.businessTripsReady === false) params.set("businessTripsReady", "false")

        if (filters.demoProgress && filters.demoProgress.length > 0) {
          params.set("demoProgress", filters.demoProgress.join(","))
        }
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
        if (filters.dateTo) params.set("dateTo", filters.dateTo)
        if (typeof filters.salaryMin === "number" && filters.salaryMin > 0) {
          params.set("salaryMin", String(filters.salaryMin))
        }
        if (typeof filters.salaryMax === "number" && filters.salaryMax > 0 && filters.salaryMax < 250000) {
          params.set("salaryMax", String(filters.salaryMax))
        }
        if (filters.sources && filters.sources.length > 0) {
          params.set("sources", filters.sources.join(","))
        }
        if (filters.cities && filters.cities.length > 0) {
          params.set("cities", filters.cities.join(","))
        }
        if (typeof filters.scoreMin === "number" && filters.scoreMin > 0) {
          params.set("scoreMin", String(filters.scoreMin))
        }
      }
      const res = await fetch(`/api/modules/hr/candidates?${params.toString()}`)
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as ApiCandidate[]
      setCandidates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки кандидатов")
    } finally {
      setLoading(false)
    }
  }, [vacancyId, stageFilter?.join(","), sortParams?.sort, sortParams?.order, JSON.stringify(filters)])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch_()
  }, [fetch_])

  // ── Stage mutation ────────────────────────────────────────────────────────

  const updateStage = useCallback(async (candidateId: string, stage: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      })
      if (!res.ok) return false
      // Optimistic update
      setCandidates(prev =>
        prev.map(c => c.id === candidateId ? { ...c, stage } : c)
      )
      return true
    } catch {
      return false
    }
  }, [])

  const toggleFavorite = useCallback(async (candidateId: string, isFavorite: boolean): Promise<boolean> => {
    // Оптимистично обновляем UI сразу
    setCandidates(prev =>
      prev.map(c => c.id === candidateId ? { ...c, isFavorite } : c)
    )
    try {
      const res = await fetch(`/api/modules/hr/candidates/${candidateId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      })
      if (!res.ok) {
        // Откатываем
        setCandidates(prev =>
          prev.map(c => c.id === candidateId ? { ...c, isFavorite: !isFavorite } : c)
        )
        return false
      }
      return true
    } catch {
      setCandidates(prev =>
        prev.map(c => c.id === candidateId ? { ...c, isFavorite: !isFavorite } : c)
      )
      return false
    }
  }, [])

  return { candidates, loading, error, refetch: fetch_, updateStage, toggleFavorite }
}
