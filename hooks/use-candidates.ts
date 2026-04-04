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
  token: string
  demoProgressJson: unknown
  anketaAnswers: { question: string; answer: string }[] | null
  aiScore: number | null
  aiSummary: string | null
  aiDetails: { question: string; score: number; comment: string }[] | null
  createdAt: string | null
  updatedAt: string | null
}

// ─── useCandidates ────────────────────────────────────────────────────────────

export function useCandidates(
  vacancyId: string | null,
  stageFilter?: string[]
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
  }, [vacancyId, stageFilter?.join(",")])  // eslint-disable-line react-hooks/exhaustive-deps

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

  return { candidates, loading, error, refetch: fetch_, updateStage }
}
