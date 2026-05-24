"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type CandidatesViewMode = "funnel" | "list" | "kanban" | "tiles"

export interface ListSortPref {
  key: string
  dir: "asc" | "desc"
}

export interface UserPreferences {
  viewMode: CandidatesViewMode
  columns: Record<string, boolean>
  // null — нет сохранённого выбора. Page инжектит дефолт при первом визите.
  listSort: ListSortPref | null
}

const DEFAULT_PREFS: UserPreferences = {
  viewMode: "list",
  columns: {},
  listSort: null,
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
  const r = raw as { viewMode?: unknown; columns?: unknown; listSort?: unknown }
  const viewMode = ALLOWED_MODES.includes(r.viewMode as CandidatesViewMode)
    ? (r.viewMode as CandidatesViewMode)
    : "list"
  const columns =
    r.columns && typeof r.columns === "object" && !Array.isArray(r.columns)
      ? (r.columns as Record<string, boolean>)
      : {}
  return { viewMode, columns, listSort: normalizeListSort(r.listSort) }
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
    columns?: Record<string, boolean>
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

  const setColumns = useCallback(
    (columns: Record<string, boolean>) => {
      setPrefs((p) => ({ ...p, columns }))
      persist({ columns })
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

  return { prefs, loaded, setViewMode, setColumns, setListSort }
}
