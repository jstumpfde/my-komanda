"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "sidebar-visibility"

export interface SidebarVisibility {
  modules: Record<string, boolean>
  items: Record<string, boolean>
}

const DEFAULT_VISIBILITY: SidebarVisibility = { modules: {}, items: {} }

function load(): SidebarVisibility {
  if (typeof window === "undefined") return DEFAULT_VISIBILITY
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VISIBILITY
    return JSON.parse(raw) as SidebarVisibility
  } catch {
    return DEFAULT_VISIBILITY
  }
}

function save(v: SidebarVisibility) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
}

export function useSidebarVisibility() {
  const [visibility, setVisibilityState] = useState<SidebarVisibility>(DEFAULT_VISIBILITY)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setVisibilityState(load())
    setLoaded(true)
  }, [])

  const setVisibility = useCallback((v: SidebarVisibility) => {
    setVisibilityState(v)
    save(v)
  }, [])

  const isModuleVisible = useCallback((moduleId: string): boolean => {
    // Not in map = visible (default)
    return visibility.modules[moduleId] !== false
  }, [visibility])

  const isItemVisible = useCallback((moduleId: string, href: string): boolean => {
    const key = `${moduleId}:${href}`
    return visibility.items[key] !== false
  }, [visibility])

  const resetToDefault = useCallback(() => {
    const def = DEFAULT_VISIBILITY
    setVisibilityState(def)
    save(def)
  }, [])

  return { visibility, setVisibility, isModuleVisible, isItemVisible, resetToDefault, loaded }
}
