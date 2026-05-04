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
  token: string
  demoProgressJson: unknown
  // Реальный формат в БД — массив [{ blockId, answer, ... }] или legacy [{ question, answer }].
  // Внутренние тулзы рендеринга нормализуют тип, поэтому здесь — `unknown`.
  anketaAnswers: unknown
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
}

// ─── useCandidates ────────────────────────────────────────────────────────────

export interface CandidatesSortParams {
  sort?: string
  order?: "asc" | "desc"
}

export function useCandidates(
  vacancyId: string | null,
  stageFilter?: string[],
  sortParams?: CandidatesSortParams,
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
  }, [vacancyId, stageFilter?.join(","), sortParams?.sort, sortParams?.order])  // eslint-disable-line react-hooks/exhaustive-deps

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
