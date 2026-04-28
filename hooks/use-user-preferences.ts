"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type CandidatesViewMode = "funnel" | "list" | "kanban" | "tiles"

export interface UserPreferences {
  viewMode: CandidatesViewMode
  columns: Record<string, boolean>
}

const DEFAULT_PREFS: UserPreferences = {
  viewMode: "list",
  columns: {},
}

const ALLOWED_MODES: CandidatesViewMode[] = ["funnel", "list", "kanban", "tiles"]

function normalize(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS }
  const r = raw as { viewMode?: unknown; columns?: unknown }
  const viewMode = ALLOWED_MODES.includes(r.viewMode as CandidatesViewMode)
    ? (r.viewMode as CandidatesViewMode)
    : "list"
  const columns =
    r.columns && typeof r.columns === "object" && !Array.isArray(r.columns)
      ? (r.columns as Record<string, boolean>)
      : {}
  return { viewMode, columns }
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

  const persist = useCallback((patch: { viewMode?: CandidatesViewMode; columns?: Record<string, boolean> }) => {
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

  return { prefs, loaded, setViewMode, setColumns }
}
