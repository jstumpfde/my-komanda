"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type CandidatesViewMode = "funnel" | "list" | "kanban" | "tiles"

export interface ListSortPref {
  key: string
  dir: "asc" | "desc"
}

export interface UserPreferences {
  viewMode: CandidatesViewMode
  // Личный override колонок списка кандидатов (Портрет/Демо/Анкета/…) поверх
  // company-default (hiring-defaults.candidateColumns) — решение владельца
  // 17.07: тумблеры активны у ВСЕХ ролей, не только у директора (было B5
  // 10.06 — read-only для не-директоров). Partial — храним только реально
  // изменённые пользователем ключи, остальное наследуется от company-default.
  candidateColumns: Partial<Record<string, boolean>>
  // null — нет сохранённого выбора. Page инжектит дефолт при первом визите.
  listSort: ListSortPref | null
}

const DEFAULT_PREFS: UserPreferences = {
  viewMode: "list",
  candidateColumns: {},
  listSort: null,
}

// Whitelist ключей candidateColumns — должен совпадать с CardDisplaySettings
// (components/dashboard/card-settings.tsx) и серверным ALLOWED_CANDIDATE_COLUMN_KEYS
// (app/api/user/preferences/route.ts). Не импортируем сам тип, чтобы не тянуть
// UI-компонент в этот общий хук (по аналогии с ALLOWED_LIST_SORT_KEYS выше).
const ALLOWED_CANDIDATE_COLUMN_KEYS = new Set([
  "showSalary", "showSalaryFull", "showScore", "showResumeScore", "showPortraitScore",
  "showAnswersScore", "showTestScore", "showNextInterview", "showAge", "showSource",
  "showCity", "showExperience", "showSkills", "showActions", "showProgress",
  "showResponseDate", "showNameWarning",
])

function normalizeCandidateColumns(raw: unknown): Partial<Record<string, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Partial<Record<string, boolean>> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (ALLOWED_CANDIDATE_COLUMN_KEYS.has(k) && typeof v === "boolean") out[k] = v
  }
  return out
}

const ALLOWED_MODES: CandidatesViewMode[] = ["funnel", "list", "kanban", "tiles"]

// Whitelist должен совпадать с ListSortKey (components/dashboard/list-view.tsx)
// и серверным ALLOWED_LIST_SORT_KEYS (app/api/user/preferences/route.ts).
const ALLOWED_LIST_SORT_KEYS = new Set([
  "favorite", "name", "aiScore", "resumeScore", "progress", "salary",
  "responseDate", "status", "city", "source",
])

function normalizeListSort(raw: unknown): ListSortPref | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as { key?: unknown; dir?: unknown }
  if (typeof r.key !== "string" || !ALLOWED_LIST_SORT_KEYS.has(r.key)) return null
  if (r.dir !== "asc" && r.dir !== "desc") return null
  return { key: r.key, dir: r.dir }
}

function normalize(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS }
  const r = raw as { viewMode?: unknown; candidateColumns?: unknown; listSort?: unknown }
  const viewMode = ALLOWED_MODES.includes(r.viewMode as CandidatesViewMode)
    ? (r.viewMode as CandidatesViewMode)
    : "list"
  const candidateColumns = normalizeCandidateColumns(r.candidateColumns)
  return { viewMode, candidateColumns, listSort: normalizeListSort(r.listSort) }
}

/**
 * Загружает per-user UI-настройки и даёт PATCH-обновления.
 * Запись делается оптимистично, без ожидания ответа сервера.
 */
export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS)
  const [loaded, setLoaded] = useState(false)
  const inflight = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/user/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setPrefs(normalize(data))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback((patch: {
    viewMode?: CandidatesViewMode
    candidateColumns?: Partial<Record<string, boolean>>
    listSort?: ListSortPref | null
  }) => {
    inflight.current?.abort()
    const ac = new AbortController()
    inflight.current = ac
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      signal: ac.signal,
    }).catch(() => {})
  }, [])

  const setViewMode = useCallback(
    (mode: CandidatesViewMode) => {
      setPrefs((p) => ({ ...p, viewMode: mode }))
      persist({ viewMode: mode })
    },
    [persist],
  )

  const setCandidateColumns = useCallback(
    (candidateColumns: Partial<Record<string, boolean>>) => {
      setPrefs((p) => ({ ...p, candidateColumns }))
      persist({ candidateColumns })
    },
    [persist],
  )

  const setListSort = useCallback(
    (listSort: ListSortPref | null) => {
      setPrefs((p) => ({ ...p, listSort }))
      persist({ listSort })
    },
    [persist],
  )

  return { prefs, loaded, setViewMode, setCandidateColumns, setListSort }
}
