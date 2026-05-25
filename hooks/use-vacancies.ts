"use client"

import { useState, useEffect, useCallback } from "react"

// ─── Types (mirror DB schema fields returned by the API) ──────────────────────

export interface ApiVacancy {
  id: string
  companyId: string
  createdBy: string
  shortCode: string | null
  title: string
  description: string | null
  city: string | null
  format: string | null
  employment: string | null
  category: string | null
  sidebarSection: string | null
  salaryMin: number | null
  salaryMax: number | null
  status: string | null
  slug: string
  descriptionJson: unknown
  experience: string | null
  requiredExperience: string | null
  employmentType: string[] | null
  schedule: string | null
  hiringPlan: number | null
  employeeType: string | null
  hhVacancyId: string | null
  hhUrl: string | null
  aiProcessSettings: {
    minScore?: number
    belowThresholdAction?: "reject" | "keep_new"
    inviteMessage?: string
    rejectMessage?: string
  } | null
  aiScoringEnabled: boolean
  deletedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface VacancyCounts {
  active: number
  archived: number
}

interface VacanciesResult {
  vacancies: ApiVacancy[]
  total: number
  page: number
  limit: number
  counts?: VacancyCounts
}

// scope: "active" — всё кроме архива; "archive" — только архив; undefined — все.
export type VacanciesScope = "active" | "archive"

// ─── useVacancies ─────────────────────────────────────────────────────────────

export function useVacancies(page = 1, limit = 20, scope?: VacanciesScope) {
  const [vacancies, setVacancies] = useState<ApiVacancy[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<VacancyCounts>({ active: 0, archived: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (scope) qs.set("scope", scope)
      const res = await fetch(`/api/modules/hr/vacancies?${qs.toString()}`)
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as VacanciesResult
      setVacancies(data.vacancies)
      setTotal(data.total)
      if (data.counts) setCounts(data.counts)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки вакансий")
    } finally {
      setLoading(false)
    }
  }, [page, limit, scope])

  useEffect(() => {
    fetch_()
  }, [fetch_])

  return { vacancies, total, counts, loading, error, refetch: fetch_ }
}

// ─── useVacancy ───────────────────────────────────────────────────────────────

export function useVacancy(id: string | null) {
  const [vacancy, setVacancy] = useState<ApiVacancy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${id}`)
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as ApiVacancy
      setVacancy(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки вакансии")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetch_()
  }, [fetch_])

  return { vacancy, loading, error, refetch: fetch_ }
}
