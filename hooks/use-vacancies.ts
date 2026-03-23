"use client"

import { useState, useEffect, useCallback } from "react"

// ─── Types (mirror DB schema fields returned by the API) ──────────────────────

export interface ApiVacancy {
  id: string
  companyId: string
  createdBy: string
  title: string
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
  createdAt: string | null
  updatedAt: string | null
}

interface VacanciesResult {
  vacancies: ApiVacancy[]
  total: number
  page: number
  limit: number
}

// ─── useVacancies ─────────────────────────────────────────────────────────────

export function useVacancies(page = 1, limit = 20) {
  const [vacancies, setVacancies] = useState<ApiVacancy[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vacancies?page=${page}&limit=${limit}`)
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as VacanciesResult
      setVacancies(data.vacancies)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки вакансий")
    } finally {
      setLoading(false)
    }
  }, [page, limit])

  useEffect(() => {
    fetch_()
  }, [fetch_])

  return { vacancies, total, loading, error, refetch: fetch_ }
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
      const res = await fetch(`/api/vacancies/${id}`)
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
